"""Add optional notes to recipe entries."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260802_11"
down_revision: str | None = "20260801_10"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Add the nullable recipe note column."""
    with op.batch_alter_table("recipe_entries") as batch_op:
        batch_op.add_column(sa.Column("note", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    """Remove the optional recipe note column."""
    with op.batch_alter_table("recipe_entries") as batch_op:
        batch_op.drop_column("note")
