"""P7.1 冰箱资料、软删除和布局并发契约测试。"""

from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from fridgeboard.auth import AccessService
from fridgeboard.main import create_app
from fridgeboard.persistence.database import create_database_engine
from fridgeboard.persistence.models import Base, Refrigerator


def make_client(database_path: Path) -> TestClient:
    """创建已登录的隔离所有者客户端。"""
    database_url = f"sqlite:///{database_path}"
    Base.metadata.create_all(create_database_engine(database_url))
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
    with engine.begin() as connection:
        connection.execute(
            Refrigerator.__table__.update()
            .where(Refrigerator.id == refrigerator["id"])
            .values(deleted_at=now - timedelta(days=30))
        )
    from sqlalchemy.orm import Session

    with Session(engine) as session, session.begin():
        service = AccessService(session)
        assert service.purge_expired_refrigerators(now) == 1
    with Session(engine) as session, session.begin():
        assert AccessService(session).purge_expired_refrigerators(now) == 0
