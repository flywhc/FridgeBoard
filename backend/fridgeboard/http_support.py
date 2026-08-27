"""HTTP 路由共用的响应映射、图标资产和 Cookie 工具。"""

from __future__ import annotations

import json
from datetime import date
from hashlib import sha256
from typing import TYPE_CHECKING, Literal

from fastapi import Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.api_models import (
    DeviceResponse,
    FoodCategoryResponse,
    InventoryBatchResponse,
    RefrigeratorLayoutResponse,
    RefrigeratorResponse,
    RefrigeratorSummaryResponse,
    RefrigeratorTemplateResponse,
    StorageSlotResponse,
    StorageZoneResponse,
    TemplateZoneResponse,
)
from fridgeboard.domain.inventory import ExpiryRule, InventoryBatch, expiry_status
from fridgeboard.layout_service import LayoutService
from fridgeboard.layouts import RefrigeratorTemplate, get_template
from fridgeboard.persistence.models import (
    DeviceCredential,
    ExpirySettings,
    FoodCategory,
    IconAsset,
    InventoryBatchModel,
    Refrigerator,
    StorageSlot,
    StorageZone,
)

if TYPE_CHECKING:
    from fridgeboard.api_models import InventoryWriteRequest
    from fridgeboard.persistence.models import DeviceCredential

DEVICE_COOKIE = "fb_device_credentials"


async def refrigerator_response(
    refrigerator: Refrigerator,
    session: AsyncSession | None = None,
    *,
    access_role: Literal["owner", "daily_access"] = "owner",
) -> RefrigeratorResponse:
    """将冰箱映射为包含设置、显示设备和当前访问角色的 API 响应。

    Args:
        refrigerator: 待公开的冰箱记录。
        session: 可选的当前数据库会话；传入后实时计算冰箱端绑定状态。
        access_role: 当前调用者对该冰箱的权限角色。

    Returns:
        不包含所有者标识或设备凭证明文的冰箱公开状态。
    """
    display_device_status = "unbound"
    if session is not None:
        has_display = await session.scalar(
            select(DeviceCredential.id).where(
                DeviceCredential.refrigerator_id == refrigerator.id,
                DeviceCredential.device_kind == "kindle",
                DeviceCredential.revoked_at.is_(None),
            )
        )
        display_device_status = "bound" if has_display is not None else "unbound"
    return RefrigeratorResponse(
        id=refrigerator.id,
        name=refrigerator.name,
        revision=refrigerator.revision,
        setup_status=refrigerator.setup_status,
        display_device_status=display_device_status,
        access_role=access_role,
    )


async def refrigerator_summary_response(
    refrigerator: Refrigerator,
    session: AsyncSession,
    *,
    access_role: Literal["owner", "daily_access"],
) -> RefrigeratorSummaryResponse:
    """将冰箱映射为统一列表使用的轻量状态和库存摘要。

    Args:
        refrigerator: 待公开的活跃冰箱记录。
        session: 用于读取显示设备和正库存数量的数据库会话。
        access_role: 当前请求对该冰箱的权限角色。

    Returns:
        不读取布局明细即可渲染冰箱列表的摘要响应。
    """
    display_device_status = (
        "bound"
        if await session.scalar(
            select(DeviceCredential.id).where(
                DeviceCredential.refrigerator_id == refrigerator.id,
                DeviceCredential.device_kind == "kindle",
                DeviceCredential.revoked_at.is_(None),
            )
        )
        is not None
        else "unbound"
    )
    inventory_quantity = sum(
        quantity
        for quantity in await session.scalars(
            select(InventoryBatchModel.quantity).where(
                InventoryBatchModel.refrigerator_id == refrigerator.id,
                InventoryBatchModel.quantity > 0,
            )
        )
    )
    return RefrigeratorSummaryResponse(
        id=refrigerator.id,
        name=refrigerator.name,
        revision=refrigerator.revision,
        template_key=refrigerator.template_key,
        template_name=get_template(refrigerator.template_key).name,
        inventory_quantity=float(inventory_quantity),
        setup_status=refrigerator.setup_status,
        display_device_status=display_device_status,
        access_role=access_role,
    )


def device_response(device: DeviceCredential, is_current: bool = False) -> DeviceResponse:
    """将设备记录映射为管理页所需的公开元数据。"""
    return DeviceResponse(
        id=device.id,
        kind=device.device_kind,
        label=device.label,
        created_at=device.created_at.isoformat(),
        last_seen_at=device.last_seen_at.isoformat() if device.last_seen_at else None,
        last_successful_sync_at=(
            device.last_successful_sync_at.isoformat() if device.last_successful_sync_at else None
        ),
        revoked_at=device.revoked_at.isoformat() if device.revoked_at else None,
        is_current=is_current,
    )


def category_response(
    category: FoodCategory, fallback_theme: Literal["ink", "skeuomorphic", "cartoon"] = "ink"
) -> FoodCategoryResponse:
    """将可用分类映射为前端搜索和选择所需的安全字段。"""
    return FoodCategoryResponse(
        id=category.id,
        parent_id=category.parent_id,
        name=category.name,
        icon_key=category.icon_key,
        is_custom=category.is_custom,
        display_order=category.display_order,
        fallback_theme=fallback_theme,
    )


async def category_response_for(
    category: FoodCategory, session: AsyncSession
) -> FoodCategoryResponse:
    """读取分类关联图标的真实 fallback 主题后构造分类响应。"""
    fallback_theme = "ink"
    if category.icon_key:
        value = await session.scalar(
            select(IconAsset.fallback_theme).where(IconAsset.key == category.icon_key)
        )
        if value in {"ink", "skeuomorphic", "cartoon"}:
            fallback_theme = value
    return category_response(category, fallback_theme)  # type: ignore[arg-type]


async def category_responses(
    categories: list[FoodCategory], session: AsyncSession
) -> list[FoodCategoryResponse]:
    """批量构造带真实图标 fallback 主题的分类响应。"""
    return [await category_response_for(category, session) for category in categories]


async def inventory_response(
    batch: InventoryBatchModel, session: AsyncSession
) -> InventoryBatchResponse:
    """生成库存列表项、位置展示名称，并仅在有 BBD 时计算风险状态。"""
    subcategory = await session.get(FoodCategory, batch.subcategory_id)
    assert subcategory is not None
    storage_slot = await session.get(StorageSlot, batch.storage_slot_id)
    assert storage_slot is not None
    storage_zone = await session.get(StorageZone, storage_slot.zone_id)
    assert storage_zone is not None
    storage_slot_name = storage_slot.custom_name or str(storage_zone.geometry["label"])
    if not storage_slot.custom_name:
        slot_number = storage_slot.slot_key.rsplit("-", 1)[-1]
        if slot_number.isdigit():
            storage_slot_name = f"{storage_slot_name}第{slot_number}格"
    settings = await session.get(ExpirySettings, batch.refrigerator_id)
    rule = ExpiryRule(
        ratio=(settings.ratio_percent / 100) if settings else 0.2,
        minimum_days=settings.minimum_days if settings else 1,
        maximum_days=settings.maximum_days if settings else 14,
    )
    status_value = expiry_status(
        InventoryBatch(
            id=batch.id,
            subcategory_id=batch.subcategory_id,
            quantity=batch.quantity,
            created_at=batch.created_at,
            best_before=batch.best_before,
            shelf_life_days=batch.shelf_life_days,
            item_name=batch.item_name,
        ),
        date.today(),
        rule,
    )
    return InventoryBatchResponse(
        id=batch.id,
        subcategory_id=subcategory.id,
        subcategory_name=subcategory.name,
        icon_key=subcategory.icon_key,
        storage_slot_id=batch.storage_slot_id,
        storage_slot_name=storage_slot_name,
        item_name=batch.item_name,
        quantity=batch.quantity,
        production_date=batch.production_date or batch.created_at.date(),
        best_before=batch.best_before,
        product_description=batch.product_description,
        price=batch.price,
        barcode=batch.barcode,
        expiry_status=str(status_value) if status_value is not None else None,
    )


def shelf_life_days(payload: InventoryWriteRequest) -> int | None:
    """按生产日期或录入当天计算内部总有效期，未填 BBD 时返回空值。"""
    if payload.best_before is None:
        return None
    baseline = payload.production_date or date.today()
    result = (payload.best_before - baseline).days
    if result < 0:
        raise ValueError("BBD 不能早于生产日期或录入日期")
    return result


def template_response(template: RefrigeratorTemplate) -> RefrigeratorTemplateResponse:
    """将固定模板定义转换为公开 API 数据。"""
    return RefrigeratorTemplateResponse(
        key=template.key,
        name=template.name,
        zones=[
            TemplateZoneResponse(
                key=zone.key,
                label=zone.label,
                temperature_mode=zone.temperature_mode,
                geometry=zone.geometry,
                layout_kind=zone.layout_kind,
                adjustable_temperature=zone.adjustable_temperature,
                is_door=zone.is_door,
            )
            for zone in template.zones
        ],
    )


async def layout_response(
    refrigerator: Refrigerator, session: AsyncSession
) -> RefrigeratorLayoutResponse:
    """返回位置选择器和所有展示端可共同使用的布局结构。"""
    zones = await LayoutService(session).layout(refrigerator)
    zone_responses = []
    for zone in zones:
        slots = list(
            await session.scalars(
                select(StorageSlot)
                .where(StorageSlot.zone_id == zone.id)
                .order_by(StorageSlot.display_order)
            )
        )
        zone_responses.append(
            StorageZoneResponse(
                key=zone.zone_key,
                label=str(zone.geometry["label"]),
                temperature_mode=zone.temperature_mode,
                geometry=zone.geometry,
                display_order=zone.display_order,
                slots=[
                    StorageSlotResponse(
                        id=slot.id,
                        key=slot.slot_key,
                        custom_name=slot.custom_name,
                        display_order=slot.display_order,
                        geometry=slot.geometry,
                    )
                    for slot in slots
                ],
                is_door=bool(zone.geometry.get("is_door", False)),
            )
        )
    return RefrigeratorLayoutResponse(
        refrigerator_id=refrigerator.id,
        template_key=refrigerator.template_key,
        revision=refrigerator.revision,
        zones=zone_responses,
    )


def tokens_from_cookie(value: str | None) -> list[str]:
    """解析 HttpOnly 设备 Cookie，丢弃畸形值且不因客户端篡改抛出 500。"""
    if not value:
        return []
    try:
        tokens = json.loads(value)
    except json.JSONDecodeError:
        return []
    return [token for token in tokens if isinstance(token, str) and len(token) <= 256]


def request_device_tokens(request: Request) -> list[str]:
    """读取请求中的 Bearer 或 HttpOnly 设备凭证，供跨身份列表接口复用。"""
    scheme, _, bearer = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() == "bearer" and bearer:
        return [bearer]
    return tokens_from_cookie(request.cookies.get(DEVICE_COOKIE))


def set_device_cookie(response: Response, request: Request, token: str) -> None:
    """在不覆盖同一浏览器其他冰箱凭证的前提下写入 HttpOnly Cookie。"""
    tokens = tokens_from_cookie(request.cookies.get(DEVICE_COOKIE))
    if token not in tokens:
        tokens.append(token)
    response.set_cookie(
        DEVICE_COOKIE,
        json.dumps(tokens[-12:], separators=(",", ":")),
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
        max_age=60 * 60 * 24 * 365,
    )


def reminder_owner_key(owner_token: str) -> str:
    """将所有者会话令牌转换为不可逆的提醒收件人键。"""
    return sha256(owner_token.encode("utf-8")).hexdigest()
