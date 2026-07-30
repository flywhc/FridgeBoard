"""库存、分类和位置布局 HTTP 路由。"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass

from fastapi import Depends, FastAPI, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from fridgeboard.api_models import (
    CustomCategoryRequest,
    DefaultLocationResponse,
    DeviceQuantityAdjustRequest,
    FoodCategoryResponse,
    InventoryBatchResponse,
    InventoryWriteRequest,
    LayoutReplaceRequest,
    RefrigeratorLayoutResponse,
)
from fridgeboard.http_support import (
    ICON_LIBRARY,
    category_response,
    inventory_response,
    layout_response,
    shelf_life_days,
)
from fridgeboard.inventory_service import InventoryService
from fridgeboard.layout_service import LayoutService
from fridgeboard.persistence.models import DeviceCredential, InventoryBatchModel, Refrigerator

SessionFactory = Callable[[], Session]
TransactionFactory = Callable[[SessionFactory], AbstractContextManager[Session]]
OwnerDependency = Callable[..., str]
DeviceDependency = Callable[..., DeviceCredential]


@dataclass(frozen=True)
class InventoryRouteContext:
    """库存路由需要的数据库、认证和服务依赖。"""

    session_factory: SessionFactory
    transaction: TransactionFactory
    owner_id: OwnerDependency
    device: DeviceDependency


def _require_owned_refrigerator(
    session: Session, refrigerator_id: str, current_owner: str, failure_status: int = 404
) -> Refrigerator:
    """返回当前所有者拥有的冰箱，并保留调用接口的既有失败状态码。"""
    refrigerator = session.get(Refrigerator, refrigerator_id)
    if (
        refrigerator is None
        or refrigerator.owner_user_id != current_owner
        or refrigerator.deleted_at is not None
    ):
        raise HTTPException(status_code=failure_status, detail="冰箱不存在或无权访问")
    return refrigerator


def _require_active_device_refrigerator(session: Session, device: DeviceCredential) -> Refrigerator:
    """返回设备所属的活跃冰箱，撤销或删除后统一返回 401。"""
    refrigerator = session.get(Refrigerator, device.refrigerator_id)
    if refrigerator is None or refrigerator.deleted_at is not None:
        raise HTTPException(status_code=401, detail="设备访问已移除或需要重新配对")
    return refrigerator


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
    def inventory_categories(
        refrigerator_id: str, q: str | None = None, current_owner: str = Depends(context.owner_id)
    ) -> list[FoodCategoryResponse]:
        """搜索当前冰箱可用的大类、内置小类和已确认的自定义小类。"""
        with context.transaction(context.session_factory) as session:
            _require_owned_refrigerator(session, refrigerator_id, current_owner)
            return [
                category_response(item)
                for item in InventoryService(session).categories(refrigerator_id, q)
            ]

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/categories",
        response_model=FoodCategoryResponse,
        status_code=201,
    )
    def create_custom_category(
        refrigerator_id: str,
        payload: CustomCategoryRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> FoodCategoryResponse:
        """手工创建自定义小类，并保存用户选定图标键以供后续录入复用。"""
        try:
            if payload.icon_key and payload.icon_key not in {item[0] for item in ICON_LIBRARY}:
                raise ValueError("图标不存在")
            with context.transaction(context.session_factory) as session:
                _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                category = InventoryService(session).create_custom_subcategory(
                    refrigerator_id, payload.parent_id, payload.name, payload.icon_key
                )
                return category_response(category)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/inventory/default-location",
        response_model=DefaultLocationResponse,
    )
    def inventory_default_location(
        refrigerator_id: str, current_owner: str = Depends(context.owner_id)
    ) -> DefaultLocationResponse:
        """读取冰箱最近添加位置，首次录入时返回空值供前端回退。"""
        with context.transaction(context.session_factory) as session:
            _require_owned_refrigerator(session, refrigerator_id, current_owner, failure_status=400)
            return DefaultLocationResponse(
                storage_slot_id=InventoryService(session).last_added_location(refrigerator_id)
            )

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/inventory",
        response_model=list[InventoryBatchResponse],
    )
    def inventory_list(
        refrigerator_id: str, current_owner: str = Depends(context.owner_id)
    ) -> list[InventoryBatchResponse]:
        """读取当前冰箱库存，未填 BBD 的记录不带风险状态。"""
        with context.session_factory() as session:
            _require_owned_refrigerator(session, refrigerator_id, current_owner)
            batches = session.scalars(
                select(InventoryBatchModel)
                .where(InventoryBatchModel.refrigerator_id == refrigerator_id)
                .order_by(
                    InventoryBatchModel.best_before.is_(None),
                    InventoryBatchModel.best_before,
                    InventoryBatchModel.created_at,
                )
            )
            return [inventory_response(batch, session) for batch in batches]

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/inventory",
        response_model=InventoryBatchResponse,
        status_code=201,
    )
    def create_inventory_batch(
        refrigerator_id: str,
        payload: InventoryWriteRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> InventoryBatchResponse:
        """新增或合并同小类、位置、描述和 BBD 的库存批次。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                batch = InventoryService(session).create_batch(
                    refrigerator_id,
                    **payload.model_dump(),
                    shelf_life_days=shelf_life_days(payload),
                )
                return inventory_response(batch, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/inventory/{batch_id}",
        response_model=InventoryBatchResponse,
    )
    def update_inventory_batch(
        refrigerator_id: str,
        batch_id: str,
        payload: InventoryWriteRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> InventoryBatchResponse:
        """编辑单个库存批次并刷新所属大类的位置记忆。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                batch = InventoryService(session).update_batch(
                    refrigerator_id,
                    batch_id,
                    **payload.model_dump(),
                    shelf_life_days=shelf_life_days(payload),
                )
                return inventory_response(batch, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.delete(
        "/api/owner/refrigerators/{refrigerator_id}/inventory/{batch_id}", status_code=204
    )
    def delete_inventory_batch(
        refrigerator_id: str, batch_id: str, current_owner: str = Depends(context.owner_id)
    ) -> Response:
        """删除一个库存批次；位置记忆保留给下次同大类录入预填。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                InventoryService(session).delete_batch(refrigerator_id, batch_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return Response(status_code=204)

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/layout",
        response_model=RefrigeratorLayoutResponse,
    )
    def owner_refrigerator_layout(
        refrigerator_id: str, current_owner: str = Depends(context.owner_id)
    ) -> RefrigeratorLayoutResponse:
        """读取所有者冰箱的持久化布局，供预览和位置选择器复用。"""
        with context.session_factory() as session:
            refrigerator = _require_owned_refrigerator(session, refrigerator_id, current_owner)
            return layout_response(refrigerator, session)

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/layout",
        response_model=RefrigeratorLayoutResponse,
    )
    def replace_refrigerator_layout(
        refrigerator_id: str,
        payload: LayoutReplaceRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> RefrigeratorLayoutResponse:
        """保存图形化分格结果，并原子归位会被删格中的库存。"""
        try:
            with context.transaction(context.session_factory) as session:
                refrigerator = _require_owned_refrigerator(
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
                LayoutService(session).replace_layout(refrigerator, config)
                session.flush()
                return layout_response(refrigerator, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get("/api/devices/current/layout", response_model=RefrigeratorLayoutResponse)
    def device_refrigerator_layout(
        current_device: DeviceCredential = Depends(context.device),
    ) -> RefrigeratorLayoutResponse:
        """给手机位置选择器和后续墨水屏提供与所有者端完全同构的布局。"""
        with context.session_factory() as session:
            refrigerator = _require_active_device_refrigerator(session, current_device)
            return layout_response(refrigerator, session)

    @application.get("/api/devices/current/inventory", response_model=list[InventoryBatchResponse])
    def device_inventory_list(
        current_device: DeviceCredential = Depends(context.device),
    ) -> list[InventoryBatchResponse]:
        """返回已配对显示设备所属冰箱的只读库存快照。"""
        with context.session_factory() as session:
            refrigerator = _require_active_device_refrigerator(session, current_device)
            batches = session.scalars(
                select(InventoryBatchModel)
                .where(InventoryBatchModel.refrigerator_id == refrigerator.id)
                .order_by(
                    InventoryBatchModel.best_before.is_(None),
                    InventoryBatchModel.best_before,
                    InventoryBatchModel.created_at,
                )
            )
            return [inventory_response(batch, session) for batch in batches]

    @application.patch(
        "/api/devices/current/inventory/{batch_id}/quantity",
        response_model=InventoryBatchResponse | None,
    )
    def adjust_device_inventory_quantity(
        batch_id: str,
        payload: DeviceQuantityAdjustRequest,
        current_device: DeviceCredential = Depends(context.device),
    ) -> InventoryBatchResponse | None:
        """让冰箱端以单步加减或全部拿走方式调整自己的库存。"""
        try:
            with context.transaction(context.session_factory) as session:
                refrigerator = _require_active_device_refrigerator(session, current_device)
                batch = InventoryService(session).adjust_batch_quantity(
                    refrigerator.id, batch_id, payload.delta
                )
                return inventory_response(batch, session) if batch is not None else None
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/devices/current/inventory/restore",
        response_model=InventoryBatchResponse,
        status_code=201,
    )
    def restore_device_inventory_batch(
        payload: InventoryWriteRequest,
        current_device: DeviceCredential = Depends(context.device),
    ) -> InventoryBatchResponse:
        """恢复刚由冰箱端全部拿走的批次，并沿用普通录入的范围校验。"""
        try:
            with context.transaction(context.session_factory) as session:
                refrigerator = _require_active_device_refrigerator(session, current_device)
                batch = InventoryService(session).create_batch(
                    refrigerator.id,
                    remember_last_added_location=False,
                    **payload.model_dump(),
                    shelf_life_days=shelf_life_days(payload),
                )
                return inventory_response(batch, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
