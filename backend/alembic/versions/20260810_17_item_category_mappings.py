"""Add the refrigerator-scoped item classification cache."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260810_17"
down_revision: str | None = "20260810_16"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Create the cache used by deterministic and AI category matching."""
    op.create_table(
        "item_category_mappings",
        sa.Column("refrigerator_id", sa.String(length=32), nullable=False),
        sa.Column("normalized_item_name", sa.String(length=160), nullable=False),
        sa.Column("display_item_name", sa.String(length=160), nullable=False),
        sa.Column("subcategory_id", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("confirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("model_name", sa.String(length=80), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["refrigerator_id"], ["refrigerators.id"]),
        sa.ForeignKeyConstraint(["subcategory_id"], ["food_categories.id"]),
        sa.PrimaryKeyConstraint("refrigerator_id", "normalized_item_name"),
    )
    op.create_index(
        "ix_item_category_mappings_subcategory_id",
        "item_category_mappings",
        ["subcategory_id"],
    )


def downgrade() -> None:
    """Remove the item classification cache."""
    op.drop_index("ix_item_category_mappings_subcategory_id", table_name="item_category_mappings")
    op.drop_table("item_category_mappings")
