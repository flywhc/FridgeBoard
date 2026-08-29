"""Inventory and category API schemas."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from fridgeboard.api_model_common import CATEGORY_ID_MAX_LENGTH


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

    subcategory_id: str = Field(
        min_length=1, max_length=CATEGORY_ID_MAX_LENGTH, examples=["builtin-egg"]
    )
    storage_slot_id: str = Field(examples=["slot-001"])
    item_name: str = Field(min_length=1, max_length=160, examples=["土鸡蛋"])
    quantity: Decimal = Field(
        default=Decimal("1"), ge=0, max_digits=10, decimal_places=2, examples=[6]
    )
    best_before: date | None = Field(default=None, examples=["2026-08-01"])
    production_date: date | None = Field(default=None, examples=["2026-07-01"])
    product_description: str | None = Field(default=None, max_length=1000, examples=["盒装 30 枚"])
    price: Decimal | None = Field(
        default=None, ge=0, max_digits=10, decimal_places=2, examples=["29.90"]
    )
    barcode: str | None = Field(default=None, max_length=128, examples=["6901234567890"])
    best_before_changed: bool = Field(
        default=False,
        description="编辑数量时是否明确填写/清空了新的 BBD；仅用于更新既有库存。",
    )
    merge_same_name: bool = Field(
        default=False,
        description="订单批量录入时，允许在同一小类和位置合并已有同名库存。",
    )


class DeviceInventoryRestoreRequest(BaseModel):
    """冰箱端撤销“全部拿走”时恢复原库存批次的请求。"""

    batch_id: str | None = Field(
        default=None,
        description="要恢复的原库存批次 ID；为空时兼容旧版客户端创建恢复批次。",
        examples=["batch-001"],
    )
    subcategory_id: str | None = Field(default=None, examples=["builtin-egg"])
    storage_slot_id: str | None = Field(default=None, examples=["slot-001"])
    item_name: str | None = Field(default=None, min_length=1, max_length=160, examples=["土鸡蛋"])
    quantity: Decimal = Field(
        default=Decimal("1"), ge=0, max_digits=10, decimal_places=2, examples=[6]
    )
    best_before: date | None = Field(default=None, examples=["2026-08-01"])
    production_date: date | None = Field(default=None, examples=["2026-07-01"])
    product_description: str | None = Field(default=None, max_length=1000, examples=["盒装 30 枚"])
    price: Decimal | None = Field(
        default=None, ge=0, max_digits=10, decimal_places=2, examples=["29.90"]
    )
    barcode: str | None = Field(default=None, max_length=128, examples=["6901234567890"])


class InventoryMoveRequest(BaseModel):
    """把一个或多个库存批次移动到目标冰箱位置的请求。"""

    target_refrigerator_id: str = Field(min_length=1, examples=["fridge-002"])
    storage_slot_id: str = Field(min_length=1, examples=["slot-002"])
    batch_ids: list[str] = Field(min_length=1, max_length=100, examples=[["batch-001"]])


class InventoryDeleteRequest(BaseModel):
    """所有者批量永久删除库存批次的请求。"""

    batch_ids: list[str] = Field(min_length=1, max_length=100, examples=[["batch-001"]])


class InventoryCategoryRequest(BaseModel):
    """所有者批量修改库存批次小类的请求。"""

    subcategory_id: str = Field(
        min_length=1, max_length=CATEGORY_ID_MAX_LENGTH, examples=["builtin-egg"]
    )
    batch_ids: list[str] = Field(min_length=1, max_length=100, examples=[["batch-001"]])


class CategoryRecognitionRequest(BaseModel):
    """分类识别时来自前一页尚未提交的物品上下文。"""

    context_item_name: str | None = Field(default=None, max_length=160)
    context_inventory_batch_id: str | None = Field(default=None, max_length=32)


class CategoryRecognitionItemResponse(BaseModel):
    """一次跨冰箱分类识别命中的物品名称和来源。"""

    item_name: str
    source: Literal["inventory", "recipe", "shopping", "current"]


class CategoryRecognitionResponse(BaseModel):
    """分类识别完成后的稳定结果。"""

    category_id: str
    category_name: str
    items: list[CategoryRecognitionItemResponse]


class InventoryBatchResponse(BaseModel):
    """库存列表和编辑表单共用的批次响应。"""

    id: str
    subcategory_id: str
    subcategory_name: str
    icon_key: str | None
    storage_slot_id: str
    storage_slot_name: str
    item_name: str
    quantity: float
    production_date: date | None
    best_before: date | None
    product_description: str | None
    price: Decimal | None
    barcode: str | None
    expiry_status: str | None
