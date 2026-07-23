"""P2 的 SQLAlchemy 领域持久化映射。

本模块定义数据库结构和关系，不实现扣库存、配对消费或 API 序列化；这些行为分别
属于领域服务和后续任务。所有时间都以 UTC 保存，用户本地日期的判断在服务层完成。
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
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
    """一台独立冰箱及其所有者和软删除状态。"""

    __tablename__ = "refrigerators"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    owner_user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    template_key: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)


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
    """食品必须归属的最小物理存放位置。"""

    __tablename__ = "storage_slots"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    zone_id: Mapped[str] = mapped_column(ForeignKey("storage_zones.id"), nullable=False, index=True)
    slot_key: Mapped[str] = mapped_column(String(80), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)
    geometry: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    __table_args__ = (UniqueConstraint("zone_id", "slot_key"),)


class FoodCategory(Base):
    """内置或某台冰箱专属的两级食物分类。"""

    __tablename__ = "food_categories"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    refrigerator_id: Mapped[str | None] = mapped_column(ForeignKey("refrigerators.id"), index=True)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("food_categories.id"), index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    icon_key: Mapped[str | None] = mapped_column(String(160))
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class CategoryLocationPreference(Base):
    """每台冰箱按大类保存的最近人工存放位置。"""

    __tablename__ = "category_location_preferences"

    refrigerator_id: Mapped[str] = mapped_column(ForeignKey("refrigerators.id"), primary_key=True)
    category_id: Mapped[str] = mapped_column(ForeignKey("food_categories.id"), primary_key=True)
    storage_slot_id: Mapped[str] = mapped_column(ForeignKey("storage_slots.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )


class InventoryBatchModel(Base):
    """一个可独立日期管理、扣减与撤销恢复的库存批次。"""

    __tablename__ = "inventory_batches"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    refrigerator_id: Mapped[str] = mapped_column(
        ForeignKey("refrigerators.id"), nullable=False, index=True
    )
    category_id: Mapped[str] = mapped_column(
        ForeignKey("food_categories.id"), nullable=False, index=True
    )
    subcategory_id: Mapped[str] = mapped_column(
        ForeignKey("food_categories.id"), nullable=False, index=True
    )
    storage_slot_id: Mapped[str] = mapped_column(
        ForeignKey("storage_slots.id"), nullable=False, index=True
    )
    food_name: Mapped[str] = mapped_column(String(160), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    production_date: Mapped[date | None] = mapped_column(Date)
    best_before: Mapped[date | None] = mapped_column(Date)
    shelf_life_days: Mapped[int | None] = mapped_column(Integer)
    product_description: Mapped[str | None] = mapped_column(Text)
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
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)


class OwnerSession(Base):
    """所有者的服务端管理会话；Cookie 中仅保存对应的不透明随机值。"""

    __tablename__ = "owner_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    owner_user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)


class KindlePasscode(Base):
    """一次性 Kindle 绑定口令；只保存口令哈希，消费必须在短事务内完成。"""

    __tablename__ = "kindle_passcodes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    owner_user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    refrigerator_id: Mapped[str | None] = mapped_column(ForeignKey("refrigerators.id"))
    new_refrigerator_name: Mapped[str | None] = mapped_column(String(120))
    new_template_key: Mapped[str | None] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime)


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
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime)


class FirstBootPairingSession(Base):
    """Kindle 首次开机二维码会话，分别保存手机与 Kindle 的短效机密摘要。"""

    __tablename__ = "first_boot_pairing_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    mobile_token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    kindle_token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    refrigerator_id: Mapped[str | None] = mapped_column(ForeignKey("refrigerators.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime)
    kindle_bound_at: Mapped[datetime | None] = mapped_column(DateTime)


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
    """一周食谱中某天的一道菜及其完成状态。"""

    __tablename__ = "recipe_entries"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    recipe_plan_id: Mapped[str] = mapped_column(
        ForeignKey("recipe_plans.id"), nullable=False, index=True
    )
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    dish_name: Mapped[str] = mapped_column(String(160), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (UniqueConstraint("recipe_plan_id", "weekday", "dish_name"),)


class RecipeIngredientModel(Base):
    """食谱食材的原始名称、可选严格匹配小类和需求数量。"""

    __tablename__ = "recipe_ingredients"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    recipe_entry_id: Mapped[str] = mapped_column(
        ForeignKey("recipe_entries.id"), nullable=False, index=True
    )
    subcategory_id: Mapped[str | None] = mapped_column(ForeignKey("food_categories.id"), index=True)
    raw_name: Mapped[str] = mapped_column(String(80), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


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
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)


class ExpirySettings(Base):
    """一台冰箱的临期窗口配置，默认值与产品规则一致。"""

    __tablename__ = "expiry_settings"

    refrigerator_id: Mapped[str] = mapped_column(ForeignKey("refrigerators.id"), primary_key=True)
    ratio_percent: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    minimum_days: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    maximum_days: Mapped[int] = mapped_column(Integer, default=14, nullable=False)
