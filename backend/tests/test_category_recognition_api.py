"""自定义小类跨冰箱全量识别接口测试。"""

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


def test_recognize_custom_category_across_all_owned_refrigerators(tmp_path: Path) -> None:
    """识别会覆盖所有自有冰箱、零库存、历史食谱和自定义购物项。"""
    client = make_client(tmp_path / "recognition.db")
    client.post("/api/auth/development-login")
    refrigerators = [
        client.post(
            "/api/owner/refrigerators", json={"name": name, "template_key": "mini"}
        ).json()
        for name in ("一号冰箱", "二号冰箱")
    ]
    source_id = refrigerators[0]["id"]
    categories = client.get(f"/api/owner/refrigerators/{source_id}/categories").json()
    parent = next(item for item in categories if item["parent_id"] is None)
    seed = next(item for item in categories if item["parent_id"] == parent["id"])
    custom = client.post(
        f"/api/owner/refrigerators/{source_id}/categories",
        json={"parent_id": parent["id"], "name": "目标物品", "icon_key": seed["icon_key"]},
    ).json()
    target_categories = client.get(
        f"/api/owner/refrigerators/{refrigerators[1]['id']}/categories?q=目标物品"
    ).json()
    assert [item["id"] for item in target_categories if item["name"] == "目标物品"] == [
        custom["id"]
    ]

    inventory_batches: list[dict[str, object]] = []
    for index, refrigerator in enumerate(refrigerators):
        refrigerator_id = refrigerator["id"]
        slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()[
            "zones"
        ][0]["slots"][0]["id"]
        inventory_batches.append(
            client.post(
                f"/api/owner/refrigerators/{refrigerator_id}/inventory",
                json={
                    "subcategory_id": seed["id"],
                    "storage_slot_id": slot_id,
                    "item_name": "目标物品",
                    "quantity": 0 if index == 0 else 2,
                },
            ).json()
        )
        shopping = client.post(
            f"/api/owner/refrigerators/{refrigerator_id}/custom-shopping-items",
            json={
                "items": [
                    {"item_name": "目标物品", "quantity": 1},
                    {"item_name": "不匹配物品", "quantity": 1},
                ]
            },
        )
        assert shopping.status_code == 201
        recipe = client.post(
            f"/api/owner/refrigerators/{refrigerator_id}/recipes",
            params={"week_start": (date.today() - timedelta(days=14)).isoformat()},
            json={
                "weekday": 0,
                "dish_name": f"历史菜{index}",
                "ingredients": [{"subcategory_name": "目标物品", "quantity": 1}],
            },
        )
        assert recipe.status_code == 201

    result = client.post(
        f"/api/owner/refrigerators/{source_id}/categories/{custom['id']}/recognize-items",
        json={
            "context_item_name": "目标物品",
            "context_inventory_batch_id": inventory_batches[0]["id"],
        },
    )
    assert result.status_code == 200
    assert [item["item_name"] for item in result.json()["items"]] == ["目标物品"]

    for refrigerator in refrigerators:
        refrigerator_id = refrigerator["id"]
        local_category = next(
            item
            for item in client.get(
                f"/api/owner/refrigerators/{refrigerator_id}/categories?q=目标物品"
            ).json()
            if item["name"] == "目标物品"
        )
        assert local_category["id"] == custom["id"]
        assert local_category["icon_key"] == custom["icon_key"]
        inventory = client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/inventory",
            params={"include_zero": "true"},
        ).json()
        assert inventory[0]["subcategory_id"] == custom["id"]
        shopping = client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/custom-shopping-items"
        ).json()
        assert shopping[0]["subcategory_id"] == custom["id"]
        recipe = client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/recipes",
            params={"week_start": (date.today() - timedelta(days=14)).isoformat()},
        ).json()
        assert recipe[0]["entries"][0]["ingredients"][0]["subcategory_id"] == custom["id"]
        assert shopping[1]["subcategory_id"] is None


def test_recognize_custom_category_rejects_foreign_category(tmp_path: Path) -> None:
    """识别接口不能使用不属于当前所有者的分类。"""
    client = make_client(tmp_path / "recognition-auth.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房", "template_key": "mini"}
    ).json()
    response = client.post(
        f"/api/owner/refrigerators/{refrigerator['id']}/categories/foreign/recognize-items",
        json={},
    )
    assert response.status_code == 400


def test_custom_shopping_reference_blocks_category_deletion(tmp_path: Path) -> None:
    """已自动归类的自定义购物项会阻止对应小类删除。"""
    client = make_client(tmp_path / "shopping-reference.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories").json()
    parent = next(item for item in categories if item["parent_id"] is None)
    category = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/categories",
        json={"parent_id": parent["id"], "name": "购物专属", "icon_key": "egg"},
    ).json()
    shopping = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/custom-shopping-items",
        json={"items": [{"item_name": "购物专属", "quantity": 1}]},
    )
    assert shopping.status_code == 201
    assert shopping.json()[0]["subcategory_id"] == category["id"]

    deleted = client.delete(
        f"/api/owner/refrigerators/{refrigerator_id}/categories/{category['id']}"
    )
    assert deleted.status_code == 400
    assert "购物清单" in deleted.json()["detail"]


def test_edited_inventory_name_is_the_context_matching_name(tmp_path: Path) -> None:
    """编辑库存名称后，旧的持久化名称不能替代当前草稿名称参与识别。"""
    client = make_client(tmp_path / "edited-context.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories").json()
    parent = next(item for item in categories if item["parent_id"] is None)
    seed = next(item for item in categories if item["parent_id"] == parent["id"])
    category = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/categories",
        json={"parent_id": parent["id"], "name": "旧名称", "icon_key": seed["icon_key"]},
    ).json()
    slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    batch = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": seed["id"],
            "storage_slot_id": slot_id,
            "item_name": "旧名称",
            "quantity": 1,
        },
    ).json()

    result = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/categories/{category['id']}/recognize-items",
        json={"context_item_name": "当前未匹配名称", "context_inventory_batch_id": batch["id"]},
    )
    assert result.status_code == 200
    assert result.json()["items"] == []
    assert client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory", params={"include_zero": "true"}
    ).json()[0]["subcategory_id"] == seed["id"]

    categories = client.get(f"/api/owner/refrigerators/{refrigerator['id']}/categories").json()
    parent = next(item for item in categories if item["parent_id"] is None)
    category = client.post(
        f"/api/owner/refrigerators/{refrigerator['id']}/categories",
        json={"parent_id": parent["id"], "name": "目标物品", "icon_key": "egg"},
    ).json()
    response = client.post(
        f"/api/owner/refrigerators/{refrigerator['id']}/categories/{category['id']}/recognize-items",
        json={"context_inventory_batch_id": "missing-batch"},
    )
    assert response.status_code == 400
