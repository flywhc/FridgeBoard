"""Add the cross-refrigerator item classification cache."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260814_22"
down_revision: str | None = "20260812_21"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Create the cache for mappings that point to built-in subcategories."""
    op.create_table(
        "global_item_category_mappings",
        sa.Column("normalized_item_name", sa.String(length=160), nullable=False),
        sa.Column("display_item_name", sa.String(length=160), nullable=False),
        sa.Column("subcategory_id", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("confirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("model_name", sa.String(length=80), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["subcategory_id"], ["food_categories.id"]),
        sa.PrimaryKeyConstraint("normalized_item_name"),
    )
    op.create_index(
        "ix_global_item_category_mappings_subcategory_id",
        "global_item_category_mappings",
        ["subcategory_id"],
    )
    op.create_index(
        "ix_global_item_category_mappings_expires_at",
        "global_item_category_mappings",
        ["expires_at"],
    )
    op.execute(
        sa.text(
            """
            INSERT OR IGNORE INTO global_item_category_mappings (
                normalized_item_name, display_item_name, subcategory_id, source,
                confidence, confirmed, model_name, expires_at, hit_count,
                created_at, updated_at
            )
            SELECT mapping.normalized_item_name, mapping.display_item_name,
                   mapping.subcategory_id, mapping.source, mapping.confidence,
                   mapping.confirmed, mapping.model_name, mapping.expires_at,
                   mapping.hit_count, mapping.created_at, mapping.updated_at
            FROM item_category_mappings AS mapping
            JOIN food_categories AS category ON category.id = mapping.subcategory_id
            WHERE category.refrigerator_id IS NULL
            ORDER BY mapping.confirmed DESC, mapping.confidence DESC, mapping.updated_at DESC
            """
        )
    )


def downgrade() -> None:
    """Remove the cross-refrigerator classification cache."""
    op.drop_index(
        "ix_global_item_category_mappings_expires_at",
        table_name="global_item_category_mappings",
    )
    op.drop_index(
        "ix_global_item_category_mappings_subcategory_id",
        table_name="global_item_category_mappings",
    )
    op.drop_table("global_item_category_mappings")
