"""FridgeBoard 的 HTTP 入口与 P3 访问控制路由。

路由层负责 Cookie、SSO 回跳和请求校验；短效口令、设备凭证和授权判断均委托给
``AccessService``。应用使用同域 HttpOnly Cookie 保存不透明会话和设备凭证，避免把
访问机密暴露给 PWA JavaScript。本模块不创建数据库表，生产启动前必须执行 Alembic。
"""

# ruff: noqa: E501

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
from collections.abc import AsyncIterator, Awaitable, Callable, Generator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta
from hashlib import sha256
from pathlib import Path
from typing import Annotated, Literal
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from fridgeboard.auth import AccessService
from fridgeboard.domain.inventory import ExpiryRule, InventoryBatch, expiry_status
from fridgeboard.inventory_service import InventoryService
from fridgeboard.layout_service import LayoutService
from fridgeboard.layouts import RefrigeratorTemplate, list_templates
from fridgeboard.persistence.database import (
    create_database_engine,
    create_session_factory,
    transaction,
)
from fridgeboard.persistence.models import (
    DeviceCredential,
    ExpirySettings,
    FoodCategory,
    InventoryBatchModel,
    NotificationSettings,
    Refrigerator,
    StorageSlot,
)
from fridgeboard.recipe_service import RecipeService
from fridgeboard.recognition import (
    RecognitionProvider,
    agnes_provider_from_environment,
    recognize_image,
)
from fridgeboard.reminder_service import ReminderService

OWNER_COOKIE = "fb_owner_session"
DEVICE_COOKIE = "fb_device_credentials"
KINDLE_FIRST_BOOT_COOKIE = "fb_kindle_first_boot"
REMINDER_RECIPIENT_COOKIE = "fb_reminder_recipient"
logger = logging.getLogger(__name__)


def _load_local_env() -> dict[str, str]:
    """在直接本地启动时读取项目根目录 ``.env``，不覆盖已有进程环境变量。"""
    env_file = Path(__file__).resolve().parents[2] / ".env"
    if not env_file.is_file():
        return {}
    values: dict[str, str] = {}
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if key:
            values[key] = value.strip("\"'")
    return values


class HealthResponse(BaseModel):
    """容器存活探针返回的数据结构。"""

    status: str = Field(examples=["ok"], description="应用进程状态；健康时始终为 `ok`。")


class OwnerLoginResponse(BaseModel):
    """本地开发所有者登录的响应。"""

    owner_user_id: str = Field(examples=["42"])


class AuthenticationModeResponse(BaseModel):
    """当前部署要求 PWA 采用的所有者认证模式。"""

    mode: Literal["sso", "local"]


class PasscodeRequest(BaseModel):
    """创建冰箱端兼容绑定码的所有者请求。"""

    refrigerator_id: str | None = Field(default=None, examples=["fridge-001"])
    new_refrigerator_name: str | None = Field(default=None, examples=["家里冰箱"])
    new_template_key: str | None = Field(default=None, examples=["unconfigured"])


class PasscodeResponse(BaseModel):
    """只向所有者展示一次的冰箱端兼容绑定码。"""

    passcode: str = Field(examples=["042913"])
    expires_in_seconds: int = Field(examples=[300])


class KindleBindRequest(BaseModel):
    """冰箱端显示设备消费一次性兼容绑定码的请求。"""

    passcode: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$", examples=["042913"])
    label: str = Field(default="厨房冰箱端", min_length=1, max_length=120, examples=["厨房冰箱端"])


class DeviceQuantityAdjustRequest(BaseModel):
    """冰箱端对单个库存批次执行的明确数量操作。"""

    delta: int = Field(ge=-10000, le=1, examples=[-1])


class PairingCreateResponse(BaseModel):
    """冰箱端显示设备展示给手机的短效二维码载荷。"""

    pairing_token: str = Field(examples=["temporary-pairing-token"])
    pairing_url: str = Field(examples=["https://fridge.example/pair?token=temporary-pairing-token"])
    expires_in_seconds: int = Field(examples=[600])


class PairingConsumeRequest(BaseModel):
    """PWA 消费二维码会话的请求。"""

    pairing_token: str = Field(min_length=20, examples=["temporary-pairing-token"])
    standalone: Literal[True] = Field(
        examples=[True], description="仅 PWA standalone 上下文允许提交此值。"
    )
    label: str = Field(default="我的手机", min_length=1, max_length=120, examples=["小王的 iPhone"])


class FirstBootPairingCreateResponse(BaseModel):
    """未绑定冰箱端显示设备展示给手机的首次页面二维码载荷。"""

    pairing_token: str = Field(examples=["temporary-first-boot-token"])
    pairing_url: str = Field(
        examples=["https://fridge.example/pair?bootstrap=temporary-first-boot-token"]
    )
    expires_in_seconds: int = Field(examples=[600])


class FirstBootPairingClaimRequest(BaseModel):
    """PWA 领取首次开机二维码并选择目标冰箱的请求。"""

    pairing_token: str = Field(min_length=20, examples=["temporary-first-boot-token"])
    standalone: Literal[True] = Field(examples=[True])
    refrigerator_id: str | None = Field(default=None, min_length=1, examples=["fridge-001"])
    new_refrigerator_name: str | None = Field(default=None, min_length=1, max_length=120)
    new_template_key: str | None = Field(default=None, min_length=1, max_length=64)
    label: str = Field(default="我的手机", min_length=1, max_length=120)


class FirstBootPairingStatusResponse(BaseModel):
    """冰箱端显示设备轮询首次页面绑定是否已由手机完成。"""

    state: Literal["pending", "bound"]
    refrigerator: RefrigeratorResponse | None = None


class RefrigeratorResponse(BaseModel):
    """当前凭证可访问的一台冰箱。"""

    id: str = Field(examples=["fridge-001"])
    name: str = Field(examples=["家里冰箱"])
    revision: int = Field(examples=[1])


class RefrigeratorRenameRequest(BaseModel):
    """所有者修改既有冰箱名称的请求。"""

    name: str = Field(min_length=1, max_length=120)


class RefrigeratorDeleteRequest(BaseModel):
    """软删除前要求输入当前名称的确认请求。"""

    confirmation_name: str = Field(min_length=1, max_length=120)


class TemplateZoneResponse(BaseModel):
    """前端绘制和编辑一个模板区域所需的受限配置。"""

    key: str
    label: str
    temperature_mode: Literal["cold", "frozen"]
    geometry: dict[str, int]
    layout_kind: Literal["vertical", "single_row"]
    adjustable_temperature: bool
    is_door: bool


class RefrigeratorTemplateResponse(BaseModel):
    """手机端创建冰箱时可选择的一种预设模板。"""

    key: str
    name: str
    zones: list[TemplateZoneResponse]


class LayoutZoneRequest(BaseModel):
    """一次图形化分格编辑提交的单个区域配置。"""

    zone_key: str
    temperature_mode: Literal["cold", "frozen"]
    slot_count: int = Field(ge=1, le=6)


class LayoutReplaceRequest(BaseModel):
    """布局写入及其乐观并发修订号。"""

    expected_revision: int = Field(ge=1)
    zones: list[LayoutZoneRequest]


class RefrigeratorCreateRequest(BaseModel):
    """所有者创建冰箱时提交的名称和模板。"""

    name: str = Field(min_length=1, max_length=120)
    template_key: str = Field(min_length=1, max_length=64)
    layout: list[LayoutZoneRequest] | None = None


class StorageSlotResponse(BaseModel):
    """食品位置选择器和拟物预览共享的最小位置数据。"""

    id: str
    key: str
    display_order: int
    geometry: dict[str, int]


class StorageZoneResponse(BaseModel):
    """冰箱布局中一个区域及其全部必选位置。"""

    key: str
    label: str
    temperature_mode: Literal["cold", "frozen"]
    geometry: dict[str, int | str]
    display_order: int
    slots: list[StorageSlotResponse]
    is_door: bool


class RefrigeratorLayoutResponse(BaseModel):
    """与手机和墨水屏同构的持久化布局。"""

    refrigerator_id: str
    template_key: str
    revision: int
    zones: list[StorageZoneResponse]


class DeviceResponse(BaseModel):
    """设备管理页使用的可撤销设备元数据。"""

    id: str = Field(examples=["device-001"])
    kind: str = Field(examples=["pwa"])
    label: str = Field(examples=["小王的 iPhone"])
    created_at: str = Field(examples=["2026-07-19T10:00:00"])
    last_seen_at: str | None = Field(examples=["2026-07-19T10:01:00"])
    revoked_at: str | None = Field(examples=[None])
    is_current: bool = Field(
        default=False,
        description="该设备凭证是否保存在当前浏览器/PWA 安装实例中。",
        examples=[True],
    )


class DeviceRenameRequest(BaseModel):
    """设备管理页更新展示名称的请求。"""

    label: str = Field(min_length=1, max_length=120, examples=["小王的 iPhone"])


class IconResponse(BaseModel):
    """可在小类图库中选择和复用的一位黑白图标。"""

    key: str = Field(examples=["egg"])
    label: str = Field(examples=["鸡蛋"])
    asset_url: str = Field(examples=["/api/icon-library/egg.svg"])


class FoodCategoryResponse(BaseModel):
    """库存表单使用的两级分类节点。"""

    id: str
    parent_id: str | None
    name: str
    icon_key: str | None
    is_custom: bool


class CustomCategoryRequest(BaseModel):
    """手工创建一个冰箱专属小类的请求。"""

    parent_id: str = Field(examples=["builtin-egg"])
    name: str = Field(min_length=1, max_length=80, examples=["乌鸡蛋"])
    icon_key: str | None = Field(default=None, max_length=160, examples=["egg"])


class InventoryWriteRequest(BaseModel):
    """新增或编辑一个库存批次的完整可编辑字段。"""

    category_id: str = Field(examples=["builtin-egg"])
    subcategory_id: str = Field(examples=["builtin-egg"])
    storage_slot_id: str = Field(examples=["slot-001"])
    food_name: str = Field(min_length=1, max_length=160, examples=["土鸡蛋"])
    quantity: int = Field(default=1, ge=1, examples=[6])
    best_before: date | None = Field(default=None, examples=["2026-08-01"])
    production_date: date | None = Field(default=None, examples=["2026-07-01"])
    product_description: str | None = Field(default=None, max_length=1000, examples=["盒装 30 枚"])
    barcode: str | None = Field(default=None, max_length=128, examples=["6901234567890"])


class InventoryBatchResponse(BaseModel):
    """库存列表和编辑表单共用的批次响应。"""

    id: str
    category_id: str
    category_name: str
    subcategory_id: str
    subcategory_name: str
    icon_key: str | None
    storage_slot_id: str
    food_name: str
    quantity: int
    production_date: date | None
    best_before: date | None
    product_description: str | None
    barcode: str | None
    expiry_status: str | None


class RecipeIngredientRequest(BaseModel):
    """食谱编辑时用户确认的小类名称与需求数量。"""

    subcategory_name: str = Field(min_length=1, max_length=80, examples=["鸡蛋"])
    quantity: int = Field(default=1, ge=1, examples=[2])


class RecipeEntryWriteRequest(BaseModel):
    """保存单日一道食谱的请求；名称必须与库存小类完全匹配。"""

    weekday: int = Field(ge=0, le=6, examples=[1])
    dish_name: str = Field(min_length=1, max_length=160, examples=["鸡蛋炒河粉"])
    ingredients: list[RecipeIngredientRequest] = Field(
        default_factory=list,
        examples=[
            [
                {"subcategory_name": "鸡蛋", "quantity": 4},
                {"subcategory_name": "火腿", "quantity": 1},
            ]
        ],
    )


class RecipeImportRequest(BaseModel):
    """一次导入一周多行纯文本食谱的请求。"""

    week_start: date = Field(examples=["2026-07-20"])
    text: str = Field(min_length=1, examples=["周二：鸡蛋炒河粉（鸡蛋×4、火腿、河粉）"])


class RecipeIngredientResponse(BaseModel):
    """食谱及缺货清单展示的严格小类食材。"""

    subcategory_name: str
    quantity: int


class RecipeEntryResponse(BaseModel):
    """食谱行及其即时缺货结果。"""

    id: str
    weekday: int
    dish_name: str
    completed: bool
    ingredients: list[RecipeIngredientResponse]
    missing: list[RecipeIngredientResponse]


class RecipeDayResponse(BaseModel):
    """固定一周中某一天和该日全部食谱。"""

    weekday: int
    label: str
    entries: list[RecipeEntryResponse]


class RestockEntryResponse(BaseModel):
    """按日期和菜名分组的一项动态缺货。"""

    weekday: int
    label: str
    dish_name: str
    missing: list[RecipeIngredientResponse]


class DefaultLocationResponse(BaseModel):
    """大类最近位置的表单预填结果。"""

    storage_slot_id: str | None = Field(examples=["slot-001"])


class ExpirySettingsResponse(BaseModel):
    """一台冰箱持久化的临期窗口规则。"""

    ratio_percent: int = Field(ge=1, le=100, examples=[20])
    minimum_days: int = Field(ge=1, le=14, examples=[1])
    maximum_days: int = Field(ge=1, le=14, examples=[14])


class ExpirySettingsRequest(ExpirySettingsResponse):
    """更新临期窗口时提交的完整规则。"""


class NotificationSettingsResponse(BaseModel):
    """每日食品提醒和显示设备健康提醒的持久化设置。"""

    daily_reminder_enabled: bool = Field(examples=[True])
    reminder_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$", examples=["20:00"])
    device_health_enabled: bool = Field(examples=[True])


class NotificationSettingsRequest(NotificationSettingsResponse):
    """更新完整提醒设置的请求。"""


class DueNotificationResponse(BaseModel):
    """一次前台轮询中新产生的应用内提醒。"""

    kind: Literal["food", "device_health"] = Field(examples=["food"])
    title: str = Field(examples=["有食材需要留意"])
    body: str = Field(examples=["牛奶临期或已过期，共 1 件。"])


class RecognitionRequest(BaseModel):
    """手机一次相机截图的受限识别请求；图片不会被持久化。"""

    image_base64: str = Field(
        min_length=1, max_length=7_000_000, examples=["/9j/4AAQSkZJRgABAQ..."]
    )
    content_type: Literal["image/jpeg", "image/png", "image/webp"] = Field(examples=["image/jpeg"])


class RecognitionFieldResponse(BaseModel):
    """一个可由前端按置信度和来源处理的增量识别字段。"""

    value: str
    confidence: float = Field(ge=0, le=1)


class RecognitionResponse(BaseModel):
    """本次图像明确识别出的字段；不存在即表示不修改原表单。"""

    fields: dict[str, RecognitionFieldResponse]


class BarcodeSuggestionResponse(BaseModel):
    """同一冰箱已确认条码可复用的非批次商品信息。"""

    food_name: str
    category_id: str
    subcategory_id: str
    product_description: str | None
    barcode: str


def _refrigerator_response(refrigerator: Refrigerator) -> RefrigeratorResponse:
    """将持久化冰箱映射为不包含所有者信息的 API 响应。"""
    return RefrigeratorResponse(id=refrigerator.id, name=refrigerator.name, revision=refrigerator.revision)


def _device_response(device: DeviceCredential, is_current: bool = False) -> DeviceResponse:
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


def _category_response(category: FoodCategory) -> FoodCategoryResponse:
    """将可用分类映射为前端搜索和选择所需的安全字段。"""
    return FoodCategoryResponse(
        id=category.id,
        parent_id=category.parent_id,
        name=category.name,
        icon_key=category.icon_key,
        is_custom=category.is_custom,
    )


def _inventory_response(batch: InventoryBatchModel, session: Session) -> InventoryBatchResponse:
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


def _shelf_life_days(payload: InventoryWriteRequest) -> int | None:
    """按生产日期或录入当天计算内部总有效期，未填 BBD 时返回空值。"""
    if payload.best_before is None:
        return None
    baseline = payload.production_date or date.today()
    result = (payload.best_before - baseline).days
    if result < 0:
        raise ValueError("BBD 不能早于生产日期或录入日期")
    return result


def _template_response(template: RefrigeratorTemplate) -> RefrigeratorTemplateResponse:
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


def _layout_response(refrigerator: Refrigerator, session: Session) -> RefrigeratorLayoutResponse:
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


def _tokens_from_cookie(value: str | None) -> list[str]:
    """解析 HttpOnly 设备 Cookie，丢弃畸形值且不因客户端篡改抛出 500。"""
    if not value:
        return []
    try:
        tokens = json.loads(value)
    except json.JSONDecodeError:
        return []
    return [token for token in tokens if isinstance(token, str) and len(token) <= 256]


def _set_device_cookie(response: Response, request: Request, token: str) -> None:
    """在不覆盖同一浏览器其他冰箱凭证的前提下写入 HttpOnly Cookie。"""
    tokens = _tokens_from_cookie(request.cookies.get(DEVICE_COOKIE))
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


def create_app(
    frontend_dist: Path | None = None,
    database_url: str | None = None,
    development_owner_user_id: str | None = None,
    public_base_url: str | None = None,
    flycn_authorize_url: str | None = None,
    flycn_exchange_url: str | None = None,
    flycn_client_secret: str | None = None,
    local_owner_user_id: str | None = None,
    recognition_provider: RecognitionProvider | None = None,
    clock: Callable[[], datetime] | None = None,
    load_local_env: bool = False,
) -> FastAPI:
    """创建 FridgeBoard HTTP 应用。

    ``development_owner_user_id`` 只用于本地和测试，生产环境不得设置。flycn URL 同时
    配置时，登录入口会生成含回跳地址的授权请求，回调以服务端请求交换一次性授权码。

    Args:
        frontend_dist: 可选 PWA 构建目录。
        database_url: 可选 SQLAlchemy URL，测试可传入临时 SQLite 文件。
        development_owner_user_id: 显式允许的本地所有者 ID。
        public_base_url: 对外 FridgeBoard 根地址，用于二维码及 SSO 回跳。
        flycn_authorize_url: flycn 授权页面 URL。
        flycn_exchange_url: flycn Docker 私网授权码兑换 URL。
        flycn_client_secret: 与 flycn 共享的服务间兑换密钥。
        local_owner_user_id: 私有局域网部署使用的免登录所有者 ID。
        recognition_provider: 可注入的 Agnes 识别适配器；默认从部署环境构造。
        clock: P10 提醒调度使用的本地时钟；测试可注入模拟时间。
        load_local_env: 是否读取项目根目录本地 ``.env``；测试和嵌入式调用默认关闭。
    """
    local_env = _load_local_env() if load_local_env else {}

    def env_value(name: str, default: str | None = None) -> str | None:
        """读取进程环境变量，并在本地启动时回退到项目 ``.env``。"""
        return os.environ.get(name, local_env.get(name, default))

    configured_database_url = database_url or env_value(
        "FRIDGEBOARD_DATABASE_URL", "sqlite:///./fridgeboard.db"
    )
    configured_base_url = (public_base_url or env_value("FRIDGEBOARD_PUBLIC_BASE_URL", "")).rstrip(
        "/"
    )
    configured_development_owner = development_owner_user_id or env_value(
        "FRIDGEBOARD_DEVELOPMENT_OWNER_USER_ID"
    )
    configured_authorize_url = flycn_authorize_url or env_value("FRIDGEBOARD_FLYCN_AUTHORIZE_URL")
    configured_exchange_url = flycn_exchange_url or env_value("FRIDGEBOARD_FLYCN_EXCHANGE_URL")
    configured_secret = flycn_client_secret or env_value("FRIDGEBOARD_FLYCN_CLIENT_SECRET")
    configured_local_owner = local_owner_user_id or env_value("FRIDGEBOARD_LOCAL_OWNER_USER_ID")
    configured_recognition_provider = recognition_provider or agnes_provider_from_environment()
    configured_clock = clock or (lambda: datetime.now(UTC).astimezone().replace(tzinfo=None))

    def public_request_base_url(request: Request) -> str:
        """返回当前请求可访问的根地址，供本地二维码和回调使用。

        本地开发时不应把 ``0.0.0.0`` 放进二维码；它只是监听通配地址，手机必须使用
        浏览器实际访问的局域网主机名或 IP。生产环境仍优先使用显式配置的公网地址。
        """
        if configured_base_url and not any(
            marker in configured_base_url for marker in ("0.0.0.0", "[::]")
        ):
            return configured_base_url
        return str(request.base_url).rstrip("/")

    engine = create_database_engine(configured_database_url)
    session_factory = create_session_factory(engine)
    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        """在单个 Uvicorn 进程中每天清理超过恢复期的软删除冰箱。"""
        async def clean_daily() -> None:
            while True:
                try:
                    with transaction(session_factory) as session:
                        AccessService(session).purge_expired_refrigerators(configured_clock())
                except Exception:
                    logger.exception("清理超过恢复期的冰箱失败；将在下一轮重试")
                await asyncio.sleep(24 * 60 * 60)

        cleanup_task = asyncio.create_task(clean_daily())
        try:
            yield
        finally:
            cleanup_task.cancel()
            try:
                await cleanup_task
            except asyncio.CancelledError:
                pass

    application = FastAPI(
        title="FridgeBoard API",
        version="0.3.0",
        description="FridgeBoard 的同域 API、PWA 静态资源与无账号设备配对入口。",
        lifespan=lifespan,
    )

    def get_session() -> Generator[Session, None, None]:
        """为只读和依赖认证请求提供自动关闭的数据库会话。"""
        with session_factory() as session:
            yield session

    def owner_id(
        owner_session: Annotated[str | None, Cookie(alias=OWNER_COOKIE)] = None,
        session: Session = Depends(get_session),
    ) -> str:
        """解析并要求有效所有者管理会话。"""
        owner = AccessService(session).owner_for_session(owner_session)
        if owner is not None:
            return owner
        if configured_local_owner:
            return configured_local_owner
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="需要所有者登录")

    def bearer_or_cookie_tokens(request: Request) -> list[str]:
        """读取 Bearer（自动化/Kindle）或浏览器 HttpOnly Cookie 中的设备凭证。"""
        scheme, _, bearer = request.headers.get("authorization", "").partition(" ")
        if scheme.lower() == "bearer" and bearer:
            return [bearer]
        return _tokens_from_cookie(request.cookies.get(DEVICE_COOKIE))

    def device(
        request: Request,
        session: Session = Depends(get_session),
    ) -> DeviceCredential:
        """解析任一有效设备凭证，拒绝被移除或不存在的设备。"""
        service = AccessService(session)
        for token in bearer_or_cookie_tokens(request):
            resolved = service.device_for_token(token)
            if resolved is not None:
                session.commit()
                return resolved
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="设备访问已移除或需要重新配对",
        )

    def owner_or_device(
        request: Request,
        owner_session: Annotated[str | None, Cookie(alias=OWNER_COOKIE)] = None,
        session: Session = Depends(get_session),
    ) -> tuple[Literal["owner", "device"], str | DeviceCredential]:
        """解析 P6 日常录入可用的所有者或已配对设备身份。"""
        service = AccessService(session)
        owner = service.owner_for_session(owner_session) or configured_local_owner
        if owner is not None:
            return "owner", owner
        for token in bearer_or_cookie_tokens(request):
            paired_device = service.device_for_token(token)
            if paired_device is not None:
                session.commit()
                return "device", paired_device
        raise HTTPException(status_code=401, detail="需要所有者登录或已配对设备凭证")

    def reminder_recipient_key(
        request: Request,
        response: Response,
        session: Session = Depends(get_session),
    ) -> str:
        """Return a stable per-PWA reminder recipient key without persisting credentials.

        A paired PWA uses its device ID. Owner-only browser sessions use a digest of the
        HttpOnly session token; local development without such a session receives a new
        opaque HttpOnly browser key.
        """
        service = AccessService(session)
        for token in bearer_or_cookie_tokens(request):
            current = service.device_for_token(token)
            if current is not None:
                session.commit()
                return f"device:{current.id}"
        owner_token = request.cookies.get(OWNER_COOKIE)
        if owner_token:
            return f"owner:{sha256(owner_token.encode('utf-8')).hexdigest()}"
        local_key = request.cookies.get(REMINDER_RECIPIENT_COOKIE)
        if local_key:
            return f"local:{local_key}"
        local_key = secrets.token_urlsafe(24)
        response.set_cookie(
            REMINDER_RECIPIENT_COOKIE,
            local_key,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
            max_age=60 * 60 * 24 * 365,
        )
        return f"local:{local_key}"

    @application.get(
        "/healthz",
        response_model=HealthResponse,
        summary="读取应用健康状态",
        responses={200: {"content": {"application/json": {"example": {"status": "ok"}}}}},
    )
    def healthz() -> HealthResponse:
        """返回不依赖数据库的固定进程存活响应。"""
        return HealthResponse(status="ok")

    @application.get("/api/auth/mode", response_model=AuthenticationModeResponse)
    def authentication_mode() -> AuthenticationModeResponse:
        """告诉 PWA 当前部署是否允许私有局域网免登录管理。"""
        return AuthenticationModeResponse(mode="local" if configured_local_owner else "sso")

    @application.post(
        "/api/auth/development-login",
        response_model=OwnerLoginResponse,
        summary="创建本地开发所有者会话",
        responses={200: {"content": {"application/json": {"example": {"owner_user_id": "42"}}}}},
    )
    def development_login(request: Request) -> Response:
        """仅在显式配置时创建开发会话，避免把模拟登录带入生产。"""
        if not configured_development_owner:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="本地登录未启用")
        with transaction(session_factory) as session:
            token = AccessService(session).create_owner_session(configured_development_owner)
        response = Response(
            content=OwnerLoginResponse(
                owner_user_id=configured_development_owner
            ).model_dump_json(),
            media_type="application/json",
        )
        response.set_cookie(
            OWNER_COOKIE,
            token,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
            max_age=60 * 60 * 24 * 30,
        )
        return response

    @application.get("/api/auth/login", summary="跳转到 flycn 登录授权")
    def login(request: Request) -> RedirectResponse:
        """开始 flycn SSO 授权，并保存同源的扫码领取回跳地址。"""
        callback_base_url = public_request_base_url(request)
        if not configured_authorize_url or not callback_base_url:
            raise HTTPException(status_code=503, detail="flycn SSO 尚未配置")
        callback_url = f"{callback_base_url}/api/auth/callback"
        state = secrets.token_urlsafe(24)
        query = urlencode({"redirect_uri": callback_url, "state": state})
        response = RedirectResponse(f"{configured_authorize_url}?{query}")
        response.set_cookie(
            "fb_sso_state",
            state,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
            max_age=300,
        )
        return_to = request.query_params.get("return_to", "/")
        if return_to.startswith("/") and not return_to.startswith("//"):
            response.set_cookie(
                "fb_sso_return_to",
                return_to,
                httponly=True,
                secure=request.url.scheme == "https",
                samesite="lax",
                max_age=300,
            )
        return response

    @application.get("/api/auth/callback", summary="消费 flycn 单次授权码")
    def login_callback(code: str, state: str, request: Request) -> RedirectResponse:
        """通过 Docker 私网兑换 flycn 授权码并签发本地所有者会话。"""
        if not configured_exchange_url or not configured_secret:
            raise HTTPException(status_code=503, detail="flycn 授权码兑换未配置")
        if not secrets.compare_digest(state, request.cookies.get("fb_sso_state", "")):
            raise HTTPException(status_code=400, detail="flycn 授权状态不匹配")
        payload = json.dumps({"code": code}).encode("utf-8")
        exchange_request = UrlRequest(
            configured_exchange_url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {configured_secret}",
            },
            method="POST",
        )
        try:
            with urlopen(exchange_request, timeout=5) as exchange_response:  # noqa: S310
                owner_user_id = str(json.loads(exchange_response.read())["user_id"])
        except HTTPError as exc:
            if exc.code == 401:
                raise HTTPException(
                    status_code=401, detail="flycn 授权码无效、过期或已使用"
                ) from exc
            raise HTTPException(status_code=502, detail="flycn SSO 服务暂时不可用") from exc
        except (KeyError, OSError, ValueError) as exc:
            raise HTTPException(status_code=401, detail="flycn 授权码无效") from exc
        with transaction(session_factory) as session:
            token = AccessService(session).create_owner_session(owner_user_id)
        return_to = request.cookies.get("fb_sso_return_to", "/")
        if not return_to.startswith("/") or return_to.startswith("//"):
            return_to = "/"
        response = RedirectResponse(return_to, status_code=status.HTTP_303_SEE_OTHER)
        response.set_cookie(
            OWNER_COOKIE,
            token,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
        )
        response.delete_cookie("fb_sso_state")
        response.delete_cookie("fb_sso_return_to")
        return response

    @application.get("/api/owner/refrigerators", response_model=list[RefrigeratorResponse])
    def owner_refrigerators(current_owner: str = Depends(owner_id)) -> list[RefrigeratorResponse]:
        """列出当前所有者可管理的冰箱。"""
        with session_factory() as session:
            refrigerators = AccessService(session).list_refrigerators_for_owner(current_owner)
            return [_refrigerator_response(item) for item in refrigerators]

    @application.get("/api/owner/refrigerators/deleted", response_model=list[RefrigeratorResponse])
    def deleted_owner_refrigerators(
        current_owner: str = Depends(owner_id),
    ) -> list[RefrigeratorResponse]:
        """列出当前所有者在 30 天恢复期内可恢复的冰箱。"""
        with session_factory() as session:
            refrigerators = AccessService(session).list_deleted_refrigerators_for_owner(current_owner)
            return [_refrigerator_response(item) for item in refrigerators]

    @application.put("/api/owner/refrigerators/{refrigerator_id}", response_model=RefrigeratorResponse)
    def rename_refrigerator(
        refrigerator_id: str,
        payload: RefrigeratorRenameRequest,
        current_owner: str = Depends(owner_id),
    ) -> RefrigeratorResponse:
        """修改一台活跃冰箱的名称，名称在同一所有者下保持唯一。"""
        try:
            with transaction(session_factory) as session:
                refrigerator = AccessService(session).rename_refrigerator(
                    current_owner, refrigerator_id, payload.name
                )
                return _refrigerator_response(refrigerator)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.delete("/api/owner/refrigerators/{refrigerator_id}", status_code=204)
    def delete_refrigerator(
        refrigerator_id: str,
        payload: RefrigeratorDeleteRequest,
        current_owner: str = Depends(owner_id),
    ) -> Response:
        """软删除冰箱并撤销其全部手机和冰箱端设备访问。"""
        try:
            with transaction(session_factory) as session:
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
        refrigerator_id: str, current_owner: str = Depends(owner_id)
    ) -> RefrigeratorResponse:
        """恢复仍在恢复期内的冰箱，但不会恢复旧设备凭证。"""
        try:
            with transaction(session_factory) as session:
                refrigerator = AccessService(session).restore_refrigerator(
                    current_owner, refrigerator_id
                )
                return _refrigerator_response(refrigerator)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get(
        "/api/refrigerator-templates", response_model=list[RefrigeratorTemplateResponse]
    )
    def refrigerator_templates() -> list[RefrigeratorTemplateResponse]:
        """列出创建页可用的七种固定模板及其图形化编辑约束。"""
        return [_template_response(template) for template in list_templates()]

    @application.get("/api/icon-library", response_model=list[IconResponse])
    def icon_library() -> list[IconResponse]:
        """列出可由内置或自定义小类复用的黑白图标资产。"""
        return [
            IconResponse(key=key, label=label, asset_url=f"/api/icon-library/{key}.svg")
            for key, label, _ in ICON_LIBRARY
        ]

    @application.get("/api/icon-library/{icon_key}.svg", response_class=Response)
    def icon_asset(icon_key: str) -> Response:
        """返回单色 SVG 图标，供小尺寸手机和后续墨水屏端共用。"""
        body = next((body for key, _, body in ICON_LIBRARY if key == icon_key), None)
        if body is None:
            raise HTTPException(status_code=404, detail="图标不存在")
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
            'role="img" aria-label="food icon">'
            f"{body}</svg>"
        )
        return Response(content=svg, media_type="image/svg+xml")

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
        actor: tuple[Literal["owner", "device"], str | DeviceCredential] = Depends(owner_or_device),
    ) -> RecognitionResponse:
        """识别一次当前相机帧，并在请求结束时删除临时图片。

        当前 API 只接受所有者会话，避免匿名调用消耗 AI 配额；结果也不会写入库存，
        由客户端与用户手工输入比较后再决定哪些字段可以采用。
        """
        del actor
        allowed_fields = {
            "food_name",
            "category_name",
            "subcategory_name",
            "product_description",
            "production_date",
            "best_before",
            "barcode",
            "raw_date_label",
        }
        try:
            raw_fields = recognize_image(
                payload.image_base64, payload.content_type, configured_recognition_provider
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
        return RecognitionResponse(fields=fields)

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/barcode/{barcode}",
        response_model=BarcodeSuggestionResponse,
    )
    def barcode_suggestion(
        refrigerator_id: str,
        barcode: str,
        actor: tuple[Literal["owner", "device"], str | DeviceCredential] = Depends(owner_or_device),
    ) -> BarcodeSuggestionResponse:
        """查询当前冰箱已确认过的条码，不复用具体购买批次字段。"""
        with session_factory() as session:
            refrigerator = session.get(Refrigerator, refrigerator_id)
            actor_kind, actor_value = actor
            is_authorized = refrigerator is not None and (
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
                food_name=batch.food_name,
                category_id=batch.category_id,
                subcategory_id=batch.subcategory_id,
                product_description=batch.product_description,
                barcode=barcode,
            )

    @application.post(
        "/api/owner/refrigerators", response_model=RefrigeratorResponse, status_code=201
    )
    def create_refrigerator(
        payload: RefrigeratorCreateRequest, current_owner: str = Depends(owner_id)
    ) -> RefrigeratorResponse:
        """由所有者原子地创建冰箱及其默认或确认后的布局。"""
        try:
            with transaction(session_factory) as session:
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
                return _refrigerator_response(refrigerator)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/categories",
        response_model=list[FoodCategoryResponse],
    )
    def inventory_categories(
        refrigerator_id: str, q: str | None = None, current_owner: str = Depends(owner_id)
    ) -> list[FoodCategoryResponse]:
        """搜索当前冰箱可用的大类、内置小类和已确认的自定义小类。"""
        with transaction(session_factory) as session:
            refrigerator = session.get(Refrigerator, refrigerator_id)
            if refrigerator is None or refrigerator.owner_user_id != current_owner:
                raise HTTPException(status_code=404, detail="冰箱不存在或无权访问")
            return [
                _category_response(item)
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
        current_owner: str = Depends(owner_id),
    ) -> FoodCategoryResponse:
        """手工创建自定义小类，并保存用户选定图标键以供后续录入复用。"""
        try:
            if payload.icon_key and payload.icon_key not in {item[0] for item in ICON_LIBRARY}:
                raise ValueError("图标不存在")
            with transaction(session_factory) as session:
                refrigerator = session.get(Refrigerator, refrigerator_id)
                if refrigerator is None or refrigerator.owner_user_id != current_owner:
                    raise ValueError("冰箱不存在或无权访问")
                category = InventoryService(session).create_custom_subcategory(
                    refrigerator_id, payload.parent_id, payload.name, payload.icon_key
                )
                return _category_response(category)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/inventory/default-location",
        response_model=DefaultLocationResponse,
    )
    def inventory_default_location(
        refrigerator_id: str, category_id: str, current_owner: str = Depends(owner_id)
    ) -> DefaultLocationResponse:
        """读取一个大类的最近位置，首次录入时返回空值让用户显式选择。"""
        try:
            with transaction(session_factory) as session:
                refrigerator = session.get(Refrigerator, refrigerator_id)
                if refrigerator is None or refrigerator.owner_user_id != current_owner:
                    raise ValueError("冰箱不存在或无权访问")
                return DefaultLocationResponse(
                    storage_slot_id=InventoryService(session).last_location(
                        refrigerator_id, category_id
                    )
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/inventory",
        response_model=list[InventoryBatchResponse],
    )
    def inventory_list(
        refrigerator_id: str, current_owner: str = Depends(owner_id)
    ) -> list[InventoryBatchResponse]:
        """读取当前冰箱库存，未填 BBD 的记录不带风险状态。"""
        with session_factory() as session:
            refrigerator = session.get(Refrigerator, refrigerator_id)
            if refrigerator is None or refrigerator.owner_user_id != current_owner:
                raise HTTPException(status_code=404, detail="冰箱不存在或无权访问")
            batches = session.scalars(
                select(InventoryBatchModel)
                .where(InventoryBatchModel.refrigerator_id == refrigerator_id)
                .order_by(
                    InventoryBatchModel.best_before.is_(None),
                    InventoryBatchModel.best_before,
                    InventoryBatchModel.created_at,
                )
            )
            return [_inventory_response(batch, session) for batch in batches]

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/inventory",
        response_model=InventoryBatchResponse,
        status_code=201,
    )
    def create_inventory_batch(
        refrigerator_id: str, payload: InventoryWriteRequest, current_owner: str = Depends(owner_id)
    ) -> InventoryBatchResponse:
        """新增或合并同小类、位置、描述和 BBD 的库存批次。"""
        try:
            with transaction(session_factory) as session:
                refrigerator = session.get(Refrigerator, refrigerator_id)
                if refrigerator is None or refrigerator.owner_user_id != current_owner:
                    raise ValueError("冰箱不存在或无权访问")
                batch = InventoryService(session).create_batch(
                    refrigerator_id,
                    **payload.model_dump(),
                    shelf_life_days=_shelf_life_days(payload),
                )
                return _inventory_response(batch, session)
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
        current_owner: str = Depends(owner_id),
    ) -> InventoryBatchResponse:
        """编辑单个库存批次并刷新所属大类的位置记忆。"""
        try:
            with transaction(session_factory) as session:
                refrigerator = session.get(Refrigerator, refrigerator_id)
                if refrigerator is None or refrigerator.owner_user_id != current_owner:
                    raise ValueError("冰箱不存在或无权访问")
                batch = InventoryService(session).update_batch(
                    refrigerator_id,
                    batch_id,
                    **payload.model_dump(),
                    shelf_life_days=_shelf_life_days(payload),
                )
                return _inventory_response(batch, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.delete(
        "/api/owner/refrigerators/{refrigerator_id}/inventory/{batch_id}", status_code=204
    )
    def delete_inventory_batch(
        refrigerator_id: str, batch_id: str, current_owner: str = Depends(owner_id)
    ) -> Response:
        """删除一个库存批次；位置记忆保留给下次同大类录入预填。"""
        try:
            with transaction(session_factory) as session:
                refrigerator = session.get(Refrigerator, refrigerator_id)
                if refrigerator is None or refrigerator.owner_user_id != current_owner:
                    raise ValueError("冰箱不存在或无权访问")
                InventoryService(session).delete_batch(refrigerator_id, batch_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return Response(status_code=204)

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/recipes",
        response_model=list[RecipeDayResponse],
    )
    def recipe_week(
        refrigerator_id: str, week_start: date, current_owner: str = Depends(owner_id)
    ) -> list[RecipeDayResponse]:
        """返回指定周固定七天的食谱，并即时计算未完成菜的缺货。"""
        normalized_week_start = week_start - timedelta(days=week_start.weekday())
        with session_factory() as session:
            refrigerator = session.get(Refrigerator, refrigerator_id)
            if refrigerator is None or refrigerator.owner_user_id != current_owner:
                raise HTTPException(status_code=404, detail="冰箱不存在或无权访问")
            return RecipeService(session).list_week(refrigerator_id, normalized_week_start)

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        response_model=list[RecipeEntryResponse],
        status_code=201,
    )
    def import_recipes(
        refrigerator_id: str,
        payload: RecipeImportRequest,
        current_owner: str = Depends(owner_id),
    ) -> list[RecipeEntryResponse]:
        """解析并导入多行食谱；未知小类要求用户在编辑页精确改正。"""
        try:
            with transaction(session_factory) as session:
                refrigerator = session.get(Refrigerator, refrigerator_id)
                if refrigerator is None or refrigerator.owner_user_id != current_owner:
                    raise ValueError("冰箱不存在或无权访问")
                week_start = payload.week_start - timedelta(days=payload.week_start.weekday())
                return RecipeService(session).import_text(refrigerator_id, week_start, payload.text)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/{entry_id}",
        response_model=RecipeEntryResponse,
    )
    def update_recipe(
        refrigerator_id: str,
        entry_id: str,
        payload: RecipeEntryWriteRequest,
        current_owner: str = Depends(owner_id),
    ) -> RecipeEntryResponse:
        """编辑一道未完成食谱；服务端拒绝任何非严格小类匹配。"""
        try:
            with transaction(session_factory) as session:
                refrigerator = session.get(Refrigerator, refrigerator_id)
                if refrigerator is None or refrigerator.owner_user_id != current_owner:
                    raise ValueError("冰箱不存在或无权访问")
                return RecipeService(session).update_entry(
                    refrigerator_id,
                    entry_id,
                    payload.weekday,
                    payload.dish_name,
                    [ingredient.model_dump() for ingredient in payload.ingredients],
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/{entry_id}/complete",
        response_model=RecipeEntryResponse,
    )
    def complete_recipe_entry(
        refrigerator_id: str, entry_id: str, current_owner: str = Depends(owner_id)
    ) -> RecipeEntryResponse:
        """原子扣减最早 BBD 批次并记录可逆的逐批次消费审计。"""
        try:
            with transaction(session_factory) as session:
                refrigerator = session.get(Refrigerator, refrigerator_id)
                if refrigerator is None or refrigerator.owner_user_id != current_owner:
                    raise ValueError("冰箱不存在或无权访问")
                return RecipeService(session).complete(refrigerator_id, entry_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/{entry_id}/undo",
        response_model=RecipeEntryResponse,
    )
    def undo_recipe_entry(
        refrigerator_id: str, entry_id: str, current_owner: str = Depends(owner_id)
    ) -> RecipeEntryResponse:
        """原子恢复该完成动作所有原批次的实际扣减数量。"""
        try:
            with transaction(session_factory) as session:
                refrigerator = session.get(Refrigerator, refrigerator_id)
                if refrigerator is None or refrigerator.owner_user_id != current_owner:
                    raise ValueError("冰箱不存在或无权访问")
                return RecipeService(session).undo(refrigerator_id, entry_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/restock",
        response_model=list[RestockEntryResponse],
    )
    def restock_list(
        refrigerator_id: str, week_start: date, current_owner: str = Depends(owner_id)
    ) -> list[RestockEntryResponse]:
        """读取本周和下周未完成食谱中按菜名分组的动态缺货清单。"""
        with session_factory() as session:
            refrigerator = session.get(Refrigerator, refrigerator_id)
            if refrigerator is None or refrigerator.owner_user_id != current_owner:
                raise HTTPException(status_code=404, detail="冰箱不存在或无权访问")
            normalized_week_start = week_start - timedelta(days=week_start.weekday())
            return RecipeService(session).restock(refrigerator_id, normalized_week_start)

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/layout",
        response_model=RefrigeratorLayoutResponse,
    )
    def owner_refrigerator_layout(
        refrigerator_id: str, current_owner: str = Depends(owner_id)
    ) -> RefrigeratorLayoutResponse:
        """读取所有者冰箱的持久化布局，供预览和位置选择器复用。"""
        with session_factory() as session:
            refrigerator = session.get(Refrigerator, refrigerator_id)
            if refrigerator is None or refrigerator.owner_user_id != current_owner:
                raise HTTPException(status_code=404, detail="冰箱不存在或无权访问")
            return _layout_response(refrigerator, session)

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/layout",
        response_model=RefrigeratorLayoutResponse,
    )
    def replace_refrigerator_layout(
        refrigerator_id: str,
        payload: LayoutReplaceRequest,
        current_owner: str = Depends(owner_id),
    ) -> RefrigeratorLayoutResponse:
        """保存图形化分格结果，并原子归位会被删格中的库存。"""
        try:
            with transaction(session_factory) as session:
                refrigerator = session.get(Refrigerator, refrigerator_id)
                if refrigerator is None or refrigerator.owner_user_id != current_owner:
                    raise ValueError("冰箱不存在或无权访问")
                if refrigerator.revision != payload.expected_revision:
                    raise ValueError("布局已被其他设备修改，请重新读取后再保存")
                config = {
                    item.zone_key: (item.temperature_mode, item.slot_count) for item in payload.zones
                }
                if len(config) != len(payload.zones):
                    raise ValueError("同一个区域只能配置一次")
                service = LayoutService(session)
                service.replace_layout(refrigerator, config)
                session.flush()
                return _layout_response(refrigerator, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get("/api/devices/current/layout", response_model=RefrigeratorLayoutResponse)
    def device_refrigerator_layout(
        current_device: DeviceCredential = Depends(device),
    ) -> RefrigeratorLayoutResponse:
        """给手机位置选择器和后续墨水屏提供与所有者端完全同构的布局。"""
        with session_factory() as session:
            refrigerator = session.get(Refrigerator, current_device.refrigerator_id)
            if refrigerator is None or refrigerator.deleted_at is not None:
                raise HTTPException(status_code=401, detail="设备访问已移除或需要重新配对")
            return _layout_response(refrigerator, session)

    @application.get("/api/devices/current/inventory", response_model=list[InventoryBatchResponse])
    def device_inventory_list(
        current_device: DeviceCredential = Depends(device),
    ) -> list[InventoryBatchResponse]:
        """返回已配对显示设备所属冰箱的只读库存快照。"""
        with session_factory() as session:
            refrigerator = session.get(Refrigerator, current_device.refrigerator_id)
            if refrigerator is None or refrigerator.deleted_at is not None:
                raise HTTPException(status_code=401, detail="设备访问已移除或需要重新配对")
            batches = session.scalars(
                select(InventoryBatchModel)
                .where(InventoryBatchModel.refrigerator_id == refrigerator.id)
                .order_by(
                    InventoryBatchModel.best_before.is_(None),
                    InventoryBatchModel.best_before,
                    InventoryBatchModel.created_at,
                )
            )
            return [_inventory_response(batch, session) for batch in batches]

    @application.post(
        "/api/devices/current/sync-status",
        status_code=status.HTTP_204_NO_CONTENT,
        summary="记录冰箱端已完成一次完整同步",
        responses={204: {"description": "同步时间已记录"}},
    )
    def report_display_sync(current_device: DeviceCredential = Depends(device)) -> Response:
        """只接受 Kindle 在获取布局和库存均成功后上报的同步完成状态。"""
        if current_device.device_kind != "kindle":
            raise HTTPException(status_code=403, detail="只有冰箱端可以上报同步状态")
        with transaction(session_factory) as session:
            current = session.get(DeviceCredential, current_device.id)
            if current is None or current.revoked_at is not None:
                raise HTTPException(status_code=401, detail="设备访问已移除或需要重新配对")
            current.last_successful_sync_at = configured_clock()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @application.patch(
        "/api/devices/current/inventory/{batch_id}/quantity",
        response_model=InventoryBatchResponse | None,
    )
    def adjust_device_inventory_quantity(
        batch_id: str,
        payload: DeviceQuantityAdjustRequest,
        current_device: DeviceCredential = Depends(device),
    ) -> InventoryBatchResponse | None:
        """让冰箱端以单步加减或全部拿走方式调整自己的库存。"""
        try:
            with transaction(session_factory) as session:
                refrigerator = session.get(Refrigerator, current_device.refrigerator_id)
                if refrigerator is None or refrigerator.deleted_at is not None:
                    raise ValueError("设备访问已移除或需要重新配对")
                batch = InventoryService(session).adjust_batch_quantity(
                    refrigerator.id, batch_id, payload.delta
                )
                return _inventory_response(batch, session) if batch is not None else None
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/devices/current/inventory/restore",
        response_model=InventoryBatchResponse,
        status_code=201,
    )
    def restore_device_inventory_batch(
        payload: InventoryWriteRequest,
        current_device: DeviceCredential = Depends(device),
    ) -> InventoryBatchResponse:
        """恢复刚由冰箱端全部拿走的批次，并沿用普通录入的范围校验。"""
        try:
            with transaction(session_factory) as session:
                refrigerator = session.get(Refrigerator, current_device.refrigerator_id)
                if refrigerator is None or refrigerator.deleted_at is not None:
                    raise ValueError("设备访问已移除或需要重新配对")
                batch = InventoryService(session).create_batch(
                    refrigerator.id,
                    **payload.model_dump(),
                    shelf_life_days=_shelf_life_days(payload),
                )
                return _inventory_response(batch, session)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/kindle-passcodes", response_model=PasscodeResponse, status_code=201
    )
    def create_kindle_passcode(
        payload: PasscodeRequest,
        current_owner: str = Depends(owner_id),
    ) -> PasscodeResponse:
        """为已有冰箱或新冰箱生成仅一次可用的六位冰箱端兼容绑定码。"""
        try:
            with transaction(session_factory) as session:
                code = AccessService(session).create_passcode(
                    current_owner,
                    payload.refrigerator_id,
                    payload.new_refrigerator_name,
                    payload.new_template_key,
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return PasscodeResponse(passcode=code, expires_in_seconds=300)

    @application.post("/api/kindle/bind", response_model=RefrigeratorResponse, status_code=201)
    def bind_kindle(payload: KindleBindRequest, request: Request) -> Response:
        """消费兼容绑定码并把独立冰箱端凭证写入 HttpOnly Cookie。"""
        try:
            with transaction(session_factory) as session:
                device_record, token = AccessService(session).consume_passcode(
                    payload.passcode, payload.label
                )
                refrigerator = session.get(Refrigerator, device_record.refrigerator_id)
                assert refrigerator is not None
                body = _refrigerator_response(refrigerator).model_dump_json()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        response = Response(content=body, media_type="application/json", status_code=201)
        _set_device_cookie(response, request, token)
        return response

    @application.post(
        "/api/kindle/first-boot-sessions",
        response_model=FirstBootPairingCreateResponse,
        status_code=201,
    )
    def create_first_boot_pairing_session(request: Request) -> Response:
        """让未绑定 Kindle 创建仅供手机扫码领取的十分钟首次开机会话。"""
        with transaction(session_factory) as session:
            _, mobile_token, kindle_token = AccessService(
                session
            ).create_first_boot_pairing_session()
        base_url = public_request_base_url(request)
        body = FirstBootPairingCreateResponse(
            pairing_token=mobile_token,
            pairing_url=f"{base_url}/pair?{urlencode({'bootstrap': mobile_token})}",
            expires_in_seconds=600,
        ).model_dump_json()
        response = Response(content=body, media_type="application/json", status_code=201)
        response.set_cookie(
            KINDLE_FIRST_BOOT_COOKIE,
            kindle_token,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
            max_age=600,
        )
        return response

    @application.post(
        "/api/first-boot-pairings/claim",
        response_model=RefrigeratorResponse,
        status_code=201,
    )
    def claim_first_boot_pairing(
        payload: FirstBootPairingClaimRequest,
        request: Request,
        current_owner: str = Depends(owner_id),
    ) -> Response:
        """由已登录 PWA 领取首次二维码，绑定已选冰箱并获得本机设备凭证。"""
        try:
            with transaction(session_factory) as session:
                device_record, token = AccessService(session).claim_first_boot_pairing(
                    payload.pairing_token,
                    current_owner,
                    payload.label,
                    payload.refrigerator_id,
                    payload.new_refrigerator_name,
                    payload.new_template_key,
                )
                refrigerator = session.get(Refrigerator, device_record.refrigerator_id)
                assert refrigerator is not None
                body = _refrigerator_response(refrigerator).model_dump_json()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        response = Response(content=body, media_type="application/json", status_code=201)
        _set_device_cookie(response, request, token)
        return response

    @application.get(
        "/api/kindle/first-boot-sessions/current",
        response_model=FirstBootPairingStatusResponse,
    )
    def current_first_boot_pairing(
        request: Request,
        kindle_token: Annotated[str | None, Cookie(alias=KINDLE_FIRST_BOOT_COOKIE)] = None,
    ) -> Response:
        """让 Kindle 轮询手机是否已完成领取，并在完成时一次性签发 Kindle 凭证。"""
        if not kindle_token:
            raise HTTPException(status_code=404, detail="没有进行中的首次配对会话")
        try:
            with transaction(session_factory) as session:
                result = AccessService(session).bind_first_boot_kindle(kindle_token, "厨房 Kindle")
                if result is None:
                    return Response(
                        content=FirstBootPairingStatusResponse(state="pending").model_dump_json(),
                        media_type="application/json",
                    )
                device_record, token = result
                refrigerator = session.get(Refrigerator, device_record.refrigerator_id)
                assert refrigerator is not None
                body = FirstBootPairingStatusResponse(
                    state="bound", refrigerator=_refrigerator_response(refrigerator)
                ).model_dump_json()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        response = Response(content=body, media_type="application/json")
        _set_device_cookie(response, request, token)
        response.delete_cookie(KINDLE_FIRST_BOOT_COOKIE)
        return response

    @application.post(
        "/api/kindle/pairing-sessions", response_model=PairingCreateResponse, status_code=201
    )
    def create_pairing_session(
        request: Request, current_device: DeviceCredential = Depends(device)
    ) -> PairingCreateResponse:
        """由 Kindle 创建单次二维码会话；手机扫码后无需 Kindle 二次确认。"""
        if current_device.device_kind != "kindle":
            raise HTTPException(status_code=403, detail="只有 Kindle 可以发起手机配对")
        with transaction(session_factory) as session:
            current = session.get(DeviceCredential, current_device.id)
            assert current is not None
            _, pairing_token = AccessService(session).create_pairing_session(current)
        base_url = public_request_base_url(request)
        return PairingCreateResponse(
            pairing_token=pairing_token,
            pairing_url=f"{base_url}/pair?{urlencode({'token': pairing_token})}",
            expires_in_seconds=600,
        )

    @application.post("/api/pairings/consume", response_model=RefrigeratorResponse, status_code=201)
    def consume_pairing(payload: PairingConsumeRequest, request: Request) -> Response:
        """仅由 PWA 提交的二维码消费请求，为当前安装实例颁发新凭证。"""
        try:
            with transaction(session_factory) as session:
                device_record, token = AccessService(session).consume_pairing(
                    payload.pairing_token, payload.label
                )
                refrigerator = session.get(Refrigerator, device_record.refrigerator_id)
                assert refrigerator is not None
                body = _refrigerator_response(refrigerator).model_dump_json()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        response = Response(content=body, media_type="application/json", status_code=201)
        _set_device_cookie(response, request, token)
        return response

    @application.get("/api/devices/refrigerators", response_model=list[RefrigeratorResponse])
    def device_refrigerators(request: Request) -> list[RefrigeratorResponse]:
        """列出本浏览器/PWA 安装实例仍可访问的所有冰箱，并自动过滤已撤销项。"""
        refrigerators: dict[str, RefrigeratorResponse] = {}
        with transaction(session_factory) as session:
            service = AccessService(session)
            for token in bearer_or_cookie_tokens(request):
                current = service.device_for_token(token)
                if current is None:
                    continue
                refrigerator = session.get(Refrigerator, current.refrigerator_id)
                if refrigerator and refrigerator.deleted_at is None:
                    refrigerators[refrigerator.id] = _refrigerator_response(refrigerator)
        return list(refrigerators.values())

    @application.get("/api/devices/current", response_model=RefrigeratorResponse)
    def current_device_refrigerator(
        current_device: DeviceCredential = Depends(device),
    ) -> RefrigeratorResponse:
        """读取当前设备的冰箱，用于在撤销后验证访问已被立即拒绝。"""
        with session_factory() as session:
            refrigerator = session.get(Refrigerator, current_device.refrigerator_id)
            if refrigerator is None or refrigerator.deleted_at is not None:
                raise HTTPException(status_code=401, detail="设备访问已移除或需要重新配对")
            return _refrigerator_response(refrigerator)

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/expiry-settings",
        response_model=ExpirySettingsResponse,
    )
    def get_expiry_settings(
        refrigerator_id: str, current_owner: str = Depends(owner_id)
    ) -> ExpirySettingsResponse:
        """读取冰箱临期规则；未保存时返回产品默认值。"""
        try:
            with transaction(session_factory) as session:
                AccessService(session)._require_owned_refrigerator(current_owner, refrigerator_id)
                settings = session.get(ExpirySettings, refrigerator_id)
                if settings is None:
                    return ExpirySettingsResponse(ratio_percent=20, minimum_days=1, maximum_days=14)
                return ExpirySettingsResponse(
                    ratio_percent=settings.ratio_percent,
                    minimum_days=settings.minimum_days,
                    maximum_days=settings.maximum_days,
                )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/expiry-settings",
        response_model=ExpirySettingsResponse,
    )
    def update_expiry_settings(
        refrigerator_id: str,
        payload: ExpirySettingsRequest,
        current_owner: str = Depends(owner_id),
    ) -> ExpirySettingsResponse:
        """保存临期百分比及最短、最长提前天数。"""
        if payload.maximum_days < payload.minimum_days:
            raise HTTPException(status_code=422, detail="最多提前天数不能小于最少提前天数")
        try:
            with transaction(session_factory) as session:
                AccessService(session)._require_owned_refrigerator(current_owner, refrigerator_id)
                settings = session.get(ExpirySettings, refrigerator_id)
                if settings is None:
                    settings = ExpirySettings(refrigerator_id=refrigerator_id)
                    session.add(settings)
                settings.ratio_percent = payload.ratio_percent
                settings.minimum_days = payload.minimum_days
                settings.maximum_days = payload.maximum_days
                session.flush()
                return ExpirySettingsResponse(**payload.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/notification-settings",
        response_model=NotificationSettingsResponse,
    )
    def get_notification_settings(
        refrigerator_id: str,
        response: Response,
        current_owner: str = Depends(owner_id),
        recipient_key: str = Depends(reminder_recipient_key),
    ) -> NotificationSettingsResponse:
        """读取提醒设置；首次访问使用每日 20:00 和两类提醒均开启的默认值。"""
        try:
            with transaction(session_factory) as session:
                AccessService(session)._require_owned_refrigerator(current_owner, refrigerator_id)
                settings = ReminderService(session, configured_clock()).settings(
                    refrigerator_id, recipient_key
                )
                return NotificationSettingsResponse(
                    daily_reminder_enabled=settings.daily_reminder_enabled,
                    reminder_time=settings.reminder_time,
                    device_health_enabled=settings.device_health_enabled,
                )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/notification-settings",
        response_model=NotificationSettingsResponse,
    )
    def update_notification_settings(
        refrigerator_id: str,
        payload: NotificationSettingsRequest,
        response: Response,
        current_owner: str = Depends(owner_id),
        recipient_key: str = Depends(reminder_recipient_key),
    ) -> NotificationSettingsResponse:
        """保存每日提醒开关、时间和显示设备健康提醒开关。"""
        try:
            with transaction(session_factory) as session:
                AccessService(session)._require_owned_refrigerator(current_owner, refrigerator_id)
                settings = session.get(NotificationSettings, (refrigerator_id, recipient_key))
                if settings is None:
                    settings = NotificationSettings(
                        refrigerator_id=refrigerator_id, recipient_key=recipient_key
                    )
                    session.add(settings)
                settings.daily_reminder_enabled = payload.daily_reminder_enabled
                settings.reminder_time = payload.reminder_time
                settings.device_health_enabled = payload.device_health_enabled
                return NotificationSettingsResponse(**payload.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/notifications/due",
        response_model=list[DueNotificationResponse],
    )
    def collect_due_notifications(
        refrigerator_id: str,
        response: Response,
        current_owner: str = Depends(owner_id),
        recipient_key: str = Depends(reminder_recipient_key),
    ) -> list[DueNotificationResponse]:
        """取走当前时间首次出现的应用内提醒，并记录每日去重审计。"""
        try:
            with transaction(session_factory) as session:
                AccessService(session)._require_owned_refrigerator(current_owner, refrigerator_id)
                due = ReminderService(session, configured_clock()).due(
                    refrigerator_id, recipient_key
                )
                return [
                    DueNotificationResponse(kind=item.kind, title=item.title, body=item.body)
                    for item in due
                ]
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/devices",
        response_model=list[DeviceResponse],
    )
    def owner_devices(
        refrigerator_id: str,
        request: Request,
        current_owner: str = Depends(owner_id),
    ) -> list[DeviceResponse]:
        """读取所有者冰箱的所有设备及其最近访问时间。"""
        try:
            with session_factory() as session:
                service = AccessService(session)
                devices = service.list_devices(current_owner, refrigerator_id)
                current_device_ids = service.device_ids_for_tokens(
                    bearer_or_cookie_tokens(request), refrigerator_id
                )
                return [
                    _device_response(item, is_current=item.id in current_device_ids)
                    for item in devices
                ]
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/devices/{device_id}",
        response_model=DeviceResponse,
    )
    def rename_device(
        refrigerator_id: str,
        device_id: str,
        payload: DeviceRenameRequest,
        request: Request,
        current_owner: str = Depends(owner_id),
    ) -> DeviceResponse:
        """重命名仍有效的 PWA 或冰箱端设备。"""
        label = payload.label.strip()
        if not label:
            raise HTTPException(status_code=422, detail="设备名称不能为空")
        try:
            with transaction(session_factory) as session:
                device = AccessService(session).rename_device(
                    current_owner, refrigerator_id, device_id, label
                )
                session.flush()
                is_current = device.id in AccessService(session).device_ids_for_tokens(
                    bearer_or_cookie_tokens(request), refrigerator_id
                )
                return _device_response(device, is_current=is_current)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.delete(
        "/api/owner/refrigerators/{refrigerator_id}/devices/{device_id}", status_code=204
    )
    def remove_device(
        refrigerator_id: str,
        device_id: str,
        current_owner: str = Depends(owner_id),
    ) -> Response:
        """立即撤销一个 PWA 或 Kindle 凭证；已移除设备随后访问会得到 401。"""
        try:
            with transaction(session_factory) as session:
                AccessService(session).revoke_device(current_owner, refrigerator_id, device_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return Response(status_code=204)

    dist = frontend_dist or Path(__file__).resolve().parents[2] / "frontend" / "dist"
    assets = dist / "assets"
    if not dist.is_dir():
        return application
    if assets.is_dir():
        application.mount("/assets", StaticFiles(directory=assets), name="assets")

    @application.middleware("http")
    async def pwa_fallback(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """将未知页面回退到 PWA，同时始终保留 API 的 JSON 404 语义。"""
        response = await call_next(request)
        if (
            response.status_code != 404
            or request.method not in {"GET", "HEAD"}
            or request.url.path.startswith("/api/")
        ):
            return response
        requested_file = (dist / request.url.path.lstrip("/")).resolve()
        if requested_file.is_relative_to(dist.resolve()) and requested_file.is_file():
            return FileResponse(requested_file)
        return FileResponse(dist / "index.html")

    return application


app = create_app(load_local_env=True)
