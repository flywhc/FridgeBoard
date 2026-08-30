"""历史分类回填命令测试。"""

import asyncio
from datetime import UTC, datetime
from pathlib import Path

from alembic import command
from alembic.config import Config
from fridgeboard.category_backfill import backfill_missing_category_ids
from fridgeboard.main import create_app
from fridgeboard.persistence.database import create_database_engine, create_database_schema
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection
from support import start_test_client


def test_category_backfill_uses_ai_against_the_target_database(tmp_path: Path) -> None:
    """回填命令应读取目标数据库，并为未命中项写入模型返回的候选 ID。"""
    database_path = tmp_path / "category-backfill.db"
    database_url = f"sqlite:///{database_path}"
    create_database_schema(database_url)
    client = start_test_client(
        create_app(database_url=database_url, development_owner_user_id="owner")
    )
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()["id"]
    shopping_path = f"/api/owner/refrigerators/{refrigerator_id}/custom-shopping-items"
    client.post(shopping_path, json={"items": [{"item_name": "白菜", "quantity": 1}]})
    client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/recipes",
        params={"week_start": "2026-08-24"},
        json={
            "weekday": 0,
            "dish_name": "酸菜鱼",
            "ingredients": [{"subcategory_name": "酸菜", "quantity": 1}],
        },
    )

    async def provider(_name: str, candidates: list[dict[str, object]], on_progress=None):
        del on_progress
        leafy = next(candidate for candidate in candidates if candidate["name"] == "叶菜")
        return {"subcategory_id": {"value": leafy["id"], "confidence": 0.96}}

    summary = asyncio.run(
        backfill_missing_category_ids(database_url, provider, "test-category-model-v3")
    )

    assert summary.ai == 2
    assert summary.failed == 0
    assert client.get(shopping_path).json()[0]["subcategory_id"] == "builtin-leafy-vegetable"


def test_category_backfill_migration_uses_only_target_database_evidence(tmp_path: Path) -> None:
    """31 号迁移按目标库的库存证据回填，无法确认的名称保持为空。"""
    database_url = f"sqlite:///{tmp_path / 'category-backfill-migration.db'}"
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "20260829_30")
    now = datetime.now(UTC).replace(tzinfo=None)

    async def seed(connection: AsyncConnection) -> None:
        await connection.execute(
            text(
                "INSERT INTO refrigerators "
                "(id, owner_user_id, name, template_key, created_at) "
                "VALUES ('fridge-1', 'owner', '测试冰箱', 'mini', :now)"
            ),
            {"now": now},
        )
        await connection.execute(
            text(
                "INSERT INTO food_categories "
                "(id, refrigerator_id, parent_id, name, icon_key, is_custom, display_order) "
                "VALUES ('group-1', NULL, NULL, '水果蔬菜', NULL, 0, 0), "
                "('leaf-1', NULL, 'group-1', '叶菜', 'chinese-cabbage', 0, 0)"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO storage_zones "
                "(id, refrigerator_id, zone_key, temperature_mode, geometry, display_order) "
                "VALUES ('zone-1', 'fridge-1', 'main', 'cool', '{}', 0)"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO storage_slots "
                "(id, zone_id, slot_key, display_order, geometry) "
                "VALUES ('slot-1', 'zone-1', 'slot', 0, '{}')"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO inventory_batches "
                "(id, refrigerator_id, subcategory_id, storage_slot_id, quantity, "
                "item_name, created_at, updated_at) "
                "VALUES ('batch-1', 'fridge-1', 'leaf-1', 'slot-1', 1, '白菜', :now, :now)"
            ),
            {"now": now},
        )
        await connection.execute(
            text(
                "INSERT INTO custom_shopping_items "
                "(id, refrigerator_id, item_name, quantity, display_order, created_at) "
                "VALUES ('shopping-1', 'fridge-1', '白菜', 1, 0, :now)"
            ),
            {"now": now},
        )
        await connection.execute(
            text(
                "INSERT INTO recipe_plans (id, refrigerator_id, week_start, created_at) "
                "VALUES ('plan-1', 'fridge-1', '2026-08-24', :now)"
            ),
            {"now": now},
        )
        await connection.execute(
            text(
                "INSERT INTO recipe_entries "
                "(id, recipe_plan_id, weekday, dish_name) "
                "VALUES ('entry-1', 'plan-1', 0, '酸菜鱼')"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO recipe_ingredients "
                "(id, recipe_entry_id, subcategory_id, quantity, raw_name) "
                "VALUES ('ingredient-1', 'entry-1', NULL, 1, '酸菜')"
            )
        )

    async def read(connection: AsyncConnection) -> list[dict[str, object]]:
        return list(
            (
                await connection.execute(
                    text(
                        "SELECT 'shopping' AS kind, subcategory_id "
                        "FROM custom_shopping_items WHERE id = 'shopping-1' "
                        "UNION ALL SELECT 'recipe', subcategory_id "
                        "FROM recipe_ingredients WHERE id = 'ingredient-1'"
                    )
                )
            )
            .mappings()
            .all()
        )

    async def run_seed() -> None:
        engine = create_database_engine(database_url)
        try:
            async with engine.begin() as connection:
                await seed(connection)
        finally:
            await engine.dispose()

    async def read_after_migration() -> list[dict[str, object]]:
        engine = create_database_engine(database_url)
        try:
            async with engine.begin() as connection:
                return await read(connection)
        finally:
            await engine.dispose()

    asyncio.run(run_seed())
    command.upgrade(config, "head")
    assert asyncio.run(read_after_migration()) == [
        {"kind": "shopping", "subcategory_id": "leaf-1"},
        {"kind": "recipe", "subcategory_id": None},
    ]
