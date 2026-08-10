"""Add optional user names to refrigerator storage slots."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260810_16"
down_revision: str | None = "20260809_15"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Add a nullable custom display name to each storage slot."""
    with op.batch_alter_table("storage_slots") as batch_op:
        batch_op.add_column(sa.Column("custom_name", sa.String(length=120), nullable=True))


def downgrade() -> None:
    """Remove custom storage slot display names."""
    with op.batch_alter_table("storage_slots") as batch_op:
        batch_op.drop_column("custom_name")
