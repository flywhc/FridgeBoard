"""为自定义购物项增加可选的小类归属。"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260829_30"
down_revision: str | None = "20260828_29"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """允许手工维护的购物项保存匹配到的小类。"""
    with op.batch_alter_table("custom_shopping_items") as batch_op:
        batch_op.add_column(sa.Column("subcategory_id", sa.String(length=32), nullable=True))
        batch_op.create_index(
            "ix_custom_shopping_items_subcategory_id", ["subcategory_id"], unique=False
        )
        batch_op.create_foreign_key(
            "fk_custom_shopping_items_subcategory_id",
            "food_categories",
            ["subcategory_id"],
            ["id"],
        )


def downgrade() -> None:
    """移除购物项的小类归属字段。"""
    with op.batch_alter_table("custom_shopping_items") as batch_op:
        batch_op.drop_constraint("fk_custom_shopping_items_subcategory_id", type_="foreignkey")
        batch_op.drop_index("ix_custom_shopping_items_subcategory_id")
        batch_op.drop_column("subcategory_id")
