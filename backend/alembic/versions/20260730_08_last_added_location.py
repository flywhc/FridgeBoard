"""Persist the refrigerator-wide default slot for the add-food dialog.

Revision ID: 20260730_08
Revises: 20260724_07
Create Date: 2026-07-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260730_08"
down_revision: str | None = "20260724_07"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Add the nullable last-added slot without changing existing category memory."""
    with op.batch_alter_table("refrigerators") as batch_op:
        batch_op.add_column(
            sa.Column("last_added_storage_slot_id", sa.String(length=32), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_refrigerators_last_added_storage_slot_id",
            "storage_slots",
            ["last_added_storage_slot_id"],
            ["id"],
        )


def downgrade() -> None:
    """Remove the refrigerator-wide default slot."""
    with op.batch_alter_table("refrigerators") as batch_op:
        batch_op.drop_constraint("fk_refrigerators_last_added_storage_slot_id", type_="foreignkey")
        batch_op.drop_column("last_added_storage_slot_id")
