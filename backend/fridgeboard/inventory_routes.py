"""库存、分类和位置布局 HTTP 路由。"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.api_models import (
    CustomCategoryRequest,
    CustomGroupRequest,
    DefaultLocationResponse,
    DeviceInventoryRestoreRequest,
    DeviceQuantityAdjustRequest,
    FoodCategoryResponse,
    IconCandidateConfirmRequest,
    IconCandidateCreateRequest,
    IconCandidateResponse,
    IconGenerationResponse,
    IconResponse,
    InventoryBatchResponse,
    InventoryCategoryRequest,
    InventoryDeleteRequest,
    InventoryMoveRequest,
    InventoryWriteRequest,
    LayoutReplaceRequest,
    RefrigeratorLayoutResponse,
    StorageSlotRenameRequest,
)
from fridgeboard.http_support import (
    category_response,
    inventory_response,
    layout_response,
    shelf_life_days,
)
from fridgeboard.icon_service import (
    IconGenerationProvider,
    IconService,
    generate_icon_images,
)
from fridgeboard.inventory_service import InventoryService
from fridgeboard.item_catalog import asset_revision, ensure_builtin_catalog
from fridgeboard.layout_service import LayoutService
from fridgeboard.persistence.database import database_pool_snapshot
from fridgeboard.persistence.models import (
    DeviceCredential,
    IconAsset,
    InventoryBatchModel,
    Refrigerator,
)
from fridgeboard.sse import sse_event

logger = logging.getLogger(__name__)

SessionFactory = Callable[[], AsyncSession]
TransactionFactory = Callable[[SessionFactory], AbstractAsyncContextManager[AsyncSession]]
OwnerDependency = Callable[..., str]
DeviceDependency = Callable[..., DeviceCredential]


@dataclass(frozen=True)
class InventoryRouteContext:
    """库存路由需要的数据库、认证和服务依赖。"""

    session_factory: SessionFactory
    transaction: TransactionFactory
    owner_id: OwnerDependency
    device: DeviceDependency
    icon_generation_provider: IconGenerationProvider | None
    persistent_icon_dir: Path
    temporary_icon_dir: Path


async def _require_owned_refrigerator(
    session: AsyncSession, refrigerator_id: str, current_owner: str, failure_status: int = 404
) -> Refrigerator:
    """返回当前所有者拥有的冰箱，并保留调用接口的既有失败状态码。"""
    refrigerator = await session.get(Refrigerator, refrigerator_id)
    if (
        refrigerator is None
        or refrigerator.owner_user_id != current_owner
        or refrigerator.deleted_at is not None
    ):
        raise HTTPException(status_code=failure_status, detail="冰箱不存在或无权访问")
    return refrigerator


async def _require_active_device_refrigerator(
    session: AsyncSession, device: DeviceCredential
) -> Refrigerator:
    """返回设备所属的活跃冰箱，撤销或删除后统一返回 401。"""
    refrigerator = await session.get(Refrigerator, device.refrigerator_id)
    if refrigerator is None or refrigerator.deleted_at is not None:
        raise HTTPException(status_code=401, detail="设备访问已移除或需要重新配对")
    return refrigerator


async def _icon_generation_sse(
    operation: Callable[[], Awaitable[object]],
    pool_snapshot: Callable[[], object] | None = None,
) -> AsyncIterator[str]:
    """以 SSE 保持异步图标生成请求可见，并在长耗时期间发送状态心跳。"""
    task = asyncio.create_task(operation())
    started_at = time.monotonic()
    yield sse_event("status", {"message": "正在生成图标候选…", "text_length": 0})
    try:
        while not task.done():
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=10)
            except TimeoutError:
                yield sse_event("status", {"message": "图标仍在生成，请稍候…", "text_length": 0})
        result = task.result()
        payload = result.model_dump(mode="json", exclude_none=False)
        yield sse_event("result", payload)
        yield sse_event("done", {"text_length": 0})
        logger.info(
            "图标生成 SSE 完成 operation=icon_generation elapsed_ms=%.1f",
            (time.monotonic() - started_at) * 1000,
        )
    except asyncio.CancelledError:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await task
        raise
    except Exception as exc:
        logger.exception(
            "图标生成 SSE 调用失败 operation=icon_generation elapsed_ms=%.1f pool=%s "
            "exception=%s",
            (time.monotonic() - started_at) * 1000,
            pool_snapshot() if pool_snapshot is not None else None,
            type(exc).__name__,
        )
        message = (
            str(exc)
            if isinstance(exc, (HTTPException, ValueError, RuntimeError))
            else "图标生成暂时不可用，请稍后重试。"
        )
        if isinstance(exc, HTTPException):
            message = str(exc.detail)
        yield sse_event("error", {"message": message})


def register_inventory_routes(application: FastAPI, context: InventoryRouteContext) -> None:
    """向应用注册库存、分类和布局路由。

    Args:
        application: 要追加路由的 FastAPI 应用实例。
        context: 路由运行所需的会话、事务和认证依赖。
    """

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/categories",
        response_model=list[FoodCategoryResponse],
    )
    async def inventory_categories(
        refrigerator_id: str, q: str | None = None, current_owner: str = Depends(context.owner_id)
    ) -> list[FoodCategoryResponse]:
        """搜索当前冰箱可用的大类、内置小类和已确认的自定义小类。"""
        async with context.transaction(context.session_factory) as session:
            await _require_owned_refrigerator(session, refrigerator_id, current_owner)
            return [
                category_response(item)
                for item in await InventoryService(session).categories(refrigerator_id, q)
            ]

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/categories",
        response_model=FoodCategoryResponse,
        status_code=201,
    )
    async def create_custom_category(
        refrigerator_id: str,
        payload: CustomCategoryRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> FoodCategoryResponse:
        """手工创建自定义小类，并保存用户选定图标键以供后续录入复用。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                await ensure_builtin_catalog(session)
                if payload.icon_key:
                    icon = await session.get(IconAsset, payload.icon_key)
                    if icon is None or icon.refrigerator_id not in {None, refrigerator_id}:
                        raise ValueError("图标不存在")
                category = await InventoryService(session).create_custom_subcategory(
                    refrigerator_id, payload.parent_id, payload.name, payload.icon_key
                )
                return category_response(category)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/categories/groups",
        response_model=FoodCategoryResponse,
        status_code=201,
    )
    async def create_custom_group(
        refrigerator_id: str,
        payload: CustomGroupRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> FoodCategoryResponse:
        """在展开选择器中创建一个无图标导航大类。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                group = await InventoryService(session).create_custom_group(
                    refrigerator_id, payload.name
                )
                return category_response(group)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/categories/recent",
        response_model=list[FoodCategoryResponse],
    )
    async def recent_categories(
        refrigerator_id: str, current_owner: str = Depends(context.owner_id)
    ) -> list[FoodCategoryResponse]:
        """返回该冰箱已初始化或真实使用过的至多十六个不重复小类。"""
        async with context.transaction(context.session_factory) as session:
            await _require_owned_refrigerator(session, refrigerator_id, current_owner)
            return [
                category_response(item)
                for item in await InventoryService(session).recent_subcategories(refrigerator_id)
            ]

    def icon_service(session: AsyncSession) -> IconService:
        """构造共享当前路由配置的图标服务。"""
        return IconService(
            session,
            context.persistent_icon_dir,
            context.temporary_icon_dir,
        )

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/icons",
        response_model=list[IconResponse],
    )
    async def icons(
        refrigerator_id: str, current_owner: str = Depends(context.owner_id)
    ) -> list[IconResponse]:
        """返回内置 SVG 和当前柜体已确认的透明 PNG 图标。"""
        async with context.transaction(context.session_factory) as session:
            await _require_owned_refrigerator(session, refrigerator_id, current_owner)
            service = icon_service(session)
            responses = []
            for item in await service.assets(refrigerator_id):
                path, _ = await service.asset_path(refrigerator_id, item.key)
                responses.append(
                    IconResponse(
                        key=item.key,
                        label=item.label,
                        asset_url=(
                            f"/api/owner/refrigerators/{refrigerator_id}/icons/{item.key}"
                            f"?v={asset_revision(path)}"
                        ),
                        media_type=item.media_type,
                    )
                )
            return responses

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/icons/{icon_key}",
        response_class=FileResponse,
    )
    async def scoped_icon_asset(
        refrigerator_id: str,
        icon_key: str,
        current_owner: str = Depends(context.owner_id),
    ) -> FileResponse:
        """按资产记录媒体类型返回当前柜体可访问的图标文件。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner)
                path, media_type = await icon_service(session).asset_path(refrigerator_id, icon_key)
                return FileResponse(path, media_type=media_type)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.get("/api/devices/current/icons", response_model=list[IconResponse])
    async def device_icons(
        current_device: DeviceCredential = Depends(context.device),
    ) -> list[IconResponse]:
        """返回显示设备所属柜体可见的内置和自定义图标。"""
        async with context.transaction(context.session_factory) as session:
            refrigerator = await _require_active_device_refrigerator(session, current_device)
            service = icon_service(session)
            responses = []
            for item in await service.assets(refrigerator.id):
                path, _ = await service.asset_path(refrigerator.id, item.key)
                responses.append(
                    IconResponse(
                        key=item.key,
                        label=item.label,
                        asset_url=(
                            f"/api/devices/current/icons/{item.key}?v={asset_revision(path)}"
                        ),
                        media_type=item.media_type,
                    )
                )
            return responses

    @application.get("/api/devices/current/icons/{icon_key}", response_class=FileResponse)
    async def device_icon_asset(
        icon_key: str,
        current_device: DeviceCredential = Depends(context.device),
    ) -> FileResponse:
        """返回显示设备所属柜体可访问的一个 SVG 或透明 PNG 图标。"""
        try:
            async with context.transaction(context.session_factory) as session:
                refrigerator = await _require_active_device_refrigerator(session, current_device)
                path, media_type = await icon_service(session).asset_path(refrigerator.id, icon_key)
                return FileResponse(path, media_type=media_type)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/icon-candidates",
        response_model=IconGenerationResponse,
        status_code=201,
        deprecated=True,
    )
    async def generate_icon_candidates(
        refrigerator_id: str,
        payload: IconCandidateCreateRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> IconGenerationResponse:
        """通过 Agnes text2image 生成四个临时图标候选。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
            logger.info(
                "图标生成授权完成 operation=icon_generation refrigerator_context=true pool=%s",
                database_pool_snapshot(application.state.database_engine),
            )
            normalized_name, images = await generate_icon_images(
                context.icon_generation_provider,
                payload.subcategory_name,
            )
            logger.info(
                "图标生成模型完成 operation=icon_generation candidate_count=%s pool=%s",
                len(images),
                database_pool_snapshot(application.state.database_engine),
            )
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                service = icon_service(session)
                generation = await service.persist_generation(
                    refrigerator_id, normalized_name, images
                )
                logger.info(
                    "图标候选持久化完成 operation=icon_generation candidate_count=%s pool=%s",
                    len(images),
                    database_pool_snapshot(application.state.database_engine),
                )
                return IconGenerationResponse(
                    id=generation.id,
                    candidates=[
                        IconCandidateResponse(
                            id=item.id,
                            asset_url=(
                                f"/api/owner/refrigerators/{refrigerator_id}/"
                                f"icon-candidates/{generation.id}/{item.id}"
                            ),
                        )
                        for item in await service.candidates(generation.id)
                    ],
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/icon-candidates/stream",
        response_class=StreamingResponse,
    )
    async def generate_icon_candidates_stream(
        refrigerator_id: str,
        payload: IconCandidateCreateRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> StreamingResponse:
        """以 SSE 返回图标生成阶段状态和最终候选列表。"""
        return StreamingResponse(
            _icon_generation_sse(
                lambda: generate_icon_candidates(refrigerator_id, payload, current_owner),
                pool_snapshot=lambda: database_pool_snapshot(application.state.database_engine),
            ),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/icon-candidates/{generation_id}/{candidate_id}",
        response_class=FileResponse,
    )
    async def icon_candidate_asset(
        refrigerator_id: str,
        generation_id: str,
        candidate_id: str,
        current_owner: str = Depends(context.owner_id),
    ) -> FileResponse:
        """读取当前柜体仍有效的一个临时 PNG 候选。"""
        try:
            async with context.session_factory() as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner)
                path = await icon_service(session).candidate_path(
                    refrigerator_id, generation_id, candidate_id
                )
                return FileResponse(path, media_type="image/png")
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/icon-candidates/{generation_id}/confirm",
        response_model=FoodCategoryResponse,
        status_code=201,
    )
    async def confirm_icon_candidate(
        refrigerator_id: str,
        generation_id: str,
        payload: IconCandidateConfirmRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> FoodCategoryResponse:
        """确认一个 Agnes 候选并原子创建对应小类。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                category = await icon_service(session).confirm(
                    refrigerator_id,
                    generation_id,
                    payload.candidate_id,
                    payload.parent_id,
                    payload.subcategory_name,
                )
                return category_response(category)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.delete(
        "/api/owner/refrigerators/{refrigerator_id}/icon-candidates/{generation_id}",
        status_code=204,
    )
    async def cancel_icon_candidates(
        refrigerator_id: str,
        generation_id: str,
        current_owner: str = Depends(context.owner_id),
    ) -> Response:
        """取消生成并删除整组候选临时文件。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner)
                await icon_service(session).cancel(refrigerator_id, generation_id)
            return Response(status_code=204)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/inventory/default-location",
        response_model=DefaultLocationResponse,
    )
    async def inventory_default_location(
        refrigerator_id: str, current_owner: str = Depends(context.owner_id)
    ) -> DefaultLocationResponse:
        """读取冰箱最近添加位置，首次录入时返回空值供前端回退。"""
        async with context.transaction(context.session_factory) as session:
            await _require_owned_refrigerator(
                session, refrigerator_id, current_owner, failure_status=400
            )
            return DefaultLocationResponse(
                storage_slot_id=await InventoryService(session).last_added_location(refrigerator_id)
            )

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/inventory",
        response_model=list[InventoryBatchResponse],
        summary="读取冰箱库存",
        responses={
            200: {
                "description": "按有效期和创建时间排序的库存批次。",
                "content": {
                    "application/json": {
                        "example": [
                            {
                                "id": "batch-001",
                                "subcategory_id": "builtin-egg",
                                "subcategory_name": "鸡蛋",
                                "icon_key": "egg",
                                "storage_slot_id": "cold-1",
                                "item_name": "土鸡蛋",
                                "quantity": 6,
                                "production_date": "2026-07-30",
                                "best_before": "2026-08-06",
                                "product_description": "盒装",
                                "price": "29.90",
                                "barcode": None,
                                "expiry_status": "expiring",
                            }
                        ]
                    }
                },
            }
        },
    )
    async def inventory_list(
        refrigerator_id: str,
        include_zero: bool = Query(
            default=True,
            description="是否包含数量为 0 的库存；首页预览传 false，物品列表传 true。",
            examples=[True],
        ),
        current_owner: str = Depends(context.owner_id),
    ) -> list[InventoryBatchResponse]:
        """读取当前冰箱库存，未填 BBD 的记录不带风险状态。

        数量为 0 的记录默认保留，供物品列表恢复库存；首页预览可传
        ``include_zero=false``，让数据库查询直接排除无库存记录。
        """
        async with context.session_factory() as session:
            await _require_owned_refrigerator(session, refrigerator_id, current_owner)
            statement = select(InventoryBatchModel).where(
                InventoryBatchModel.refrigerator_id == refrigerator_id
            )
            if not include_zero:
                statement = statement.where(InventoryBatchModel.quantity > 0)
            batches = await session.scalars(
                statement.order_by(
                    InventoryBatchModel.best_before.is_(None),
                    InventoryBatchModel.best_before,
                    InventoryBatchModel.created_at,
                )
            )
            return [await inventory_response(batch, session) for batch in batches]

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/inventory",
        response_model=InventoryBatchResponse,
        status_code=201,
    )
    async def create_inventory_batch(
        refrigerator_id: str,
        payload: InventoryWriteRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> InventoryBatchResponse:
        """新增库存，或按请求语义合并符合条件的已有库存批次。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                batch = await InventoryService(session).create_batch(
                    refrigerator_id,
                    **payload.model_dump(),
                    shelf_life_days=shelf_life_days(payload),
                )
                return await inventory_response(batch, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/inventory/{batch_id}",
        response_model=InventoryBatchResponse,
    )
    async def update_inventory_batch(
        refrigerator_id: str,
        batch_id: str,
        payload: InventoryWriteRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> InventoryBatchResponse:
        """编辑单个库存批次并刷新所属大类的位置记忆。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                batch = await InventoryService(session).update_batch(
                    refrigerator_id,
                    batch_id,
                    **payload.model_dump(),
                    shelf_life_days=shelf_life_days(payload),
                )
                return await inventory_response(batch, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/inventory/move",
        response_model=list[InventoryBatchResponse],
    )
    async def move_inventory_batches(
        payload: InventoryMoveRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> list[InventoryBatchResponse]:
        """把当前所有者选中的库存批次移动到另一台自有冰箱的位置。"""
        try:
            async with context.transaction(context.session_factory) as session:
                target = await _require_owned_refrigerator(
                    session,
                    payload.target_refrigerator_id,
                    current_owner,
                    failure_status=400,
                )
                owner_refrigerator_ids = select(Refrigerator.id).where(
                    Refrigerator.owner_user_id == current_owner,
                    Refrigerator.deleted_at.is_(None),
                )
                batches = list(
                    await session.scalars(
                        select(InventoryBatchModel).where(
                            InventoryBatchModel.id.in_(payload.batch_ids),
                            InventoryBatchModel.refrigerator_id.in_(owner_refrigerator_ids),
                        )
                    )
                )
                if len(batches) != len(set(payload.batch_ids)):
                    raise ValueError("部分物品不存在或无权访问")
                moved = await InventoryService(session).move_batches(
                    target.id,
                    payload.batch_ids,
                    payload.storage_slot_id,
                )
                return [await inventory_response(batch, session) for batch in moved]
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/inventory/category",
        response_model=list[InventoryBatchResponse],
    )
    async def categorize_inventory_batches(
        refrigerator_id: str,
        payload: InventoryCategoryRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> list[InventoryBatchResponse]:
        """批量修改当前所有者冰箱中库存批次的小类。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                categorized = await InventoryService(session).reclassify_batches(
                    refrigerator_id,
                    payload.batch_ids,
                    payload.subcategory_id,
                )
                return [await inventory_response(batch, session) for batch in categorized]
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post("/api/owner/inventory/delete", status_code=204)
    async def delete_inventory_batches(
        payload: InventoryDeleteRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> Response:
        """按批次 ID 永久删除当前所有者可访问的库存记录。"""
        try:
            async with context.transaction(context.session_factory) as session:
                owner_refrigerator_ids = select(Refrigerator.id).where(
                    Refrigerator.owner_user_id == current_owner,
                    Refrigerator.deleted_at.is_(None),
                )
                batches = list(
                    await session.scalars(
                        select(InventoryBatchModel).where(
                            InventoryBatchModel.id.in_(payload.batch_ids),
                            InventoryBatchModel.refrigerator_id.in_(owner_refrigerator_ids),
                        )
                    )
                )
                if len(set(payload.batch_ids)) != len(payload.batch_ids):
                    raise ValueError("物品列表不能重复")
                if len(batches) != len(payload.batch_ids):
                    raise ValueError("部分物品不存在或无权访问")
                await InventoryService(session).delete_batches(payload.batch_ids)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return Response(status_code=204)

    @application.delete(
        "/api/owner/refrigerators/{refrigerator_id}/inventory/{batch_id}", status_code=204
    )
    async def delete_inventory_batch(
        refrigerator_id: str, batch_id: str, current_owner: str = Depends(context.owner_id)
    ) -> Response:
        """删除一个库存批次；位置记忆保留给下次同大类录入预填。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                await InventoryService(session).delete_batch(refrigerator_id, batch_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return Response(status_code=204)

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/layout",
        response_model=RefrigeratorLayoutResponse,
    )
    async def owner_refrigerator_layout(
        refrigerator_id: str, current_owner: str = Depends(context.owner_id)
    ) -> RefrigeratorLayoutResponse:
        """读取所有者冰箱的持久化布局，供预览和位置选择器复用。"""
        async with context.session_factory() as session:
            refrigerator = await _require_owned_refrigerator(
                session, refrigerator_id, current_owner
            )
            return await layout_response(refrigerator, session)

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/layout",
        response_model=RefrigeratorLayoutResponse,
    )
    async def replace_refrigerator_layout(
        refrigerator_id: str,
        payload: LayoutReplaceRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> RefrigeratorLayoutResponse:
        """保存图形化分格结果，并原子归位会被删格中的库存。"""
        try:
            async with context.transaction(context.session_factory) as session:
                refrigerator = await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                if refrigerator.revision != payload.expected_revision:
                    raise ValueError("布局已被其他设备修改，请重新读取后再保存")
                config = {
                    item.zone_key: (item.temperature_mode, item.slot_count)
                    for item in payload.zones
                }
                if len(config) != len(payload.zones):
                    raise ValueError("同一个区域只能配置一次")
                await LayoutService(session).replace_layout(refrigerator, config)
                await session.flush()
                return await layout_response(refrigerator, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/layout/slots/{storage_slot_id}/name",
        response_model=RefrigeratorLayoutResponse,
    )
    async def rename_owner_storage_slot(
        refrigerator_id: str,
        storage_slot_id: str,
        payload: StorageSlotRenameRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> RefrigeratorLayoutResponse:
        """修改所有者冰箱中一个分层的用户显示名称。"""
        try:
            async with context.transaction(context.session_factory) as session:
                refrigerator = await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                await LayoutService(session).rename_slot(
                    refrigerator, storage_slot_id, payload.name
                )
                return await layout_response(refrigerator, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get("/api/devices/current/layout", response_model=RefrigeratorLayoutResponse)
    async def device_refrigerator_layout(
        current_device: DeviceCredential = Depends(context.device),
    ) -> RefrigeratorLayoutResponse:
        """给手机位置选择器和后续墨水屏提供与所有者端完全同构的布局。"""
        async with context.session_factory() as session:
            refrigerator = await _require_active_device_refrigerator(session, current_device)
            return await layout_response(refrigerator, session)

    @application.get("/api/devices/current/inventory", response_model=list[InventoryBatchResponse])
    async def device_inventory_list(
        current_device: DeviceCredential = Depends(context.device),
    ) -> list[InventoryBatchResponse]:
        """返回已配对显示设备所属冰箱的只读库存快照。"""
        async with context.session_factory() as session:
            refrigerator = await _require_active_device_refrigerator(session, current_device)
            batches = await session.scalars(
                select(InventoryBatchModel)
                .where(InventoryBatchModel.refrigerator_id == refrigerator.id)
                .where(InventoryBatchModel.quantity > 0)
                .order_by(
                    InventoryBatchModel.best_before.is_(None),
                    InventoryBatchModel.best_before,
                    InventoryBatchModel.created_at,
                )
            )
            return [await inventory_response(batch, session) for batch in batches]

    @application.patch(
        "/api/devices/current/inventory/{batch_id}/quantity",
        response_model=InventoryBatchResponse,
    )
    async def adjust_device_inventory_quantity(
        batch_id: str,
        payload: DeviceQuantityAdjustRequest,
        current_device: DeviceCredential = Depends(context.device),
    ) -> InventoryBatchResponse:
        """让冰箱端以单步加减或全部拿走方式调整自己的库存。"""
        try:
            async with context.transaction(context.session_factory) as session:
                refrigerator = await _require_active_device_refrigerator(session, current_device)
                batch = await InventoryService(session).adjust_batch_quantity(
                    refrigerator.id, batch_id, payload.delta
                )
                return await inventory_response(batch, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/devices/current/inventory/restore",
        response_model=InventoryBatchResponse,
        status_code=201,
    )
    async def restore_device_inventory_batch(
        payload: DeviceInventoryRestoreRequest,
        current_device: DeviceCredential = Depends(context.device),
    ) -> InventoryBatchResponse:
        """恢复刚由冰箱端全部拿走的批次，并沿用普通录入的范围校验。"""
        try:
            async with context.transaction(context.session_factory) as session:
                refrigerator = await _require_active_device_refrigerator(session, current_device)
                if payload.batch_id:
                    batch = await InventoryService(session).restore_batch_quantity(
                        refrigerator.id, payload.batch_id, payload.quantity
                    )
                else:
                    if (
                        not payload.subcategory_id
                        or not payload.storage_slot_id
                        or not payload.item_name
                    ):
                        raise ValueError("恢复库存缺少分类、位置或物品名称")
                    batch = await InventoryService(session).create_batch(
                        refrigerator.id,
                        remember_last_added_location=False,
                        subcategory_id=payload.subcategory_id,
                        storage_slot_id=payload.storage_slot_id,
                        item_name=payload.item_name,
                        quantity=payload.quantity,
                        best_before=payload.best_before,
                        production_date=payload.production_date,
                        product_description=payload.product_description,
                        price=payload.price,
                        barcode=payload.barcode,
                        shelf_life_days=shelf_life_days(payload),
                    )
                return await inventory_response(batch, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
