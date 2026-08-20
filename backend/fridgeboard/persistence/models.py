"""P2 的 SQLAlchemy 领域持久化映射。

本模块定义数据库结构和关系，不实现扣库存、配对消费或 API 序列化；这些行为分别
属于领域服务和后续任务。所有时间都以 UTC 保存，用户本地日期的判断在服务层完成。
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _uuid() -> str:
    """返回无分隔符 UUID，避免把数据库主键格式暴露为业务语义。"""
    return uuid4().hex


def _utcnow() -> datetime:
    """返回用于记录创建与更新时间的 UTC 时间戳。"""
    return datetime.now(UTC)


class Base(DeclarativeBase):
    """全部 FridgeBoard 持久化模型的 declarative 基类。"""


class Refrigerator(Base):
    """一台独立冰箱及其所有者、设置进度和软删除状态。"""

    __tablename__ = "refrigerators"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    owner_user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    template_key: Mapped[str] = mapped_column(String(64), nullable=False)
    setup_status: Mapped[str] = mapped_column(
        String(20), default="needs_layout", server_default="needs_layout", nullable=False
    )
    setup_draft: Mapped[dict[str, Any] | None] = mapped_column(JSON(none_as_null=True))
    last_added_storage_slot_id: Mapped[str | None] = mapped_column(
        ForeignKey("storage_slots.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "setup_status IN ('needs_layout', 'ready')",
            name="ck_refrigerators_setup_status",
        ),
        CheckConstraint(
            "setup_status = 'needs_layout' OR setup_draft IS NULL",
            name="ck_refrigerators_ready_without_draft",
        ),
    )


class StorageZone(Base):
    """冰箱布局中的大分区，例如冷藏、冷冻或门架。"""

    __tablename__ = "storage_zones"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    refrigerator_id: Mapped[str] = mapped_column(
        ForeignKey("refrigerators.id"), nullable=False, index=True
    )
    zone_key: Mapped[str] = mapped_column(String(80), nullable=False)
    temperature_mode: Mapped[str] = mapped_column(String(20), nullable=False)
    geometry: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (UniqueConstraint("refrigerator_id", "zone_key"),)


class StorageSlot(Base):
    """物品必须归属的最小物理存放位置。"""

    __tablename__ = "storage_slots"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    zone_id: Mapped[str] = mapped_column(ForeignKey("storage_zones.id"), nullable=False, index=True)
    slot_key: Mapped[str] = mapped_column(String(80), nullable=False)
    custom_name: Mapped[str | None] = mapped_column(String(120))
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)
    geometry: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    __table_args__ = (UniqueConstraint("zone_id", "slot_key"),)


class FoodCategory(Base):
    """内置或某台冰箱专属的物品分类节点。"""

    __tablename__ = "food_categories"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    refrigerator_id: Mapped[str | None] = mapped_column(ForeignKey("refrigerators.id"), index=True)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("food_categories.id"), index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    icon_key: Mapped[str | None] = mapped_column(String(160))
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class IconAsset(Base):
    """一个可由分类复用的 SVG 或透明 PNG 图标资产。"""

    __tablename__ = "icon_assets"

    key: Mapped[str] = mapped_column(String(160), primary_key=True)
    refrigerator_id: Mapped[str | None] = mapped_column(ForeignKey("refrigerators.id"), index=True)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    media_type: Mapped[str] = mapped_column(String(40), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class RecentSubcategoryUsage(Base):
    """每台冰箱最近成功新增过的小类及其最后使用时间。"""

    __tablename__ = "recent_subcategory_usage"

    refrigerator_id: Mapped[str] = mapped_column(ForeignKey("refrigerators.id"), primary_key=True)
    subcategory_id: Mapped[str] = mapped_column(
        ForeignKey("food_categories.id"), primary_key=True
    )
    last_added_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False, index=True
    )
    is_bootstrap: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ItemCategoryMapping(Base):
    """当前冰箱学习到的物品名称与小类映射。"""

    __tablename__ = "item_category_mappings"

    refrigerator_id: Mapped[str] = mapped_column(
        ForeignKey("refrigerators.id"), primary_key=True
    )
    normalized_item_name: Mapped[str] = mapped_column(String(160), primary_key=True)
    display_item_name: Mapped[str] = mapped_column(String(160), nullable=False)
    subcategory_id: Mapped[str] = mapped_column(
        ForeignKey("food_categories.id"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    confidence: Mapped[float] = mapped_column(default=1.0, nullable=False)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(80))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    hit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )


class GlobalItemCategoryMapping(Base):
    """跨冰箱复用的商品名称与内置小类映射。"""

    __tablename__ = "global_item_category_mappings"

    normalized_item_name: Mapped[str] = mapped_column(String(160), primary_key=True)
    display_item_name: Mapped[str] = mapped_column(String(160), nullable=False)
    subcategory_id: Mapped[str] = mapped_column(
        ForeignKey("food_categories.id"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    confidence: Mapped[float] = mapped_column(default=1.0, nullable=False)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(80))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    hit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )


class IconGenerationSession(Base):
    """一组尚未确认、到期后必须清理的 AI 图标候选。"""

    __tablename__ = "icon_generation_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    refrigerator_id: Mapped[str] = mapped_column(
        ForeignKey("refrigerators.id"), nullable=False, index=True
    )
    subcategory_name: Mapped[str] = mapped_column(String(80), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class IconGenerationCandidate(Base):
    """AI 图标生成会话中的一个临时 PNG 候选。"""

    __tablename__ = "icon_generation_candidates"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("icon_generation_sessions.id"), nullable=False, index=True
    )
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)


class InventoryBatchModel(Base):
    """一个可独立日期管理、扣减与撤销恢复的库存批次。"""

    __tablename__ = "inventory_batches"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    refrigerator_id: Mapped[str] = mapped_column(
        ForeignKey("refrigerators.id"), nullable=False, index=True
    )
    subcategory_id: Mapped[str] = mapped_column(
        ForeignKey("food_categories.id"), nullable=False, index=True
    )
    storage_slot_id: Mapped[str] = mapped_column(
        ForeignKey("storage_slots.id"), nullable=False, index=True
    )
    item_name: Mapped[str] = mapped_column(String(160), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("1"), nullable=False)
    production_date: Mapped[date | None] = mapped_column(Date)
    best_before: Mapped[date | None] = mapped_column(Date)
    shelf_life_days: Mapped[int | None] = mapped_column(Integer)
    product_description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    barcode: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )


class DeviceCredential(Base):
    """一台 PWA 或 Kindle 的可撤销设备凭证元数据，永不保存明文凭证。"""

    __tablename__ = "device_credentials"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    refrigerator_id: Mapped[str] = mapped_column(
        ForeignKey("refrigerators.id"), nullable=False, index=True
    )
    device_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    credential_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime)
    # ``last_seen_at`` also changes when a device merely opens an API route; only a
    # completed display snapshot may update this field.
    last_successful_sync_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)

class OwnerSession(Base):
    """所有者的服务端管理会话；Cookie 中仅保存对应的不透明随机值。"""

    __tablename__ = "owner_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    owner_user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)


class MobileAuthorizationCode(Base):
    """系统浏览器 SSO 回调后签发的一次性 App 授权码。"""

    __tablename__ = "mobile_authorization_codes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    owner_user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    redirect_uri: Mapped[str] = mapped_column(String(512), nullable=False)
    code_challenge: Mapped[str] = mapped_column(String(128), nullable=False)
    code_challenge_method: Mapped[str] = mapped_column(
        String(10), default="S256", server_default="S256", nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class MobileSession(Base):
    """Capacitor App 的可撤销访问/刷新会话，仅保存令牌摘要。"""

    __tablename__ = "mobile_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    owner_user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    access_token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    access_expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    refresh_expires_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)


class KindlePasscode(Base):
    """一次性 Kindle 绑定口令；只保存口令哈希，消费必须在短事务内完成。"""

    __tablename__ = "kindle_passcodes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    owner_user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    refrigerator_id: Mapped[str | None] = mapped_column(ForeignKey("refrigerators.id"))
    new_refrigerator_name: Mapped[str | None] = mapped_column(String(120))
    new_template_key: Mapped[str | None] = mapped_column(String(64))
    purpose: Mapped[str] = mapped_column(
        String(32),
        default="bind_display_device",
        server_default="bind_display_device",
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (
        CheckConstraint(
            "purpose IN ('bind_display_device', 'replace_display_device')",
            name="ck_kindle_passcodes_purpose",
        ),
    )


class PairingSession(Base):
    """Kindle 发起的单次手机配对会话；会话值不是长期设备凭证。"""

    __tablename__ = "pairing_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    refrigerator_id: Mapped[str] = mapped_column(
        ForeignKey("refrigerators.id"), nullable=False, index=True
    )
    kindle_device_id: Mapped[str] = mapped_column(
        ForeignKey("device_credentials.id"), nullable=False
    )
    purpose: Mapped[str] = mapped_column(
        String(32), default="grant_pwa_access", server_default="grant_pwa_access", nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (
        CheckConstraint(
            "purpose = 'grant_pwa_access'",
            name="ck_pairing_sessions_purpose",
        ),
    )


class FirstBootPairingSession(Base):
    """Kindle 首次开机二维码会话，分别保存手机与 Kindle 的短效机密摘要。"""

    __tablename__ = "first_boot_pairing_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    mobile_token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    kindle_token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    refrigerator_id: Mapped[str | None] = mapped_column(ForeignKey("refrigerators.id"), index=True)
    target_refrigerator_id: Mapped[str | None] = mapped_column(ForeignKey("refrigerators.id"))
    purpose: Mapped[str] = mapped_column(
        String(32),
        default="bind_display_device",
        server_default="bind_display_device",
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime)
    kindle_bound_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (
        CheckConstraint(
            "purpose IN ('bind_display_device', 'replace_display_device')",
            name="ck_first_boot_pairing_sessions_purpose",
        ),
        CheckConstraint(
            "target_refrigerator_id IS NULL OR refrigerator_id IS NULL "
            "OR target_refrigerator_id = refrigerator_id",
            name="ck_first_boot_pairing_sessions_target_matches_result",
        ),
    )


class RecipePlan(Base):
    """某台冰箱一个周周期的食谱容器。"""

    __tablename__ = "recipe_plans"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    refrigerator_id: Mapped[str] = mapped_column(
        ForeignKey("refrigerators.id"), nullable=False, index=True
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("refrigerator_id", "week_start"),)


class RecipeEntry(Base):
    """一周食谱中某天的一道菜、做法、备注及其完成状态。"""

    __tablename__ = "recipe_entries"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    recipe_plan_id: Mapped[str] = mapped_column(
        ForeignKey("recipe_plans.id"), nullable=False, index=True
    )
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    dish_name: Mapped[str] = mapped_column(String(160), nullable=False)
    method: Mapped[str | None] = mapped_column(String(2000))
    note: Mapped[str | None] = mapped_column(String(1000))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (UniqueConstraint("recipe_plan_id", "weekday", "dish_name"),)


class RecipeIngredientModel(Base):
    """食谱食材的原始名称和需求数量；旧版分类绑定字段仅为兼容保留。"""

    __tablename__ = "recipe_ingredients"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    recipe_entry_id: Mapped[str] = mapped_column(
        ForeignKey("recipe_entries.id"), nullable=False, index=True
    )
    subcategory_id: Mapped[str | None] = mapped_column(ForeignKey("food_categories.id"), index=True)
    raw_name: Mapped[str] = mapped_column(String(80), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("1"), nullable=False)


class CustomShoppingItem(Base):
    """用户手工添加到冰箱购物清单的物品及其数量。"""

    __tablename__ = "custom_shopping_items"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    refrigerator_id: Mapped[str] = mapped_column(
        ForeignKey("refrigerators.id"), nullable=False, index=True
    )
    item_name: Mapped[str] = mapped_column(String(160), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    __table_args__ = (CheckConstraint("quantity >= 1", name="ck_custom_shopping_quantity"),)


class RecipeCompletion(Base):
    """一次食谱完成动作，用于限制编辑并支持原子撤销。"""

    __tablename__ = "recipe_completions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    recipe_entry_id: Mapped[str] = mapped_column(
        ForeignKey("recipe_entries.id"), nullable=False, unique=True
    )
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    undone_at: Mapped[datetime | None] = mapped_column(DateTime)


class ConsumptionLineModel(Base):
    """完成食谱时从原库存批次扣除的精确数量，供撤销恢复。"""

    __tablename__ = "consumption_lines"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    completion_id: Mapped[str] = mapped_column(
        ForeignKey("recipe_completions.id"), nullable=False, index=True
    )
    inventory_batch_id: Mapped[str] = mapped_column(
        ForeignKey("inventory_batches.id"), nullable=False
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)


class ExpirySettings(Base):
    """一台冰箱的临期窗口配置，默认值与产品规则一致。"""

    __tablename__ = "expiry_settings"

    refrigerator_id: Mapped[str] = mapped_column(ForeignKey("refrigerators.id"), primary_key=True)
    ratio_percent: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    minimum_days: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    maximum_days: Mapped[int] = mapped_column(Integer, default=14, nullable=False)


class NotificationSettings(Base):
    """某台手机/PWA 对一台冰箱的每日提醒与设备健康提醒设置。"""

    __tablename__ = "notification_settings"

    refrigerator_id: Mapped[str] = mapped_column(ForeignKey("refrigerators.id"), primary_key=True)
    recipient_key: Mapped[str] = mapped_column(String(80), primary_key=True)
    daily_reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reminder_time: Mapped[str] = mapped_column(String(5), default="20:00", nullable=False)
    device_health_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class NotificationDelivery(Base):
    """按手机/PWA 去重的每日提醒观测记录；不保存推送订阅明文。"""

    __tablename__ = "notification_deliveries"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    refrigerator_id: Mapped[str] = mapped_column(
        ForeignKey("refrigerators.id"), nullable=False, index=True
    )
    recipient_key: Mapped[str] = mapped_column(String(80), nullable=False)
    notification_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    notification_date: Mapped[date] = mapped_column(Date, nullable=False)
    delivered_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "refrigerator_id", "recipient_key", "notification_kind", "notification_date"
        ),
    )
