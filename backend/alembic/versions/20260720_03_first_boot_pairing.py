"""创建 Kindle 首次开机二维码配对会话。

Revision ID: 20260720_03
Revises: 20260719_02
Create Date: 2026-07-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260720_03"
down_revision: str | None = "20260719_02"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """创建手机与 Kindle 分持令牌的首次开机短效会话表。"""
    op.create_table(
        "first_boot_pairing_sessions",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("mobile_token_hash", sa.String(length=64), nullable=False),
        sa.Column("kindle_token_hash", sa.String(length=64), nullable=False),
        sa.Column("refrigerator_id", sa.String(length=32), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("kindle_bound_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["refrigerator_id"], ["refrigerators.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("kindle_token_hash"),
        sa.UniqueConstraint("mobile_token_hash"),
    )
    op.create_index(
        "ix_first_boot_pairing_sessions_expires_at",
        "first_boot_pairing_sessions",
        ["expires_at"],
    )
    op.create_index(
        "ix_first_boot_pairing_sessions_refrigerator_id",
        "first_boot_pairing_sessions",
        ["refrigerator_id"],
    )


def downgrade() -> None:
    """移除首次开机配对会话表。"""
    op.drop_index("ix_first_boot_pairing_sessions_refrigerator_id")
    op.drop_index("ix_first_boot_pairing_sessions_expires_at")
    op.drop_table("first_boot_pairing_sessions")
