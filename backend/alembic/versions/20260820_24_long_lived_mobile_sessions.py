"""Make mobile refresh sessions long-lived and retry-safe."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260820_24"
down_revision: str | None = "20260814_23"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Remove the fixed refresh deadline from existing App sessions."""
    with op.batch_alter_table("mobile_sessions") as batch_op:
        batch_op.alter_column(
            "refresh_expires_at",
            existing_type=sa.DateTime(),
            nullable=True,
        )
    op.execute(sa.text("UPDATE mobile_sessions SET refresh_expires_at = NULL"))


def downgrade() -> None:
    """Restore a finite deadline for sessions created before downgrade."""
    op.execute(
        sa.text(
            "UPDATE mobile_sessions "
            "SET refresh_expires_at = CURRENT_TIMESTAMP "
            "WHERE refresh_expires_at IS NULL"
        )
    )
    with op.batch_alter_table("mobile_sessions") as batch_op:
        batch_op.alter_column(
            "refresh_expires_at",
            existing_type=sa.DateTime(),
            nullable=False,
        )
