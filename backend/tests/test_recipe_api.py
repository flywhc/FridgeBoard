"""P9 食谱导入、动态缺货和可逆扣库存的接口测试。"""

from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from fridgeboard.main import create_app
from fridgeboard.persistence.database import create_database_engine
from fridgeboard.persistence.models import Base


def make_client(database_path: Path) -> TestClient:
    """创建具备隔离 SQLite 数据库的本地所有者客户端。"""
    database_url = f"sqlite:///{database_path}"
    Base.metadata.create_all(create_database_engine(database_url))
    return TestClient(create_app(database_url=database_url, development_owner_user_id="owner"))


def test_recipe_import_restock_complete_and_undo_restore_original_batches(tmp_path: Path) -> None:
    """食谱只精确匹配小类，按最早 BBD 扣减且撤销恢复每个原批次。"""
    client = make_client(tmp_path / "recipes.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories?q=鸡蛋").json()
    egg = next(item for item in categories if item["name"] == "鸡蛋")
    slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    early = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "category_id": egg["parent_id"],
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "food_name": "早到鸡蛋",
            "quantity": 2,
            "best_before": (date.today() + timedelta(days=1)).isoformat(),
        },
    ).json()
    late = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "category_id": egg["parent_id"],
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "food_name": "晚到鸡蛋",
            "quantity": 3,
            "best_before": (date.today() + timedelta(days=3)).isoformat(),
        },
    ).json()
    week_start = date.today() - timedelta(days=date.today().weekday())
    imported = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": week_start.isoformat(), "text": "周二：鸡蛋羹（鸡蛋×6）"},
    )
    assert imported.status_code == 201
    entry = imported.json()[0]
    assert entry["missing"] == [{"subcategory_name": "鸡蛋", "quantity": 1}]
    assert (
        len(
            client.get(
                f"/api/owner/refrigerators/{refrigerator_id}/recipes",
                params={"week_start": week_start.isoformat()},
            ).json()
        )
        == 7
    )
    completed = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{entry['id']}/complete"
    )
    assert completed.status_code == 200
    assert completed.json()["completed"] is True
    assert completed.json()["missing"] == [{"subcategory_name": "鸡蛋", "quantity": 1}]
    assert client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/restock",
        params={"week_start": week_start.isoformat()},
    ).json()[0]["missing"] == [{"subcategory_name": "鸡蛋", "quantity": 1}]
    quantities = {
        item["id"]: item["quantity"]
        for item in client.get(f"/api/owner/refrigerators/{refrigerator_id}/inventory").json()
    }
    assert quantities[early["id"]] == 0
    assert quantities[late["id"]] == 0
    undone = client.post(f"/api/owner/refrigerators/{refrigerator_id}/recipes/{entry['id']}/undo")
    assert undone.status_code == 200
    assert undone.json()["completed"] is False
    restored = {
        item["id"]: item["quantity"]
        for item in client.get(f"/api/owner/refrigerators/{refrigerator_id}/inventory").json()
    }
    assert restored[early["id"]] == 2
    assert restored[late["id"]] == 3


def test_recipe_keeps_unmatched_name_until_user_edits_to_exact_subcategory(tmp_path: Path) -> None:
    """导入保留未匹配名称；改正后才允许严格匹配并参与扣减。"""
    client = make_client(tmp_path / "strict-recipes.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    imported = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": date.today().isoformat(), "text": "周一：早餐（蛋×2）"},
    )
    assert imported.status_code == 201
    entry = imported.json()[0]
    assert entry["missing"] == [{"subcategory_name": "蛋", "quantity": 2}]
    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories?q=鸡蛋").json()
    assert any(item["name"] == "鸡蛋" for item in categories)
    updated = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{entry['id']}",
        json={
            "weekday": 0,
            "dish_name": "早餐",
            "ingredients": [{"subcategory_name": "鸡蛋", "quantity": 2}],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["ingredients"] == [{"subcategory_name": "鸡蛋", "quantity": 2}]


def test_restock_reserves_inventory_for_earlier_uncompleted_recipes(tmp_path: Path) -> None:
    """同一份库存只能满足按日期排序后的第一道未完成食谱。"""
    client = make_client(tmp_path / "reserved-restock.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories?q=鸡蛋").json()
    egg = next(item for item in categories if item["name"] == "鸡蛋")
    slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "category_id": egg["parent_id"],
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "food_name": "鸡蛋",
            "quantity": 1,
        },
    )
    week_start = date.today() - timedelta(days=date.today().weekday())
    client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={
            "week_start": week_start.isoformat(),
            "text": "周一：早餐（鸡蛋）\n周二：午餐（鸡蛋）",
        },
    )
    week = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": week_start.isoformat()},
    ).json()
    assert week[0]["entries"][0]["missing"] == []
    assert week[1]["entries"][0]["missing"] == [{"subcategory_name": "鸡蛋", "quantity": 1}]
