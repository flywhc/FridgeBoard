"""Store the upstream login email for account display."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260828_28"
down_revision: str | None = "20260826_27"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Add optional display email fields without changing ownership IDs."""
    with op.batch_alter_table("owner_sessions") as batch_op:
        batch_op.add_column(sa.Column("owner_email", sa.String(length=255), nullable=True))
    with op.batch_alter_table("mobile_authorization_codes") as batch_op:
        batch_op.add_column(sa.Column("owner_email", sa.String(length=255), nullable=True))
    with op.batch_alter_table("mobile_sessions") as batch_op:
        batch_op.add_column(sa.Column("owner_email", sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Remove account display email fields while preserving ownership IDs."""
    with op.batch_alter_table("mobile_sessions") as batch_op:
        batch_op.drop_column("owner_email")
    with op.batch_alter_table("mobile_authorization_codes") as batch_op:
        batch_op.drop_column("owner_email")
    with op.batch_alter_table("owner_sessions") as batch_op:
        batch_op.drop_column("owner_email")
