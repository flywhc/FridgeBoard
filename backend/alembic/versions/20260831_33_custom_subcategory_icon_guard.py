"""Prevent new custom subcategories from being stored without a logical icon."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from fridgeboard.persistence.schema_guards import (
    custom_subcategory_icon_guard_ddl,
    drop_custom_subcategory_icon_guard_ddl,
)

revision: str = "20260831_33"
down_revision: str | None = "20260830_32"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

def upgrade() -> None:
    """Reject future custom subcategory writes without a logical icon key.

    Existing invalid rows remain readable so an owner can choose and bind a replacement
    icon through the normal editor before a later strict table constraint is introduced.
    """
    for statement in custom_subcategory_icon_guard_ddl():
        op.execute(sa.text(statement))


def downgrade() -> None:
    """Remove the custom subcategory icon guard triggers."""
    for statement in drop_custom_subcategory_icon_guard_ddl():
        op.execute(sa.text(statement))
