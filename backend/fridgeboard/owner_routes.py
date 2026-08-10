"""所有者冰箱资料、图标和识别 HTTP 路由。"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from fridgeboard.api_models import (
    BarcodeSuggestionResponse,
    IconResponse,
    ProductLookupResponse,
    QrLookupRequest,
    QrLookupResponse,
    RecognitionFieldResponse,
    RecognitionOrderItemResponse,
    RecognitionRequest,
    RecognitionResponse,
    RefrigeratorCreateRequest,
    RefrigeratorDeleteRequest,
    RefrigeratorRenameRequest,
    RefrigeratorResponse,
    RefrigeratorSummaryResponse,
    RefrigeratorTemplateResponse,
)
from fridgeboard.auth import AccessService
from fridgeboard.category_matching import match_item_name
from fridgeboard.http_support import (
    refrigerator_response,
    refrigerator_summary_response,
    request_device_tokens,
    template_response,
)
from fridgeboard.item_catalog import asset_revision, builtin_icon_path, load_catalog
from fridgeboard.layout_service import LayoutService
from fridgeboard.layouts import list_templates
from fridgeboard.persistence.models import (
    DeviceCredential,
    FoodCategory,
    InventoryBatchModel,
    Refrigerator,
)
from fridgeboard.product_lookup import lookup_product_by_barcode
from fridgeboard.recognition import (
    QrRecognitionProvider,
    RecognitionCategoryCandidate,
    RecognitionProvider,
    invoke_qr_recognition_provider,
    normalize_order_item_name,
    parse_order_item_price,
    progress_callback_context,
    recognize_image,
)
from fridgeboard.sse import sse_event

logger = logging.getLogger(__name__)

SessionFactory = Callable[[], Session]
TransactionFactory = Callable[[SessionFactory], AbstractContextManager[Session]]
OwnerDependency = Callable[..., str]
ActorDependency = Callable[..., tuple[Literal["owner", "device"], str | DeviceCredential]]


@dataclass(frozen=True)
class OwnerRouteContext:
    """所有者资料路由需要的数据库、事务和认证依赖。"""

    session_factory: SessionFactory
    transaction: TransactionFactory
    owner_id: OwnerDependency
    owner_or_device: ActorDependency
    recognition_provider: RecognitionProvider
    qr_recognition_provider: QrRecognitionProvider | None


def _resolve_recognition_category(
    raw_subcategory_id: object,
    raw_subcategory_name: object,
    category_candidates: list[RecognitionCategoryCandidate],
) -> tuple[str | None, str | None]:
    """把不可信模型分类解析为当前冰箱白名单中的规范 ID 和名称。"""
    candidate_by_id = {item["id"]: item for item in category_candidates}
    category_id = str(raw_subcategory_id) if raw_subcategory_id else None
    if category_id in candidate_by_id:
        candidate = candidate_by_id[category_id]
        return candidate["id"], candidate["name"]
    if raw_subcategory_name:
        matched = match_item_name(str(raw_subcategory_name), category_candidates)
        if matched is not None:
            return matched.subcategory_id, matched.subcategory_name
    return None, None


async def _model_sse(
    operation: Callable[[Callable[[str], None]], object],
    initial_message: str,
) -> AsyncIterator[str]:
    """将同步模型路由包装成不会阻塞事件循环的 SSE 事件流。"""
    queue: asyncio.Queue[tuple[str, object]] = asyncio.Queue()
    loop = asyncio.get_running_loop()
    text_length = 0

    def on_progress(text: str) -> None:
        """把工作线程中的模型增量投递给 SSE 生成器。"""
        loop.call_soon_threadsafe(queue.put_nowait, ("token", text))

    task = asyncio.create_task(asyncio.to_thread(operation, on_progress))
    yield sse_event("status", {"message": initial_message, "text_length": 0})
    try:
        while True:
            if task.done() and queue.empty():
                result = task.result()
                payload = (
                    result.model_dump(mode="json", exclude_none=False)
                    if hasattr(result, "model_dump")
                    else result
                )
                yield sse_event("result", payload)
                yield sse_event("done", {"text_length": text_length})
                return
            kind, value = await queue.get()
            if kind == "token":
                text = str(value)
                text_length += len(text)
                yield sse_event("token", {"text": text, "text_length": text_length})
    except asyncio.CancelledError:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        raise
    except Exception as exc:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        logger.exception("模型 SSE 调用失败 exception=%s", type(exc).__name__)
        message = (
            exc.detail
            if isinstance(exc, HTTPException)
            else "模型服务暂时不可用，请稍后重试。"
        )
        yield sse_event("error", {"message": str(message)})


async def _recognition_sse(
    payload: RecognitionRequest,
    actor: tuple[Literal["owner", "device"], str | DeviceCredential],
    handler: Callable[..., RecognitionResponse],
) -> AsyncIterator[str]:
    """返回图片识别的阶段状态、模型原文增量和结构化结果。"""
    async for event in _model_sse(
        lambda callback: _run_with_progress(lambda: handler(payload, actor), callback),
        "正在上传图片并请求识别…",
    ):
        yield event


async def _qr_lookup_sse(
    payload: QrLookupRequest,
    handler: Callable[[QrLookupRequest], object],
) -> AsyncIterator[str]:
    """返回二维码解析的阶段状态、模型原文增量和结构化结果。"""
    async for event in _model_sse(
        lambda callback: _run_with_progress(lambda: handler(payload), callback),
        "正在解析二维码内容…",
    ):
        yield event


def _run_with_progress(operation: Callable[[], object], callback: Callable[[str], None]) -> object:
    """在工作线程内安装模型文字回调并执行同步路由。"""
    with progress_callback_context(callback):
        return operation()


def register_owner_routes(application: FastAPI, context: OwnerRouteContext) -> None:
    """向应用注册所有者冰箱资料、图标和识别路由。

    Args:
        application: 要追加路由的 FastAPI 应用实例。
        context: 路由运行所需的数据库、事务、认证和识别依赖。
        """

    @application.get("/api/refrigerators", response_model=list[RefrigeratorSummaryResponse])
    def accessible_refrigerators(
        request: Request,
        actor: tuple[Literal["owner", "device"], str | DeviceCredential] = Depends(
            context.owner_or_device
        ),
    ) -> list[RefrigeratorSummaryResponse]:
        """合并账号冰箱与当前 PWA 实例授权冰箱，返回手机列表轻量摘要。

        登录账号拥有的冰箱始终以 ``owner`` 返回；扫码获得但不属于该账号的冰箱仅以
        ``daily_access`` 返回，不能借此获得所有者管理权限。
        """
        owner_user_id = actor[1] if actor[0] == "owner" else None
        with context.session_factory() as session:
            entries = AccessService(session).list_refrigerators_for_access(
                owner_user_id,
                request_device_tokens(request),
            )
            return [
                refrigerator_summary_response(
                    refrigerator,
                    session,
                    access_role=access_role,
                )
                for refrigerator, access_role in entries
            ]

    @application.get("/api/owner/refrigerators", response_model=list[RefrigeratorResponse])
    def owner_refrigerators(
        current_owner: str = Depends(context.owner_id),
    ) -> list[RefrigeratorResponse]:
        """列出当前所有者可管理的冰箱。"""
        with context.session_factory() as session:
            refrigerators = AccessService(session).list_refrigerators_for_owner(current_owner)
            return [refrigerator_response(item, session) for item in refrigerators]

    @application.get("/api/owner/refrigerators/deleted", response_model=list[RefrigeratorResponse])
    def deleted_owner_refrigerators(
        current_owner: str = Depends(context.owner_id),
    ) -> list[RefrigeratorResponse]:
        """列出当前所有者在 30 天恢复期内可恢复的冰箱。"""
        with context.session_factory() as session:
            refrigerators = AccessService(session).list_deleted_refrigerators_for_owner(
                current_owner
            )
            return [refrigerator_response(item, session) for item in refrigerators]

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}", response_model=RefrigeratorResponse
    )
    def rename_refrigerator(
        refrigerator_id: str,
        payload: RefrigeratorRenameRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> RefrigeratorResponse:
        """修改一台活跃冰箱的名称，名称在同一所有者下保持唯一。"""
        try:
            with context.transaction(context.session_factory) as session:
                refrigerator = AccessService(session).rename_refrigerator(
                    current_owner, refrigerator_id, payload.name
                )
                return refrigerator_response(refrigerator, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.delete("/api/owner/refrigerators/{refrigerator_id}", status_code=204)
    def delete_refrigerator(
        refrigerator_id: str,
        payload: RefrigeratorDeleteRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> Response:
        """软删除冰箱并撤销其全部手机和冰箱端设备访问。"""
        try:
            with context.transaction(context.session_factory) as session:
                AccessService(session).delete_refrigerator(
                    current_owner, refrigerator_id, payload.confirmation_name
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/restore", response_model=RefrigeratorResponse
    )
    def restore_refrigerator(
        refrigerator_id: str, current_owner: str = Depends(context.owner_id)
    ) -> RefrigeratorResponse:
        """恢复仍在恢复期内的冰箱，但不会恢复旧设备凭证。"""
        try:
            with context.transaction(context.session_factory) as session:
                refrigerator = AccessService(session).restore_refrigerator(
                    current_owner, refrigerator_id
                )
                return refrigerator_response(refrigerator, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get(
        "/api/refrigerator-templates", response_model=list[RefrigeratorTemplateResponse]
    )
    def refrigerator_templates() -> list[RefrigeratorTemplateResponse]:
        """列出创建页可用的固定模板及其图形化编辑约束。"""
        return [template_response(template) for template in list_templates()]

    @application.get("/api/icon-library", response_model=list[IconResponse])
    def icon_library() -> list[IconResponse]:
        """列出可由内置或自定义小类复用的黑白图标资产。"""
        return [
            IconResponse(
                key=str(item["key"]),
                label=str(item["label"]),
                asset_url=(
                    f"/api/icon-library/{item['key']}.svg"
                    f"?v={asset_revision(builtin_icon_path(str(item['path'])))}"
                ),
                media_type="image/svg+xml",
            )
            for item in load_catalog()["icons"]
        ]

    @application.get("/api/icon-library/{icon_key}.svg", response_class=FileResponse)
    def icon_asset(icon_key: str) -> FileResponse:
        """返回单色 SVG 图标，供小尺寸手机和后续墨水屏端共用。"""
        item = next(
            (item for item in load_catalog()["icons"] if item["key"] == icon_key), None
        )
        if item is None:
            raise HTTPException(status_code=404, detail="图标不存在")
        return FileResponse(
            builtin_icon_path(str(item["path"])), media_type="image/svg+xml"
        )

    @application.post(
        "/api/recognition",
        response_model=RecognitionResponse,
        response_model_exclude_none=True,
        responses={
            400: {"description": "图片不合法"},
            503: {"description": "Agnes 尚未配置或暂不可用"},
        },
    )
    def recognition(
        payload: RecognitionRequest,
        actor: tuple[Literal["owner", "device"], str | DeviceCredential] = Depends(
            context.owner_or_device
        ),
    ) -> RecognitionResponse:
        """识别一次当前相机帧，结果只返回给客户端且不会写入库存。"""
        category_candidates: list[RecognitionCategoryCandidate] = []
        if payload.refrigerator_id:
            with context.session_factory() as session:
                refrigerator = session.get(Refrigerator, payload.refrigerator_id)
                actor_kind, actor_value = actor
                authorized = refrigerator is not None and refrigerator.deleted_at is None and (
                    actor_value == refrigerator.owner_user_id
                    if actor_kind == "owner"
                    else isinstance(actor_value, DeviceCredential)
                    and actor_value.refrigerator_id == payload.refrigerator_id
                )
                if not authorized:
                    raise HTTPException(status_code=404, detail="冰箱不存在或无权访问")
                categories = list(
                    session.scalars(
                        select(FoodCategory)
                        .where(
                            (FoodCategory.refrigerator_id.is_(None))
                            | (FoodCategory.refrigerator_id == payload.refrigerator_id)
                        )
                        .order_by(
                            FoodCategory.display_order,
                            FoodCategory.name,
                            FoodCategory.id,
                        )
                    )
                )
                category_by_id = {category.id: category for category in categories}
                category_candidates = [
                    {
                        "id": category.id,
                        "name": category.name,
                        "parent_name": category_by_id[category.parent_id].name,
                    }
                    for category in categories
                    if category.parent_id is not None
                    and category.parent_id in category_by_id
                ]
        allowed_fields = {
            "item_name",
            "subcategory_id",
            "subcategory_name",
            "product_description",
            "production_date",
            "best_before",
            "barcode",
            "raw_date_label",
        }
        try:
            raw_fields = recognize_image(
                payload.image_base64,
                payload.content_type,
                context.recognition_provider,
                category_candidates,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            logger.exception(
                "图片识别服务失败 operation=image_recognition content_type=%s "
                "refrigerator_context=%s exception=%s",
                payload.content_type,
                payload.refrigerator_id is not None,
                type(exc).__name__,
            )
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        category_field = raw_fields.get("subcategory_name")
        category_id_field = raw_fields.get("subcategory_id")
        if payload.refrigerator_id is None:
            # 兼容没有冰箱上下文的通用识别调用：保留模型给出的名称，
            # 但不把未经当前冰箱白名单校验的 ID 返回给客户端。
            raw_fields.pop("subcategory_id", None)
        else:
            category_id, category_name = _resolve_recognition_category(
                category_id_field.get("value") if isinstance(category_id_field, dict) else None,
                category_field.get("value") if isinstance(category_field, dict) else None,
                category_candidates,
            )
            raw_fields.pop("subcategory_id", None)
            raw_fields.pop("subcategory_name", None)
            if category_id is not None and category_name is not None:
                confidence = (
                    category_id_field.get("confidence", 0.5)
                    if isinstance(category_id_field, dict)
                    else category_field.get("confidence", 0.5)
                    if isinstance(category_field, dict)
                    else 0.5
                )
                raw_fields["subcategory_id"] = {
                    "value": category_id,
                    "confidence": confidence,
                }
                raw_fields["subcategory_name"] = {
                    "value": category_name,
                    "confidence": confidence,
                }
        try:
            fields = {
                name: RecognitionFieldResponse(**value)
                for name, value in raw_fields.items()
                if name in allowed_fields and isinstance(value, dict)
            }
        except ValidationError as exc:
            logger.exception(
                "图片识别字段契约校验失败 operation=image_recognition field_names=%s",
                sorted(
                    name
                    for name, value in raw_fields.items()
                    if name in allowed_fields and isinstance(value, dict)
                ),
            )
            raise HTTPException(status_code=503, detail="Agnes 返回格式无效") from exc
        order_items: list[RecognitionOrderItemResponse] = []
        raw_order_items = raw_fields.get("order_items", [])
        if isinstance(raw_order_items, list):
            for item_index, raw_item in enumerate(raw_order_items):
                if not isinstance(raw_item, dict) or not raw_item.get("item_name"):
                    continue
                try:
                    item_name = normalize_order_item_name(
                        raw_item["item_name"], raw_item.get("brand")
                    )
                    if not item_name:
                        continue
                    raw_subcategory_id = (
                        str(raw_item["subcategory_id"])
                        if raw_item.get("subcategory_id")
                        else None
                    )
                    raw_subcategory_name = (
                        str(raw_item["subcategory_name"])
                        if raw_item.get("subcategory_name")
                        else None
                    )
                    raw_subcategory_id, raw_subcategory_name = (
                        _resolve_recognition_category(
                            raw_subcategory_id,
                            raw_subcategory_name,
                            category_candidates,
                        )
                    )
                    order_items.append(
                        RecognitionOrderItemResponse(
                            item_name=item_name,
                            specification=str(
                                raw_item.get("specification", raw_item.get("spec", ""))
                            ).strip(),
                            quantity=raw_item.get("quantity", 1),
                            price=parse_order_item_price(raw_item),
                            subcategory_id=raw_subcategory_id,
                            subcategory_name=raw_subcategory_name,
                            subcategory_confidence=(
                                float(raw_item["subcategory_confidence"])
                                if raw_item.get("subcategory_confidence") is not None
                                else None
                            ),
                        )
                    )
                except (TypeError, ValueError, ValidationError):
                    logger.exception(
                        "订单识别商品项契约校验失败 operation=image_recognition item_index=%s "
                        "field_names=%s",
                        item_index,
                        sorted(raw_item),
                    )
                    continue
        raw_kind = raw_fields.get("kind")
        kind = (
            raw_kind
            if isinstance(raw_kind, str) and raw_kind in {"item", "order", "unknown"}
            else None
        )
        if order_items:
            kind = "order"
        elif fields:
            kind = "item"
        else:
            kind = kind or "unknown"
        return RecognitionResponse(kind=kind, fields=fields, order_items=order_items)

    @application.post(
        "/api/recognition/stream",
        response_class=StreamingResponse,
    )
    async def recognition_stream(
        payload: RecognitionRequest,
        actor: tuple[Literal["owner", "device"], str | DeviceCredential] = Depends(
            context.owner_or_device
        ),
    ) -> StreamingResponse:
        """以 SSE 返回识别阶段、模型文字增量和最终结构化结果。"""
        return StreamingResponse(
            _recognition_sse(payload, actor, recognition),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/barcode/{barcode}",
        response_model=BarcodeSuggestionResponse,
    )
    def barcode_suggestion(
        refrigerator_id: str,
        barcode: str,
        actor: tuple[Literal["owner", "device"], str | DeviceCredential] = Depends(
            context.owner_or_device
        ),
    ) -> BarcodeSuggestionResponse:
        """查询当前冰箱已确认过的条码，不复用具体购买批次字段。"""
        with context.session_factory() as session:
            refrigerator = session.get(Refrigerator, refrigerator_id)
            actor_kind, actor_value = actor
            is_authorized = refrigerator is not None and refrigerator.deleted_at is None and (
                actor_value == refrigerator.owner_user_id
                if actor_kind == "owner"
                else isinstance(actor_value, DeviceCredential)
                and actor_value.refrigerator_id == refrigerator_id
            )
            if not is_authorized:
                raise HTTPException(status_code=404, detail="冰箱不存在或无权访问")
            batch = session.scalar(
                select(InventoryBatchModel)
                .where(
                    InventoryBatchModel.refrigerator_id == refrigerator_id,
                    InventoryBatchModel.barcode == barcode,
                )
                .order_by(InventoryBatchModel.updated_at.desc())
            )
            if batch is None:
                raise HTTPException(status_code=404, detail="尚未找到该条码的已确认商品")
            return BarcodeSuggestionResponse(
                item_name=batch.item_name,
                subcategory_id=batch.subcategory_id,
                product_description=batch.product_description,
                barcode=barcode,
            )

    @application.get(
        "/api/owner/product-lookup/barcode/{barcode}", response_model=ProductLookupResponse
    )
    def product_lookup(
        barcode: str,
        actor: tuple[Literal["owner", "device"], str | DeviceCredential] = Depends(
            context.owner_or_device
        ),
    ) -> ProductLookupResponse:
        """首次扫码时查询公开商品数据库，不依赖当前冰箱历史记录。"""
        del actor
        result = lookup_product_by_barcode(barcode)
        if result is None:
            return ProductLookupResponse(found=False, barcode=barcode)
        return ProductLookupResponse(
            found=True,
            item_name=result.item_name,
            product_description=result.product_description,
            barcode=result.barcode,
            source=result.source,
        )

    @application.post("/api/owner/product-lookup/qr", response_model=QrLookupResponse)
    def qr_lookup(
        payload: QrLookupRequest,
        actor: tuple[Literal["owner", "device"], str | DeviceCredential] = Depends(
            context.owner_or_device
        ),
    ) -> QrLookupResponse:
        """使用大模型解析二维码原始文本，不把二维码强行当作商品条码。"""
        del actor
        if context.qr_recognition_provider is None:
            raise HTTPException(status_code=503, detail="二维码解析服务尚未配置")
        try:
            result = invoke_qr_recognition_provider(
                context.qr_recognition_provider, payload.payload
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        fields: dict[str, RecognitionFieldResponse] = {}
        for name, value in result.items():
            if name not in {
                "item_name",
                "subcategory_name",
                "subcategory_id",
                "product_description",
                "barcode",
            } or not isinstance(value, dict):
                continue
            try:
                fields[name] = RecognitionFieldResponse(**value)
            except ValidationError:
                continue
        raw_kind = result.get("kind")
        kind = raw_kind if raw_kind in {"item", "url", "text", "unknown"} else "unknown"
        return QrLookupResponse(kind=kind, payload=payload.payload, fields=fields)

    @application.post(
        "/api/owner/product-lookup/qr/stream",
        response_class=StreamingResponse,
    )
    async def qr_lookup_stream(
        payload: QrLookupRequest,
        actor: tuple[Literal["owner", "device"], str | DeviceCredential] = Depends(
            context.owner_or_device
        ),
    ) -> StreamingResponse:
        """以 SSE 返回二维码大模型解析状态和结构化结果。"""
        return StreamingResponse(
            _qr_lookup_sse(payload, lambda request: qr_lookup(request, actor)),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    @application.post(
        "/api/owner/refrigerators", response_model=RefrigeratorResponse, status_code=201
    )
    def create_refrigerator(
        payload: RefrigeratorCreateRequest, current_owner: str = Depends(context.owner_id)
    ) -> RefrigeratorResponse:
        """由所有者原子地创建冰箱及其默认或确认后的布局。"""
        try:
            with context.transaction(context.session_factory) as session:
                name = AccessService(session).assert_refrigerator_name_available(
                    current_owner, payload.name
                )
                config = (
                    {
                        item.zone_key: (item.temperature_mode, item.slot_count)
                        for item in payload.layout
                    }
                    if payload.layout is not None
                    else None
                )
                if payload.layout is not None and len(config) != len(payload.layout):
                    raise ValueError("同一个区域只能配置一次")
                refrigerator = LayoutService(session).create_refrigerator(
                    current_owner, name, payload.template_key, config
                )
                return refrigerator_response(refrigerator, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
