"""日常访问凭证的跨账号、撤销失效和所有者权限回归测试。"""

import json
from pathlib import Path

from fastapi.testclient import TestClient
from fridgeboard.main import create_app
from fridgeboard.persistence.database import create_database_engine
from fridgeboard.persistence.models import Base

DEVICE_COOKIE = "fb_device_credentials"


def make_client(database_path: Path, owner_user_id: str) -> TestClient:
    """创建使用指定开发账号的隔离测试客户端。"""
    database_url = f"sqlite:///{database_path}"
    Base.metadata.create_all(create_database_engine(database_url))
    return TestClient(
        create_app(
            database_url=database_url,
            development_owner_user_id=owner_user_id,
            public_base_url="https://fridge.example",
        )
    )


def create_daily_access_fixture(database_path: Path) -> tuple[TestClient, TestClient, dict]:
    """创建所有者、未登录访客 PWA 和一台已配置冰箱。"""
    owner = make_client(database_path, "owner-a")
    assert owner.post("/api/auth/development-login").status_code == 200
    refrigerator = owner.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    passcode = owner.post(
        "/api/owner/kindle-passcodes", json={"refrigerator_id": refrigerator["id"]}
    ).json()["passcode"]

    kindle = make_client(database_path, "device")
    assert kindle.post("/api/kindle/bind", json={"passcode": passcode}).status_code == 201
    pairing_token = kindle.post("/api/kindle/pairing-sessions").json()["pairing_token"]

    phone = make_client(database_path, "visitor")
    assert phone.post(
        "/api/pairings/consume",
        json={"pairing_token": pairing_token, "standalone": True, "label": "访客手机"},
    ).status_code == 201
    return owner, phone, refrigerator


def test_cross_account_daily_access_is_listed_without_owner_role(tmp_path: Path) -> None:
    """跨账号 PWA 只能在统一列表中获得 daily_access，不能改变账号所有权。"""
    database_path = tmp_path / "cross-account-list.db"
    owner_a, phone, shared = create_daily_access_fixture(database_path)
    owner_b = make_client(database_path, "owner-b")
    assert owner_b.post("/api/auth/development-login").status_code == 200
    owned = owner_b.post(
        "/api/owner/refrigerators", json={"name": "办公室冰箱", "template_key": "mini"}
    ).json()
    owner_b.cookies.set(DEVICE_COOKIE, phone.cookies.get(DEVICE_COOKIE))

    listed = owner_b.get("/api/refrigerators")
    assert listed.status_code == 200
    by_id = {item["id"]: item for item in listed.json()}
    assert set(by_id) == {shared["id"], owned["id"]}
    assert by_id[shared["id"]]["access_role"] == "daily_access"
    assert by_id[owned["id"]]["access_role"] == "owner"
    assert owner_b.get("/api/owner/refrigerators").json() == [owned]
    owner_a_list = owner_a.get("/api/owner/refrigerators").json()
    assert [item["id"] for item in owner_a_list] == [shared["id"]]
    assert owner_a_list[0]["access_role"] == "owner"


def test_revoked_daily_access_disappears_from_lists_and_workspace(tmp_path: Path) -> None:
    """所有者撤销 PWA 后，统一列表、设备列表和当前工作区均立即失效。"""
    owner, phone, refrigerator = create_daily_access_fixture(tmp_path / "revocation.db")
    refrigerator_id = refrigerator["id"]

    assert [item["id"] for item in phone.get("/api/refrigerators").json()] == [refrigerator_id]
    assert [item["id"] for item in phone.get("/api/devices/refrigerators").json()] == [
        refrigerator_id
    ]
    assert phone.get("/api/devices/current").status_code == 200
    assert phone.get("/api/devices/current/layout").status_code == 200
    assert phone.get("/api/devices/current/inventory").status_code == 200

    devices = owner.get(f"/api/owner/refrigerators/{refrigerator_id}/devices").json()
    pwa_device = next(item for item in devices if item["kind"] == "pwa")
    assert owner.delete(
        f"/api/owner/refrigerators/{refrigerator_id}/devices/{pwa_device['id']}"
    ).status_code == 204

    assert phone.get("/api/refrigerators").status_code == 401
    assert phone.get("/api/devices/refrigerators").json() == []
    assert phone.get("/api/devices/current").status_code == 401
    assert phone.get("/api/devices/current/layout").status_code == 401
    assert phone.get("/api/devices/current/inventory").status_code == 401


def test_daily_access_rejects_owner_management_interfaces(tmp_path: Path) -> None:
    """日常访问凭证不能调用冰箱、布局、库存、食谱或设备管理接口。"""
    owner, phone, refrigerator = create_daily_access_fixture(tmp_path / "owner-rejection.db")
    refrigerator_id = refrigerator["id"]
    base = f"/api/owner/refrigerators/{refrigerator_id}"
    requests = [
        ("GET", "/api/owner/refrigerators", None),
        ("GET", "/api/owner/refrigerators/deleted", None),
        ("POST", "/api/owner/refrigerators", {"name": "另一台", "template_key": "mini"}),
        ("PUT", base, {"name": "被拒绝的重命名"}),
        ("DELETE", base, {"confirmation_name": refrigerator["name"]}),
        ("POST", f"{base}/restore", None),
        ("GET", f"{base}/expiry-settings", None),
        (
            "PUT",
            f"{base}/expiry-settings",
            {"ratio_percent": 20, "minimum_days": 1, "maximum_days": 14},
        ),
        ("GET", f"{base}/notification-settings", None),
        (
            "PUT",
            f"{base}/notification-settings",
            {
                "daily_reminder_enabled": True,
                "reminder_time": "20:00",
                "device_health_enabled": True,
            },
        ),
        ("POST", f"{base}/notifications/due", None),
        ("GET", f"{base}/devices", None),
        ("PUT", f"{base}/devices/not-owned", {"label": "被拒绝设备"}),
        ("DELETE", f"{base}/devices/not-owned", None),
        ("GET", f"{base}/layout", None),
        ("PUT", f"{base}/layout", {"expected_revision": 1, "zones": []}),
        ("GET", f"{base}/categories", None),
        ("POST", f"{base}/categories", {"parent_id": "builtin", "name": "被拒绝分类"}),
        ("GET", f"{base}/inventory", None),
        (
            "POST",
            f"{base}/inventory",
            {
                "subcategory_id": "builtin",
                "storage_slot_id": "slot",
                "item_name": "被拒绝库存",
            },
        ),
        ("GET", f"{base}/recipes?week_start=2026-08-03", None),
        (
            "POST",
            f"{base}/recipes?week_start=2026-08-03",
            {"weekday": 0, "dish_name": "被拒绝食谱", "ingredients": []},
        ),
        ("GET", f"{base}/restock?week_start=2026-08-03", None),
        ("POST", "/api/owner/kindle-passcodes", {"refrigerator_id": refrigerator_id}),
    ]

    for method, url, payload in requests:
        response = (
            phone.request(method, url, json=payload)
            if payload is not None
            else phone.request(method, url)
        )
        assert response.status_code == 401, (
            f"{method} {url}: {response.status_code} {response.text}"
        )


def test_daily_access_workspace_supports_inventory_and_recipe_reads(tmp_path: Path) -> None:
    """日常凭证可以读取工作区并新增、编辑库存，但不能依赖所有者路径。"""
    _, phone, refrigerator = create_daily_access_fixture(tmp_path / "daily-workspace.db")
    refrigerator_id = refrigerator["id"]
    layout = phone.get(f"/api/daily/refrigerators/{refrigerator_id}/layout").json()
    categories = phone.get(f"/api/daily/refrigerators/{refrigerator_id}/categories").json()
    subcategory = next(item for item in categories if item["parent_id"] is not None)
    slot_id = layout["zones"][0]["slots"][0]["id"]

    assert phone.get(
        f"/api/daily/refrigerators/{refrigerator_id}/inventory/default-location"
    ).json() == {"storage_slot_id": None}
    created = phone.post(
        f"/api/daily/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": subcategory["id"],
            "storage_slot_id": slot_id,
            "item_name": "访客录入鸡蛋",
            "quantity": 2,
        },
    )
    assert created.status_code == 201
    batch = created.json()
    updated = phone.put(
        f"/api/daily/refrigerators/{refrigerator_id}/inventory/{batch['id']}",
        json={
            "subcategory_id": subcategory["id"],
            "storage_slot_id": slot_id,
            "item_name": "访客编辑鸡蛋",
            "quantity": 3,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["item_name"] == "访客编辑鸡蛋"
    assert phone.get(
        f"/api/daily/refrigerators/{refrigerator_id}/recipes?week_start=2026-08-03"
    ).status_code == 200
    assert phone.get(
        f"/api/daily/refrigerators/{refrigerator_id}/restock?week_start=2026-08-03"
    ).status_code == 200


def test_daily_access_selects_matching_cookie_when_one_pwa_has_multiple_fridges(
    tmp_path: Path,
) -> None:
    """同一浏览器持有多台 daily_access 时，工作区按目标冰箱选择对应凭证。"""
    database_path = tmp_path / "multiple-daily-fridges.db"
    owner, phone, first = create_daily_access_fixture(database_path)
    second = owner.post(
        "/api/owner/refrigerators", json={"name": "阳台冰箱", "template_key": "mini"}
    ).json()
    second_kindle = make_client(database_path, "device-2")
    passcode = owner.post(
        "/api/owner/kindle-passcodes", json={"refrigerator_id": second["id"]}
    ).json()["passcode"]
    assert second_kindle.post("/api/kindle/bind", json={"passcode": passcode}).status_code == 201
    pairing_token = second_kindle.post("/api/kindle/pairing-sessions").json()["pairing_token"]
    second_phone = make_client(database_path, "visitor-2")
    assert second_phone.post(
        "/api/pairings/consume",
        json={"pairing_token": pairing_token, "standalone": True, "label": "第二台手机访问"},
    ).status_code == 201

    first_cookie = json.loads(phone.cookies.get(DEVICE_COOKIE))
    second_cookie = json.loads(second_phone.cookies.get(DEVICE_COOKIE))
    first_tokens = json.loads(first_cookie) if isinstance(first_cookie, str) else first_cookie
    second_tokens = json.loads(second_cookie) if isinstance(second_cookie, str) else second_cookie
    multi_device_cookie = json.dumps(first_tokens + second_tokens, separators=(",", ":"))

    headers = {"Cookie": f"{DEVICE_COOKIE}={multi_device_cookie}"}
    first_layout = phone.get(f"/api/daily/refrigerators/{first['id']}/layout", headers=headers)
    second_layout = phone.get(f"/api/daily/refrigerators/{second['id']}/layout", headers=headers)
    assert first_layout.status_code == 200
    assert second_layout.status_code == 200
