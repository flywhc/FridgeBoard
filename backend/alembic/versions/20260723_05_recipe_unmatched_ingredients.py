"""保留未匹配食谱食材的原始名称。

Revision ID: 20260723_05
Revises: 20260722_04
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260723_05"
down_revision: str | None = "20260722_04"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """允许未匹配食材先入库，供用户在单日编辑页改正。"""
    with op.batch_alter_table("recipe_ingredients") as batch_op:
        batch_op.add_column(sa.Column("raw_name", sa.String(length=80), nullable=True))
        batch_op.alter_column("subcategory_id", existing_type=sa.String(length=32), nullable=True)
    op.execute(
        """
        UPDATE recipe_ingredients
        SET raw_name = COALESCE(
            (
                SELECT name FROM food_categories
                WHERE food_categories.id = recipe_ingredients.subcategory_id
            ),
            subcategory_id
        )
        WHERE raw_name IS NULL
        """
    )
    with op.batch_alter_table("recipe_ingredients") as batch_op:
        batch_op.alter_column("raw_name", existing_type=sa.String(length=80), nullable=False)


def downgrade() -> None:
    """回退前要求所有食材都已重新匹配到小类。"""
    bind = op.get_bind()
    unmatched = bind.execute(
        sa.text("SELECT COUNT(*) FROM recipe_ingredients WHERE subcategory_id IS NULL")
    ).scalar_one()
    if unmatched:
        raise RuntimeError("存在未匹配食材，不能回退 P9 食谱迁移")
    with op.batch_alter_table("recipe_ingredients") as batch_op:
        batch_op.alter_column("subcategory_id", existing_type=sa.String(length=32), nullable=False)
        batch_op.drop_column("raw_name")
