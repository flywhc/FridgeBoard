"""创建 P3 所有者会话与短效配对凭证。

Revision ID: 20260719_02
Revises: 20260719_01
Create Date: 2026-07-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260719_02"
down_revision: str | None = "20260719_01"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """创建服务端所有者会话、Kindle Passcode 和手机配对会话表。"""
    op.create_table(
        "owner_sessions",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("owner_user_id", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime()),
    )
    op.create_index("ix_owner_sessions_owner_user_id", "owner_sessions", ["owner_user_id"])
    op.create_index("ix_owner_sessions_expires_at", "owner_sessions", ["expires_at"])
    op.create_table(
        "kindle_passcodes",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("code_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("owner_user_id", sa.String(length=128), nullable=False),
        sa.Column("refrigerator_id", sa.String(length=32), sa.ForeignKey("refrigerators.id")),
        sa.Column("new_refrigerator_name", sa.String(length=120)),
        sa.Column("new_template_key", sa.String(length=64)),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime()),
    )
    op.create_index("ix_kindle_passcodes_owner_user_id", "kindle_passcodes", ["owner_user_id"])
    op.create_index("ix_kindle_passcodes_expires_at", "kindle_passcodes", ["expires_at"])
    op.create_table(
        "pairing_sessions",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column(
            "refrigerator_id",
            sa.String(length=32),
            sa.ForeignKey("refrigerators.id"),
            nullable=False,
        ),
        sa.Column(
            "kindle_device_id",
            sa.String(length=32),
            sa.ForeignKey("device_credentials.id"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime()),
    )
    op.create_index("ix_pairing_sessions_refrigerator_id", "pairing_sessions", ["refrigerator_id"])
    op.create_index("ix_pairing_sessions_expires_at", "pairing_sessions", ["expires_at"])


def downgrade() -> None:
    """按依赖反向删除 P3 访问控制表。"""
    op.drop_table("pairing_sessions")
    op.drop_table("kindle_passcodes")
    op.drop_table("owner_sessions")
