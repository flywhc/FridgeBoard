"""小数消费审计约束迁移的回归测试。"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text


def _alembic_config(database_url: str) -> Config:
    """返回指向临时 SQLite 数据库的 Alembic 配置。"""
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def test_consumption_quantity_migration_replaces_legacy_check(tmp_path: Path) -> None:
    """从 20260812_20 升级后消费审计应允许两位小数。"""
    database_url = f"sqlite:///{tmp_path / 'decimal-quantities.db'}"
    config = _alembic_config(database_url)
    command.upgrade(config, "20260812_20")
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            schema = connection.execute(
                text(
                    "SELECT sql FROM sqlite_master "
                    "WHERE type = 'table' AND name = 'consumption_lines'"
                )
            ).scalar_one()
    finally:
        engine.dispose()

    assert "CONSTRAINT ck_consumption_line_quantity CHECK (quantity >= 0.01)" in schema
    assert "CONSTRAINT ck_consumption_line_quantity CHECK (quantity >= 1)" not in schema
