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
    assert {"drink", "condiment"} <= {icon["key"] for icon in icons.json()}
    assert all("?v=" in icon["asset_url"] for icon in icons.json())
    assert client.get("/api/icon-library/other.svg").status_code == 404
    egg_icon = client.get("/api/icon-library/egg.svg")
    assert egg_icon.headers["content-type"].startswith("image/svg+xml")
    assert "<path" in egg_icon.text
    assert "<text" not in egg_icon.text

    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories?q=蛋类")
    egg = next(item for item in categories.json() if item["name"] == "蛋类")
    category_id = egg["parent_id"]
    assert category_id

    created = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": first_slot_id,
            "item_name": "土鸡蛋",
            "quantity": 6,
        },
    )
    assert created.status_code == 201
    assert created.json()["expiry_status"] is None
    assert created.json()["quantity"] == 6
    assert created.json()["icon_key"] == "egg"

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
            "subcategory_id": egg["id"],
            "storage_slot_id": first_slot_id,
            "item_name": "土鸡蛋",
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
            "subcategory_id": egg["id"],
            "storage_slot_id": first_slot_id,
            "item_name": "土鸡蛋",
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


def test_inventory_keeps_different_item_names_in_the_same_subcategory_separate(
    tmp_path: Path,
) -> None:
    """同一小类的不同品名不能在列表数据中合并为一个批次。"""
    client = make_client(tmp_path / "inventory-food-name-batches.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    pepper = next(
        item
        for item in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/categories?q=辣椒"
        ).json()
        if item["name"] == "辣椒"
    )
    payload = {
        "subcategory_id": pepper["id"],
        "storage_slot_id": slot_id,
        "quantity": 1,
    }

    first = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={**payload, "item_name": "巴沙鱼"},
    )
    second = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={**payload, "item_name": "鲈鱼"},
    )
    merged = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={**payload, "item_name": "巴沙鱼"},
    )

    assert first.status_code == second.status_code == merged.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert merged.json()["id"] == first.json()["id"]
    inventory = client.get(f"/api/owner/refrigerators/{refrigerator_id}/inventory").json()
    assert [(item["item_name"], item["quantity"]) for item in inventory] == [
        ("巴沙鱼", 2),
        ("鲈鱼", 1),
    ]


def test_builtin_parent_categories_follow_requested_order_and_icons(tmp_path: Path) -> None:
    """内置大类按添加页顺序返回，并为指定品类提供专用图标。"""
    client = make_client(tmp_path / "category-order.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()

    categories = client.get(
        f"/api/owner/refrigerators/{refrigerator['id']}/categories"
    ).json()
    parents = [item for item in categories if item["parent_id"] is None]
    assert [item["name"] for item in parents] == [
        "肉蛋水产",
        "水果蔬菜",
        "熟食主食",
        "粮油酱料",
        "酒水饮料",
        "点心奶品",
        "个护美妆",
        "日化清洁",
    ]
    assert all(item["icon_key"] is None for item in parents)
    expected_icon_keys = {
        "鸡肉": "fluent-emoji-high-contrast:chicken",
        "猪肉": "pork",
        "牛肉": "beef",
        "羊肉": "lamb",
        "肠丸": "sausage",
        "熟肉": "cooked-meat",
        "主食": "steamed-bun",
        "香辛": "scallion-ginger",
        "干货": "dried-goods",
        "甜点": "dessert",
        "叶菜": "chinese-cabbage",
        "瓜豆": "tomato",
        "辣椒": "pepper",
        "菌菇": "mingcute:mushroom-line",
        "酒类": "lucide:wine",
        "茶咖": "mdi:coffee-outline",
        "杂粮": "bean",
        "唇膏": "lipstick-line",
        "奶品": "milk",
        "烘焙": "bread",
        "坚果": "nuts",
        "洁牙": "personal-hygiene-clean-toothpaste",
        "体护": "shampoo",
        "香氛": "perfume-outline",
        "面膜": "mask-one",
        "洗碗": "dishwasher",
        "洗衣": "washing-machine",
    }
    subcategory_icon_keys = {
        item["name"]: item["icon_key"] for item in categories if item["parent_id"] is not None
    }
    assert {
        name: subcategory_icon_keys[name] for name in expected_icon_keys
    } == expected_icon_keys

    icon_library = {item["key"] for item in client.get("/api/icon-library").json()}
    assert set(expected_icon_keys.values()) <= icon_library
    assert {
        "personal-hygiene-clean-toothpaste",
        "shampoo",
        "perfume-outline",
        "mask-one",
        "dishwasher",
        "washing-machine",
    } <= icon_library
    for icon_key in expected_icon_keys.values():
        response = client.get(f"/api/icon-library/{icon_key}.svg")
        assert response.status_code == 200
        assert "<svg" in response.text
        assert "<text" not in response.text
    chicken_icon = client.get(
        "/api/icon-library/fluent-emoji-high-contrast:chicken.svg"
    ).text
    assert '<g fill="currentColor">' in chicken_icon
    assert '<path d="M15.42 16.25a1.5 1.5 0 1 1-3 0' in chicken_icon
    pig_icon = client.get("/api/icon-library/pork.svg").text
    assert pig_icon.count('stroke-width="1.1"') == 2
    assert 'cx="10.2" cy="10.8" r="1.1"' in pig_icon
    assert 'cx="13.8" cy="10.8" r="1.1"' in pig_icon
    assert 'cx="11.3" cy="15.65"' in pig_icon
    assert "M5 2.922V2" in client.get("/api/icon-library/beef.svg").text
    assert "M9 15a1 1" in client.get("/api/icon-library/lamb.svg").text
    rice_icon = client.get("/api/icon-library/steamed-bun.svg").text
    assert "M8.51 12.48" in rice_icon
    assert "M6 4.73" in rice_icon


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
    categories = client.get(f"/api/owner/refrigerators/{first['id']}/categories?q=蛋类").json()
    egg = next(item for item in categories if item["name"] == "蛋类")
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
            "subcategory_id": custom["id"],
            "storage_slot_id": second_slot_id,
            "item_name": "一号特供",
            "quantity": 1,
        },
    )
    assert response.status_code == 400
    assert "不属于当前冰箱" in response.json()["detail"]


def test_inventory_write_routes_keep_legacy_400_for_unknown_refrigerator(tmp_path: Path) -> None:
    """拆分路由后，库存写接口仍按既有契约返回 400。"""
    client = make_client(tmp_path / "inventory-write-status.db")
    client.post("/api/auth/development-login")
    refrigerator_id = "missing-refrigerator"

    category = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/categories",
        json={"parent_id": "builtin-egg", "name": "乌鸡蛋", "icon_key": "egg"},
    )
    assert category.status_code == 400

    default_location = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory/default-location",
        params={"category_id": "builtin-egg"},
    )
    assert default_location.status_code == 400

    inventory = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": "builtin-egg",
            "storage_slot_id": "missing-slot",
            "item_name": "鸡蛋",
            "quantity": 1,
        },
    )
    assert inventory.status_code == 400

    layout = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/layout",
        json={
            "expected_revision": 1,
            "zones": [{"zone_key": "fresh", "temperature_mode": "cold", "slot_count": 1}],
        },
    )
    assert layout.status_code == 400


def test_paired_display_can_read_and_adjust_its_own_inventory(tmp_path: Path) -> None:
    """冰箱端仅能读取已绑定冰箱，并可单步调整或把库存拿完。"""
    owner = make_client(tmp_path / "eink-inventory.db")
    owner.post("/api/auth/development-login")
    refrigerator = owner.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    categories = owner.get(
        f"/api/owner/refrigerators/{refrigerator_id}/categories?q=蛋类"
    ).json()
    egg = next(item for item in categories if item["name"] == "蛋类")
    slot_id = owner.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    batch = owner.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "item_name": "鸡蛋",
            "quantity": 2,
        },
    ).json()
    passcode = owner.post(
        "/api/owner/kindle-passcodes", json={"refrigerator_id": refrigerator_id}
    ).json()["passcode"]
    display = make_client(tmp_path / "eink-inventory.db")
    assert display.post("/api/kindle/bind", json={"passcode": passcode}).status_code == 201

    device_icons = display.get("/api/devices/current/icons")
    assert device_icons.status_code == 200
    egg_icon = next(icon for icon in device_icons.json() if icon["key"] == "egg")
    assert display.get(egg_icon["asset_url"]).headers["content-type"].startswith(
        "image/svg+xml"
    )
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
            "subcategory_id": batch["subcategory_id"],
            "storage_slot_id": batch["storage_slot_id"],
            "item_name": batch["item_name"],
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
    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories?q=蛋类").json()
    egg = next(item for item in categories if item["name"] == "蛋类")
    layout = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()
    slot = layout["zones"][0]["slots"][0]["id"]
    client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": egg["id"], "storage_slot_id": slot,
            "item_name": "鸡蛋", "quantity": 1, "production_date": date.today().isoformat(),
            "best_before": (date.today() + timedelta(days=5)).isoformat(),
        },
    )
    inventory = client.get(f"/api/owner/refrigerators/{refrigerator_id}/inventory").json()
    assert inventory[0]["expiry_status"] == "expiring"
