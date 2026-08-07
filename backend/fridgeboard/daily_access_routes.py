"""PWA 日常访问工作区路由。

本模块只面向已配对的 PWA 设备凭证，提供指定冰箱的布局、分类、图标、库存和食谱
日常工作区。所有者更名、布局维护、设备管理、删除/恢复和通知设置继续由所有者路由
处理；本模块不提供这些管理操作。数据库读写依赖调用方注入的会话和事务边界。
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from fridgeboard.api_models import (
    DefaultLocationResponse,
    DeviceInventoryRestoreRequest,
    DeviceQuantityAdjustRequest,
    FoodCategoryResponse,
    IconResponse,
    InventoryBatchResponse,
    InventoryWriteRequest,
    RecipeDayResponse,
    RecipeEntryResponse,
    RecipeHistoryWeekResponse,
    RefrigeratorLayoutResponse,
    RestockEntryResponse,
)
from fridgeboard.http_support import (
    category_response,
    inventory_response,
    layout_response,
    shelf_life_days,
)
from fridgeboard.icon_service import IconGenerationProvider, IconService
from fridgeboard.inventory_service import InventoryService
from fridgeboard.item_catalog import asset_revision
from fridgeboard.persistence.models import DeviceCredential, InventoryBatchModel, Refrigerator
from fridgeboard.recipe_service import RecipeService

SessionFactory = Callable[[], Session]
TransactionFactory = Callable[[SessionFactory], AbstractContextManager[Session]]
DeviceDependency = Callable[..., DeviceCredential]

_DAILY_ACCESS_ERRORS = {
    401: {"description": "缺少、失效、撤销或已删除目标冰箱的 PWA 设备凭证。"},
    403: {"description": "凭证不是 PWA，或目标冰箱不属于该 PWA 的日常访问范围。"},
}


@dataclass(frozen=True)
class DailyAccessRouteContext:
    """日常访问路由需要的数据库、认证、事务和图标资产依赖。"""

    session_factory: SessionFactory
    transaction: TransactionFactory
    device: DeviceDependency
    icon_generation_provider: IconGenerationProvider | None
    persistent_icon_dir: Path
    temporary_icon_dir: Path


def _require_daily_refrigerator(
    session: Session, device: DeviceCredential, refrigerator_id: str
) -> Refrigerator:
    """验证 PWA 凭证与路径中的冰箱一致，并区分 401 与 403。

    Args:
        session: 当前请求使用的数据库会话。
        device: 已由应用级设备依赖解析的设备凭证。
        refrigerator_id: 请求路径中的目标冰箱 ID。

    Returns:
        未软删除且属于该 PWA 凭证的冰箱记录。

    Raises:
        HTTPException: 凭证不是 PWA 时返回 403；冰箱不在该凭证范围时返回 403；
            凭证所属冰箱已删除时返回 401。
    """
    if device.device_kind != "pwa":
        raise HTTPException(status_code=403, detail="日常工作区仅允许 PWA 设备凭证")
    if device.refrigerator_id != refrigerator_id:
        raise HTTPException(status_code=403, detail="该设备无权访问目标冰箱")
    refrigerator = session.get(Refrigerator, refrigerator_id)
    if refrigerator is None or refrigerator.deleted_at is not None:
        raise HTTPException(status_code=401, detail="设备访问已移除或需要重新配对")
    return refrigerator


def _icon_service(context: DailyAccessRouteContext, session: Session) -> IconService:
    """构造只读图标服务，复用所有者和显示设备端的资产解析规则。"""
    return IconService(
        session,
        context.persistent_icon_dir,
        context.temporary_icon_dir,
        context.icon_generation_provider,
    )


def _normalized_week_start(value: date) -> date:
    """将任意日期归一化为所在自然周的周一。"""
    return value - timedelta(days=value.weekday())


def register_daily_access_routes(application: FastAPI, context: DailyAccessRouteContext) -> None:
    """注册 PWA 日常访问工作区接口。

    Args:
        application: 要追加路由的 FastAPI 应用实例。
        context: 当前应用的设备凭证、数据库和图标资产依赖。
    """

    @application.get(
        "/api/daily/refrigerators/{refrigerator_id}/layout",
        response_model=RefrigeratorLayoutResponse,
        responses={
            **_DAILY_ACCESS_ERRORS,
            200: {"description": "目标冰箱的持久化日常布局。"},
        },
    )
    def daily_layout(
        refrigerator_id: str,
        current_device: DeviceCredential = Depends(context.device),
    ) -> RefrigeratorLayoutResponse:
        """读取日常工作区使用的冰箱布局；不允许通过此接口修改布局。"""
        with context.session_factory() as session:
            refrigerator = _require_daily_refrigerator(session, current_device, refrigerator_id)
            return layout_response(refrigerator, session)

    @application.get(
        "/api/daily/refrigerators/{refrigerator_id}/categories",
        response_model=list[FoodCategoryResponse],
        responses=_DAILY_ACCESS_ERRORS,
    )
    def daily_categories(
        refrigerator_id: str,
        q: str | None = Query(default=None, description="可选的分类名称搜索词。"),
        current_device: DeviceCredential = Depends(context.device),
    ) -> list[FoodCategoryResponse]:
        """读取当前冰箱可用于日常录入的内置和自定义分类。"""
        with context.transaction(context.session_factory) as session:
            _require_daily_refrigerator(session, current_device, refrigerator_id)
            return [
                category_response(item)
                for item in InventoryService(session).categories(refrigerator_id, q)
            ]

    @application.get(
        "/api/daily/refrigerators/{refrigerator_id}/categories/recent",
        response_model=list[FoodCategoryResponse],
        responses=_DAILY_ACCESS_ERRORS,
    )
    def daily_recent_categories(
        refrigerator_id: str,
        current_device: DeviceCredential = Depends(context.device),
    ) -> list[FoodCategoryResponse]:
        """读取日常录入选择器最近使用过的分类。"""
        with context.transaction(context.session_factory) as session:
            _require_daily_refrigerator(session, current_device, refrigerator_id)
            return [
                category_response(item)
                for item in InventoryService(session).recent_subcategories(refrigerator_id)
            ]

    @application.get(
        "/api/daily/refrigerators/{refrigerator_id}/inventory/default-location",
        response_model=DefaultLocationResponse,
        responses=_DAILY_ACCESS_ERRORS,
    )
    def daily_inventory_default_location(
        refrigerator_id: str,
        current_device: DeviceCredential = Depends(context.device),
    ) -> DefaultLocationResponse:
        """读取日常录入默认位置；首次使用时返回空值。"""
        with context.transaction(context.session_factory) as session:
            _require_daily_refrigerator(session, current_device, refrigerator_id)
            return DefaultLocationResponse(
                storage_slot_id=InventoryService(session).last_added_location(refrigerator_id)
            )

    @application.get(
        "/api/daily/refrigerators/{refrigerator_id}/icons",
        response_model=list[IconResponse],
        responses=_DAILY_ACCESS_ERRORS,
    )
    def daily_icons(
        refrigerator_id: str,
        current_device: DeviceCredential = Depends(context.device),
    ) -> list[IconResponse]:
        """读取当前冰箱可复用的内置和已确认自定义图标。"""
        with context.transaction(context.session_factory) as session:
            _require_daily_refrigerator(session, current_device, refrigerator_id)
            service = _icon_service(context, session)
            return [
                IconResponse(
                    key=item.key,
                    label=item.label,
                    asset_url=(
                        f"/api/daily/refrigerators/{refrigerator_id}/icons/{item.key}"
                        f"?v={asset_revision(service.asset_path(refrigerator_id, item.key)[0])}"
                    ),
                    media_type=item.media_type,
                )
                for item in service.assets(refrigerator_id)
            ]

    @application.get(
        "/api/daily/refrigerators/{refrigerator_id}/icons/{icon_key}",
        response_class=FileResponse,
        responses=_DAILY_ACCESS_ERRORS,
    )
    def daily_icon_asset(
        refrigerator_id: str,
        icon_key: str,
        current_device: DeviceCredential = Depends(context.device),
    ) -> FileResponse:
        """读取当前冰箱范围内的一个图标资产。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_daily_refrigerator(session, current_device, refrigerator_id)
                path, media_type = _icon_service(context, session).asset_path(
                    refrigerator_id, icon_key
                )
                return FileResponse(path, media_type=media_type)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.get(
        "/api/daily/refrigerators/{refrigerator_id}/inventory",
        response_model=list[InventoryBatchResponse],
        responses={
            **_DAILY_ACCESS_ERRORS,
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
                                "storage_slot_id": "slot-001",
                                "item_name": "土鸡蛋",
                                "quantity": 6,
                                "production_date": "2026-08-01",
                                "best_before": "2026-08-08",
                                "product_description": "盒装",
                                "barcode": None,
                                "expiry_status": "normal",
                            }
                        ]
                    }
                },
            },
        },
    )
    def daily_inventory(
        refrigerator_id: str,
        include_zero: bool = Query(
            default=True,
            description="是否包含数量为 0 的记录，便于日常撤销和恢复库存。",
            examples=[True],
        ),
        current_device: DeviceCredential = Depends(context.device),
    ) -> list[InventoryBatchResponse]:
        """读取目标冰箱的日常库存；数量为 0 的批次默认保留。"""
        with context.session_factory() as session:
            _require_daily_refrigerator(session, current_device, refrigerator_id)
            statement = select(InventoryBatchModel).where(
                InventoryBatchModel.refrigerator_id == refrigerator_id
            )
            if not include_zero:
                statement = statement.where(InventoryBatchModel.quantity > 0)
            batches = session.scalars(
                statement.order_by(
                    InventoryBatchModel.best_before.is_(None),
                    InventoryBatchModel.best_before,
                    InventoryBatchModel.created_at,
                )
            )
            return [inventory_response(batch, session) for batch in batches]

    @application.post(
        "/api/daily/refrigerators/{refrigerator_id}/inventory",
        response_model=InventoryBatchResponse,
        status_code=201,
        responses={
            **_DAILY_ACCESS_ERRORS,
            201: {"description": "已新增或合并一个库存批次。"},
        },
    )
    def create_daily_inventory(
        refrigerator_id: str,
        payload: InventoryWriteRequest,
        current_device: DeviceCredential = Depends(context.device),
    ) -> InventoryBatchResponse:
        """允许 PWA 日常录入库存，但不允许通过此接口维护布局或分类。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_daily_refrigerator(session, current_device, refrigerator_id)
                batch = InventoryService(session).create_batch(
                    refrigerator_id,
                    **payload.model_dump(),
                    shelf_life_days=shelf_life_days(payload),
                )
                return inventory_response(batch, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.put(
        "/api/daily/refrigerators/{refrigerator_id}/inventory/{batch_id}",
        response_model=InventoryBatchResponse,
        responses=_DAILY_ACCESS_ERRORS,
    )
    def update_daily_inventory(
        refrigerator_id: str,
        batch_id: str,
        payload: InventoryWriteRequest,
        current_device: DeviceCredential = Depends(context.device),
    ) -> InventoryBatchResponse:
        """允许 PWA 编辑自己的日常库存批次字段。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_daily_refrigerator(session, current_device, refrigerator_id)
                batch = InventoryService(session).update_batch(
                    refrigerator_id,
                    batch_id,
                    **payload.model_dump(),
                    shelf_life_days=shelf_life_days(payload),
                )
                return inventory_response(batch, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.patch(
        "/api/daily/refrigerators/{refrigerator_id}/inventory/{batch_id}/quantity",
        response_model=InventoryBatchResponse,
        responses={
            **_DAILY_ACCESS_ERRORS,
            200: {"description": "已完成一次明确的库存数量调整。"},
        },
    )
    def adjust_daily_inventory_quantity(
        refrigerator_id: str,
        batch_id: str,
        payload: DeviceQuantityAdjustRequest,
        current_device: DeviceCredential = Depends(context.device),
    ) -> InventoryBatchResponse:
        """按一次加减或全部拿走调整库存数量，并保留可恢复的零库存批次。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_daily_refrigerator(session, current_device, refrigerator_id)
                batch = InventoryService(session).adjust_batch_quantity(
                    refrigerator_id, batch_id, payload.delta
                )
                return inventory_response(batch, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/daily/refrigerators/{refrigerator_id}/inventory/restore",
        response_model=InventoryBatchResponse,
        status_code=201,
        responses={
            **_DAILY_ACCESS_ERRORS,
            201: {"description": "已恢复原库存批次，或按兼容字段录入一个恢复批次。"},
        },
    )
    def restore_daily_inventory(
        refrigerator_id: str,
        payload: DeviceInventoryRestoreRequest,
        current_device: DeviceCredential = Depends(context.device),
    ) -> InventoryBatchResponse:
        """撤销日常“全部拿走”操作，或兼容旧客户端创建恢复批次。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_daily_refrigerator(session, current_device, refrigerator_id)
                if payload.batch_id:
                    batch = InventoryService(session).restore_batch_quantity(
                        refrigerator_id, payload.batch_id, payload.quantity
                    )
                else:
                    if (
                        not payload.subcategory_id
                        or not payload.storage_slot_id
                        or not payload.item_name
                    ):
                        raise ValueError("恢复库存缺少分类、位置或物品名称")
                    batch = InventoryService(session).create_batch(
                        refrigerator_id,
                        remember_last_added_location=False,
                        subcategory_id=payload.subcategory_id,
                        storage_slot_id=payload.storage_slot_id,
                        item_name=payload.item_name,
                        quantity=payload.quantity,
                        best_before=payload.best_before,
                        production_date=payload.production_date,
                        product_description=payload.product_description,
                        barcode=payload.barcode,
                        shelf_life_days=shelf_life_days(payload),
                    )
                return inventory_response(batch, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get(
        "/api/daily/refrigerators/{refrigerator_id}/recipes",
        response_model=list[RecipeDayResponse],
        responses=_DAILY_ACCESS_ERRORS,
    )
    def daily_recipes(
        refrigerator_id: str,
        week_start: date,
        current_device: DeviceCredential = Depends(context.device),
    ) -> list[RecipeDayResponse]:
        """读取指定自然周的食谱及实时缺货信息。"""
        with context.session_factory() as session:
            _require_daily_refrigerator(session, current_device, refrigerator_id)
            return RecipeService(session).list_week(
                refrigerator_id, _normalized_week_start(week_start)
            )

    @application.get(
        "/api/daily/refrigerators/{refrigerator_id}/recipes/history",
        response_model=list[RecipeHistoryWeekResponse],
        responses=_DAILY_ACCESS_ERRORS,
    )
    def daily_recipe_history(
        refrigerator_id: str,
        week_start: date | None = None,
        current_device: DeviceCredential = Depends(context.device),
    ) -> list[RecipeHistoryWeekResponse]:
        """读取当前周之前的最近八周食谱摘要。"""
        with context.session_factory() as session:
            _require_daily_refrigerator(session, current_device, refrigerator_id)
            return RecipeService(session).list_history(
                refrigerator_id, _normalized_week_start(week_start or date.today())
            )

    @application.get(
        "/api/daily/refrigerators/{refrigerator_id}/restock",
        response_model=list[RestockEntryResponse],
        responses=_DAILY_ACCESS_ERRORS,
    )
    def daily_restock(
        refrigerator_id: str,
        week_start: date,
        current_device: DeviceCredential = Depends(context.device),
    ) -> list[RestockEntryResponse]:
        """读取本周和下周食谱产生的动态缺货清单。"""
        with context.session_factory() as session:
            _require_daily_refrigerator(session, current_device, refrigerator_id)
            return RecipeService(session).restock(
                refrigerator_id, _normalized_week_start(week_start)
            )

    @application.post(
        "/api/daily/refrigerators/{refrigerator_id}/recipes/{entry_id}/complete",
        response_model=RecipeEntryResponse,
        responses={
            **_DAILY_ACCESS_ERRORS,
            200: {"description": "已完成食谱并原子扣减匹配库存。"},
        },
    )
    def complete_daily_recipe(
        refrigerator_id: str,
        entry_id: str,
        current_device: DeviceCredential = Depends(context.device),
    ) -> RecipeEntryResponse:
        """允许 PWA 完成食谱，并复用服务层的库存扣减审计。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_daily_refrigerator(session, current_device, refrigerator_id)
                return RecipeService(session).complete(refrigerator_id, entry_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/daily/refrigerators/{refrigerator_id}/recipes/{entry_id}/undo",
        response_model=RecipeEntryResponse,
        responses={
            **_DAILY_ACCESS_ERRORS,
            200: {"description": "已撤销食谱完成并恢复实际扣减的库存。"},
        },
    )
    def undo_daily_recipe(
        refrigerator_id: str,
        entry_id: str,
        current_device: DeviceCredential = Depends(context.device),
    ) -> RecipeEntryResponse:
        """允许 PWA 撤销食谱完成，并复用服务层的逐批次恢复审计。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_daily_refrigerator(session, current_device, refrigerator_id)
                return RecipeService(session).undo(refrigerator_id, entry_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
