"""P7.1 冰箱资料、软删除和布局并发契约测试。"""

import asyncio
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from fridgeboard.auth import AccessService
from fridgeboard.main import create_app
from fridgeboard.persistence.database import (
    create_database_engine,
    create_database_schema,
    create_session_factory,
)
from fridgeboard.persistence.models import Refrigerator


def make_client(database_path: Path) -> TestClient:
    """创建已登录的隔离所有者客户端。"""
    database_url = f"sqlite:///{database_path}"
    create_database_schema(database_url)
    client = TestClient(create_app(database_url=database_url, development_owner_user_id="owner"))
    client.post("/api/auth/development-login")
    return client


def test_rename_delete_restore_revokes_devices_and_keeps_them_revoked(tmp_path: Path) -> None:
    """软删除隐藏冰箱、撤销设备；恢复后旧设备不会重新获得权限。"""
    owner = make_client(tmp_path / "management.db")
    refrigerator = owner.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    duplicate = owner.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    )
    assert duplicate.status_code == 400
    other = owner.post(
        "/api/owner/refrigerators", json={"name": "阳台冰箱", "template_key": "mini"}
    )
    assert other.status_code == 201
    renamed = owner.put(
        f"/api/owner/refrigerators/{refrigerator['id']}", json={"name": "餐厅冰箱"}
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "餐厅冰箱"
    assert owner.put(
        f"/api/owner/refrigerators/{refrigerator['id']}", json={"name": "阳台冰箱"}
    ).status_code == 400

    passcode = owner.post(
        "/api/owner/kindle-passcodes", json={"refrigerator_id": refrigerator["id"]}
    ).json()["passcode"]
    device = TestClient(
        create_app(
            database_url=f"sqlite:///{tmp_path / 'management.db'}",
            development_owner_user_id="owner",
        )
    )
    assert device.post("/api/kindle/bind", json={"passcode": passcode}).status_code == 201
    assert owner.request(
        "DELETE",
        f"/api/owner/refrigerators/{refrigerator['id']}",
        json={"confirmation_name": "餐厅冰箱"},
    ).status_code == 204
    assert owner.get("/api/owner/refrigerators").json()[0]["id"] == other.json()["id"]
    assert owner.get("/api/owner/refrigerators/deleted").json()[0]["id"] == refrigerator["id"]
    assert device.get("/api/devices/current").status_code == 401
    replacement = owner.post(
        "/api/owner/refrigerators", json={"name": "餐厅冰箱", "template_key": "mini"}
    )
    assert replacement.status_code == 201
    restored = owner.post(f"/api/owner/refrigerators/{refrigerator['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["name"] == "餐厅冰箱 2"
    assert device.get("/api/devices/current").status_code == 401


def test_deleted_refrigerator_rejects_expiry_and_notification_settings(tmp_path: Path) -> None:
    """软删除后，所有者不能再读取、修改或触发该冰箱的提醒设置。"""
    owner = make_client(tmp_path / "deleted-settings.db")
    refrigerator_id = owner.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    assert owner.request(
        "DELETE",
        f"/api/owner/refrigerators/{refrigerator_id}",
        json={"confirmation_name": "厨房冰箱"},
    ).status_code == 204

    requests = (
        ("GET", f"/api/owner/refrigerators/{refrigerator_id}/expiry-settings", None),
        (
            "PUT",
            f"/api/owner/refrigerators/{refrigerator_id}/expiry-settings",
            {"ratio_percent": 20, "minimum_days": 1, "maximum_days": 14},
        ),
        ("GET", f"/api/owner/refrigerators/{refrigerator_id}/notification-settings", None),
        (
            "PUT",
            f"/api/owner/refrigerators/{refrigerator_id}/notification-settings",
            {
                "daily_reminder_enabled": True,
                "reminder_time": "20:00",
                "device_health_enabled": True,
            },
        ),
        ("POST", f"/api/owner/refrigerators/{refrigerator_id}/notifications/due", None),
    )
    for method, url, json in requests:
        assert owner.request(method, url, json=json).status_code == 404


def test_deleted_refrigerator_rejects_inventory_recipe_and_barcode_routes(tmp_path: Path) -> None:
    """恢复期内，库存、食谱和条码 API 均不能再访问软删除冰箱。"""
    owner = make_client(tmp_path / "deleted-active-routes.db")
    refrigerator_id = owner.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    assert owner.request(
        "DELETE",
        f"/api/owner/refrigerators/{refrigerator_id}",
        json={"confirmation_name": "厨房冰箱"},
    ).status_code == 204
    week_start = date.today().isoformat()
    inventory_payload = {
        "subcategory_id": "builtin-egg",
        "storage_slot_id": "missing-slot",
        "item_name": "鸡蛋",
        "quantity": 1,
    }
    active_reads = (
        (
            f"/api/owner/refrigerators/{refrigerator_id}/categories",
            404,
            {"params": {"q": "鸡蛋"}},
        ),
        (
            f"/api/owner/refrigerators/{refrigerator_id}/inventory/default-location",
            400,
            {"params": {"category_id": "builtin-egg"}},
        ),
        (f"/api/owner/refrigerators/{refrigerator_id}/inventory", 404, {}),
        (f"/api/owner/refrigerators/{refrigerator_id}/layout", 404, {}),
        (
            f"/api/owner/refrigerators/{refrigerator_id}/recipes",
            404,
            {"params": {"week_start": week_start}},
        ),
        (
            f"/api/owner/refrigerators/{refrigerator_id}/recipes/history",
            404,
            {"params": {"week_start": week_start}},
        ),
        (
            f"/api/owner/refrigerators/{refrigerator_id}/restock",
            404,
            {"params": {"week_start": week_start}},
        ),
        (f"/api/owner/refrigerators/{refrigerator_id}/barcode/6901234567890", 404, {}),
    )
    for url, expected_status, kwargs in active_reads:
        assert owner.get(url, **kwargs).status_code == expected_status

    active_writes = (
        (
            "POST",
            f"/api/owner/refrigerators/{refrigerator_id}/categories",
            {"json": {"parent_id": "builtin-egg", "name": "乌鸡蛋", "icon_key": "egg"}},
        ),
        (
            "POST",
            f"/api/owner/refrigerators/{refrigerator_id}/inventory",
            {"json": inventory_payload},
        ),
        (
            "PUT",
            f"/api/owner/refrigerators/{refrigerator_id}/inventory/missing-batch",
            {"json": inventory_payload},
        ),
        ("DELETE", f"/api/owner/refrigerators/{refrigerator_id}/inventory/missing-batch", {}),
        (
            "PUT",
            f"/api/owner/refrigerators/{refrigerator_id}/layout",
            {
                "json": {
                    "expected_revision": 1,
                    "zones": [
                        {"zone_key": "fresh", "temperature_mode": "cold", "slot_count": 1}
                    ],
                }
            },
        ),
        (
            "POST",
            f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
            {"json": {"week_start": week_start, "text": "周一：早餐（鸡蛋）"}},
        ),
        (
            "POST",
            f"/api/owner/refrigerators/{refrigerator_id}/recipes/copy",
            {"json": {"source_week_start": week_start, "target_week_start": week_start}},
        ),
        (
            "PUT",
            f"/api/owner/refrigerators/{refrigerator_id}/recipes/missing-entry",
            {"json": {"weekday": 0, "dish_name": "早餐", "ingredients": []}},
        ),
        ("POST", f"/api/owner/refrigerators/{refrigerator_id}/recipes/missing-entry/complete", {}),
        ("POST", f"/api/owner/refrigerators/{refrigerator_id}/recipes/missing-entry/undo", {}),
    )
    for method, url, kwargs in active_writes:
        assert owner.request(method, url, **kwargs).status_code == 400


def test_layout_rejects_stale_revision(tmp_path: Path) -> None:
    """布局请求使用过期修订号时不得覆盖其他设备已经保存的布局。"""
    client = make_client(tmp_path / "layout-revision.db")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    layout = client.get(f"/api/owner/refrigerators/{refrigerator['id']}/layout").json()
    zones = [
        {
            "zone_key": zone["key"],
            "temperature_mode": zone["temperature_mode"],
            "slot_count": len(zone["slots"]),
        }
        for zone in layout["zones"]
    ]
    assert client.put(
        f"/api/owner/refrigerators/{refrigerator['id']}/layout",
        json={"expected_revision": layout["revision"], "zones": zones},
    ).status_code == 200
    stale = client.put(
        f"/api/owner/refrigerators/{refrigerator['id']}/layout",
        json={"expected_revision": layout["revision"], "zones": zones},
    )
    assert stale.status_code == 400
    assert "重新读取" in stale.json()["detail"]


def test_purge_expired_refrigerators_is_repeatable(tmp_path: Path) -> None:
    """超过恢复期的软删除冰箱被物理清理，重复调度不会产生副作用。"""
    client = make_client(tmp_path / "purge.db")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "待清理冰箱", "template_key": "mini"}
    ).json()
    engine = create_database_engine(f"sqlite:///{tmp_path / 'purge.db'}")
    now = datetime(2026, 7, 24, tzinfo=UTC).replace(tzinfo=None)
    async def purge() -> tuple[int, int]:
        session_factory = create_session_factory(engine)
        async with engine.begin() as connection:
            await connection.execute(
                Refrigerator.__table__.update()
                .where(Refrigerator.id == refrigerator["id"])
                .values(deleted_at=now - timedelta(days=30))
            )
        async with session_factory.begin() as session:
            first = await AccessService(session).purge_expired_refrigerators(now)
        async with session_factory.begin() as session:
            second = await AccessService(session).purge_expired_refrigerators(now)
        return first, second

    first, second = asyncio.run(purge())
    asyncio.run(engine.dispose())
    assert first == 1
    assert second == 0
