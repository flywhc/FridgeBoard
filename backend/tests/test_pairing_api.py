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


def make_local_client(database_path: Path) -> TestClient:
    """创建不依赖 flycn 登录的私有局域网部署测试应用。"""
    database_url = f"sqlite:///{database_path}"
    Base.metadata.create_all(create_database_engine(database_url))
    return TestClient(
        create_app(
            database_url=database_url,
            local_owner_user_id="openwrt-local-owner",
            public_base_url="http://fridge.lan",
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


def test_first_boot_qr_binds_kindle_after_owner_claims_existing_refrigerator(
    tmp_path: Path,
) -> None:
    """首次 Kindle 二维码在所有者领取后才为两端签发独立凭证。"""
    owner = make_client(tmp_path / "first-boot.db")
    owner.post("/api/auth/development-login")
    refrigerator = owner.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()

    kindle = make_client(tmp_path / "first-boot.db")
    started = kindle.post("/api/kindle/first-boot-sessions")
    assert started.status_code == 201
    pairing_token = started.json()["pairing_token"]
    assert started.json()["pairing_url"].startswith("https://fridge.example/pair?bootstrap=")
    assert kindle.get("/api/kindle/first-boot-sessions/current").json()["state"] == "pending"

    phone = make_client(tmp_path / "first-boot.db")
    assert (
        phone.post(
            "/api/first-boot-pairings/claim",
            json={
                "pairing_token": pairing_token,
                "standalone": True,
                "refrigerator_id": refrigerator["id"],
            },
        ).status_code
        == 401
    )
    phone.post("/api/auth/development-login")
    claimed = phone.post(
        "/api/first-boot-pairings/claim",
        json={
            "pairing_token": pairing_token,
            "standalone": True,
            "refrigerator_id": refrigerator["id"],
        },
    )
    assert claimed.status_code == 201
    assert claimed.json() == refrigerator
    assert phone.get("/api/devices/current").json() == refrigerator

    ready = kindle.get("/api/kindle/first-boot-sessions/current")
    assert ready.status_code == 200
    assert ready.json() == {"state": "bound", "refrigerator": refrigerator}
    assert kindle.get("/api/devices/current").json() == refrigerator
    assert kindle.post("/api/kindle/pairing-sessions").status_code == 201
    assert (
        phone.post(
            "/api/first-boot-pairings/claim",
            json={
                "pairing_token": pairing_token,
                "standalone": True,
                "refrigerator_id": refrigerator["id"],
            },
        ).status_code
        == 400
    )


def test_first_boot_qr_allows_private_lan_owner_without_login(tmp_path: Path) -> None:
    """配置本地所有者后，OpenWrt 部署不要求手机先完成 flycn 登录。"""
    phone = make_local_client(tmp_path / "openwrt.db")
    assert phone.get("/api/auth/mode").json() == {"mode": "local"}
    refrigerator = phone.post(
        "/api/owner/refrigerators", json={"name": "餐厅冰箱", "template_key": "mini"}
    ).json()

    kindle = make_local_client(tmp_path / "openwrt.db")
    pairing_token = kindle.post("/api/kindle/first-boot-sessions").json()["pairing_token"]
    claimed = phone.post(
        "/api/first-boot-pairings/claim",
        json={
            "pairing_token": pairing_token,
            "standalone": True,
            "refrigerator_id": refrigerator["id"],
        },
    )
    assert claimed.status_code == 201
    assert kindle.get("/api/kindle/first-boot-sessions/current").json()["state"] == "bound"


def test_first_boot_qr_claim_can_create_refrigerator(tmp_path: Path) -> None:
    """手机领取首次二维码时可在同一事务内新建冰箱并绑定两台设备。"""
    owner = make_client(tmp_path / "first-boot-create.db")
    owner.post("/api/auth/development-login")
    kindle = make_client(tmp_path / "first-boot-create.db")
    pairing_token = kindle.post("/api/kindle/first-boot-sessions").json()["pairing_token"]

    claimed = owner.post(
        "/api/first-boot-pairings/claim",
        json={
            "pairing_token": pairing_token,
            "standalone": True,
            "new_refrigerator_name": "新冰箱",
            "new_template_key": "mini",
        },
    )
    assert claimed.status_code == 201
    assert claimed.json()["name"] == "新冰箱"
    assert kindle.get("/api/kindle/first-boot-sessions/current").json()["state"] == "bound"
