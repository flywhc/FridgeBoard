"""P3 无账号设备配对、撤销与重新加入的接口测试。"""

from pathlib import Path

import fridgeboard.main as main_module
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


def make_client_for_owner(database_path: Path, owner_user_id: str) -> TestClient:
    """创建使用指定开发所有者身份的隔离应用客户端。"""
    database_url = f"sqlite:///{database_path}"
    Base.metadata.create_all(create_database_engine(database_url))
    return TestClient(
        create_app(
            database_url=database_url,
            development_owner_user_id=owner_user_id,
            public_base_url="https://fridge.example",
        )
    )


def test_sso_callback_persists_owner_session_for_pwa_restart(tmp_path: Path, monkeypatch) -> None:
    """SSO 回调签发的所有者会话应跨 PWA 重启保留 30 天。"""

    class FakeExchangeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def read(self) -> bytes:
            return b'{"user_id":"flycn-user-42"}'

    monkeypatch.setattr(main_module, "urlopen", lambda *_args, **_kwargs: FakeExchangeResponse())
    database_url = f"sqlite:///{tmp_path / 'sso-session.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    client = TestClient(
        create_app(
            database_url=database_url,
            public_base_url="https://fridge.example",
            flycn_authorize_url="https://flycn.example/authorize",
            flycn_exchange_url="http://flycn-internal/exchange",
            flycn_client_secret="secret",
        )
    )

    client.get("/api/auth/login", params={"return_to": "/"})
    state = client.cookies.get("fb_sso_state")
    callback = client.get(f"/api/auth/callback?code=one-time&state={state}", follow_redirects=False)

    assert callback.status_code == 303
    set_cookie = callback.headers["set-cookie"]
    assert "fb_owner_session=" in set_cookie
    assert "Max-Age=2592000" in set_cookie
    assert client.get("/api/owner/refrigerators").status_code == 200


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

    owner.cookies.set("fb_device_credentials", browser.cookies.get("fb_device_credentials"))

    devices_response = owner.get(f"/api/owner/refrigerators/{refrigerator['id']}/devices")
    pwa_device = next(device for device in devices_response.json() if device["kind"] == "pwa")
    assert pwa_device["is_current"] is True
    renamed = owner.put(
        f"/api/owner/refrigerators/{refrigerator['id']}/devices/{pwa_device['id']}",
        json={"label": "餐桌上的 iPhone"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["label"] == "餐桌上的 iPhone"
    assert renamed.json()["created_at"]
    assert renamed.json()["is_current"] is True
    assert (
        owner.put(
            f"/api/owner/refrigerators/{refrigerator['id']}/devices/{pwa_device['id']}",
            json={"label": "   "},
        ).status_code
        == 422
    )
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


def test_first_boot_qr_endpoint_returns_png_for_legacy_kindle(tmp_path: Path) -> None:
    """首次配对二维码应由服务端生成 PNG，避免 Kindle 解码 SVG 图片失败。"""
    kindle = make_client(tmp_path / "first-boot-qr.db")

    session = kindle.post("/api/kindle/first-boot-sessions")
    assert session.status_code == 201
    token = session.json()["pairing_token"]

    qr = kindle.get("/api/kindle/first-boot-sessions/qr", params={"token": token})

    assert qr.status_code == 200
    assert qr.headers["content-type"].startswith("image/png")
    assert qr.headers["cache-control"] == "no-store, max-age=0"
    assert qr.content.startswith(b"\x89PNG\r\n\x1a\n")


def test_expiry_settings_unknown_refrigerator_returns_not_found(tmp_path: Path) -> None:
    """临期规则接口不把无权或不存在的冰箱暴露为服务器错误。"""
    owner = make_client(tmp_path / "expiry-settings-not-found.db")
    owner.post("/api/auth/development-login")
    missing_id = "missing-refrigerator"
    assert owner.get(f"/api/owner/refrigerators/{missing_id}/expiry-settings").status_code == 404
    assert (
        owner.put(
            f"/api/owner/refrigerators/{missing_id}/expiry-settings",
            json={"ratio_percent": 20, "minimum_days": 1, "maximum_days": 14},
        ).status_code
        == 404
    )


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
    assert phone.get("/api/devices/current").json() == {
        **refrigerator,
        "access_role": "daily_access",
    }

    ready = kindle.get("/api/kindle/first-boot-sessions/current")
    assert ready.status_code == 200
    assert ready.json() == {
        "state": "bound",
        "refrigerator": {
            **refrigerator,
            "access_role": "daily_access",
            "display_device_status": "bound",
        },
    }
    assert kindle.get("/api/devices/current").json() == {
        **refrigerator,
        "access_role": "daily_access",
        "display_device_status": "bound",
    }
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
    """首次扫码新建的是待完成冰箱，不得在没有用户确认时写入默认布局。"""
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
    assert claimed.json()["setup_status"] == "needs_layout"
    layout = owner.get(f"/api/owner/refrigerators/{claimed.json()['id']}/layout")
    assert layout.status_code == 200
    assert layout.json()["zones"] == []
    assert kindle.get("/api/kindle/first-boot-sessions/current").json()["state"] == "bound"


def test_first_boot_claim_rejects_duplicate_pending_refrigerator_name(tmp_path: Path) -> None:
    """首次扫码创建草稿仍须遵守所有者活跃冰箱名称唯一约束。"""
    database_path = tmp_path / "first-boot-duplicate-name.db"
    owner = make_client(database_path)
    owner.post("/api/auth/development-login")
    assert (
        owner.post(
            "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
        ).status_code
        == 201
    )
    kindle = make_client(database_path)
    pairing_token = kindle.post("/api/kindle/first-boot-sessions").json()["pairing_token"]

    duplicate = owner.post(
        "/api/first-boot-pairings/claim",
        json={
            "pairing_token": pairing_token,
            "standalone": True,
            "new_refrigerator_name": "厨房冰箱",
            "new_template_key": "mini",
        },
    )

    assert duplicate.status_code == 400
    assert "同名" in duplicate.json()["detail"]


def test_grant_pwa_access_is_idempotent_and_does_not_grant_other_owner_rights(
    tmp_path: Path,
) -> None:
    """同一 PWA 重复领取只保留一个日常访问凭证，登录其他账号也不能取得管理权。"""
    database_path = tmp_path / "grant-pwa-access.db"
    owner = make_client_for_owner(database_path, "owner-a")
    owner.post("/api/auth/development-login")
    refrigerator = owner.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    assert refrigerator["setup_status"] == "ready"
    passcode = owner.post(
        "/api/owner/kindle-passcodes", json={"refrigerator_id": refrigerator["id"]}
    ).json()["passcode"]
    kindle = make_client(database_path)
    assert kindle.post("/api/kindle/bind", json={"passcode": passcode}).status_code == 201
    pairing_token = kindle.post("/api/kindle/pairing-sessions").json()["pairing_token"]

    other_account_phone = make_client_for_owner(database_path, "owner-b")
    other_account_phone.post("/api/auth/development-login")
    first = other_account_phone.post(
        "/api/pairings/consume",
        json={"pairing_token": pairing_token, "standalone": True, "label": "访客手机"},
    )
    repeated = other_account_phone.post(
        "/api/pairings/consume",
        json={"pairing_token": pairing_token, "standalone": True, "label": "访客手机"},
    )

    assert first.status_code == 201
    assert repeated.status_code == 201
    assert repeated.json()["access_role"] == "daily_access"
    assert other_account_phone.get("/api/owner/refrigerators").json() == []
    devices = owner.get(f"/api/owner/refrigerators/{refrigerator['id']}/devices").json()
    assert (
        len([item for item in devices if item["kind"] == "pwa" and item["revoked_at"] is None]) == 1
    )


def test_display_binding_rejects_second_bind_but_replace_is_atomic(tmp_path: Path) -> None:
    """普通绑定不能挤掉旧 Kindle；明确换绑成功后才撤销旧设备。"""
    database_path = tmp_path / "replace-display.db"
    owner = make_client(database_path)
    owner.post("/api/auth/development-login")
    refrigerator = owner.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()

    first_kindle = make_client(database_path)
    first_token = first_kindle.post("/api/kindle/first-boot-sessions").json()["pairing_token"]
    assert (
        owner.post(
            "/api/first-boot-pairings/claim",
            json={
                "pairing_token": first_token,
                "standalone": True,
                "refrigerator_id": refrigerator["id"],
                "purpose": "bind_display_device",
            },
        ).status_code
        == 201
    )
    assert first_kindle.get("/api/kindle/first-boot-sessions/current").json()["state"] == "bound"

    rejected_kindle = make_client(database_path)
    rejected_token = rejected_kindle.post("/api/kindle/first-boot-sessions").json()["pairing_token"]
    rejected = owner.post(
        "/api/first-boot-pairings/claim",
        json={
            "pairing_token": rejected_token,
            "standalone": True,
            "refrigerator_id": refrigerator["id"],
            "purpose": "bind_display_device",
        },
    )
    assert rejected.status_code == 409
    assert first_kindle.get("/api/devices/current").status_code == 200

    replacement_kindle = make_client(database_path)
    replacement_token = replacement_kindle.post("/api/kindle/first-boot-sessions").json()[
        "pairing_token"
    ]
    assert (
        owner.post(
            "/api/first-boot-pairings/claim",
            json={
                "pairing_token": replacement_token,
                "standalone": True,
                "refrigerator_id": refrigerator["id"],
                "purpose": "replace_display_device",
            },
        ).status_code
        == 201
    )
    assert first_kindle.get("/api/devices/current").status_code == 200
    assert (
        replacement_kindle.get("/api/kindle/first-boot-sessions/current").json()["state"] == "bound"
    )
    assert first_kindle.get("/api/devices/current").status_code == 401
    assert replacement_kindle.get("/api/devices/current").status_code == 200


def test_expired_or_failed_replacement_keeps_existing_display_active(tmp_path: Path) -> None:
    """过期的新设备二维码不得提前撤销正在使用的冰箱端。"""
    database_path = tmp_path / "replace-rollback.db"
    owner = make_client(database_path)
    owner.post("/api/auth/development-login")
    refrigerator = owner.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    passcode = owner.post(
        "/api/owner/kindle-passcodes", json={"refrigerator_id": refrigerator["id"]}
    ).json()["passcode"]
    old_kindle = make_client(database_path)
    assert old_kindle.post("/api/kindle/bind", json={"passcode": passcode}).status_code == 201

    new_kindle = make_client(database_path)
    expired_token = new_kindle.post("/api/kindle/first-boot-sessions").json()["pairing_token"]
    engine = create_database_engine(f"sqlite:///{database_path}")
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "UPDATE first_boot_pairing_sessions SET expires_at = '2000-01-01 00:00:00' "
            "WHERE mobile_token_hash IS NOT NULL"
        )
    failed = owner.post(
        "/api/first-boot-pairings/claim",
        json={
            "pairing_token": expired_token,
            "standalone": True,
            "refrigerator_id": refrigerator["id"],
            "purpose": "replace_display_device",
        },
    )
    assert failed.status_code == 400
    assert old_kindle.get("/api/devices/current").status_code == 200


def test_kindle_page_and_pairing_status_are_explicit(tmp_path: Path) -> None:
    """Kindle 页面不应通过模糊的 401 猜测首次启动、撤销或二维码消费状态。"""
    database_path = tmp_path / "kindle-page-state.db"
    kindle = make_client(database_path)
    assert kindle.get("/api/kindle/page-state").json() == {"state": "unconfigured"}

    owner = make_client(database_path)
    owner.post("/api/auth/development-login")
    passcode = owner.post(
        "/api/owner/kindle-passcodes",
        json={"new_refrigerator_name": "厨房冰箱", "new_template_key": "mini"},
    ).json()["passcode"]
    bound = kindle.post("/api/kindle/bind", json={"passcode": passcode})
    assert bound.status_code == 201
    assert bound.json()["setup_status"] == "ready"
    assert kindle.get("/api/kindle/page-state").json() == {"state": "configured"}
    pairing = kindle.post("/api/kindle/pairing-sessions").json()
    qr = kindle.get("/api/kindle/pairing-sessions/qr", params={"token": pairing["pairing_token"]})
    assert qr.status_code == 200
    assert qr.headers["cache-control"] == "no-store, max-age=0"
    assert qr.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert kindle.get("/api/kindle/pairing-sessions/current").json()["state"] == "pending"
    phone = make_client(database_path)
    assert (
        phone.post(
            "/api/pairings/consume",
            json={"pairing_token": pairing["pairing_token"], "standalone": True},
        ).status_code
        == 201
    )
    assert kindle.get("/api/kindle/pairing-sessions/current").json()["state"] == "used"


def test_deleted_refrigerator_cannot_create_or_consume_display_binding_code(
    tmp_path: Path,
) -> None:
    """删除后的冰箱不应继续签发或消费新的冰箱端绑定码。"""
    database_path = tmp_path / "deleted-passcode.db"
    owner = make_client(database_path)
    owner.post("/api/auth/development-login")
    refrigerator = owner.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    assert owner.request(
        "DELETE",
        f"/api/owner/refrigerators/{refrigerator['id']}",
        json={"confirmation_name": refrigerator["name"]},
    ).status_code == 204

    passcode = owner.post(
        "/api/owner/kindle-passcodes",
        json={"refrigerator_id": refrigerator["id"]},
    )
    assert passcode.status_code == 400


def test_unified_refrigerator_list_merges_owner_and_cross_account_daily_access(
    tmp_path: Path,
) -> None:
    """统一列表合并账号冰箱和当前 PWA 的跨账号日常访问，但不提升管理权限。"""
    database_path = tmp_path / "unified-refrigerators.db"
    owner_a = make_client_for_owner(database_path, "owner-a")
    owner_a.post("/api/auth/development-login")
    owned = owner_a.post(
        "/api/owner/refrigerators", json={"name": "我的冰箱", "template_key": "mini"}
    ).json()

    owner_b = make_client_for_owner(database_path, "owner-b")
    owner_b.post("/api/auth/development-login")
    shared = owner_b.post(
        "/api/owner/refrigerators", json={"name": "朋友冰箱", "template_key": "mini"}
    ).json()
    passcode = owner_b.post(
        "/api/owner/kindle-passcodes", json={"refrigerator_id": shared["id"]}
    ).json()["passcode"]
    kindle = make_client(database_path)
    assert kindle.post("/api/kindle/bind", json={"passcode": passcode}).status_code == 201
    pairing_token = kindle.post("/api/kindle/pairing-sessions").json()["pairing_token"]

    phone = make_client_for_owner(database_path, "owner-a")
    phone.post("/api/auth/development-login")
    assert phone.post(
        "/api/pairings/consume",
        json={"pairing_token": pairing_token, "standalone": True},
    ).status_code == 201

    listed = phone.get("/api/refrigerators")
    assert listed.status_code == 200
    by_id = {item["id"]: item for item in listed.json()}
    assert set(by_id) == {owned["id"], shared["id"]}
    assert by_id[owned["id"]]["access_role"] == "owner"
    assert by_id[shared["id"]]["access_role"] == "daily_access"
    assert by_id[shared["id"]]["inventory_quantity"] == 0
    assert by_id[shared["id"]]["template_key"] == "mini"
    assert phone.get(f"/api/owner/refrigerators/{shared['id']}/devices").status_code == 404
