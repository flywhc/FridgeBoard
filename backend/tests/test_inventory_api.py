"""P5 库存、两级分类、图标库和位置记忆的接口测试。"""

from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from fridgeboard.main import create_app
from fridgeboard.persistence.database import create_database_engine
from fridgeboard.persistence.models import Base


def make_client(database_path: Path) -> TestClient:
    """创建带本地所有者登录的隔离应用。"""
    database_url = f"sqlite:///{database_path}"
    Base.metadata.create_all(create_database_engine(database_url))
    return TestClient(create_app(database_url=database_url, development_owner_user_id="owner"))


def test_inventory_crud_categories_icons_and_location_memory(tmp_path: Path) -> None:
    """手工录入可复用类别图标、记忆位置，并正确处理无 BBD 批次。"""
    client = make_client(tmp_path / "p5.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    layout = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()
    first_slot_id = layout["zones"][0]["slots"][0]["id"]

    icons = client.get("/api/icon-library")
    assert icons.status_code == 200
    assert any(icon["key"] == "egg" for icon in icons.json())
    assert {"drink", "condiment", "other"} <= {icon["key"] for icon in icons.json()}
    egg_icon = client.get("/api/icon-library/egg.svg")
    assert egg_icon.headers["content-type"].startswith("image/svg+xml")
    assert "<path" in egg_icon.text
    assert "<text" not in egg_icon.text

    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories?q=鸡蛋")
    egg = next(item for item in categories.json() if item["name"] == "鸡蛋")
    category_id = egg["parent_id"]
    assert category_id

    created = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "category_id": category_id,
            "subcategory_id": egg["id"],
            "storage_slot_id": first_slot_id,
            "food_name": "土鸡蛋",
            "quantity": 6,
        },
    )
    assert created.status_code == 201
    assert created.json()["expiry_status"] is None
    assert created.json()["quantity"] == 6

    default_location = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory/default-location",
        params={"category_id": category_id},
    )
    assert default_location.json() == {"storage_slot_id": first_slot_id}

    custom = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/categories",
        json={"parent_id": category_id, "name": "乌鸡蛋", "icon_key": "egg"},
    )
    assert custom.status_code == 201
    assert custom.json()["is_custom"] is True
    assert custom.json()["icon_key"] == "egg"
    assert any(
        item["id"] == custom.json()["id"]
        for item in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/categories?q=乌鸡"
        ).json()
    )

    production_date = date.today() - timedelta(days=9)
    best_before = date.today() + timedelta(days=1)
    updated = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory/{created.json()['id']}",
        json={
            "category_id": category_id,
            "subcategory_id": egg["id"],
            "storage_slot_id": first_slot_id,
            "food_name": "土鸡蛋",
            "quantity": 4,
            "best_before": best_before.isoformat(),
            "production_date": production_date.isoformat(),
        },
    )
    assert updated.status_code == 200
    assert updated.json()["quantity"] == 4
    assert updated.json()["production_date"] == production_date.isoformat()
    assert updated.json()["expiry_status"] == "expiring"
    preserved_date = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory/{created.json()['id']}",
        json={
            "category_id": category_id,
            "subcategory_id": egg["id"],
            "storage_slot_id": first_slot_id,
            "food_name": "土鸡蛋",
            "quantity": 5,
            "best_before": best_before.isoformat(),
            "production_date": production_date.isoformat(),
        },
    )
    assert preserved_date.status_code == 200
    assert preserved_date.json()["production_date"] == production_date.isoformat()
    assert preserved_date.json()["expiry_status"] == "expiring"
    assert (
        client.delete(
            f"/api/owner/refrigerators/{refrigerator_id}/inventory/{created.json()['id']}"
        ).status_code
        == 204
    )
    assert client.get(f"/api/owner/refrigerators/{refrigerator_id}/inventory").json() == []


def test_inventory_rejects_cross_refrigerator_category_and_location(tmp_path: Path) -> None:
    """库存写入不能跨冰箱引用自定义分类或物理位置。"""
    client = make_client(tmp_path / "inventory-scope.db")
    client.post("/api/auth/development-login")
    first = client.post(
        "/api/owner/refrigerators", json={"name": "一号", "template_key": "mini"}
    ).json()
    second = client.post(
        "/api/owner/refrigerators", json={"name": "二号", "template_key": "mini"}
    ).json()
    categories = client.get(f"/api/owner/refrigerators/{first['id']}/categories?q=鸡蛋").json()
    egg = next(item for item in categories if item["name"] == "鸡蛋")
    category_id = egg["parent_id"]
    custom = client.post(
        f"/api/owner/refrigerators/{first['id']}/categories",
        json={"parent_id": category_id, "name": "一号特供", "icon_key": "egg"},
    ).json()
    second_slot_id = client.get(f"/api/owner/refrigerators/{second['id']}/layout").json()["zones"][
        0
    ]["slots"][0]["id"]
    response = client.post(
        f"/api/owner/refrigerators/{second['id']}/inventory",
        json={
            "category_id": category_id,
            "subcategory_id": custom["id"],
            "storage_slot_id": second_slot_id,
            "food_name": "一号特供",
            "quantity": 1,
        },
    )
    assert response.status_code == 400
    assert "不属于当前冰箱" in response.json()["detail"]


def test_paired_display_can_read_and_adjust_its_own_inventory(tmp_path: Path) -> None:
    """冰箱端仅能读取已绑定冰箱，并可单步调整或把库存拿完。"""
    owner = make_client(tmp_path / "eink-inventory.db")
    owner.post("/api/auth/development-login")
    refrigerator = owner.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    categories = owner.get(
        f"/api/owner/refrigerators/{refrigerator_id}/categories?q=鸡蛋"
    ).json()
    egg = next(item for item in categories if item["name"] == "鸡蛋")
    slot_id = owner.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    batch = owner.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "category_id": egg["parent_id"],
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "food_name": "鸡蛋",
            "quantity": 2,
        },
    ).json()
    passcode = owner.post(
        "/api/owner/kindle-passcodes", json={"refrigerator_id": refrigerator_id}
    ).json()["passcode"]
    display = make_client(tmp_path / "eink-inventory.db")
    assert display.post("/api/kindle/bind", json={"passcode": passcode}).status_code == 201

    assert display.get("/api/devices/current/inventory").json()[0]["id"] == batch["id"]
    decreased = display.patch(
        f"/api/devices/current/inventory/{batch['id']}/quantity", json={"delta": -1}
    )
    assert decreased.status_code == 200
    assert decreased.json()["quantity"] == 1
    removed = display.patch(
        f"/api/devices/current/inventory/{batch['id']}/quantity", json={"delta": -1}
    )
    assert removed.status_code == 200
    assert removed.json() is None
    assert display.get("/api/devices/current/inventory").json() == []
    restored = display.post(
        "/api/devices/current/inventory/restore",
        json={
            "category_id": batch["category_id"],
            "subcategory_id": batch["subcategory_id"],
            "storage_slot_id": batch["storage_slot_id"],
            "food_name": batch["food_name"],
            "quantity": batch["quantity"],
        },
    )
    assert restored.status_code == 201
    assert restored.json()["quantity"] == 2


def test_expiry_settings_persist_and_update_inventory_status(tmp_path: Path) -> None:
    """临期规则按冰箱保存，修改后库存列表立即按新规则计算状态。"""
    client = make_client(tmp_path / "expiry-settings.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    assert client.get(f"/api/owner/refrigerators/{refrigerator_id}/expiry-settings").json() == {
        "ratio_percent": 20,
        "minimum_days": 1,
        "maximum_days": 14,
    }
    saved = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/expiry-settings",
        json={"ratio_percent": 100, "minimum_days": 1, "maximum_days": 14},
    )
    assert saved.status_code == 200
    assert saved.json()["ratio_percent"] == 100
    assert (
        client.put(
            f"/api/owner/refrigerators/{refrigerator_id}/expiry-settings",
            json={"ratio_percent": 20, "minimum_days": 10, "maximum_days": 2},
        ).status_code
        == 422
    )
    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories?q=鸡蛋").json()
    egg = next(item for item in categories if item["name"] == "鸡蛋")
    layout = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()
    slot = layout["zones"][0]["slots"][0]["id"]
    client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "category_id": egg["parent_id"], "subcategory_id": egg["id"], "storage_slot_id": slot,
            "food_name": "鸡蛋", "quantity": 1, "production_date": date.today().isoformat(),
            "best_before": (date.today() + timedelta(days=5)).isoformat(),
        },
    )
    inventory = client.get(f"/api/owner/refrigerators/{refrigerator_id}/inventory").json()
    assert inventory[0]["expiry_status"] == "expiring"
