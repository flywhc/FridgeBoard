"""P10 reminder, display synchronization and simulated-clock API coverage."""

from datetime import datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from fridgeboard.main import create_app
from fridgeboard.persistence.database import create_database_engine
from fridgeboard.persistence.models import Base


def _client(database_path: Path, clock: list[datetime]) -> TestClient:
    """Create an isolated locally-owned app with a mutable deterministic clock."""
    database_url = f"sqlite:///{database_path}"
    Base.metadata.create_all(create_database_engine(database_url))
    return TestClient(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            clock=lambda: clock[0],
        )
    )


def test_due_reminders_are_time_gated_deduplicated_and_skip_batches_without_bbd(
    tmp_path: Path,
) -> None:
    """Only dated risk batches produce one food reminder after the configured time."""
    clock = [datetime(2026, 7, 23, 19, 59)]
    client = _client(tmp_path / "reminders.db", clock)
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    settings_endpoint = f"/api/owner/refrigerators/{refrigerator_id}/notification-settings"
    assert client.get(settings_endpoint).json() == {
        "daily_reminder_enabled": True,
        "reminder_time": "20:00",
        "device_health_enabled": True,
    }
    assert client.put(
        settings_endpoint,
        json={
            "daily_reminder_enabled": True,
            "reminder_time": "20:00",
            "device_health_enabled": False,
        },
    ).json() == {
        "daily_reminder_enabled": True,
        "reminder_time": "20:00",
        "device_health_enabled": False,
    }
    slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    egg = next(
        item
        for item in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/categories?q=鸡蛋"
        ).json()
        if item["name"] == "鸡蛋"
    )
    for name, best_before in (("临期牛奶", "2026-07-24"), ("无日期调料", None)):
        assert (
            client.post(
                f"/api/owner/refrigerators/{refrigerator_id}/inventory",
                json={
                    "category_id": egg["parent_id"],
                    "subcategory_id": egg["id"],
                    "storage_slot_id": slot_id,
                    "food_name": name,
                    "quantity": 1,
                    "production_date": "2026-07-14" if best_before else None,
                    "best_before": best_before,
                },
            ).status_code
            == 201
        )

    endpoint = f"/api/owner/refrigerators/{refrigerator_id}/notifications/due"
    assert client.post(endpoint).json() == []
    clock[0] = datetime(2026, 7, 23, 20, 0)
    due = client.post(endpoint).json()
    assert due == [
        {
            "kind": "food",
            "title": "有食材需要留意",
            "body": "临期牛奶临期或已过期，共 1 件。",
        }
    ]
    assert client.post(endpoint).json() == []
    second_phone = _client(tmp_path / "reminders.db", clock)
    second_phone.post("/api/auth/development-login")
    assert second_phone.post(endpoint).json() == due


def test_display_health_alert_clears_after_a_completed_sync(tmp_path: Path) -> None:
    """A bound display without today's completed sync is reported, then recovers after sync."""
    clock = [datetime(2026, 7, 23, 20, 0)]
    database_path = tmp_path / "display-health.db"
    owner = _client(database_path, clock)
    owner.post("/api/auth/development-login")
    refrigerator = owner.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    passcode = owner.post(
        "/api/owner/kindle-passcodes", json={"refrigerator_id": refrigerator_id}
    ).json()["passcode"]
    display = _client(database_path, clock)
    assert display.post("/api/kindle/bind", json={"passcode": passcode}).status_code == 201

    endpoint = f"/api/owner/refrigerators/{refrigerator_id}/notifications/due"
    assert owner.post(endpoint).json() == [
        {
            "kind": "device_health",
            "title": "冰箱端今天尚未同步",
            "body": "1 台显示设备未完成同步，请检查网络、电源或睡眠状态。",
        }
    ]
    clock[0] += timedelta(days=1)
    assert display.get("/api/devices/current/layout").status_code == 200
    assert display.get("/api/devices/current/inventory").status_code == 200
    assert display.post("/api/devices/current/sync-status").status_code == 204
    second_passcode = owner.post(
        "/api/owner/kindle-passcodes", json={"refrigerator_id": refrigerator_id}
    ).json()["passcode"]
    second_display = _client(database_path, clock)
    assert (
        second_display.post("/api/kindle/bind", json={"passcode": second_passcode}).status_code
        == 201
    )
    assert owner.post(endpoint).json() == [
        {
            "kind": "device_health",
            "title": "冰箱端今天尚未同步",
            "body": "1 台显示设备未完成同步，请检查网络、电源或睡眠状态。",
        }
    ]
