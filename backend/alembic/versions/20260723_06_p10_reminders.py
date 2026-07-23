"""Persist P10 notification preferences, delivery audit and display synchronization.

Revision ID: 20260723_06
Revises: 20260723_05
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260723_06"
down_revision: str | None = "20260723_05"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Create the P10 persistence boundary without altering existing reminder rules."""
    with op.batch_alter_table("device_credentials") as batch_op:
        batch_op.add_column(sa.Column("last_successful_sync_at", sa.DateTime(), nullable=True))
    op.create_index(
        "ix_device_credentials_last_successful_sync_at",
        "device_credentials",
        ["last_successful_sync_at"],
    )
    op.create_table(
        "notification_settings",
        sa.Column("refrigerator_id", sa.String(length=32), nullable=False),
        sa.Column("recipient_key", sa.String(length=80), nullable=False),
        sa.Column("daily_reminder_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("reminder_time", sa.String(length=5), nullable=False, server_default="20:00"),
        sa.Column("device_health_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(["refrigerator_id"], ["refrigerators.id"]),
        sa.PrimaryKeyConstraint("refrigerator_id", "recipient_key"),
    )
    op.create_table(
        "notification_deliveries",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("refrigerator_id", sa.String(length=32), nullable=False),
        sa.Column("recipient_key", sa.String(length=80), nullable=False),
        sa.Column("notification_kind", sa.String(length=40), nullable=False),
        sa.Column("notification_date", sa.Date(), nullable=False),
        sa.Column("delivered_at", sa.DateTime(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["refrigerator_id"], ["refrigerators.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "refrigerator_id", "recipient_key", "notification_kind", "notification_date"
        ),
    )
    op.create_index(
        "ix_notification_deliveries_refrigerator_id",
        "notification_deliveries",
        ["refrigerator_id"],
    )


def downgrade() -> None:
    """Remove only P10's new persistence structures."""
    op.drop_index(
        "ix_notification_deliveries_refrigerator_id", table_name="notification_deliveries"
    )
    op.drop_table("notification_deliveries")
    op.drop_table("notification_settings")
    op.drop_index(
        "ix_device_credentials_last_successful_sync_at", table_name="device_credentials"
    )
    with op.batch_alter_table("device_credentials") as batch_op:
        batch_op.drop_column("last_successful_sync_at")
