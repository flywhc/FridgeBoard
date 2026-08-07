"""配对重构的冰箱设置状态迁移测试。"""

from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fridgeboard.persistence.database import create_database_engine
from fridgeboard.persistence.models import Base, Refrigerator
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session


def _alembic_config(database_url: str) -> Config:
    """返回指向临时 SQLite 数据库的 Alembic 配置。"""
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def test_new_refrigerator_needs_layout_and_has_no_draft_by_default() -> None:
    """新建冰箱不得用模板或库存隐式推断布局已经完成。"""
    engine = create_database_engine("sqlite://")
    Base.metadata.create_all(engine)
    refrigerator = Refrigerator(owner_user_id="owner", name="待配置冰箱", template_key="mini")
    with Session(engine) as session:
        session.add(refrigerator)
        session.flush()

        assert refrigerator.setup_status == "needs_layout"
        assert refrigerator.setup_draft is None

    with engine.connect() as connection:
        refrigerator_schema = connection.execute(
            text("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'refrigerators'")
        ).scalar_one()
        pairing_schema = connection.execute(
            text("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pairing_sessions'")
        ).scalar_one()

    assert "ck_refrigerators_setup_status" in refrigerator_schema
    assert "ck_refrigerators_ready_without_draft" in refrigerator_schema
    assert "ck_pairing_sessions_purpose" in pairing_schema


def test_onboarding_state_migration_marks_existing_refrigerators_ready(tmp_path: Path) -> None:
    """迁移为历史冰箱显式回填 ready，且不虚构可恢复的设置草稿。"""
    database_url = f"sqlite:///{tmp_path / 'onboarding-state.db'}"
    config = _alembic_config(database_url)
    command.upgrade(config, "20260805_12")

    with create_engine(database_url).begin() as connection:
        connection.execute(
            text(
                "INSERT INTO refrigerators "
                "(id, owner_user_id, name, template_key, revision, created_at) "
                "VALUES ('legacy', 'owner', '旧冰箱', 'mini', 1, :created_at)"
            ),
            {"created_at": datetime.now(UTC).replace(tzinfo=None)},
        )
        connection.execute(
            text(
                "INSERT INTO device_credentials "
                "(id, refrigerator_id, device_kind, credential_hash, label, created_at) "
                "VALUES ('kindle', 'legacy', 'kindle', 'credential', '旧 Kindle', :created_at)"
            ),
            {"created_at": datetime.now(UTC).replace(tzinfo=None)},
        )
        connection.execute(
            text(
                "INSERT INTO pairing_sessions "
                "(id, token_hash, refrigerator_id, kindle_device_id, expires_at) "
                "VALUES ('pairing', 'pairing-token', 'legacy', 'kindle', :expires_at)"
            ),
            {"expires_at": datetime.now(UTC).replace(tzinfo=None)},
        )
        connection.execute(
            text(
                "INSERT INTO first_boot_pairing_sessions "
                "(id, mobile_token_hash, kindle_token_hash, expires_at) "
                "VALUES ('bootstrap', 'mobile-token', 'kindle-token', :expires_at)"
            ),
            {"expires_at": datetime.now(UTC).replace(tzinfo=None)},
        )
        connection.execute(
            text(
                "INSERT INTO kindle_passcodes "
                "(id, code_hash, owner_user_id, expires_at) "
                "VALUES ('passcode', 'passcode-hash', 'owner', :expires_at)"
            ),
            {"expires_at": datetime.now(UTC).replace(tzinfo=None)},
        )

    command.upgrade(config, "head")

    with create_engine(database_url).connect() as connection:
        refrigerator = connection.execute(
            text(
                "SELECT setup_status, setup_draft FROM refrigerators WHERE id = 'legacy'"
            )
        ).mappings().one()
        pairing = connection.execute(
            text("SELECT purpose FROM pairing_sessions WHERE id = 'pairing'")
        ).scalar_one()
        bootstrap = connection.execute(
            text(
                "SELECT purpose, target_refrigerator_id "
                "FROM first_boot_pairing_sessions WHERE id = 'bootstrap'"
            )
        ).mappings().one()
        passcode = connection.execute(
            text("SELECT purpose FROM kindle_passcodes WHERE id = 'passcode'")
        ).scalar_one()

    assert refrigerator == {"setup_status": "ready", "setup_draft": None}
    assert pairing == "grant_pwa_access"
    assert bootstrap == {"purpose": "bind_display_device", "target_refrigerator_id": None}
    assert passcode == "bind_display_device"

    invalid_updates = (
        "UPDATE refrigerators SET setup_status = 'in_progress'",
        "UPDATE refrigerators SET setup_draft = '{}'",
        "UPDATE pairing_sessions SET purpose = 'bind_display_device'",
        "UPDATE kindle_passcodes SET purpose = 'grant_pwa_access'",
        "UPDATE first_boot_pairing_sessions SET purpose = 'grant_pwa_access'",
    )
    engine = create_engine(database_url)
    for invalid_update in invalid_updates:
        with engine.begin() as connection, pytest.raises(IntegrityError):
            connection.execute(text(invalid_update))


def test_model_constraints_reject_ready_draft() -> None:
    """模型创建的数据库同样阻止非法设置状态。"""
    engine = create_database_engine("sqlite://")
    Base.metadata.create_all(engine)
    refrigerator = Refrigerator(owner_user_id="owner", name="厨房冰箱", template_key="mini")
    with Session(engine) as session:
        session.add(refrigerator)
        session.flush()
        refrigerator_id = refrigerator.id
        session.commit()

    with Session(engine) as session, pytest.raises(IntegrityError):
        persisted = session.get(Refrigerator, refrigerator_id)
        assert persisted is not None
        persisted.setup_status = "ready"
        persisted.setup_draft = {"zones": {}}
        session.flush()
