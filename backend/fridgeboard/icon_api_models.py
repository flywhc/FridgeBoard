"""图标和自定义小类相关 API 模型。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class IconVariantResponse(BaseModel):
    """单个主题下可读取的图标变体。"""

    asset_url: str
    media_type: Literal["image/svg+xml", "image/png"]
    source: str | None = None
    source_id: str | None = None
    source_url: str | None = None
    attribution: str | None = None


class IconResponse(BaseModel):
    """可在小类图库中选择和复用的 SVG、透明 PNG 及主题变体。"""

    key: str = Field(examples=["egg"])
    label: str = Field(examples=["鸡蛋"])
    asset_url: str = Field(examples=["/api/icon-library/egg.svg"])
    media_type: Literal["image/svg+xml", "image/png"]
    variants: dict[str, IconVariantResponse] = Field(default_factory=dict)
    fallback_theme: Literal["ink", "skeuomorphic", "cartoon"] = "ink"


class FoodCategoryResponse(BaseModel):
    """库存表单使用的两级分类节点。"""

    id: str
    parent_id: str | None
    name: str
    icon_key: str | None
    is_custom: bool
    display_order: int
    fallback_theme: Literal["ink", "skeuomorphic", "cartoon"] = "ink"


class IconCandidateCreateRequest(BaseModel):
    """请求为一个待建小类生成四个透明 PNG 候选。"""

    subcategory_name: str = Field(min_length=1, max_length=80, examples=["洗发水"])
    theme_key: Literal["ink", "skeuomorphic", "cartoon"] = "skeuomorphic"
    model: str = Field(default="agnes", min_length=1, max_length=80)


class IconKeywordRequest(BaseModel):
    """请求为中文小类生成可用于在线图标检索的英语短语。"""

    subcategory_name: str = Field(min_length=1, max_length=80)


class IconKeywordResponse(BaseModel):
    """经过结构化验证的英语检索短语。"""

    keywords: list[str] = Field(default_factory=list, max_length=6)


class IconSearchResponse(BaseModel):
    """在线图标搜索结果及其许可元数据。"""

    provider: Literal["iconify", "thiings"]
    results: list[dict[str, str | None]] = Field(default_factory=list)


class IconVariantUpdateRequest(BaseModel):
    """替换一个自定义小类主题图标变体。"""

    theme_key: Literal["ink", "skeuomorphic", "cartoon"]
    icon_key: str | None = None


class IconImportRequest(BaseModel):
    """导入在线图标到指定小类主题变体。"""

    theme_key: Literal["ink", "skeuomorphic", "cartoon"]
    provider: Literal["iconify", "thiings"]
    item_id: str = Field(min_length=1, max_length=240)


class IconDraftCreateRequest(BaseModel):
    """创建新建或编辑小类图标草稿。"""

    parent_id: str
    name: str = Field(min_length=1, max_length=80)
    category_id: str | None = None
    fallback_theme: Literal["ink", "skeuomorphic", "cartoon"] = "ink"
    version: int = Field(default=1, ge=1)


class IconDraftVariantRequest(BaseModel):
    """草稿主题变体引用或在线 item 导入请求。"""

    theme_key: Literal["ink", "skeuomorphic", "cartoon"]
    icon_key: str | None = None
    provider: Literal["iconify", "thiings"] | None = None
    item_id: str | None = None


class IconDraftConfirmRequest(BaseModel):
    """一次性确认完整图标草稿。"""

    parent_id: str
    name: str = Field(min_length=1, max_length=80)
    fallback_theme: Literal["ink", "skeuomorphic", "cartoon"]
    version: int = Field(ge=1)


class IconDraftResponse(BaseModel):
    """图标草稿状态和主题变体摘要。"""

    id: str
    category_id: str | None
    parent_id: str
    name: str
    fallback_theme: Literal["ink", "skeuomorphic", "cartoon"]
    version: int
    variants: dict[str, IconVariantResponse] = Field(default_factory=dict)


class IconModelResponse(BaseModel):
    """可用于图标生成的模型及其输出能力。"""

    id: str
    label: str
    capabilities: list[Literal["svg", "image"]]


class CategoryUpdateRequest(BaseModel):
    """编辑自定义小类名称、所属大类和可选图标键。"""

    parent_id: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=80)
    icon_key: str | None = Field(default=None, max_length=160)


class IconCandidateResponse(BaseModel):
    """一个尚未持久化的临时 AI 图标候选。"""

    id: str
    asset_url: str
    media_type: Literal["image/svg+xml", "image/png"]


class IconGenerationResponse(BaseModel):
    """一组等待用户四选一确认的 AI 图标候选。"""

    id: str
    candidates: list[IconCandidateResponse]


class IconCandidateConfirmRequest(BaseModel):
    """确认候选并同时创建自定义小类。"""

    candidate_id: str
    parent_id: str
    subcategory_name: str = Field(min_length=1, max_length=80)
