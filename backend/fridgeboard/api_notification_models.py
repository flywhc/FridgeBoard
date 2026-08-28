"""Notification and expiry settings API schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


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
