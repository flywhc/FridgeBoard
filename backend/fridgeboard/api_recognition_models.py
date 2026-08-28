"""Recognition, category matching, and lookup API schemas."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class RecognitionRequest(BaseModel):
    """手机一次相机截图的受限识别请求；图片不会被持久化。"""

    image_base64: str = Field(
        min_length=1, max_length=7_000_000, examples=["/9j/4AAQSkZJRgABAQ..."]
    )
    content_type: Literal["image/jpeg", "image/png", "image/webp"] = Field(examples=["image/jpeg"])
    mode: Literal["image", "photo"] = Field(default="image", examples=["image"])
    refrigerator_id: str | None = Field(default=None, min_length=1, max_length=32)


class RecognitionFieldResponse(BaseModel):
    """一个可由前端按置信度和来源处理的增量识别字段。"""

    value: str
    confidence: float = Field(ge=0, le=1)


class RecognitionOrderItemResponse(BaseModel):
    """订单截图中可直接批量加入冰箱的一项商品。"""

    item_name: str = Field(min_length=1)
    specification: str = ""
    quantity: int = Field(default=1, ge=1, le=9999)
    price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    subcategory_id: str | None = None
    subcategory_name: str | None = None
    subcategory_confidence: float | None = Field(default=None, ge=0, le=1)


class RecognitionResponse(BaseModel):
    """本次图像的识别结果；普通商品填充字段，订单截图返回商品列表。"""

    kind: Literal["item", "order", "unknown"] = "unknown"
    fields: dict[str, RecognitionFieldResponse]
    order_items: list[RecognitionOrderItemResponse] = Field(default_factory=list)


class CategoryMatchRequest(BaseModel):
    """手工物品名称自动分类请求。"""

    model_config = {
        "json_schema_extra": {"examples": [{"item_name": "蒙牛纯牛奶", "request_id": None}]}
    }

    item_name: str = Field(min_length=1, max_length=160, examples=["蒙牛纯牛奶"])
    request_id: str | None = Field(default=None, min_length=1, max_length=64)

    @field_validator("item_name")
    @classmethod
    def validate_item_name(cls, value: str) -> str:
        """去除首尾空白并拒绝没有实际内容的物品名。"""
        normalized = value.strip()
        if not normalized:
            raise ValueError("物品名称不能为空")
        return normalized


class CategoryMatchResponse(BaseModel):
    """自动分类结果；未命中时由前端决定是否启动大模型兜底。"""

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "status": "matched",
                    "subcategory_id": "builtin-category-dairy",
                    "subcategory_name": "奶品",
                    "source": "cache",
                    "confidence": 1.0,
                    "request_id": None,
                },
                {
                    "status": "needs_ai",
                    "subcategory_id": None,
                    "subcategory_name": None,
                    "source": None,
                    "confidence": None,
                    "request_id": "match-request-001",
                },
            ]
        }
    }

    status: Literal["matched", "needs_ai", "not_found"]
    subcategory_id: str | None = None
    subcategory_name: str | None = None
    source: Literal["builtin", "cache", "ai"] | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    request_id: str | None = None


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


class QrLookupRequest(BaseModel):
    """二维码解码后的原始文本。"""

    payload: str = Field(min_length=1, max_length=4096)


class QrLookupResponse(BaseModel):
    """二维码文本的大模型解析结果。"""

    kind: Literal["item", "url", "text", "unknown"]
    payload: str
    fields: dict[str, RecognitionFieldResponse] = Field(default_factory=dict)
