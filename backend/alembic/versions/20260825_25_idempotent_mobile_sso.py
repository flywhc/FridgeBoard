"""Persist enough mobile SSO state to recover duplicate browser callbacks."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260825_25"
down_revision: str | None = "20260820_24"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Store the upstream SSO fingerprint and App state for callback replay."""
    with op.batch_alter_table("mobile_authorization_codes") as batch_op:
        batch_op.add_column(sa.Column("sso_code_hash", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("sso_state", sa.String(length=256), nullable=True))
        batch_op.add_column(sa.Column("mobile_state", sa.String(length=256), nullable=True))
    op.create_index(
        "ix_mobile_authorization_codes_sso_code_hash",
        "mobile_authorization_codes",
        ["sso_code_hash"],
        unique=True,
    )


def downgrade() -> None:
    """Remove duplicate callback recovery fields."""
    op.drop_index(
        "ix_mobile_authorization_codes_sso_code_hash",
        table_name="mobile_authorization_codes",
    )
    with op.batch_alter_table("mobile_authorization_codes") as batch_op:
        batch_op.drop_column("mobile_state")
        batch_op.drop_column("sso_state")
        batch_op.drop_column("sso_code_hash")
