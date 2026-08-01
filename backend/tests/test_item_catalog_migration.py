"""通用物品分类迁移的数据保真回归测试。"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text


def test_item_catalog_migration_round_trip_preserves_legacy_category_links(
    tmp_path: Path,
) -> None:
    """含库存数据升级再降级后仍恢复旧大类与小类父子关系。"""
    database_path = tmp_path / "migration.db"
    database_url = f"sqlite:///{database_path}"
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "20260730_08")
    engine = create_engine(database_url)
    now = datetime.now(UTC).replace(tzinfo=None)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO refrigerators "
                "(id, owner_user_id, name, template_key, revision, created_at) "
                "VALUES ('r1', 'owner', '冰箱', 'mini', 1, :now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO storage_zones "
                "(id, refrigerator_id, zone_key, temperature_mode, geometry, display_order) "
                "VALUES ('z1', 'r1', 'cold', 'cold', '{}', 0)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO storage_slots (id, zone_id, slot_key, display_order, geometry) "
                "VALUES ('s1', 'z1', 'cold-1', 0, '{}')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO food_categories "
                "(id, refrigerator_id, parent_id, name, icon_key, is_custom) VALUES "
                "('builtin-category-egg', NULL, NULL, '蛋类', 'egg', 0), "
                "('builtin-egg', NULL, 'builtin-category-egg', '鸡蛋', 'egg', 0), "
                "('builtin-category-dairy', NULL, NULL, '奶品', 'milk', 0), "
                "('builtin-milk', NULL, 'builtin-category-dairy', '牛奶', 'milk', 0)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO inventory_batches "
                "(id, refrigerator_id, category_id, subcategory_id, storage_slot_id, "
                "food_name, quantity, created_at, updated_at) VALUES "
                "('b1', 'r1', 'builtin-category-egg', 'builtin-egg', 's1', "
                "'鸡蛋', 1, :now, :now)"
            ),
            {"now": now},
        )

    command.upgrade(config, "head")
    with engine.connect() as connection:
        upgraded_group_names = connection.execute(
            text(
                "SELECT name FROM food_categories "
                "WHERE id LIKE 'builtin-group-%' ORDER BY display_order"
            )
        ).scalars().all()
        upgraded_dairy_parent = connection.scalar(
            text("SELECT parent_id FROM food_categories WHERE id = 'builtin-category-dairy'")
        )

    command.downgrade(config, "20260730_08")

    with engine.connect() as connection:
        batch = connection.execute(
            text("SELECT category_id, subcategory_id FROM inventory_batches WHERE id = 'b1'")
        ).one()
        child_parent = connection.scalar(
            text("SELECT parent_id FROM food_categories WHERE id = 'builtin-egg'")
        )
        remaining_groups = connection.scalar(
            text("SELECT COUNT(*) FROM food_categories WHERE id LIKE 'builtin-group-%'")
        )

    assert tuple(batch) == ("builtin-category-egg", "builtin-egg")
    assert child_parent == "builtin-category-egg"
    assert upgraded_group_names == [
        "肉蛋水产",
        "水果蔬菜",
        "熟肉主食",
        "粮油酱料",
        "酒水饮料",
        "点心奶品",
    ]
    assert upgraded_dairy_parent == "builtin-group-snacks"
    assert remaining_groups == 0
