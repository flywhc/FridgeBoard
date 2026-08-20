"""P5 库存、两级分类、图标库和位置记忆的接口测试。"""

from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from fridgeboard.main import create_app
from fridgeboard.persistence.database import create_database_schema
from support import start_test_client


def make_client(database_path: Path) -> TestClient:
    """创建带本地所有者登录的隔离应用。"""
    database_url = f"sqlite:///{database_path}"
    create_database_schema(database_url)
    return start_test_client(
        create_app(database_url=database_url, development_owner_user_id="owner")
    )


def test_inventory_crud_categories_icons_and_location_memory(tmp_path: Path) -> None:
    """手工录入可复用类别图标、默认生产日期、记忆位置，并正确处理无 BBD 批次。"""
    client = make_client(tmp_path / "p5.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    layout = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()
    first_slot_id = layout["zones"][0]["slots"][0]["id"]
    first_zone_label = layout["zones"][0]["label"]

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
            "price": "12.30",
        },
    )
    assert created.status_code == 201
    assert created.json()["expiry_status"] is None
    assert created.json()["quantity"] == 6
    assert created.json()["icon_key"] == "egg"
    assert created.json()["storage_slot_name"] == f"{first_zone_label}第1格"
    assert created.json()["production_date"] == date.today().isoformat()
    assert created.json()["price"] == "12.30"

    renamed = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/layout/slots/{first_slot_id}/name",
        json={"name": "早餐食材"},
    )
    assert renamed.status_code == 200
    renamed_inventory = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory"
    ).json()
    assert renamed_inventory[0]["storage_slot_name"] == "早餐食材"

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
            "price": "9.99",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["quantity"] == 4
    assert updated.json()["production_date"] == production_date.isoformat()
    assert updated.json()["expiry_status"] == "expiring"
    assert updated.json()["price"] == "9.99"
    preserved_date = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory/{created.json()['id']}",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": first_slot_id,
            "item_name": "土鸡蛋",
            "quantity": 5,
            "best_before": best_before.isoformat(),
            "best_before_changed": True,
            "production_date": production_date.isoformat(),
        },
    )
    assert preserved_date.status_code == 200
    assert preserved_date.json()["production_date"] == production_date.isoformat()
    assert preserved_date.json()["best_before"] == best_before.isoformat()
    assert preserved_date.json()["expiry_status"] == "expiring"
    zero_quantity = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory/{created.json()['id']}",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": first_slot_id,
            "item_name": "土鸡蛋",
            "quantity": 0,
            "best_before": best_before.isoformat(),
            "production_date": production_date.isoformat(),
        },
    )
    assert zero_quantity.status_code == 200
    assert zero_quantity.json()["quantity"] == 0
    assert zero_quantity.json()["production_date"] == production_date.isoformat()
    assert zero_quantity.json()["best_before"] == best_before.isoformat()
    assert zero_quantity.json()["expiry_status"] is None
    restored_quantity = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory/{created.json()['id']}",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": first_slot_id,
            "item_name": "土鸡蛋",
            "quantity": 1,
        },
    )
    assert restored_quantity.status_code == 200
    assert restored_quantity.json()["quantity"] == 1
    assert restored_quantity.json()["production_date"] == production_date.isoformat()
    assert restored_quantity.json()["best_before"] == best_before.isoformat()
    assert restored_quantity.json()["expiry_status"] == "expiring"
    default_inventory = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory"
    ).json()
    assert default_inventory[0]["quantity"] == 1
    assert len(
        client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/inventory",
            params={"include_zero": False},
        ).json()
    ) == 1
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


def test_inventory_keeps_different_prices_in_separate_batches(tmp_path: Path) -> None:
    """同一物品的不同价格批次不能合并，价格为空仍可正常创建。"""
    client = make_client(tmp_path / "inventory-price-batches.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    egg = next(
        item
        for item in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/categories"
        ).json()
        if item["name"] == "蛋类"
    )
    payload = {
        "subcategory_id": egg["id"],
        "storage_slot_id": slot_id,
        "item_name": "土鸡蛋",
        "quantity": 1,
    }

    no_price = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory", json=payload
    )
    priced = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={**payload, "price": "18.80"},
    )

    assert no_price.status_code == priced.status_code == 201
    assert no_price.json()["price"] is None
    assert priced.json()["price"] == "18.80"
    assert priced.json()["id"] != no_price.json()["id"]


def test_order_inventory_merge_same_name_adds_quantity_and_keeps_one_batch(
    tmp_path: Path,
) -> None:
    """订单批量录入在同一位置按同名库存累加数量，不制造重复项。"""
    client = make_client(tmp_path / "inventory-order-merge.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    layout = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()
    slot_id = layout["zones"][0]["slots"][0]["id"]
    egg = next(
        item
        for item in client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories").json()
        if item["name"] == "蛋类"
    )
    payload = {
        "subcategory_id": egg["id"],
        "storage_slot_id": slot_id,
        "item_name": "土鸡蛋",
        "quantity": 2,
        "price": "20.99",
        "merge_same_name": True,
    }
    first = client.post(f"/api/owner/refrigerators/{refrigerator_id}/inventory", json=payload)
    second = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={**payload, "quantity": 3, "price": "18.99"},
    )

    assert first.status_code == second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["quantity"] == 5
    assert second.json()["price"] == "20.99"
    assert len(client.get(f"/api/owner/refrigerators/{refrigerator_id}/inventory").json()) == 1


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


def test_owner_can_batch_reclassify_inventory_batches(tmp_path: Path) -> None:
    """所有者可把当前冰箱的多个库存批次一次改到同一个小类。"""
    client = make_client(tmp_path / "inventory-category.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories").json()
    subcategories = [item for item in categories if item["parent_id"] is not None]
    source = subcategories[0]
    target = next(
        item
        for item in subcategories
        if item["id"] != source["id"]
    )
    batches = [
        client.post(
            f"/api/owner/refrigerators/{refrigerator_id}/inventory",
            json={
                "subcategory_id": source["id"],
                "storage_slot_id": slot_id,
                "item_name": item_name,
                "quantity": 1,
            },
        ).json()
        for item_name in ("土鸡蛋", "白煮蛋")
    ]

    categorized = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory/category",
        json={"batch_ids": [batch["id"] for batch in batches], "subcategory_id": target["id"]},
    )

    assert categorized.status_code == 200
    assert [batch["id"] for batch in categorized.json()] == [batch["id"] for batch in batches]
    assert {batch["subcategory_id"] for batch in categorized.json()} == {target["id"]}
    listed = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory?include_zero=true"
    ).json()
    assert {batch["subcategory_id"] for batch in listed} == {target["id"]}


def test_owner_can_move_inventory_batches_to_another_refrigerator(tmp_path: Path) -> None:
    """所有者可把已选库存批次移动到另一台自有冰箱的位置。"""
    client = make_client(tmp_path / "inventory-move.db")
    client.post("/api/auth/development-login")
    source = client.post(
        "/api/owner/refrigerators", json={"name": "一号", "template_key": "mini"}
    ).json()
    target = client.post(
        "/api/owner/refrigerators", json={"name": "二号", "template_key": "mini"}
    ).json()
    egg = next(
        item
        for item in client.get(f"/api/owner/refrigerators/{source['id']}/categories?q=蛋类").json()
        if item["name"] == "蛋类"
    )
    source_slot_id = client.get(
        f"/api/owner/refrigerators/{source['id']}/layout"
    ).json()["zones"][0]["slots"][0]["id"]
    target_slot_id = client.get(
        f"/api/owner/refrigerators/{target['id']}/layout"
    ).json()["zones"][0]["slots"][0]["id"]
    batch = client.post(
        f"/api/owner/refrigerators/{source['id']}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": source_slot_id,
            "item_name": "鸡蛋",
            "quantity": 2,
        },
    ).json()
    custom = client.post(
        f"/api/owner/refrigerators/{source['id']}/categories",
        json={"parent_id": egg["parent_id"], "name": "一号特供", "icon_key": "egg"},
    ).json()
    custom_batch = client.post(
        f"/api/owner/refrigerators/{source['id']}/inventory",
        json={
            "subcategory_id": custom["id"],
            "storage_slot_id": source_slot_id,
            "item_name": "一号特供",
            "quantity": 1,
        },
    ).json()

    moved = client.post(
        "/api/owner/inventory/move",
        json={
            "target_refrigerator_id": target["id"],
            "storage_slot_id": target_slot_id,
            "batch_ids": [batch["id"], custom_batch["id"]],
        },
    )

    assert moved.status_code == 200
    assert [item["id"] for item in moved.json()] == [batch["id"], custom_batch["id"]]
    assert moved.json()[0]["storage_slot_id"] == target_slot_id
    assert client.get(
        f"/api/owner/refrigerators/{source['id']}/inventory?include_zero=true"
    ).json() == []
    assert client.get(
        f"/api/owner/refrigerators/{target['id']}/inventory?include_zero=true"
    ).json()[0]["item_name"] == "鸡蛋"
    target_items = client.get(
        f"/api/owner/refrigerators/{target['id']}/inventory?include_zero=true"
    ).json()
    assert {item["item_name"] for item in target_items} == {"鸡蛋", "一号特供"}
    assert any(
        item["name"] == "一号特供"
        for item in client.get(
            f"/api/owner/refrigerators/{target['id']}/categories?q=一号特供"
        ).json()
    )


def test_owner_can_permanently_delete_selected_inventory_batches(tmp_path: Path) -> None:
    """批量删除会移除整条库存记录，而不是将数量改为零。"""
    client = make_client(tmp_path / "inventory-delete-batches.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    egg = next(
        item
        for item in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/categories?q=蛋类"
        ).json()
        if item["name"] == "蛋类"
    )
    slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    first = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "item_name": "土鸡蛋",
            "quantity": 0,
        },
    ).json()
    second = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "item_name": "鹌鹑蛋",
            "quantity": 2,
        },
    ).json()

    deleted = client.post(
        "/api/owner/inventory/delete", json={"batch_ids": [first["id"], second["id"]]}
    )

    assert deleted.status_code == 204
    assert client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory?include_zero=true"
    ).json() == []

    remaining = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "item_name": "鸡蛋",
            "quantity": 1,
        },
    ).json()
    rejected = client.post(
        "/api/owner/inventory/delete",
        json={"batch_ids": [remaining["id"], "missing-batch"]},
    )

    assert rejected.status_code == 400
    assert client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory?include_zero=true"
    ).json()[0]["id"] == remaining["id"]


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
            "best_before": (date.today() + timedelta(days=3)).isoformat(),
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
    assert removed.json()["id"] == batch["id"]
    assert removed.json()["quantity"] == 0
    assert removed.json()["production_date"] == date.today().isoformat()
    assert removed.json()["best_before"] == (date.today() + timedelta(days=3)).isoformat()
    assert display.get("/api/devices/current/inventory").json() == []
    restored = display.post(
        "/api/devices/current/inventory/restore",
        json={
            "batch_id": batch["id"],
            "quantity": batch["quantity"],
        },
    )
    assert restored.status_code == 201
    assert restored.json()["id"] == batch["id"]
    assert restored.json()["quantity"] == 2
    assert restored.json()["production_date"] == batch["production_date"]
    assert restored.json()["best_before"] == batch["best_before"]


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
