"""Add refrigerator-scoped custom shopping list items."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260812_19"
down_revision: str | None = "20260810_18"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Create the table used by manually maintained shopping items."""
    op.create_table(
        "custom_shopping_items",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("refrigerator_id", sa.String(length=32), nullable=False),
        sa.Column("item_name", sa.String(length=160), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("quantity >= 1", name="ck_custom_shopping_quantity"),
        sa.ForeignKeyConstraint(["refrigerator_id"], ["refrigerators.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_custom_shopping_items_refrigerator_id",
        "custom_shopping_items",
        ["refrigerator_id"],
    )


def downgrade() -> None:
    """Remove manually maintained shopping list items."""
    op.drop_index(
        "ix_custom_shopping_items_refrigerator_id", table_name="custom_shopping_items"
    )
    op.drop_table("custom_shopping_items")
