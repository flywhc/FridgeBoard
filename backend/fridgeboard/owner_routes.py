"""所有者冰箱资料、图标和识别 HTTP 路由。"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from fridgeboard.api_models import (
    BarcodeSuggestionResponse,
    IconResponse,
    RecognitionFieldResponse,
    RecognitionOrderItemResponse,
    RecognitionRequest,
    RecognitionResponse,
    RefrigeratorCreateRequest,
    RefrigeratorDeleteRequest,
    RefrigeratorRenameRequest,
    RefrigeratorResponse,
    RefrigeratorTemplateResponse,
)
from fridgeboard.auth import AccessService
from fridgeboard.http_support import refrigerator_response, template_response
from fridgeboard.item_catalog import asset_revision, builtin_icon_path, load_catalog
from fridgeboard.layout_service import LayoutService
from fridgeboard.layouts import list_templates
from fridgeboard.persistence.models import DeviceCredential, InventoryBatchModel, Refrigerator
from fridgeboard.recognition import RecognitionProvider, recognize_image

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


def register_owner_routes(application: FastAPI, context: OwnerRouteContext) -> None:
    """向应用注册所有者冰箱资料、图标和识别路由。

    Args:
        application: 要追加路由的 FastAPI 应用实例。
        context: 路由运行所需的数据库、事务、认证和识别依赖。
    """

    @application.get("/api/owner/refrigerators", response_model=list[RefrigeratorResponse])
    def owner_refrigerators(
        current_owner: str = Depends(context.owner_id),
    ) -> list[RefrigeratorResponse]:
        """列出当前所有者可管理的冰箱。"""
        with context.session_factory() as session:
            refrigerators = AccessService(session).list_refrigerators_for_owner(current_owner)
            return [refrigerator_response(item) for item in refrigerators]

    @application.get("/api/owner/refrigerators/deleted", response_model=list[RefrigeratorResponse])
    def deleted_owner_refrigerators(
        current_owner: str = Depends(context.owner_id),
    ) -> list[RefrigeratorResponse]:
        """列出当前所有者在 30 天恢复期内可恢复的冰箱。"""
        with context.session_factory() as session:
            refrigerators = AccessService(session).list_deleted_refrigerators_for_owner(
                current_owner
            )
            return [refrigerator_response(item) for item in refrigerators]

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
                return refrigerator_response(refrigerator)
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
                return refrigerator_response(refrigerator)
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
        del actor
        allowed_fields = {
            "item_name",
            "subcategory_name",
            "product_description",
            "production_date",
            "best_before",
            "barcode",
            "raw_date_label",
        }
        try:
            raw_fields = recognize_image(
                payload.image_base64, payload.content_type, context.recognition_provider
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        try:
            fields = {
                name: RecognitionFieldResponse(**value)
                for name, value in raw_fields.items()
                if name in allowed_fields and isinstance(value, dict)
            }
        except ValidationError as exc:
            raise HTTPException(status_code=503, detail="Agnes 返回格式无效") from exc
        order_items: list[RecognitionOrderItemResponse] = []
        raw_order_items = raw_fields.get("order_items", [])
        if isinstance(raw_order_items, list):
            for raw_item in raw_order_items:
                if not isinstance(raw_item, dict) or not raw_item.get("item_name"):
                    continue
                try:
                    order_items.append(
                        RecognitionOrderItemResponse(
                            item_name=str(raw_item["item_name"]).strip(),
                            specification=str(
                                raw_item.get("specification", raw_item.get("spec", ""))
                            ).strip(),
                            quantity=raw_item.get("quantity", 1),
                        )
                    )
                except (TypeError, ValueError, ValidationError):
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
                return refrigerator_response(refrigerator)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
