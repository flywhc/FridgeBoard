"""Add optional prices to inventory batches."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260808_14"
down_revision: str | None = "20260807_13"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Add a nullable two-decimal price to each inventory batch."""
    with op.batch_alter_table("inventory_batches") as batch_op:
        batch_op.add_column(sa.Column("price", sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    """Remove inventory batch prices."""
    with op.batch_alter_table("inventory_batches") as batch_op:
        batch_op.drop_column("price")
