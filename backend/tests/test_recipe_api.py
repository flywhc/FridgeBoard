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


def test_recipe_rejects_non_exact_subcategory_name(tmp_path: Path) -> None:
    """食谱不允许从大类或近似名称退化匹配到库存小类。"""
    client = make_client(tmp_path / "strict-recipes.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    response = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": date.today().isoformat(), "text": "周一：早餐（蛋×2）"},
    )
    assert response.status_code == 400
    assert "完全匹配" in response.json()["detail"]
