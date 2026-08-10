"""物品自动分类缓存生命周期迁移测试。"""

from datetime import UTC, datetime, timedelta
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text


def test_category_mapping_expiry_migration_backfills_only_temporary_rows(
    tmp_path: Path,
) -> None:
    """升级后旧临时映射获得有效期，用户确认映射仍永久保留。"""
    database_url = f"sqlite:///{tmp_path / 'category-mapping-expiry.db'}"
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "20260810_17")
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
                "INSERT INTO food_categories "
                "(id, refrigerator_id, parent_id, name, icon_key, is_custom, display_order) "
                "VALUES "
                "('group', NULL, NULL, '大类', NULL, 0, 0), "
                "('child', NULL, 'group', '小类', NULL, 0, 0)"
            )
        )
        connection.execute(
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

    before_upgrade = datetime.now(UTC).replace(tzinfo=None)
    command.upgrade(config, "20260810_18")
    after_upgrade = datetime.now(UTC).replace(tzinfo=None)
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT normalized_item_name, model_name, expires_at "
                "FROM item_category_mappings ORDER BY confirmed"
            )
        ).mappings().all()

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
