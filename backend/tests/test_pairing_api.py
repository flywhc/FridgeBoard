"""P3 无账号设备配对、撤销与重新加入的接口测试。"""

from pathlib import Path

from fastapi.testclient import TestClient
from fridgeboard.main import create_app
from fridgeboard.persistence.database import create_database_engine
from fridgeboard.persistence.models import Base


def make_client(database_path: Path) -> TestClient:
    """创建已建表且开启本地所有者登录的隔离 P3 应用。"""
    database_url = f"sqlite:///{database_path}"
    Base.metadata.create_all(create_database_engine(database_url))
    return TestClient(
        create_app(
            database_url=database_url,
            development_owner_user_id="flycn-user-42",
            public_base_url="https://fridge.example",
        )
    )


def test_kindle_pwa_pairing_revocation_and_rejoin(tmp_path: Path) -> None:
    """PWA 可自动配对，撤销立即拒绝访问，重新扫码恢复新凭证。"""
    owner = make_client(tmp_path / "p3.db")
    assert owner.post("/api/auth/development-login").json() == {"owner_user_id": "flycn-user-42"}

    passcode_response = owner.post(
        "/api/owner/kindle-passcodes",
        json={"new_refrigerator_name": "家里冰箱", "new_template_key": "mini"},
    )
    assert passcode_response.status_code == 201
    passcode = passcode_response.json()["passcode"]

    kindle = make_client(tmp_path / "p3.db")
    bind_response = kindle.post(
        "/api/kindle/bind", json={"passcode": passcode, "label": "厨房 Kindle"}
    )
    assert bind_response.status_code == 201
    refrigerator = bind_response.json()

    pairing_response = kindle.post("/api/kindle/pairing-sessions")
    assert pairing_response.status_code == 201
    pairing_token = pairing_response.json()["pairing_token"]
    assert pairing_response.json()["pairing_url"].startswith("https://fridge.example/pair?")

    browser = make_client(tmp_path / "p3.db")
    assert (
        browser.post(
            "/api/pairings/consume",
            json={"pairing_token": pairing_token, "standalone": False},
        ).status_code
        == 422
    )
    paired_response = browser.post(
        "/api/pairings/consume",
        json={"pairing_token": pairing_token, "standalone": True, "label": "小王的 iPhone"},
    )
    assert paired_response.status_code == 201
    assert paired_response.json() == refrigerator
    assert browser.get("/api/devices/current").json() == refrigerator

    devices_response = owner.get(f"/api/owner/refrigerators/{refrigerator['id']}/devices")
    pwa_device = next(device for device in devices_response.json() if device["kind"] == "pwa")
    assert (
        owner.delete(
            f"/api/owner/refrigerators/{refrigerator['id']}/devices/{pwa_device['id']}"
        ).status_code
        == 204
    )
    assert browser.get("/api/devices/current").status_code == 401

    new_pairing_token = kindle.post("/api/kindle/pairing-sessions").json()["pairing_token"]
    rejoined = browser.post(
        "/api/pairings/consume",
        json={"pairing_token": new_pairing_token, "standalone": True, "label": "小王的 iPhone"},
    )
    assert rejoined.status_code == 201
    assert browser.get("/api/devices/current").json() == refrigerator


def test_passcode_is_single_use(tmp_path: Path) -> None:
    """Kindle Passcode 被消费后不可用于第二台设备。"""
    owner = make_client(tmp_path / "single-use.db")
    owner.post("/api/auth/development-login")
    passcode = owner.post(
        "/api/owner/kindle-passcodes",
        json={"new_refrigerator_name": "家里冰箱", "new_template_key": "mini"},
    ).json()["passcode"]
    kindle = make_client(tmp_path / "single-use.db")
    assert kindle.post("/api/kindle/bind", json={"passcode": passcode}).status_code == 201
    assert kindle.post("/api/kindle/bind", json={"passcode": passcode}).status_code == 400
