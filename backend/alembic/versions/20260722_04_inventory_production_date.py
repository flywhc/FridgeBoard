"""持久化库存批次的生产日期。

Revision ID: 20260722_04
Revises: 20260720_03
Create Date: 2026-07-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260722_04"
down_revision: str | None = "20260720_03"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """为既有库存批次添加可选生产日期。"""
    with op.batch_alter_table("inventory_batches") as batch_op:
        batch_op.add_column(sa.Column("production_date", sa.Date(), nullable=True))


def downgrade() -> None:
    """移除生产日期列。"""
    with op.batch_alter_table("inventory_batches") as batch_op:
        batch_op.drop_column("production_date")
