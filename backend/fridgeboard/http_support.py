"""HTTP 路由共用的响应映射、图标资产和 Cookie 工具。"""

from __future__ import annotations

import json
from datetime import date
from hashlib import sha256
from typing import TYPE_CHECKING

from fastapi import Request, Response
from sqlalchemy.orm import Session

from fridgeboard.api_models import (
    DeviceResponse,
    FoodCategoryResponse,
    InventoryBatchResponse,
    RefrigeratorLayoutResponse,
    RefrigeratorResponse,
    RefrigeratorTemplateResponse,
    StorageSlotResponse,
    StorageZoneResponse,
    TemplateZoneResponse,
)
from fridgeboard.domain.inventory import ExpiryRule, InventoryBatch, expiry_status
from fridgeboard.layout_service import LayoutService
from fridgeboard.layouts import RefrigeratorTemplate
from fridgeboard.persistence.models import (
    ExpirySettings,
    FoodCategory,
    InventoryBatchModel,
    Refrigerator,
    StorageSlot,
)

if TYPE_CHECKING:
    from fridgeboard.api_models import InventoryWriteRequest
    from fridgeboard.persistence.models import DeviceCredential

DEVICE_COOKIE = "fb_device_credentials"

def refrigerator_response(refrigerator: Refrigerator) -> RefrigeratorResponse:
    """将持久化冰箱映射为不包含所有者信息的 API 响应。"""
    return RefrigeratorResponse(
        id=refrigerator.id, name=refrigerator.name, revision=refrigerator.revision
    )


def device_response(device: DeviceCredential, is_current: bool = False) -> DeviceResponse:
    """将设备记录映射为管理页所需的公开元数据。"""
    return DeviceResponse(
        id=device.id,
        kind=device.device_kind,
        label=device.label,
        created_at=device.created_at.isoformat(),
        last_seen_at=device.last_seen_at.isoformat() if device.last_seen_at else None,
        revoked_at=device.revoked_at.isoformat() if device.revoked_at else None,
        is_current=is_current,
    )


def category_response(category: FoodCategory) -> FoodCategoryResponse:
    """将可用分类映射为前端搜索和选择所需的安全字段。"""
    return FoodCategoryResponse(
        id=category.id,
        parent_id=category.parent_id,
        name=category.name,
        icon_key=category.icon_key,
        is_custom=category.is_custom,
        display_order=category.display_order,
    )


def inventory_response(batch: InventoryBatchModel, session: Session) -> InventoryBatchResponse:
    """生成库存列表项，并仅在有 BBD 时计算风险状态。"""
    subcategory = session.get(FoodCategory, batch.subcategory_id)
    assert subcategory is not None
    settings = session.get(ExpirySettings, batch.refrigerator_id)
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
        item_name=batch.item_name,
        quantity=batch.quantity,
        production_date=batch.production_date,
        best_before=batch.best_before,
        product_description=batch.product_description,
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


def layout_response(refrigerator: Refrigerator, session: Session) -> RefrigeratorLayoutResponse:
    """返回位置选择器和所有展示端可共同使用的布局结构。"""
    zones = LayoutService(session).layout(refrigerator)
    return RefrigeratorLayoutResponse(
        refrigerator_id=refrigerator.id,
        template_key=refrigerator.template_key,
        revision=refrigerator.revision,
        zones=[
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
                        display_order=slot.display_order,
                        geometry=slot.geometry,
                    )
                    for slot in session.query(StorageSlot)
                    .filter_by(zone_id=zone.id)
                    .order_by(StorageSlot.display_order)
                ],
                is_door=bool(zone.geometry.get("is_door", False)),
            )
            for zone in zones
        ],
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
