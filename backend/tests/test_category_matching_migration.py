"""物品自动分类缓存生命周期迁移测试。"""

import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path

from alembic import command
from alembic.config import Config
from fridgeboard.persistence.database import create_database_engine
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


def _run_connection(
    database_url: str, operation: Callable[[AsyncConnection], Awaitable[object]]
) -> object:
    """在异步 SQLite 连接上运行迁移测试数据库操作。"""
    async def run() -> object:
        engine = create_database_engine(database_url)
        try:
            async with engine.begin() as connection:
                return await operation(connection)
        finally:
            await engine.dispose()

    return asyncio.run(run())


def test_category_mapping_expiry_migration_backfills_only_temporary_rows(
    tmp_path: Path,
) -> None:
    """升级后旧临时映射获得有效期，用户确认映射仍永久保留。"""
    database_url = f"sqlite:///{tmp_path / 'category-mapping-expiry.db'}"
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "20260810_17")
    now = datetime.now(UTC).replace(tzinfo=None)
    async def seed(connection: AsyncConnection) -> None:
        await connection.execute(
            text(
                "INSERT INTO refrigerators "
                "(id, owner_user_id, name, template_key, revision, created_at) "
                "VALUES ('r1', 'owner', '冰箱', 'mini', 1, :now)"
            ),
            {"now": now},
        )
        await connection.execute(
            text(
                "INSERT INTO food_categories "
                "(id, refrigerator_id, parent_id, name, icon_key, is_custom, display_order) "
                "VALUES "
                "('group', NULL, NULL, '大类', NULL, 0, 0), "
                "('child', NULL, 'group', '小类', NULL, 0, 0)"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO item_category_mappings "
                "(refrigerator_id, normalized_item_name, display_item_name, "
                "subcategory_id, source, confidence, confirmed, model_name, hit_count, "
                "created_at, updated_at) VALUES "
                "('r1', '临时商品', '临时商品', 'child', 'ai', 0.9, 0, "
                "'agnes-2.5-flash', 0, :now, :now), "
                "('r1', '确认商品', '确认商品', 'child', 'user', 1.0, 1, "
                "NULL, 1, :now, :now)"
            ),
            {"now": now},
        )

    _run_connection(database_url, seed)
    before_upgrade = datetime.now(UTC).replace(tzinfo=None)
    command.upgrade(config, "20260810_18")
    after_upgrade = datetime.now(UTC).replace(tzinfo=None)

    async def read(connection: AsyncConnection) -> list[dict[str, object]]:
        return list(
            (
                await connection.execute(
                    text(
                        "SELECT normalized_item_name, model_name, expires_at "
                        "FROM item_category_mappings ORDER BY confirmed"
                    )
                )
            )
            .mappings()
            .all()
        )

    rows = _run_connection(database_url, read)

    assert rows[0]["normalized_item_name"] == "临时商品"
    assert rows[0]["model_name"] == "agnes-2.5-flash"
    temporary_expiry = datetime.fromisoformat(rows[0]["expires_at"])
    assert before_upgrade + timedelta(days=90) <= temporary_expiry
    assert temporary_expiry <= after_upgrade + timedelta(days=90)
    assert rows[1] == {
        "normalized_item_name": "确认商品",
        "model_name": None,
        "expires_at": None,
    }


def test_global_category_mapping_migration_backfills_builtin_rows(tmp_path: Path) -> None:
    """全局缓存迁移只回填内置小类，不回填冰箱专属小类。"""
    database_url = f"sqlite:///{tmp_path / 'global-category-mapping.db'}"
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "20260810_18")
    now = datetime.now(UTC).replace(tzinfo=None)

    async def seed(connection: AsyncConnection) -> None:
        await connection.execute(
            text(
                "INSERT INTO refrigerators "
                "(id, owner_user_id, name, template_key, revision, created_at) "
                "VALUES ('r1', 'owner', '冰箱', 'mini', 1, :now)"
            ),
            {"now": now},
        )
        await connection.execute(
            text(
                "INSERT INTO food_categories "
                "(id, refrigerator_id, parent_id, name, icon_key, is_custom, display_order) "
                "VALUES "
                "('group', NULL, NULL, '大类', NULL, 0, 0), "
                "('builtin', NULL, 'group', '内置小类', NULL, 0, 0), "
                "('custom', 'r1', 'group', '专属小类', NULL, 1, 1)"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO item_category_mappings "
                "(refrigerator_id, normalized_item_name, display_item_name, "
                "subcategory_id, source, confidence, confirmed, hit_count, "
                "created_at, updated_at) VALUES "
                "('r1', '内置商品', '内置商品', 'builtin', 'user', 1.0, 1, 1, :now, :now), "
                "('r1', '专属商品', '专属商品', 'custom', 'user', 1.0, 1, 1, :now, :now)"
            ),
            {"now": now},
        )

    _run_connection(database_url, seed)
    command.upgrade(config, "20260814_22")

    async def read(connection: AsyncConnection) -> list[dict[str, object]]:
        return list(
            (
                await connection.execute(
                    text(
                        "SELECT normalized_item_name, subcategory_id "
                        "FROM global_item_category_mappings"
                    )
                )
            )
            .mappings()
            .all()
        )

    assert _run_connection(database_url, read) == [
        {"normalized_item_name": "内置商品", "subcategory_id": "builtin"}
    ]


def test_owner_category_migration_merges_refrigerator_clones_and_rewrites_references(
    tmp_path: Path,
) -> None:
    """用户级分类迁移合并同名副本，并保留购物、映射和最近使用关联。"""
    database_url = f"sqlite:///{tmp_path / 'owner-categories.db'}"
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "20260830_31")
    now = datetime.now(UTC).replace(tzinfo=None)

    async def seed(connection: AsyncConnection) -> None:
        await connection.execute(
            text(
                "INSERT INTO refrigerators "
                "(id, owner_user_id, name, template_key, revision, created_at) VALUES "
                "('r1', 'owner', '一号', 'mini', 1, :now), "
                "('r2', 'owner', '二号', 'mini', 1, :now)"
            ),
            {"now": now},
        )
        await connection.execute(
            text(
                "INSERT INTO food_categories "
                "(id, refrigerator_id, parent_id, name, icon_key, is_custom, "
                "created_by_user_id, display_order, revision) VALUES "
                "('group', NULL, NULL, '主食', NULL, 0, NULL, 0, 1), "
                "('clone-1', 'r1', 'group', '杂粮饭', 'custom-grain', 1, 'owner', 0, 1), "
                "('clone-2', 'r2', 'group', '杂粮饭', 'custom-grain', 1, 'owner', 0, 2), "
                "('grain', 'r1', 'group', '杂粮', NULL, 1, 'owner', 1, 1), "
                "('cabbage', 'r1', 'group', '白菜', NULL, 1, 'owner', 2, 1), "
                "('kale', 'r1', 'group', '甘蓝', NULL, 1, 'owner', 3, 1)"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO icon_assets "
                "(key, refrigerator_id, label, media_type, storage_path, source, "
                "fallback_theme, created_at) VALUES "
                "('custom-grain', 'r1', '旧标签', 'image/png', 'custom-grain/ink.png', "
                "'draft', 'ink', :now)"
            ),
            {"now": now},
        )
        await connection.execute(
            text(
                "INSERT OR IGNORE INTO icon_assets "
                "(key, refrigerator_id, label, media_type, storage_path, source, "
                "fallback_theme, created_at) VALUES "
                "('bean', NULL, '杂粮', 'image/svg+xml', 'icons/bean.svg', "
                "'builtin', 'ink', :now)"
            ),
            {"now": now},
        )
        await connection.execute(
            text(
                "INSERT INTO custom_shopping_items "
                "(id, refrigerator_id, subcategory_id, item_name, quantity, display_order, "
                "created_at) VALUES ('shopping', 'r1', 'clone-1', '杂粮饭', 1, 0, :now)"
            ),
            {"now": now},
        )
        await connection.execute(
            text(
                "INSERT INTO custom_shopping_items "
                "(id, refrigerator_id, subcategory_id, item_name, quantity, display_order, "
                "created_at) VALUES ('cabbage-shopping', 'r1', 'cabbage', '圆白菜', 1, 1, :now)"
            ),
            {"now": now},
        )
        await connection.execute(
            text(
                "INSERT INTO item_category_mappings "
                "(refrigerator_id, normalized_item_name, display_item_name, subcategory_id, "
                "source, confidence, confirmed, hit_count, created_at, updated_at) VALUES "
                "('r1', '杂粮饭', '杂粮饭', 'clone-1', 'user', 1, 1, 1, :now, :now)"
            ),
            {"now": now},
        )
        await connection.execute(
            text(
                "INSERT INTO recent_subcategory_usage "
                "(refrigerator_id, subcategory_id, last_added_at, is_bootstrap) VALUES "
                "('r1', 'clone-1', :now, 0), ('r1', 'clone-2', :now, 0)"
            ),
            {"now": now},
        )

    _run_connection(database_url, seed)
    command.upgrade(config, "head")

    async def read(connection: AsyncConnection) -> dict[str, object]:
        categories = list(
            (
                await connection.execute(
                    text(
                        "SELECT id, owner_user_id, name, icon_key FROM food_categories "
                        "WHERE name = '杂粮饭'"
                    )
                )
            )
            .mappings()
            .all()
        )
        return {
            "categories": categories,
            "shopping": (
                await connection.execute(
                    text("SELECT subcategory_id FROM custom_shopping_items WHERE id='shopping'")
                )
            ).scalar_one(),
            "mapping": (
                await connection.execute(
                    text(
                        "SELECT subcategory_id FROM item_category_mappings "
                        "WHERE normalized_item_name='杂粮饭'"
                    )
                )
            ).scalar_one(),
            "recent_count": (
                await connection.execute(
                    text("SELECT COUNT(*) FROM recent_subcategory_usage WHERE refrigerator_id='r1'")
                )
            ).scalar_one(),
            "icon": dict(
                (
                    await connection.execute(
                        text(
                            "SELECT owner_user_id, label FROM icon_assets "
                            "WHERE key='custom-grain'"
                        )
                    )
                )
                .mappings()
                .one()
            ),
            "grain_icon": (
                await connection.execute(
                    text("SELECT icon_key FROM food_categories WHERE id='grain'")
                )
            ).scalar_one(),
            "produce_categories": {
                row["name"]: row["parent_id"]
                for row in (
                    await connection.execute(
                        text(
                            "SELECT name, parent_id FROM food_categories "
                            "WHERE id IN ('cabbage', 'kale')"
                        )
                    )
                )
                .mappings()
                .all()
            },
            "round_cabbage": (
                await connection.execute(
                    text(
                        "SELECT subcategory_id FROM custom_shopping_items "
                        "WHERE id='cabbage-shopping'"
                    )
                )
            ).scalar_one(),
            "category_columns": {
                row[1]
                for row in (
                    await connection.execute(text("PRAGMA table_info(food_categories)"))
                )
            },
        }

    result = _run_connection(database_url, read)
    assert result["categories"] == [
        {
            "id": "clone-2",
            "owner_user_id": "owner",
            "name": "杂粮饭",
            "icon_key": "custom-grain",
        }
    ]
    assert result["shopping"] == "clone-2"
    assert result["mapping"] == "clone-2"
    assert result["recent_count"] == 1
    assert result["icon"] == {"owner_user_id": "owner", "label": "杂粮饭"}
    assert result["grain_icon"] == "bean"
    assert result["produce_categories"] == {
        "白菜": "builtin-group-produce",
        "甘蓝": "builtin-group-produce",
    }
    assert result["round_cabbage"] == "kale"
    assert "owner_user_id" in result["category_columns"]
    assert "refrigerator_id" not in result["category_columns"]
