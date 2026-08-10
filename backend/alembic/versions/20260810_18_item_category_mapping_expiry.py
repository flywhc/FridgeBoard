"""Add expiry timestamps to AI item classification cache entries."""

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from alembic import op

revision: str = "20260810_18"
down_revision: str | None = "20260810_17"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Add expiry metadata and start the lifetime of existing temporary AI mappings."""
    op.add_column(
        "item_category_mappings",
        sa.Column("expires_at", sa.DateTime(), nullable=True),
    )
    mapping = sa.table(
        "item_category_mappings",
        sa.column("source", sa.String()),
        sa.column("confirmed", sa.Boolean()),
        sa.column("expires_at", sa.DateTime()),
    )
    op.execute(
        mapping.update()
        .where(mapping.c.source == "ai", mapping.c.confirmed.is_(False))
        .values(
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=90)
        )
    )
    op.create_index(
        "ix_item_category_mappings_expires_at",
        "item_category_mappings",
        ["expires_at"],
    )


def downgrade() -> None:
    """Remove the AI mapping expiry column."""
    op.drop_index("ix_item_category_mappings_expires_at", table_name="item_category_mappings")
    op.drop_column("item_category_mappings", "expires_at")
