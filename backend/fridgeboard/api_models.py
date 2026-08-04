from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


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
    slot_count: int = Field(ge=0, le=8)


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
    """物品位置选择器和拟物预览共享的最小位置数据。"""

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
    """可在小类图库中选择和复用的 SVG 或透明 PNG 图标。"""

    key: str = Field(examples=["egg"])
    label: str = Field(examples=["鸡蛋"])
    asset_url: str = Field(examples=["/api/icon-library/egg.svg"])
    media_type: Literal["image/svg+xml", "image/png"]


class FoodCategoryResponse(BaseModel):
    """库存表单使用的两级分类节点。"""

    id: str
    parent_id: str | None
    name: str
    icon_key: str | None
    is_custom: bool
    display_order: int


class CustomGroupRequest(BaseModel):
    """在展开选择器中创建一个仅用于导航的大类。"""

    name: str = Field(min_length=1, max_length=80, examples=["宠物用品"])


class CustomCategoryRequest(BaseModel):
    """手工创建一个冰箱专属小类的请求。"""

    parent_id: str = Field(examples=["builtin-egg"])
    name: str = Field(min_length=1, max_length=80, examples=["乌鸡蛋"])
    icon_key: str | None = Field(default=None, max_length=160, examples=["egg"])


class InventoryWriteRequest(BaseModel):
    """新增或编辑一个库存批次的完整可编辑字段。"""

    subcategory_id: str = Field(examples=["builtin-egg"])
    storage_slot_id: str = Field(examples=["slot-001"])
    item_name: str = Field(min_length=1, max_length=160, examples=["土鸡蛋"])
    quantity: int = Field(default=1, ge=0, examples=[6])
    best_before: date | None = Field(default=None, examples=["2026-08-01"])
    production_date: date | None = Field(default=None, examples=["2026-07-01"])
    product_description: str | None = Field(default=None, max_length=1000, examples=["盒装 30 枚"])
    barcode: str | None = Field(default=None, max_length=128, examples=["6901234567890"])


class InventoryBatchResponse(BaseModel):
    """库存列表和编辑表单共用的批次响应。"""

    id: str
    subcategory_id: str
    subcategory_name: str
    icon_key: str | None
    storage_slot_id: str
    item_name: str
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
    note: str | None = Field(default=None, max_length=1000, examples=["少放油"])
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


class RecipeCopyRequest(BaseModel):
    """将历史菜单完整覆盖到本周或下周的请求。"""

    source_week_start: date = Field(examples=["2026-07-13"])
    target_week_start: date = Field(examples=["2026-07-27"])


class RecipeIngredientResponse(BaseModel):
    """食谱及缺货清单展示的严格小类食材。"""

    subcategory_name: str
    quantity: int


class RecipeEntryResponse(BaseModel):
    """食谱行及其即时缺货结果。"""

    id: str
    weekday: int
    dish_name: str
    note: str | None
    completed: bool
    ingredients: list[RecipeIngredientResponse]
    missing: list[RecipeIngredientResponse]


class RecipeDayResponse(BaseModel):
    """固定一周中某一天和该日全部食谱。"""

    weekday: int
    label: str
    entries: list[RecipeEntryResponse]


class RecipeHistoryWeekResponse(BaseModel):
    """菜单历史列表中的一周摘要。"""

    week_start: date
    label: str
    recipe_count: int
    preview: str


class RestockEntryResponse(BaseModel):
    """按日期和菜名分组的一项动态缺货。"""

    weekday: int
    label: str
    dish_name: str
    missing: list[RecipeIngredientResponse]


class DefaultLocationResponse(BaseModel):
    """冰箱最近添加位置的表单预填结果。"""

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
    title: str = Field(examples=["有物品需要留意"])
    body: str = Field(examples=["牛奶临期或已过期，共 1 件。"])


class RecognitionRequest(BaseModel):
    """手机一次相机截图的受限识别请求；图片不会被持久化。"""

    image_base64: str = Field(
        min_length=1, max_length=7_000_000, examples=["/9j/4AAQSkZJRgABAQ..."]
    )
    content_type: Literal["image/jpeg", "image/png", "image/webp"] = Field(examples=["image/jpeg"])
    mode: Literal["image", "photo"] = Field(default="image", examples=["image"])


class RecognitionFieldResponse(BaseModel):
    """一个可由前端按置信度和来源处理的增量识别字段。"""

    value: str
    confidence: float = Field(ge=0, le=1)


class RecognitionOrderItemResponse(BaseModel):
    """订单截图中可直接批量加入冰箱的一项商品。"""

    item_name: str = Field(min_length=1)
    specification: str = ""
    quantity: int = Field(default=1, ge=1, le=9999)


class RecognitionResponse(BaseModel):
    """本次图像的识别结果；普通商品填充字段，订单截图返回商品列表。"""

    kind: Literal["item", "order", "unknown"] = "unknown"
    fields: dict[str, RecognitionFieldResponse]
    order_items: list[RecognitionOrderItemResponse] = Field(default_factory=list)


class BarcodeSuggestionResponse(BaseModel):
    """同一冰箱已确认条码可复用的非批次商品信息。"""

    item_name: str
    subcategory_id: str
    product_description: str | None
    barcode: str


class ProductLookupResponse(BaseModel):
    """公开商品数据库返回的首次扫码查询结果。"""

    found: bool
    item_name: str | None = None
    product_description: str | None = None
    barcode: str
    source: str | None = None


class IconCandidateCreateRequest(BaseModel):
    """请求为一个待建小类生成四个透明 PNG 候选。"""

    subcategory_name: str = Field(min_length=1, max_length=80, examples=["洗发水"])


class IconCandidateResponse(BaseModel):
    """一个尚未持久化的临时 AI 图标候选。"""

    id: str
    asset_url: str


class IconGenerationResponse(BaseModel):
    """一组等待用户四选一确认的 AI 图标候选。"""

    id: str
    candidates: list[IconCandidateResponse]


class IconCandidateConfirmRequest(BaseModel):
    """确认候选并同时创建自定义小类。"""

    candidate_id: str
    parent_id: str
    subcategory_name: str = Field(min_length=1, max_length=80)
