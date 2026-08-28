"""Refrigerator, layout, and device API schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class RefrigeratorResponse(BaseModel):
    """当前凭证可访问的一台冰箱。"""

    id: str = Field(examples=["fridge-001"])
    name: str = Field(examples=["家里冰箱"])
    revision: int = Field(examples=[1])
    setup_status: Literal["needs_layout", "ready"] = Field(examples=["ready"])
    display_device_status: Literal["unbound", "bound"] = Field(examples=["bound"])
    access_role: Literal["owner", "daily_access"] = Field(examples=["owner"])


class PairingConsumeResponse(RefrigeratorResponse):
    """配对成功后的冰箱信息；移动 App 可额外取得一次设备 Bearer。"""

    device_token: str | None = Field(default=None)


class RefrigeratorSummaryResponse(BaseModel):
    """手机端统一冰箱列表所需的权限、状态和轻量库存摘要。"""

    id: str = Field(examples=["fridge-001"])
    name: str = Field(examples=["家里冰箱"])
    revision: int = Field(examples=[3])
    template_key: str = Field(examples=["mini"])
    template_name: str = Field(examples=["迷你冰箱"])
    inventory_quantity: float = Field(ge=0, examples=[6])
    setup_status: Literal["needs_layout", "ready"] = Field(examples=["ready"])
    display_device_status: Literal["unbound", "bound"] = Field(examples=["bound"])
    access_role: Literal["owner", "daily_access"] = Field(examples=["daily_access"])


class RefrigeratorRenameRequest(BaseModel):
    """所有者修改既有冰箱名称的请求。"""

    name: str = Field(min_length=1, max_length=120)


class RefrigeratorOrderRequest(BaseModel):
    """所有者保存活跃冰箱完整顺序的请求。"""

    refrigerator_ids: list[str] = Field(max_length=100)


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
    custom_name: str | None = Field(default=None, description="用户自定义的分层名称。")
    display_order: int
    geometry: dict[str, int]


class StorageSlotRenameRequest(BaseModel):
    """修改一个冰箱分层显示名称的请求。"""

    name: str = Field(min_length=1, max_length=120)


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
    last_successful_sync_at: str | None = Field(default=None, examples=["2026-07-19T10:01:00"])
    revoked_at: str | None = Field(examples=[None])
    is_current: bool = Field(
        default=False,
        description="该设备凭证是否保存在当前浏览器/PWA 安装实例中。",
        examples=[True],
    )


class DeviceSyncStatusResponse(BaseModel):
    """返回当前冰箱端最近一次完整同步成功的时间。"""

    last_successful_sync_at: str | None = Field(default=None, examples=["2026-07-19T10:01:00"])


class DeviceRenameRequest(BaseModel):
    """设备管理页更新展示名称的请求。"""

    label: str = Field(min_length=1, max_length=120, examples=["小王的 iPhone"])
