"""移动端长期会话迁移回归测试。"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text


def test_mobile_session_migration_removes_existing_refresh_deadlines(tmp_path: Path) -> None:
    """升级已有移动会话后，刷新令牌应不再因旧的 30 天期限失效。"""
    database_url = f"sqlite:///{tmp_path / 'mobile-session-migration.db'}"
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "20260814_23")

    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO mobile_sessions "
                    "(id, owner_user_id, access_token_hash, refresh_token_hash, "
                    "access_expires_at, refresh_expires_at, label, created_at) "
                    "VALUES ('session-1', 'owner-1', 'access-hash', 'refresh-hash', "
                    "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Android', CURRENT_TIMESTAMP)"
                )
            )
        command.upgrade(config, "head")
        with engine.connect() as connection:
            refresh_expiry = connection.execute(
                text("SELECT refresh_expires_at FROM mobile_sessions WHERE id = 'session-1'")
            ).scalar_one()
    finally:
        engine.dispose()

    assert refresh_expiry is None
