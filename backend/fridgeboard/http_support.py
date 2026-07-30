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
        "chicken",
        "鸡肉",
        '<g transform="scale(.75)" fill="currentColor"><path d="M9.5 12.83a1.5 1.5 0 1 0 0-3.001a1.5 1.5 0 0 0 0 3"/><path d="m3 13.99l-1.27-.97a1.795 1.795 0 0 1-.022-2.873l1.775-1.495A8.485 8.485 0 0 1 11.48 3a8.47 8.47 0 0 1 8.188 6.262l9.616 2.52A2.295 2.295 0 0 1 31 14c0 7.09-5.269 12.948-12.105 13.873l-.125.627h1.78c.73 0 1.34.52 1.48 1.21c.03.15-.09.29-.25.29H9.25c-.16-.14.08-.29.24-.29c.14-.69.74-1.21 1.47-1.21h1.8l.246-1.23C6.988 25.404 3 20.168 3 14zM15.52 28.5h1.75l.101-.505Q17.186 28 17 28a14 14 0 0 1-3.053-.334l-.167.834zM11.48 5A6.48 6.48 0 0 0 5 11.48V14c0 6.628 5.372 12 12 12a11.94 11.94 0 0 0 6.253-1.756a9 9 0 0 1-1.984.256h-.009c-3.333 0-6.906-1.65-8.774-4.449a.5.5 0 0 1 .832-.555c1.655 2.48 4.89 4.003 7.937 4.004a8.14 8.14 0 0 0 4.954-1.806A11.95 11.95 0 0 0 29 14a.294.294 0 0 0-.224-.283l-9.66-2.532a1.96 1.96 0 0 1-1.369-1.364l-.002-.007l-.002-.007A6.47 6.47 0 0 0 11.48 5"/></g>',
    ),
    (
        "beef",
        "牛肉",
        '<g fill="currentColor"><path d="M15.5 9.5a1 1 0 1 0 0-2a1 1 0 0 0 0 2m-6-1a1 1 0 1 1-2 0a1 1 0 0 1 2 0M9 14a1 1 0 0 1 1 1v.5a1 1 0 1 1-2 0V15a1 1 0 0 1 1-1m7 1a1 1 0 1 0-2 0v.5a1 1 0 1 0 2 0z"/><path fill-rule="evenodd" d="M5 2.922V2h1.5v.922c0 .331.132.649.366.883l.217.217A4.7 4.7 0 0 1 9.25 3.5h5.5c.78 0 1.517.188 2.167.522l.217-.217a1.25 1.25 0 0 0 .366-.883V2H19v.922c0 .729-.29 1.428-.805 1.944l-.056.056c.44.448.793.984 1.028 1.578H23v1.75A2.75 2.75 0 0 1 20.25 11h-.75v.786A4.74 4.74 0 0 1 21 15.25v1.5a3.75 3.75 0 0 1-3.75 3.75h-1.761A2.75 2.75 0 0 1 12.75 23h-1.5a2.75 2.75 0 0 1-2.739-2.5H6.75A3.75 3.75 0 0 1 3 16.75v-1.5c0-1.366.577-2.598 1.5-3.464V11h-.75A2.75 2.75 0 0 1 1 8.25V6.5h3.833A4.8 4.8 0 0 1 5.86 4.922l-.056-.056A2.75 2.75 0 0 1 5 2.922M9.25 5A3.25 3.25 0 0 0 6 8.25v2.583a4.7 4.7 0 0 1 1.75-.333h8.5c.618 0 1.208.118 1.75.333V8.25A3.25 3.25 0 0 0 14.75 5zM4.5 9.5V8.25q0-.126.006-.25H2.5v.25c0 .69.56 1.25 1.25 1.25zm15.75 0h-.75V8.25a5 5 0 0 0-.006-.25H21.5v.25c0 .69-.56 1.25-1.25 1.25m-6.275 11h-3.95c.116.57.62 1 1.225 1h1.5c.605 0 1.11-.43 1.225-1M7.75 12a3.25 3.25 0 0 0-3.25 3.25v1.5A2.25 2.25 0 0 0 6.75 19h10.5a2.25 2.25 0 0 0 2.25-2.25v-1.5A3.25 3.25 0 0 0 16.25 12z" clip-rule="evenodd"/></g>',
    ),
    (
        "pork",
        "猪肉",
        '<g transform="translate(3 4) scale(1.3)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path stroke-width="1.1" d="M1.68 4.883c-.417.51-1.055 1.601-1.055 3.5C.625 11.696 3.686 13 7 13s6.375-1.304 6.375-4.617c0-1.899-.638-2.99-1.055-3.5c-.2-.246-.353-.546-.353-.864V1l-3.15 1.5S7.633 2.22 7 2.22s-1.817.28-1.817.28L2.033 1v3.02c0 .317-.152.617-.353.863"/><path stroke-width="1.1" d="M9.938 8.969c0 1.344-1.316 2.156-2.938 2.156s-2.937-.75-2.937-2.156S5.377 6.813 7 6.813s2.938.812 2.938 2.156Z"/></g><circle cx="10.2" cy="10.8" r="1.1" fill="currentColor"/><circle cx="13.8" cy="10.8" r="1.1" fill="currentColor"/><circle cx="11.3" cy="15.65" r=".65" fill="currentColor"/><circle cx="12.9" cy="15.65" r=".65" fill="currentColor"/>',
    ),
    (
        "lamb",
        "羊肉",
        '<g fill="currentColor"><path d="M9 15a1 1 0 1 0 0-2a1 1 0 0 0 0 2m7-1a1 1 0 1 1-2 0a1 1 0 0 1 2 0"/><path fill-rule="evenodd" d="M12 2a4.96 4.96 0 0 0-2.621.749A4 4 0 0 0 8 2.5a3.996 3.996 0 0 0-3.953 3.415A3.746 3.746 0 0 0 2.912 11.7l-1.544 4.38a1.25 1.25 0 0 0 1.531 1.615l3.014-.886l.372 1.55A4.75 4.75 0 0 0 10.904 22h2.193a4.75 4.75 0 0 0 4.618-3.642l.373-1.55l3.013.886a1.25 1.25 0 0 0 1.531-1.615L21.087 11.7a3.74 3.74 0 0 0-1.134-5.786A3.996 3.996 0 0 0 16 2.5c-.487 0-.951.09-1.379.249A4.96 4.96 0 0 0 12 2m7.832 10.65a3.7 3.7 0 0 1-.812.27l-.582 2.427l2.617.77zm-2.354.27a3.73 3.73 0 0 1-1.964-1.126c-1.02.45-2.228.706-3.514.706s-2.493-.255-3.512-.705a3.7 3.7 0 0 1-1.966 1.125l1.221 5.088a3.25 3.25 0 0 0 3.16 2.492h.347v-.94l-1.28-1.28l1.06-1.06l.97.97l.97-.97l1.06 1.06l-1.28 1.28v.94h.347a3.25 3.25 0 0 0 3.16-2.492l1.221-5.089Zm-12.498 0a3.7 3.7 0 0 1-.812-.27l-1.223 3.467l2.617-.77l-.582-2.426Zm4.929-8.719A3.48 3.48 0 0 1 12 3.5c.784 0 1.503.262 2.091.701l.37.277l.414-.207A2.5 2.5 0 0 1 16 4a2.497 2.497 0 0 1 2.495 2.442l.012.52l.49.17A2.24 2.24 0 0 1 20.5 9.25c0 1.24-1.01 2.25-2.25 2.25c-.79 0-1.485-.418-1.887-1.052l-.38-.598l-.618.345C14.483 10.687 13.31 11 12 11s-2.483-.313-3.365-.805l-.62-.346l-.38.6A2.22 2.22 0 0 1 5.75 11.5c-1.24 0-2.25-1.01-2.25-2.25c0-.975.628-1.81 1.504-2.118l.489-.172l.012-.518A2.497 2.497 0 0 1 8 4c.4 0 .78.099 1.125.27l.413.208l.37-.277Z" clip-rule="evenodd"/></g>',
    ),
    (
        "sausage",
        "肠丸",
        '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M5.5 5.5A2.5 2.5 0 0 0 3 8c0 7.18 5.82 13 13 13a2.5 2.5 0 1 0 0-5a8 8 0 0 1-8-8a2.5 2.5 0 0 0-2.5-2.5"/><path d="M5.195 5.519L3.952 3.53A1 1 0 0 1 4.8 2h1.392a1 1 0 0 1 .848 1.53L5.795 5.52m12.687 12.705l1.989-1.243a1 1 0 0 1 1.53.848v1.392a1 1 0 0 1-1.53.848l-1.991-1.245"/></g>',
    ),
    (
        "cooked-meat",
        "熟肉",
        '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m13.62 8.382l1.966-1.967A2 2 0 1 1 19 5a2 2 0 1 1-1.413 3.414l-1.82 1.821m-9.863 8.361c2.733 2.734 5.9 4 7.07 2.829c1.172-1.172-.094-4.338-2.828-7.071c-2.733-2.734-5.9-4-7.07-2.829c-1.172 1.172.094 4.338 2.828 7.071M7.5 16l1 1"/><path d="M12.975 21.425c3.905-3.906 4.855-9.288 2.121-12.021c-2.733-2.734-8.115-1.784-12.02 2.121"/></g>',
    ),
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
        '<g transform="scale(1.5)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path stroke-width="1.25" d="M1.96 6.994c0 2.4 1.405 4.472 3.438 5.437v1.009h5.157v-1.009a6.02 6.02 0 0 0 3.438-5.437zm10.901 0c0-2.44-2.194-4.417-4.901-4.417S3.059 4.555 3.059 6.994z"/><circle cx="7.5" cy="3.5" r=".45" fill="currentColor" stroke="none"/><circle cx="7.5" cy="5.5" r=".45" fill="currentColor" stroke="none"/><circle cx="5.5" cy="4.5" r=".45" fill="currentColor" stroke="none"/><circle cx="8.5" cy="5.5" r=".45" fill="currentColor" stroke="none"/><circle cx="8.5" cy="4.5" r=".45" fill="currentColor" stroke="none"/></g>',
    ),
    (
        "steamed-bun",
        "主食",
        '<g transform="scale(1.5)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path stroke-width="1.25" d="M1.96 6.994c0 2.4 1.405 4.472 3.438 5.437v1.009h5.157v-1.009a6.02 6.02 0 0 0 3.438-5.437zm10.901 0c0-2.44-2.194-4.417-4.901-4.417S3.059 4.555 3.059 6.994z"/><circle cx="7.5" cy="3.5" r=".45" fill="currentColor" stroke="none"/><circle cx="7.5" cy="5.5" r=".45" fill="currentColor" stroke="none"/><circle cx="5.5" cy="4.5" r=".45" fill="currentColor" stroke="none"/><circle cx="8.5" cy="5.5" r=".45" fill="currentColor" stroke="none"/><circle cx="8.5" cy="4.5" r=".45" fill="currentColor" stroke="none"/></g>',
    ),
    (
        "scallion-ginger",
        "葱姜",
        '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M10 21c1-5 2-10 2-17M13 21c1-5 1-11 5-17"/><path d="M12 8 8 4m4 1 1-3m4 6 3-3m-3 3 2 3"/><path d="M8 21h7"/></g>',
    ),
    (
        "dried-goods",
        "干货",
        '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 11.1C20 6.626 16.418 3 12 3s-8 3.626-8 8.1a.9.9 0 0 0 .9.9h14.2a.9.9 0 0 0 .9-.9M10 12v7a2 2 0 1 0 4 0v-7"/>',
    ),
    (
        "dessert",
        "甜点",
        '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 20h18v-8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3z"/><path d="M3 14.803A2.4 2.4 0 0 0 4 15a2.4 2.4 0 0 0 2-1a2.4 2.4 0 0 1 2-1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2-1a2.4 2.4 0 0 1 2-1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1c.35.007.692-.062 1-.197M12 4l1.465 1.638a2 2 0 1 1-3.015.099z"/></g>',
    ),
    (
        "nuts",
        "坚果",
        '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m18 10l-.45 4.1a8.36 8.36 0 0 1-5.18 6.83a1 1 0 0 1-.74 0a8.36 8.36 0 0 1-5.18-6.83L6 10m7-7a4.9 4.9 0 0 0-1 3M8 6h8a3 3 0 0 1 3 3a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1a3 3 0 0 1 3-3"/>',
    ),
    (
        "bread",
        "烘焙",
        '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 4a3 3 0 0 1 2 5.235V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9.236a3 3 0 0 1 1.824-5.231H18z"/>',
    ),
    (
        "drink",
        "饮料",
        '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m6 8l1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8M5 8h14"/><path d="M7 15a6.47 6.47 0 0 1 5 0a6.47 6.47 0 0 0 5 0m-5-7l1-6h2"/></g>',
    ),
    (
        "condiment",
        "酱料",
        '<g transform="rotate(25 12 12)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M10 5h4V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1z"/><path d="M14 3.5c0 1.626.507 3.212 1.45 4.537l.05.07a8.1 8.1 0 0 1 1.5 4.694V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-6.2c0-1.682.524-3.322 1.5-4.693l.05-.07A7.82 7.82 0 0 0 10 3.5"/></g><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M20 20c0 1.1-.9 2-2 2s-2-.9-2-2c0-1.5 2-3.5 2-3.5s2 2 2 3.5Z"/>',
    ),
    (
        "other",
        "其他",
        '<g transform="scale(.0234375)" fill="currentColor"><path d="M714.4 704a352 352 0 0 0 148.2-256H161.4a352 352 0 0 0 148.2 256zM288 766.6A416 416 0 0 1 96 416a32 32 0 0 1 32-32h768a32 32 0 0 1 32 32a416 416 0 0 1-192 350.6V832a64 64 0 0 1-64 64H352a64 64 0 0 1-64-64zM493.2 320h-90.4L657.2 65.6a32 32 0 1 1 45.2 45.2zm187.4 0h-128l269.7-155.7a32 32 0 0 1 32 55.4zM352 768v64h320v-64z"/></g>',
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
