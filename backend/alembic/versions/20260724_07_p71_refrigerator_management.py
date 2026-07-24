"""Add optimistic revisions for P7.1 refrigerator management.

Revision ID: 20260724_07
Revises: 20260723_06
Create Date: 2026-07-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260724_07"
down_revision: str | None = "20260723_06"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Add a non-null layout revision without changing existing refrigerators."""
    with op.batch_alter_table("refrigerators") as batch_op:
        batch_op.add_column(sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))


def downgrade() -> None:
    """Remove the P7.1 optimistic concurrency column."""
    with op.batch_alter_table("refrigerators") as batch_op:
        batch_op.drop_column("revision")
