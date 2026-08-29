"""P9 食谱导入、动态缺货和可逆扣库存的接口测试。"""

import logging
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from fridgeboard.main import create_app
from fridgeboard.persistence.database import create_database_schema
from support import start_test_client


def make_client(database_path: Path) -> TestClient:
    """创建具备隔离 SQLite 数据库的本地所有者客户端。"""
    database_url = f"sqlite:///{database_path}"
    create_database_schema(database_url)
    return start_test_client(
        create_app(database_url=database_url, development_owner_user_id="owner")
    )


def test_recipe_import_restock_complete_and_undo_restore_original_batches(tmp_path: Path) -> None:
    """食谱按库存食材名称匹配，按最早 BBD 扣减且撤销恢复每个原批次。"""
    client = make_client(tmp_path / "recipes.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories?q=蛋类").json()
    egg = next(item for item in categories if item["name"] == "蛋类")
    slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    early = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "item_name": "鸡蛋",
            "quantity": 2,
            "best_before": (date.today() + timedelta(days=1)).isoformat(),
        },
    ).json()
    late = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "item_name": "鸡蛋",
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
    assert entry["method"] is None
    assert entry["note"] is None
    assert entry["ingredients"] == [
        {
            "subcategory_name": "鸡蛋",
            "quantity": 6,
            "subcategory_id": egg["id"],
            "matched_category_name": "蛋类",
        }
    ]
    assert entry["missing"] == [
        {"subcategory_name": "鸡蛋", "quantity": 1, "subcategory_id": egg["id"]}
    ]
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
    assert completed.json()["missing"] == [
        {"subcategory_name": "鸡蛋", "quantity": 1, "subcategory_id": egg["id"]}
    ]
    assert client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/restock",
        params={"week_start": week_start.isoformat()},
    ).json()[0]["missing"] == [
        {"subcategory_name": "鸡蛋", "quantity": 1, "subcategory_id": egg["id"]}
    ]
    quantities = {
        item["id"]: item["quantity"]
        for item in client.get(f"/api/owner/refrigerators/{refrigerator_id}/inventory").json()
    }
    assert quantities[early["id"]] == 0
    assert quantities[late["id"]] == 0
    assert client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        params={"include_zero": "false"},
    ).json() == []
    retained_zero_batches = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        params={"include_zero": "true"},
    ).json()
    retained_zero_by_id = {item["id"]: item for item in retained_zero_batches}
    assert set(retained_zero_by_id) == {early["id"], late["id"]}
    assert retained_zero_by_id[early["id"]]["production_date"] == early["production_date"]
    assert retained_zero_by_id[late["id"]]["production_date"] == late["production_date"]
    assert retained_zero_by_id[early["id"]]["best_before"] == early["best_before"]
    assert retained_zero_by_id[late["id"]]["best_before"] == late["best_before"]
    assert all(item["expiry_status"] is None for item in retained_zero_batches)
    undone = client.post(f"/api/owner/refrigerators/{refrigerator_id}/recipes/{entry['id']}/undo")
    assert undone.status_code == 200
    assert undone.json()["completed"] is False
    restored = {
        item["id"]: item["quantity"]
        for item in client.get(f"/api/owner/refrigerators/{refrigerator_id}/inventory").json()
    }
    assert restored[early["id"]] == 2
    assert restored[late["id"]] == 3
    restored_batches = {
        item["id"]: item
        for item in client.get(f"/api/owner/refrigerators/{refrigerator_id}/inventory").json()
    }
    assert restored_batches[early["id"]]["production_date"] == early["production_date"]
    assert restored_batches[late["id"]]["production_date"] == late["production_date"]
    assert restored_batches[early["id"]]["best_before"] == early["best_before"]
    assert restored_batches[late["id"]]["best_before"] == late["best_before"]
    assert {
        item["id"]
        for item in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/inventory",
            params={"include_zero": "false"},
        ).json()
    } == {early["id"], late["id"]}

    completed_again = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{entry['id']}/complete"
    )
    assert completed_again.status_code == 200
    assert completed_again.json()["completed"] is True
    quantities_after_recomplete = {
        item["id"]: item["quantity"]
        for item in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/inventory"
        ).json()
    }
    assert quantities_after_recomplete[early["id"]] == 0
    assert quantities_after_recomplete[late["id"]] == 0

    undone_again = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{entry['id']}/undo"
    )
    assert undone_again.status_code == 200
    assert undone_again.json()["completed"] is False
    quantities_after_reundo = {
        item["id"]: item["quantity"]
        for item in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/inventory"
        ).json()
    }
    assert quantities_after_reundo[early["id"]] == 2
    assert quantities_after_reundo[late["id"]] == 3

    for batch in (early, late):
        deleted = client.delete(
            f"/api/owner/refrigerators/{refrigerator_id}/inventory/{batch['id']}"
        )
        assert deleted.status_code == 204

    assert client.get(f"/api/owner/refrigerators/{refrigerator_id}/inventory").json() == []


def test_recipe_matches_contained_inventory_name_only_with_same_category(
    tmp_path: Path,
) -> None:
    """食材名称可匹配同分类的复合库存名，但不会跨分类匹配。"""
    client = make_client(tmp_path / "fuzzy-recipes.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories").json()
    staple = next(item for item in categories if item["name"] == "主食")
    egg = next(item for item in categories if item["name"] == "蛋类")
    slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    matching = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": staple["id"],
            "storage_slot_id": slot_id,
            "item_name": "猪肉水饺",
            "quantity": 1,
        },
    ).json()
    wrong_category = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "item_name": "猪肉水饺",
            "quantity": 2,
        },
    ).json()
    recipe = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": date.today().isoformat()},
        json={
            "weekday": 0,
            "dish_name": "水饺",
            "ingredients": [
                {"subcategory_name": "水饺", "subcategory_id": staple["id"], "quantity": 2}
            ],
        },
    )

    assert recipe.status_code == 201
    entry = recipe.json()
    assert entry["missing"] == [
        {"subcategory_name": "水饺", "quantity": 1, "subcategory_id": staple["id"]}
    ]

    completed = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{entry['id']}/complete"
    )
    assert completed.status_code == 200
    assert completed.json()["missing"] == [
        {"subcategory_name": "水饺", "quantity": 1, "subcategory_id": staple["id"]}
    ]
    quantities = {
        item["id"]: item["quantity"]
        for item in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/inventory",
            params={"include_zero": "true"},
        ).json()
    }
    assert quantities[matching["id"]] == 0
    assert quantities[wrong_category["id"]] == 2

    undone = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{entry['id']}/undo"
    )
    assert undone.status_code == 200
    restored = {
        item["id"]: item["quantity"]
        for item in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/inventory",
            params={"include_zero": "true"},
        ).json()
    }
    assert restored[matching["id"]] == 1
    assert restored[wrong_category["id"]] == 2


def test_recipe_keeps_unmatched_name_until_user_edits_to_matchable_inventory_name(
    tmp_path: Path,
) -> None:
    """导入保留未匹配名称；改正为库存食材名称后才参与扣减。"""
    client = make_client(tmp_path / "strict-recipes.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories?q=蛋类").json()
    egg = next(item for item in categories if item["name"] == "蛋类")
    slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "item_name": "鸡蛋",
            "quantity": 2,
        },
    )
    imported = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": date.today().isoformat(), "text": "周一：早餐（蛋×2）"},
    )
    assert imported.status_code == 201
    entry = imported.json()[0]
    assert entry["missing"] == [
        {"subcategory_name": "蛋", "quantity": 2, "subcategory_id": None}
    ]
    updated = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{entry['id']}",
        json={
            "weekday": 0,
            "dish_name": "早餐",
            "method": "先炒鸡蛋，再加入河粉翻炒。",
            "note": "少放油",
            "ingredients": [{"subcategory_name": "鸡蛋", "quantity": 2}],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["method"] == "先炒鸡蛋，再加入河粉翻炒。"
    assert updated.json()["note"] == "少放油"
    assert updated.json()["ingredients"] == [
        {
            "subcategory_name": "鸡蛋",
            "quantity": 2,
            "subcategory_id": egg["id"],
            "matched_category_name": "蛋类",
        }
    ]
    assert updated.json()["missing"] == []


def test_recipe_update_persists_changed_weekday(tmp_path: Path) -> None:
    """编辑未完成食谱时，修改星期会保存到同一条食谱记录。"""
    client = make_client(tmp_path / "recipe-weekday-update.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    entry = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": date.today().isoformat(), "text": "周一：早餐（鸡蛋）"},
    ).json()[0]

    updated = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{entry['id']}",
        json={
            "weekday": 4,
            "dish_name": "早餐",
            "method": None,
            "note": None,
            "ingredients": [{"subcategory_name": "鸡蛋", "quantity": 1}],
        },
    )

    assert updated.status_code == 200
    assert updated.json()["weekday"] == 4
    week = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": date.today().isoformat()},
    ).json()
    assert week[4]["entries"][0]["id"] == entry["id"]


def test_recipe_update_accepts_long_builtin_category_id(tmp_path: Path) -> None:
    """目录中的较长内置分类 ID 也可以随星期修改一起保存。"""
    client = make_client(tmp_path / "recipe-long-category-id.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    entry = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": date.today().isoformat()},
        json={
            "weekday": 3,
            "dish_name": "清洁",
            "method": None,
            "note": None,
            "ingredients": [
                {
                    "subcategory_name": "眼膜",
                    "quantity": 1,
                    "subcategory_id": "builtin-category-outlook-eye-care",
                }
            ],
        },
    ).json()

    updated = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{entry['id']}",
        json={
            "weekday": 2,
            "dish_name": "清洁",
            "method": None,
            "note": None,
            "ingredients": [
                {
                    "subcategory_name": "眼膜",
                    "quantity": 1,
                    "subcategory_id": "builtin-category-outlook-eye-care",
                }
            ],
        },
    )

    assert updated.status_code == 200
    assert updated.json()["weekday"] == 2
    week = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": date.today().isoformat()},
    ).json()
    assert week[2]["entries"][0]["id"] == entry["id"]


def test_recipe_validation_log_includes_field_context_without_request_body(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """422 日志包含失败字段，但不写入用户提交的菜名。"""
    client = make_client(tmp_path / "recipe-validation-log.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]

    with caplog.at_level(logging.ERROR, logger="fridgeboard.main"):
        response = client.put(
            f"/api/owner/refrigerators/{refrigerator_id}/recipes/entry-1",
            json={
                "weekday": 2,
                "dish_name": "不应写入日志的菜名",
                "ingredients": [
                    {"subcategory_name": "眼膜", "subcategory_id": "x" * 65}
                ],
            },
        )

    assert response.status_code == 422
    validation_log = next(
        record
        for record in caplog.records
        if record.name == "fridgeboard.main" and "请求校验错误" in record.message
    )
    assert "subcategory_id" in validation_log.message
    assert "不应写入日志的菜名" not in validation_log.message


def test_recipe_create_reuses_cached_category_match_without_changing_name_matching(
    tmp_path: Path,
) -> None:
    """手工新增食谱自动保存快速分类，但食谱扣减仍按原始食材名称计算。"""
    client = make_client(tmp_path / "recipe-create-category.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    egg = next(
        item
        for item in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/categories", params={"q": "蛋类"}
        ).json()
        if item["name"] == "蛋类"
    )
    response = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": date.today().isoformat()},
        json={
            "weekday": 0,
            "dish_name": "煎蛋",
            "ingredients": [{"subcategory_name": "鸡蛋", "quantity": 1}],
        },
    )
    assert response.status_code == 201
    assert response.json()["ingredients"] == [
        {
            "subcategory_name": "鸡蛋",
            "quantity": 1,
            "subcategory_id": egg["id"],
            "matched_category_name": "蛋类",
        }
    ]


def test_recipe_accepts_decimal_ingredient_quantity_and_returns_numeric_json(
    tmp_path: Path,
) -> None:
    """食谱食材数量支持两位小数，并以 JSON 数字返回。"""
    client = make_client(tmp_path / "recipe-decimal-quantity.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]

    response = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": date.today().isoformat()},
        json={
            "weekday": 0,
            "dish_name": "半份煎蛋",
            "ingredients": [{"subcategory_name": "鸡蛋", "quantity": 0.5}],
        },
    )

    assert response.status_code == 201
    assert response.json()["ingredients"][0]["quantity"] == 0.5


def test_recipe_completion_accepts_decimal_consumption_and_undoes_it(tmp_path: Path) -> None:
    """完成半份食谱时允许写入小数消费审计，并可完整撤销。"""
    client = make_client(tmp_path / "recipe-decimal-completion.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    egg = next(
        item
        for item in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/categories", params={"q": "蛋类"}
        ).json()
        if item["name"] == "蛋类"
    )
    slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    inventory = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "item_name": "鸡蛋",
            "quantity": 0.5,
        },
    )
    assert inventory.status_code == 201
    recipe = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": date.today().isoformat()},
        json={
            "weekday": 0,
            "dish_name": "半份煎蛋",
            "ingredients": [{"subcategory_name": "鸡蛋", "quantity": 0.5}],
        },
    )
    assert recipe.status_code == 201
    entry_id = recipe.json()["id"]

    completed = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{entry_id}/complete"
    )
    assert completed.status_code == 200
    assert completed.json()["missing"] == []
    assert client.get(f"/api/owner/refrigerators/{refrigerator_id}/inventory").json()[0][
        "quantity"
    ] == 0

    undone = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{entry_id}/undo"
    )
    assert undone.status_code == 200
    assert client.get(f"/api/owner/refrigerators/{refrigerator_id}/inventory").json()[0][
        "quantity"
    ] == 0.5


def test_recipe_import_can_add_or_overwrite_the_selected_week(tmp_path: Path) -> None:
    """文本导入可追加或先清空目标周，且默认模式保持追加兼容。"""
    client = make_client(tmp_path / "recipe-import-modes.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    week_start = date.today() - timedelta(days=date.today().weekday())

    first = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": week_start.isoformat(), "text": "周一：旧菜（鸡蛋）"},
    )
    assert first.status_code == 201
    appended = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": week_start.isoformat(), "text": "周二：追加菜（番茄）"},
    )
    assert appended.status_code == 201
    names_after_append = [
        entry["dish_name"]
        for day in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/recipes",
            params={"week_start": week_start.isoformat()},
        ).json()
        for entry in day["entries"]
    ]
    assert names_after_append == ["旧菜", "追加菜"]

    overwritten = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={
            "week_start": week_start.isoformat(),
            "text": "周三：覆盖菜（牛肉）",
            "mode": "overwrite",
        },
    )
    assert overwritten.status_code == 201
    names_after_overwrite = [
        entry["dish_name"]
        for day in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/recipes",
            params={"week_start": week_start.isoformat()},
        ).json()
        for entry in day["entries"]
    ]
    assert names_after_overwrite == ["覆盖菜"]


def test_recipe_can_delete_pending_and_completed_entries(tmp_path: Path) -> None:
    """删除食谱会清理待完成和已完成记录，但不恢复已完成食谱的库存扣减。"""
    client = make_client(tmp_path / "recipe-delete.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    week_start = date.today() - timedelta(days=date.today().weekday())
    pending = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": week_start.isoformat(), "text": "周一：待删除（鸡蛋）"},
    ).json()[0]
    assert client.delete(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{pending['id']}"
    ).status_code == 204

    completed = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": week_start.isoformat(), "text": "周二：已完成（鸡蛋）"},
    ).json()[0]
    assert client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{completed['id']}/complete"
    ).status_code == 200
    assert client.delete(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{completed['id']}"
    ).status_code == 204
    assert all(
        not day["entries"]
        for day in client.get(
            f"/api/owner/refrigerators/{refrigerator_id}/recipes",
            params={"week_start": week_start.isoformat()},
        ).json()
    )


def test_completed_recipe_allows_method_and_note_edit(tmp_path: Path) -> None:
    """完成食谱只能修改做法和备注，其他字段必须保持完成时的值。"""
    client = make_client(tmp_path / "completed-recipe-note.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    imported = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": date.today().isoformat(), "text": "周一：早餐（蛋类×2）"},
    ).json()[0]
    completed = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{imported['id']}/complete"
    )
    assert completed.status_code == 200

    updated = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{imported['id']}",
        json={
            "weekday": 0,
            "dish_name": "早餐",
            "method": "水开后蒸十分钟",
            "note": "少放油",
            "ingredients": [{"subcategory_name": "蛋类", "quantity": 2}],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["completed"] is True
    assert updated.json()["method"] == "水开后蒸十分钟"
    assert updated.json()["note"] == "少放油"

    rejected = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{imported['id']}",
        json={
            "weekday": 1,
            "dish_name": "被篡改的早餐",
            "method": "被篡改的做法",
            "note": "仍然保留",
            "ingredients": [{"subcategory_name": "蛋类", "quantity": 9}],
        },
    )
    assert rejected.status_code == 400


def test_recipe_can_be_created_from_an_empty_day(tmp_path: Path) -> None:
    """空白日期可新增食谱，并将请求日期归一化到所属周。"""
    client = make_client(tmp_path / "create-recipe.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    created = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": "2026-07-29"},
        json={
            "weekday": 4,
            "dish_name": "周末火锅",
            "ingredients": [{"subcategory_name": "牛肉", "quantity": 2}],
        },
    )

    assert created.status_code == 201
    assert created.json()["weekday"] == 4
    assert client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": "2026-07-27"},
    ).json()[4]["entries"][0]["dish_name"] == "周末火锅"


def test_restock_reserves_inventory_for_earlier_uncompleted_recipes(tmp_path: Path) -> None:
    """同一份库存只能满足按日期排序后的第一道未完成食谱。"""
    client = make_client(tmp_path / "reserved-restock.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories?q=蛋类").json()
    egg = next(item for item in categories if item["name"] == "蛋类")
    slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()["zones"][0][
        "slots"
    ][0]["id"]
    client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "item_name": "鸡蛋",
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
    assert week[1]["entries"][0]["missing"] == [
        {"subcategory_name": "鸡蛋", "quantity": 1, "subcategory_id": egg["id"]}
    ]


def test_recipe_history_lists_eight_past_weeks_and_can_overwrite_a_target_week(
    tmp_path: Path,
) -> None:
    """历史菜单只暴露过去八周，复制后完整替换本周或下周的食谱内容。"""
    client = make_client(tmp_path / "recipe-history.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    current_week = date.today() - timedelta(days=date.today().weekday())
    history_week = current_week - timedelta(days=7)
    old_week = current_week - timedelta(days=56)
    client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": history_week.isoformat(), "text": "周一：历史早餐（鸡蛋×2）"},
    )
    historical_entry = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": history_week.isoformat()},
    ).json()[0]["entries"][0]
    noted = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{historical_entry['id']}",
        json={
            "weekday": 0,
            "dish_name": "历史早餐",
            "method": "前一晚腌好，早餐蒸熟",
            "note": "前一晚备好",
            "ingredients": [{"subcategory_name": "鸡蛋", "quantity": 2}],
        },
    )
    assert noted.status_code == 200
    client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": old_week.isoformat(), "text": "周二：八周前晚餐（牛肉）"},
    )
    client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": current_week.isoformat(), "text": "周三：本周旧菜（番茄）"},
    )

    history = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/history",
    )
    assert history.status_code == 200
    assert [item["week_start"] for item in history.json()] == [
        (current_week - timedelta(days=7 * offset)).isoformat() for offset in range(1, 9)
    ]
    assert history.json()[0]["recipe_count"] == 1
    assert history.json()[-1]["recipe_count"] == 1
    assert history.json()[0]["label"] == history_week.isoformat()
    assert history.json()[0]["preview"] == "周一 历史早餐"

    copied = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/copy",
        json={
            "source_week_start": history_week.isoformat(),
            "target_week_start": current_week.isoformat(),
        },
    )
    assert copied.status_code == 200
    assert copied.json()[0]["entries"][0]["dish_name"] == "历史早餐"
    assert copied.json()[0]["entries"][0]["method"] == "前一晚腌好，早餐蒸熟"
    assert copied.json()[0]["entries"][0]["note"] == "前一晚备好"
    assert copied.json()[2]["entries"] == []

    rejected = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/copy",
        json={
            "source_week_start": current_week.isoformat(),
            "target_week_start": (current_week + timedelta(days=7)).isoformat(),
        },
    )
    assert rejected.status_code == 400


def test_recipe_import_keeps_selected_weeks_isolated(tmp_path: Path) -> None:
    """分别导入本周和下周时，食谱只能写入请求指定的周。"""
    client = make_client(tmp_path / "recipe-week-isolation.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    current_week = date.today() - timedelta(days=date.today().weekday())
    next_week = current_week + timedelta(days=7)

    for week_start, text in (
        (current_week, "周一：本周早餐（鸡蛋）"),
        (next_week, "周一：下周早餐（牛肉）"),
    ):
        response = client.post(
            f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
            json={"week_start": week_start.isoformat(), "text": text},
        )
        assert response.status_code == 201

    current = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": current_week.isoformat()},
    ).json()
    following = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": next_week.isoformat()},
    ).json()
    assert [entry["dish_name"] for entry in current[0]["entries"]] == ["本周早餐"]
    assert [entry["dish_name"] for entry in following[0]["entries"]] == ["下周早餐"]


def test_recipe_history_uses_requested_current_week_anchor(tmp_path: Path) -> None:
    """历史列表按调用方的当前周计算，避免服务端日期与客户端周次漂移。"""
    client = make_client(tmp_path / "recipe-history-anchor.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    anchor = date(2026, 7, 27)
    previous_week = anchor - timedelta(days=7)
    client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": previous_week.isoformat(), "text": "周一：上一周早餐（鸡蛋）"},
    )

    history = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/history",
        params={"week_start": anchor.isoformat()},
    )
    assert history.status_code == 200
    assert history.json()[0]["week_start"] == previous_week.isoformat()
    assert history.json()[0]["preview"] == "周一 上一周早餐"


def test_recipe_copy_uses_the_same_requested_week_anchor_as_history(tmp_path: Path) -> None:
    """历史列表和复制使用同一客户端周锚点，避免跨周时复制被拒绝。"""
    client = make_client(tmp_path / "recipe-copy-anchor.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    anchor = date.today() + timedelta(days=21)
    anchor -= timedelta(days=anchor.weekday())
    source_week = anchor - timedelta(days=7)
    client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": source_week.isoformat(), "text": "周一：跨周早餐（鸡蛋）"},
    )

    history = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/history",
        params={"week_start": anchor.isoformat()},
    )
    assert history.status_code == 200
    assert history.json()[0]["week_start"] == source_week.isoformat()

    copied = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/copy",
        params={"week_start": anchor.isoformat()},
        json={
            "source_week_start": source_week.isoformat(),
            "target_week_start": anchor.isoformat(),
        },
    )
    assert copied.status_code == 200
    assert copied.json()[0]["entries"][0]["dish_name"] == "跨周早餐"


def test_recipe_write_routes_keep_legacy_400_for_unknown_refrigerator(tmp_path: Path) -> None:
    """拆分路由后，食谱写接口仍按既有契约返回 400。"""
    client = make_client(tmp_path / "recipe-write-status.db")
    client.post("/api/auth/development-login")
    week_start = date.today().isoformat()

    imported = client.post(
        "/api/owner/refrigerators/missing-refrigerator/recipes/import",
        json={"week_start": week_start, "text": "周一：早餐（鸡蛋）"},
    )
    assert imported.status_code == 400

    copied = client.post(
        "/api/owner/refrigerators/missing-refrigerator/recipes/copy",
        json={"source_week_start": week_start, "target_week_start": week_start},
    )
    assert copied.status_code == 400


def test_custom_shopping_items_can_be_added_in_one_batch_and_persisted(tmp_path: Path) -> None:
    """自定义购物项支持批量追加，并按追加顺序持久化到指定冰箱。"""
    client = make_client(tmp_path / "custom-shopping.db")
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    path = f"/api/owner/refrigerators/{refrigerator_id}/custom-shopping-items"

    created = client.post(
        path,
        json={
            "items": [
                {"item_name": "洗衣液", "quantity": 2},
                {"item_name": "垃圾袋", "quantity": 3},
            ]
        },
    )
    assert created.status_code == 201
    assert [(item["item_name"], item["quantity"]) for item in created.json()] == [
        ("洗衣液", 2),
        ("垃圾袋", 3),
    ]
    assert [item["item_name"] for item in client.get(path).json()] == ["洗衣液", "垃圾袋"]

    appended = client.post(path, json={"items": [{"item_name": "  纸巾  ", "quantity": 1}]})
    assert appended.status_code == 201
    items = client.get(path).json()
    assert [item["item_name"] for item in items] == ["洗衣液", "垃圾袋", "纸巾"]

    updated = client.put(
        f"{path}/{items[0]['id']}",
        json={"item_name": "洗衣液（大桶）", "quantity": 4},
    )
    assert updated.status_code == 200
    assert updated.json()["quantity"] == 4
    deleted = client.delete(f"{path}/{items[1]['id']}")
    assert deleted.status_code == 204
    assert [item["item_name"] for item in client.get(path).json()] == ["洗衣液（大桶）", "纸巾"]
