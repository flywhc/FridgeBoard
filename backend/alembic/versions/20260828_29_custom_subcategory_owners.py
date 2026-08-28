"""Record the creator of refrigerator custom subcategories.

Revision ID: 20260828_29
Revises: 20260828_28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260828_29"
down_revision: str | None = "20260828_28"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Add creator ownership and backfill existing refrigerator subcategories."""
    with op.batch_alter_table("food_categories") as batch_op:
        batch_op.add_column(sa.Column("created_by_user_id", sa.String(length=128), nullable=True))
        batch_op.create_index(
            "ix_food_categories_created_by_user_id", ["created_by_user_id"], unique=False
        )
    op.execute(
        sa.text(
            "UPDATE food_categories SET created_by_user_id = "
            "(SELECT owner_user_id FROM refrigerators "
            "WHERE refrigerators.id = food_categories.refrigerator_id) "
            "WHERE is_custom = 1 AND parent_id IS NOT NULL AND refrigerator_id IS NOT NULL"
        )
    )


def downgrade() -> None:
    """Remove creator ownership metadata."""
    with op.batch_alter_table("food_categories") as batch_op:
        batch_op.drop_index("ix_food_categories_created_by_user_id")
        batch_op.drop_column("created_by_user_id")
