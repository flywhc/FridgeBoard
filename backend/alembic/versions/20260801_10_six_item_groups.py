"""Adjust the built-in navigation groups to the six-category catalog."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260801_10"
down_revision: str | None = "20260801_09"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Rename six groups, move dairy into snacks, and remove empty obsolete groups."""
    names = {
        "builtin-group-meat-protein": "肉蛋水产",
        "builtin-group-produce": "水果蔬菜",
        "builtin-group-prepared-staples": "熟肉主食",
        "builtin-group-pantry": "粮油酱料",
        "builtin-group-drinks": "酒水饮料",
        "builtin-group-snacks": "点心奶品",
    }
    for group_id, name in names.items():
        op.execute(
            sa.text("UPDATE food_categories SET name = :name WHERE id = :group_id").bindparams(
                name=name, group_id=group_id
            )
        )
    op.execute(
        sa.text(
            "UPDATE food_categories SET parent_id = 'builtin-group-snacks' "
            "WHERE id IN ('builtin-category-dairy', 'builtin-milk')"
        )
    )
    op.execute(
        sa.text(
            "DELETE FROM food_categories WHERE id IN "
            "('builtin-group-personal-care', 'builtin-group-cleaning') "
            "AND NOT EXISTS (SELECT 1 FROM food_categories child "
            "WHERE child.parent_id = food_categories.id)"
        )
    )


def downgrade() -> None:
    """Restore the previous eight group names and dairy placement."""
    for group_id, name, display_order in (
        ("builtin-group-personal-care", "个护美妆", 6),
        ("builtin-group-cleaning", "家庭清洁", 7),
    ):
        op.execute(
            sa.text(
                "INSERT INTO food_categories "
                "(id, refrigerator_id, parent_id, name, icon_key, is_custom, display_order) "
                "SELECT :group_id, NULL, NULL, :name, NULL, 0, :display_order "
                "WHERE NOT EXISTS "
                "(SELECT 1 FROM food_categories WHERE id = :group_id)"
            ).bindparams(group_id=group_id, name=name, display_order=display_order)
        )
    old_names = {
        "builtin-group-meat-protein": "肉蛋奶鱼",
        "builtin-group-produce": "果蔬豆腐",
        "builtin-group-prepared-staples": "熟食主食",
        "builtin-group-pantry": "粮油酱料",
        "builtin-group-drinks": "酒水饮料",
        "builtin-group-snacks": "点心零食",
    }
    for group_id, name in old_names.items():
        op.execute(
            sa.text("UPDATE food_categories SET name = :name WHERE id = :group_id").bindparams(
                name=name, group_id=group_id
            )
        )
    op.execute(
        sa.text(
            "UPDATE food_categories SET parent_id = 'builtin-group-meat-protein' "
            "WHERE id IN ('builtin-category-dairy', 'builtin-milk')"
        )
    )
