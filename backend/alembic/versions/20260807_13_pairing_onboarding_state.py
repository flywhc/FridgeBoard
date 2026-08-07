"""持久化冰箱设置进度和配对会话用途。

Revision ID: 20260807_13
Revises: 20260805_12
Create Date: 2026-08-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260807_13"
down_revision: str | None = "20260805_12"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """添加显式设置状态，并以 ready 回填所有历史冰箱。"""
    with op.batch_alter_table("refrigerators") as batch_op:
        batch_op.add_column(
            sa.Column(
                "setup_status",
                sa.String(length=20),
                nullable=False,
                server_default="needs_layout",
            )
        )
        batch_op.add_column(sa.Column("setup_draft", sa.JSON(), nullable=True))
        batch_op.create_check_constraint(
            "ck_refrigerators_setup_status",
            "setup_status IN ('needs_layout', 'ready')",
        )
        batch_op.create_check_constraint(
            "ck_refrigerators_ready_without_draft",
            "setup_status = 'needs_layout' OR setup_draft IS NULL",
        )
    op.execute(sa.text("UPDATE refrigerators SET setup_status = 'ready', setup_draft = NULL"))

    with op.batch_alter_table("pairing_sessions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "purpose",
                sa.String(length=32),
                nullable=False,
                server_default="grant_pwa_access",
            )
        )
        batch_op.create_check_constraint(
            "ck_pairing_sessions_purpose",
            "purpose = 'grant_pwa_access'",
        )

    with op.batch_alter_table("kindle_passcodes") as batch_op:
        batch_op.add_column(
            sa.Column(
                "purpose",
                sa.String(length=32),
                nullable=False,
                server_default="bind_display_device",
            )
        )
        batch_op.create_check_constraint(
            "ck_kindle_passcodes_purpose",
            "purpose IN ('bind_display_device', 'replace_display_device')",
        )

    with op.batch_alter_table("first_boot_pairing_sessions") as batch_op:
        batch_op.add_column(
            sa.Column("target_refrigerator_id", sa.String(length=32), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_first_boot_pairing_sessions_target_refrigerator_id_refrigerators",
            "refrigerators",
            ["target_refrigerator_id"],
            ["id"],
        )
        batch_op.add_column(
            sa.Column(
                "purpose",
                sa.String(length=32),
                nullable=False,
                server_default="bind_display_device",
            )
        )
        batch_op.create_check_constraint(
            "ck_first_boot_pairing_sessions_purpose",
            "purpose IN ('bind_display_device', 'replace_display_device')",
        )
        batch_op.create_check_constraint(
            "ck_first_boot_pairing_sessions_target_matches_result",
            "target_refrigerator_id IS NULL OR refrigerator_id IS NULL "
            "OR target_refrigerator_id = refrigerator_id",
        )

def downgrade() -> None:
    """删除设置/草稿字段和新版配对用途字段。"""
    with op.batch_alter_table("first_boot_pairing_sessions") as batch_op:
        batch_op.drop_constraint("ck_first_boot_pairing_sessions_purpose", type_="check")
        batch_op.drop_constraint(
            "ck_first_boot_pairing_sessions_target_matches_result", type_="check"
        )
        batch_op.drop_constraint(
            "fk_first_boot_pairing_sessions_target_refrigerator_id_refrigerators",
            type_="foreignkey",
        )
        batch_op.drop_column("purpose")
        batch_op.drop_column("target_refrigerator_id")

    with op.batch_alter_table("pairing_sessions") as batch_op:
        batch_op.drop_constraint("ck_pairing_sessions_purpose", type_="check")
        batch_op.drop_column("purpose")

    with op.batch_alter_table("kindle_passcodes") as batch_op:
        batch_op.drop_constraint("ck_kindle_passcodes_purpose", type_="check")
        batch_op.drop_column("purpose")

    with op.batch_alter_table("refrigerators") as batch_op:
        batch_op.drop_constraint("ck_refrigerators_setup_status", type_="check")
        batch_op.drop_constraint("ck_refrigerators_ready_without_draft", type_="check")
        batch_op.drop_column("setup_draft")
        batch_op.drop_column("setup_status")
