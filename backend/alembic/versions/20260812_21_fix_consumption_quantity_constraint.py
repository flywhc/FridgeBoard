"""Allow fractional quantities in recipe completion audit rows."""

from collections.abc import Sequence

from alembic import op

revision: str = "20260812_21"
down_revision: str | None = "20260812_20"
branch_labels: Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Replace the legacy integer-only consumption quantity constraint."""
    with op.batch_alter_table("consumption_lines") as batch_op:
        batch_op.drop_constraint("ck_consumption_line_quantity", type_="check")
        batch_op.create_check_constraint(
            "ck_consumption_line_quantity", "quantity >= 0.01"
        )


def downgrade() -> None:
    """Restore the integer-only consumption quantity constraint."""
    with op.batch_alter_table("consumption_lines") as batch_op:
        batch_op.drop_constraint("ck_consumption_line_quantity", type_="check")
        batch_op.create_check_constraint("ck_consumption_line_quantity", "quantity >= 1")
