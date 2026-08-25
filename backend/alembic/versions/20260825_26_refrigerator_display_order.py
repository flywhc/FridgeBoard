"""Persist the owner-defined refrigerator list order."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260825_26"
down_revision: str | None = "20260825_25"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Add a stable display order; existing rows retain the previous name ordering."""
    with op.batch_alter_table("refrigerators") as batch_op:
        batch_op.add_column(
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0")
        )


def downgrade() -> None:
    """Remove the persisted refrigerator display order."""
    with op.batch_alter_table("refrigerators") as batch_op:
        batch_op.drop_column("display_order")
