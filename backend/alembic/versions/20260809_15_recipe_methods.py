"""Add optional methods to recipe entries."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260809_15"
down_revision: str | None = "20260808_14"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Add the nullable recipe method column."""
    with op.batch_alter_table("recipe_entries") as batch_op:
        batch_op.add_column(sa.Column("method", sa.String(length=2000), nullable=True))


def downgrade() -> None:
    """Remove the optional recipe method column."""
    with op.batch_alter_table("recipe_entries") as batch_op:
        batch_op.drop_column("method")
