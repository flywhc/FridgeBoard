"""HTTP 路由共用的响应映射、图标资产和 Cookie 工具。"""

# 静态 SVG 路径来自设计资产，保持单条资产字符串便于复制和审校。
# ruff: noqa: E501

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

# 这些路径来自冻结设计稿引用的 Lucide 图标；本地化后，PWA 和墨水屏无需依赖 Iconify CDN。
ICON_LIBRARY: tuple[tuple[str, str, str], ...] = (
    (
        "meat",
        "肉类",
        '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M15.4 15.63a7.875 6 135 1 1 6.23-6.23a4.5 3.43 135 0 0-6.23 6.23"/><path d="m8.29 12.71l-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59"/></g>',
    ),
    (
        "egg",
        "鸡蛋",
        '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2C8 2 4 8 4 14a8 8 0 0 0 16 0c0-6-4-12-8-12"/>',
    ),
    (
        "milk",
        "奶类",
        '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M8 2h8M9 2v2.789a4 4 0 0 1-.672 2.219l-.656.984A4 4 0 0 0 7 10.212V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9.789a4 4 0 0 0-.672-2.219l-.656-.984A4 4 0 0 1 15 4.788V2"/><path d="M7 15a6.47 6.47 0 0 1 5 0a6.47 6.47 0 0 0 5 0"/></g>',
    ),
    (
        "vegetable",
        "蔬菜",
        '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M15 16a1 1 0 0 0-7-7q-4 4-5.987 12.385a.5.5 0 0 0 .602.602Q11 20 15 16l-3-3"/><path d="M15 9q4 4 7 0q-3-4-7 0q4-4 0-7q-4 3 0 7m-7 6l-2.58-2.58"/></g>',
    ),
    (
        "fruit",
        "水果",
        '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 6.528V3a1 1 0 0 1 1-1h0"/><path d="M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10a3 3 0 0 0 3.648.648a5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21"/></g>',
    ),
    (
        "fish",
        "水产",
        '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M6.5 12c.94-3.46 4.94-6 8.5-6s6.06 2.54 7 6c-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86m-9 4.6C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5c-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33"/></g>',
    ),
    (
        "rice",
        "主食",
        '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2 22L16 8M3.47 12.53L5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94m4-4L9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94"/></g>',
    ),
    (
        "drink",
        "饮品",
        '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m6 8l1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8M5 8h14"/><path d="M7 15a6.47 6.47 0 0 1 5 0a6.47 6.47 0 0 0 5 0m-5-7l1-6h2"/></g>',
    ),
    (
        "condiment",
        "调味",
        '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m12 9l-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12"/><path d="m18 9l.4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4l3.4-3.4a1 1 0 1 1 3 3z"/></g>',
    ),
    (
        "other",
        "其他",
        '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></g>',
    ),
)


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
    )


def inventory_response(batch: InventoryBatchModel, session: Session) -> InventoryBatchResponse:
    """生成库存列表项，并仅在有 BBD 时计算风险状态。"""
    category = session.get(FoodCategory, batch.category_id)
    subcategory = session.get(FoodCategory, batch.subcategory_id)
    assert category is not None and subcategory is not None
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
        category_id=category.id,
        category_name=category.name,
        subcategory_id=subcategory.id,
        subcategory_name=subcategory.name,
        icon_key=subcategory.icon_key or category.icon_key,
        storage_slot_id=batch.storage_slot_id,
        food_name=batch.food_name,
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
