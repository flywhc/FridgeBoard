"""库存、分类和位置布局 HTTP 路由。"""

from __future__ import annotations

import logging
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.api_models import (
    CategoryRecognitionRequest,
    CategoryRecognitionResponse,
    CategoryUpdateRequest,
    CustomCategoryRequest,
    CustomGroupRequest,
    DefaultLocationResponse,
    DeviceInventoryRestoreRequest,
    DeviceQuantityAdjustRequest,
    FoodCategoryResponse,
    InventoryBatchResponse,
    InventoryCategoryRequest,
    InventoryDeleteRequest,
    InventoryMoveRequest,
    InventoryWriteRequest,
    LayoutReplaceRequest,
    RefrigeratorLayoutResponse,
    StorageSlotRenameRequest,
)
from fridgeboard.category_recognition_service import CategoryRecognitionService
from fridgeboard.http_support import (
    category_response_for,
    category_responses,
    inventory_response,
    layout_response,
    shelf_life_days,
)
from fridgeboard.icon_routes import register_icon_routes
from fridgeboard.icon_service import (
    IconGenerationProvider,
    IconKeywordProvider,
)
from fridgeboard.inventory_service import CategoryOwnershipError, InventoryService
from fridgeboard.item_catalog import (
    ensure_builtin_catalog,
)
from fridgeboard.layout_service import LayoutService
from fridgeboard.persistence.models import (
    DeviceCredential,
    IconAsset,
    InventoryBatchModel,
    Refrigerator,
)
from fridgeboard.route_auth import (
    require_active_device_refrigerator as _require_active_device_refrigerator,
)
from fridgeboard.route_auth import (
    require_owned_refrigerator as _require_owned_refrigerator,
)

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
    ink_icon_generation_provider: IconGenerationProvider | None = None
    icon_keyword_provider: IconKeywordProvider | None = None


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
            return await category_responses(
                await InventoryService(session).categories(refrigerator_id, q),
                session,
                current_owner,
            )

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
                if not payload.icon_key.strip():
                    raise ValueError("自定义小类必须绑定逻辑图标")
                icon = await session.get(IconAsset, payload.icon_key)
                if icon is None or icon.owner_user_id not in {None, current_owner}:
                    raise ValueError("图标不存在")
                category = await InventoryService(session).create_custom_subcategory(
                    refrigerator_id,
                    payload.parent_id,
                    payload.name,
                    payload.icon_key,
                    current_owner,
                )
                return await category_response_for(category, session, current_owner)
        except CategoryOwnershipError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
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
                return await category_response_for(group, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.patch(
        "/api/owner/refrigerators/{refrigerator_id}/categories/{category_id}",
        response_model=FoodCategoryResponse,
    )
    async def update_custom_category(
        refrigerator_id: str,
        category_id: str,
        payload: CategoryUpdateRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> FoodCategoryResponse:
        """编辑自定义小类；系统小类由服务层拒绝。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                if payload.icon_key is not None:
                    icon = await session.get(IconAsset, payload.icon_key)
                    if icon is None or icon.owner_user_id not in {None, current_owner}:
                        raise ValueError("图标不存在")
                category = await InventoryService(session).update_custom_subcategory(
                    refrigerator_id,
                    category_id,
                    payload.name,
                    payload.parent_id,
                    payload.icon_key,
                    created_by_user_id=current_owner,
                )
                return await category_response_for(category, session, current_owner)
        except CategoryOwnershipError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/categories/{category_id}/recognize-items",
        response_model=CategoryRecognitionResponse,
    )
    async def recognize_custom_category_items(
        refrigerator_id: str,
        category_id: str,
        payload: CategoryRecognitionRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> CategoryRecognitionResponse:
        """跨当前所有者全部活跃自有冰箱识别并更新目标自定义小类。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                category, items = await CategoryRecognitionService(session).recognize(
                    current_owner,
                    refrigerator_id,
                    category_id,
                    payload.context_item_name,
                    payload.context_inventory_batch_id,
                )
                return CategoryRecognitionResponse(
                    category_id=category.id,
                    category_name=category.name,
                    items=items,
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.delete(
        "/api/owner/refrigerators/{refrigerator_id}/categories/{category_id}",
        status_code=204,
    )
    async def delete_custom_category(
        refrigerator_id: str,
        category_id: str,
        current_owner: str = Depends(context.owner_id),
    ) -> Response:
        """删除当前用户创建且尚未被业务数据引用的自定义小类。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                await InventoryService(
                    session, temporary_icon_dir=context.temporary_icon_dir
                ).delete_custom_subcategory(
                    refrigerator_id,
                    category_id,
                    current_owner,
                )
            return Response(status_code=204)
        except CategoryOwnershipError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
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
            return await category_responses(
                await InventoryService(session).recent_subcategories(refrigerator_id),
                session,
                current_owner,
            )

    register_icon_routes(application, context)

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
                                "storage_slot_name": "冷藏室第1格",
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
        """幂等删除当前所有者的库存记录，并拒绝其他账号的批次。"""
        try:
            async with context.transaction(context.session_factory) as session:
                if len(set(payload.batch_ids)) != len(payload.batch_ids):
                    raise ValueError("物品列表不能重复")
                batches = list(
                    await session.scalars(
                        select(InventoryBatchModel).where(
                            InventoryBatchModel.id.in_(payload.batch_ids)
                        )
                    )
                )
                owner_refrigerator_ids = set(
                    await session.scalars(
                        select(Refrigerator.id).where(
                            Refrigerator.owner_user_id == current_owner,
                            Refrigerator.deleted_at.is_(None),
                        )
                    )
                )
                if any(batch.refrigerator_id not in owner_refrigerator_ids for batch in batches):
                    raise HTTPException(status_code=403, detail="部分物品不属于当前账号")
                existing_ids = {batch.id for batch in batches}
                deletable_ids = [
                    batch_id for batch_id in payload.batch_ids if batch_id in existing_ids
                ]
                if deletable_ids:
                    await InventoryService(session).delete_batches(deletable_ids)
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
