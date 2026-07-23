"""P10 daily in-app reminders and display-device health evaluation.

This module reads and writes only the notification audit tables through the caller's
SQLAlchemy session. It intentionally does not send Web Push: push delivery requires a
real-device capability validation and a durable subscription lifecycle that P10's
application-inbox fallback must not pretend to provide.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from fridgeboard.domain.inventory import ExpiryRule, InventoryBatch, expiry_status
from fridgeboard.persistence.models import (
    DeviceCredential,
    ExpirySettings,
    InventoryBatchModel,
    NotificationDelivery,
    NotificationSettings,
)


@dataclass(frozen=True, slots=True)
class DueNotification:
    """A notification that the PWA may render in its in-app inbox.

    Attributes:
        kind: Stable event kind used for once-per-day deduplication.
        title: User-facing short title.
        body: User-facing detail without confidential data.
    """

    kind: str
    title: str
    body: str


class ReminderService:
    """Evaluate daily reminders at a supplied clock time and record each delivery once."""

    def __init__(self, session: Session, now: datetime) -> None:
        """Bind one transaction and its deterministic local clock.

        Args:
            session: Open SQLAlchemy session managed by the caller.
            now: Local wall-clock time for schedule evaluation and tests.
        """
        self._session = session
        self._now = now

    def settings(self, refrigerator_id: str, recipient_key: str) -> NotificationSettings:
        """Return persisted settings or an unsaved product-default settings object."""
        saved = self._session.get(NotificationSettings, (refrigerator_id, recipient_key))
        return saved or NotificationSettings(
            refrigerator_id=refrigerator_id,
            recipient_key=recipient_key,
            daily_reminder_enabled=True,
            reminder_time="20:00",
            device_health_enabled=True,
        )

    def due(self, refrigerator_id: str, recipient_key: str) -> list[DueNotification]:
        """Return and audit notifications due now, at most once per kind per local day.

        BBD-less batches are excluded by the shared expiry rule. No due item is created
        before the configured local reminder time, which makes foreground polling safe.
        """
        settings = self.settings(refrigerator_id, recipient_key)
        if self._now.time() < _parse_time(settings.reminder_time):
            return []
        notifications: list[DueNotification] = []
        if settings.daily_reminder_enabled:
            notification = self._food_notification(refrigerator_id)
            if notification and self._record_once(refrigerator_id, recipient_key, notification):
                notifications.append(notification)
        if settings.device_health_enabled:
            notification = self._device_health_notification(refrigerator_id)
            if notification and self._record_once(refrigerator_id, recipient_key, notification):
                notifications.append(notification)
        return notifications

    def _food_notification(self, refrigerator_id: str) -> DueNotification | None:
        expiry = self._session.get(ExpirySettings, refrigerator_id)
        rule = ExpiryRule(
            ratio=(expiry.ratio_percent if expiry else 20) / 100,
            minimum_days=expiry.minimum_days if expiry else 1,
            maximum_days=expiry.maximum_days if expiry else 14,
        )
        batches = self._session.scalars(
            select(InventoryBatchModel).where(
                InventoryBatchModel.refrigerator_id == refrigerator_id
            )
        )
        names: list[str] = []
        for batch in batches:
            status = expiry_status(
                InventoryBatch(
                    id=batch.id,
                    subcategory_id=batch.subcategory_id,
                    quantity=batch.quantity,
                    created_at=batch.created_at,
                    best_before=batch.best_before,
                    shelf_life_days=batch.shelf_life_days,
                ),
                self._now.date(),
                rule,
            )
            if status and status.value in {"expiring", "expired"}:
                names.append(batch.food_name)
        if not names:
            return None
        preview = "、".join(names[:2])
        suffix = f"等 {len(names)} 件" if len(names) > 2 else f"共 {len(names)} 件"
        return DueNotification("food", "有食材需要留意", f"{preview}临期或已过期，{suffix}。")

    def _device_health_notification(self, refrigerator_id: str) -> DueNotification | None:
        displays = list(
            self._session.scalars(
                select(DeviceCredential).where(
                    DeviceCredential.refrigerator_id == refrigerator_id,
                    DeviceCredential.device_kind == "kindle",
                    DeviceCredential.revoked_at.is_(None),
                )
            )
        )
        unsynced = [
            device
            for device in displays
            if not device.last_successful_sync_at
            or device.last_successful_sync_at.date() != self._now.date()
        ]
        if not unsynced:
            return None
        count = len(unsynced)
        return DueNotification(
            "device_health",
            "冰箱端今天尚未同步",
            f"{count} 台显示设备未完成同步，请检查网络、电源或睡眠状态。",
        )

    def _record_once(
        self, refrigerator_id: str, recipient_key: str, notification: DueNotification
    ) -> bool:
        """Use SQLite's atomic conflict handling so concurrent polling never returns 500."""
        result = self._session.execute(
            sqlite_insert(NotificationDelivery)
            .values(
                id=uuid4().hex,
                refrigerator_id=refrigerator_id,
                recipient_key=recipient_key,
                notification_kind=notification.kind,
                notification_date=self._now.date(),
                payload={"title": notification.title, "body": notification.body},
            )
            .prefix_with("OR IGNORE")
        )
        return result.rowcount == 1


def _parse_time(value: str) -> time:
    """Parse the constrained persisted HH:MM setting into a comparable local time."""
    return time.fromisoformat(value)
