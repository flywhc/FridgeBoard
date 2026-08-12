"""Allow two-decimal quantities across inventory and recipe flows."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260812_20"
down_revision: str | None = "20260812_19"
branch_labels: Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Convert user-editable quantity columns to fixed two-decimal numbers."""
    tables = (
        "inventory_batches",
        "recipe_ingredients",
        "consumption_lines",
        "custom_shopping_items",
    )
    for table in tables:
        with op.batch_alter_table(table) as batch_op:
            batch_op.alter_column("quantity", existing_type=sa.Integer(), type_=sa.Numeric(12, 2))
    with op.batch_alter_table("recipe_ingredients") as batch_op:
        batch_op.drop_constraint("ck_recipe_ingredient_quantity", type_="check")
        batch_op.create_check_constraint(
            "ck_recipe_ingredient_quantity", "quantity >= 0.01"
        )


def downgrade() -> None:
    """Convert quantity columns back to integers for older application code."""
    tables = (
        "inventory_batches",
        "recipe_ingredients",
        "consumption_lines",
        "custom_shopping_items",
    )
    for table in tables:
        with op.batch_alter_table(table) as batch_op:
            batch_op.alter_column("quantity", existing_type=sa.Numeric(12, 2), type_=sa.Integer())
    with op.batch_alter_table("recipe_ingredients") as batch_op:
        batch_op.drop_constraint("ck_recipe_ingredient_quantity", type_="check")
        batch_op.create_check_constraint("ck_recipe_ingredient_quantity", "quantity >= 1")
