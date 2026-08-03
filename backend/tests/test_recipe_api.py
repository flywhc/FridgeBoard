"""P9 食谱导入、动态缺货和可逆扣库存的接口测试。"""

from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from fridgeboard.main import create_app
from fridgeboard.persistence.database import create_database_engine
from fridgeboard.persistence.models import Base
from support import start_test_client


def make_client(database_path: Path) -> TestClient:
    """创建具备隔离 SQLite 数据库的本地所有者客户端。"""
    database_url = f"sqlite:///{database_path}"
    Base.metadata.create_all(create_database_engine(database_url))
    return start_test_client(
        create_app(database_url=database_url, development_owner_user_id="owner")
    )


def test_recipe_import_restock_complete_and_undo_restore_original_batches(tmp_path: Path) -> None:
    """食谱只精确匹配小类，按最早 BBD 扣减且撤销恢复每个原批次。"""
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
            "item_name": "早到鸡蛋",
            "quantity": 2,
            "best_before": (date.today() + timedelta(days=1)).isoformat(),
        },
    ).json()
    late = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "item_name": "晚到鸡蛋",
            "quantity": 3,
            "best_before": (date.today() + timedelta(days=3)).isoformat(),
        },
    ).json()
    week_start = date.today() - timedelta(days=date.today().weekday())
    imported = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        json={"week_start": week_start.isoformat(), "text": "周二：鸡蛋羹（蛋类×6）"},
    )
    assert imported.status_code == 201
    entry = imported.json()[0]
    assert entry["missing"] == [{"subcategory_name": "蛋类", "quantity": 1}]
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
    assert completed.json()["missing"] == [{"subcategory_name": "蛋类", "quantity": 1}]
    assert client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/restock",
        params={"week_start": week_start.isoformat()},
    ).json()[0]["missing"] == [{"subcategory_name": "蛋类", "quantity": 1}]
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
    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories?q=蛋类").json()
    assert any(item["name"] == "蛋类" for item in categories)
    updated = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{entry['id']}",
        json={
            "weekday": 0,
            "dish_name": "早餐",
            "note": "少放油",
            "ingredients": [{"subcategory_name": "蛋类", "quantity": 2}],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["note"] == "少放油"
    assert updated.json()["ingredients"] == [{"subcategory_name": "蛋类", "quantity": 2}]


def test_completed_recipe_allows_note_only_edit(tmp_path: Path) -> None:
    """完成食谱只能修改备注，其他字段必须保持完成时的值。"""
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
            "note": "少放油",
            "ingredients": [{"subcategory_name": "蛋类", "quantity": 2}],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["completed"] is True
    assert updated.json()["note"] == "少放油"

    rejected = client.put(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes/{imported['id']}",
        json={
            "weekday": 1,
            "dish_name": "被篡改的早餐",
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
            "text": "周一：早餐（蛋类）\n周二：午餐（蛋类）",
        },
    )
    week = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": week_start.isoformat()},
    ).json()
    assert week[0]["entries"][0]["missing"] == []
    assert week[1]["entries"][0]["missing"] == [{"subcategory_name": "蛋类", "quantity": 1}]


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
