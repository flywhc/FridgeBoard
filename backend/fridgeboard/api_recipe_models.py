"""Recipe and shopping list API schemas."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from fridgeboard.api_model_common import CATEGORY_ID_MAX_LENGTH


class RecipeIngredientRequest(BaseModel):
    """食谱编辑时用户填写的库存食材名称与需求数量。"""

    subcategory_name: str = Field(
        min_length=1,
        max_length=80,
        examples=["鸡蛋"],
        description="兼容既有字段名；实际要求分类 ID 相同且库存批次的 item_name 包含该名称。",
    )
    quantity: Decimal = Field(
        default=Decimal("1"), ge=Decimal("0.01"), max_digits=10, decimal_places=2, examples=[2]
    )
    subcategory_id: str | None = Field(
        default=None, min_length=1, max_length=CATEGORY_ID_MAX_LENGTH
    )


class RecipeEntryWriteRequest(BaseModel):
    """保存单日一道食谱的请求；库存判断要求分类相同且库存名称包含食材名称。"""

    weekday: int = Field(ge=0, le=6, examples=[1])
    dish_name: str = Field(min_length=1, max_length=160, examples=["鸡蛋炒河粉"])
    method: str | None = Field(
        default=None, max_length=2000, examples=["先炒鸡蛋，再加入河粉翻炒。"]
    )
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
    mode: Literal["add", "overwrite"] = Field(
        default="add",
        description="添加到目标周，或先清空目标周再导入。",
    )


class RecipeCopyRequest(BaseModel):
    """将历史菜单完整覆盖到本周或下周的请求。"""

    source_week_start: date = Field(examples=["2026-07-13"])
    target_week_start: date = Field(examples=["2026-07-27"])


class RecipeIngredientResponse(BaseModel):
    """食谱及缺货清单展示的分类约束、库存名称包含匹配食材。"""

    subcategory_name: str
    quantity: float
    subcategory_id: str | None = None
    matched_category_name: str | None = None


class RecipeMissingIngredientResponse(BaseModel):
    """缺货清单中的食材；分类信息只在食谱主食材列表中返回。"""

    subcategory_name: str
    quantity: float


class RecipeEntryResponse(BaseModel):
    """食谱行及其即时缺货结果。"""

    id: str
    weekday: int
    dish_name: str
    method: str | None
    note: str | None
    completed: bool
    ingredients: list[RecipeIngredientResponse]
    missing: list[RecipeMissingIngredientResponse]


class RecipeReadIngredientResponse(BaseModel):
    """只读设备食谱中的兼容食材响应，不暴露所有者编辑用分类字段。"""

    subcategory_name: str
    quantity: float


class RecipeReadEntryResponse(BaseModel):
    """只读设备食谱行及其即时缺货结果。"""

    id: str
    weekday: int
    dish_name: str
    method: str | None
    note: str | None
    completed: bool
    ingredients: list[RecipeReadIngredientResponse]
    missing: list[RecipeReadIngredientResponse]


class RecipeReadDayResponse(BaseModel):
    """只读设备固定一周中的某一天和当天食谱。"""

    weekday: int
    label: str
    entries: list[RecipeReadEntryResponse]


class RecipeReadRestockEntryResponse(BaseModel):
    """只读设备动态缺货清单中的一项。"""

    week_start: date
    weekday: int
    label: str
    dish_name: str
    missing: list[RecipeReadIngredientResponse]


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
    """按周次、日期和菜名分组的一项动态缺货。"""

    week_start: date
    weekday: int
    label: str
    dish_name: str
    missing: list[RecipeMissingIngredientResponse]


class CustomShoppingItemResponse(BaseModel):
    """用户手工添加的购物清单项。"""

    model_config = {"from_attributes": True}

    id: str
    item_name: str
    quantity: float
    display_order: int


class CustomShoppingItemInput(BaseModel):
    """新增一项自定义购物清单内容。"""

    item_name: str = Field(min_length=1, max_length=160)
    quantity: Decimal = Field(ge=1, le=10000, max_digits=10, decimal_places=2)

    @field_validator("item_name")
    @classmethod
    def validate_item_name(cls, value: str) -> str:
        """去除名称首尾空白，并拒绝只包含空白的名称。"""
        value = value.strip()
        if not value:
            raise ValueError("物品名称不能为空")
        return value


class CustomShoppingItemsRequest(BaseModel):
    """一次追加多项自定义购物清单内容。"""

    items: list[CustomShoppingItemInput] = Field(min_length=1, max_length=100)
