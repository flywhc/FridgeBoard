"""Refactor food inventory into generic item subcategories and icon assets.

Revision ID: 20260801_09
Revises: 20260730_08
Create Date: 2026-08-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260801_09"
down_revision: str | None = "20260730_08"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Add data-driven catalog assets and persist inventory by subcategory only."""
    with op.batch_alter_table("food_categories") as batch_op:
        batch_op.add_column(
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0")
        )

    op.create_table(
        "item_catalog_legacy_parentage",
        sa.Column("category_id", sa.String(length=32), primary_key=True),
        sa.Column("parent_id", sa.String(length=32)),
    )
    op.execute(
        sa.text(
            "INSERT INTO item_catalog_legacy_parentage (category_id, parent_id) "
            "SELECT id, parent_id FROM food_categories"
        )
    )

    category_table = sa.table(
        "food_categories",
        sa.column("id", sa.String()),
        sa.column("refrigerator_id", sa.String()),
        sa.column("parent_id", sa.String()),
        sa.column("name", sa.String()),
        sa.column("icon_key", sa.String()),
        sa.column("is_custom", sa.Boolean()),
        sa.column("display_order", sa.Integer()),
    )
    groups = [
        ("builtin-group-meat-protein", "肉蛋奶鱼"),
        ("builtin-group-produce", "果蔬豆腐"),
        ("builtin-group-prepared-staples", "熟食主食"),
        ("builtin-group-pantry", "粮油酱料"),
        ("builtin-group-drinks", "酒水饮料"),
        ("builtin-group-snacks", "点心零食"),
        ("builtin-group-personal-care", "个护美妆"),
        ("builtin-group-cleaning", "家庭清洁"),
    ]
    op.bulk_insert(
        category_table,
        [
            {
                "id": group_id,
                "refrigerator_id": None,
                "parent_id": None,
                "name": name,
                "icon_key": None,
                "is_custom": False,
                "display_order": index,
            }
            for index, (group_id, name) in enumerate(groups)
        ],
    )
    parent_groups = {
        "builtin-category-egg": "builtin-group-meat-protein",
        "builtin-category-dairy": "builtin-group-meat-protein",
        "builtin-category-meat": "builtin-group-meat-protein",
        "builtin-category-pork": "builtin-group-meat-protein",
        "builtin-category-beef": "builtin-group-meat-protein",
        "builtin-category-lamb": "builtin-group-meat-protein",
        "builtin-category-seafood": "builtin-group-meat-protein",
        "builtin-category-vegetable": "builtin-group-produce",
        "builtin-category-fruit": "builtin-group-produce",
        "builtin-category-onion-ginger": "builtin-group-produce",
        "builtin-category-sausage": "builtin-group-prepared-staples",
        "builtin-category-cooked-meat": "builtin-group-prepared-staples",
        "builtin-category-staple": "builtin-group-prepared-staples",
        "builtin-category-dry-goods": "builtin-group-pantry",
        "builtin-category-condiment": "builtin-group-pantry",
        "builtin-category-other": "builtin-group-pantry",
        "builtin-category-drink": "builtin-group-drinks",
        "builtin-category-dessert": "builtin-group-snacks",
        "builtin-category-baking": "builtin-group-snacks",
        "builtin-category-nuts": "builtin-group-snacks",
    }
    for old_parent_id, group_id in parent_groups.items():
        op.execute(
            sa.text("UPDATE food_categories SET parent_id = :group_id WHERE parent_id = :old_id")
            .bindparams(group_id=group_id, old_id=old_parent_id)
        )
        op.execute(
            sa.text("UPDATE food_categories SET parent_id = :group_id WHERE id = :old_id")
            .bindparams(group_id=group_id, old_id=old_parent_id)
        )

    op.create_table(
        "icon_assets",
        sa.Column("key", sa.String(length=160), primary_key=True),
        sa.Column("refrigerator_id", sa.String(length=32), sa.ForeignKey("refrigerators.id")),
        sa.Column("label", sa.String(length=80), nullable=False),
        sa.Column("media_type", sa.String(length=40), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_icon_assets_refrigerator_id", "icon_assets", ["refrigerator_id"])
    op.create_table(
        "recent_subcategory_usage",
        sa.Column(
            "refrigerator_id",
            sa.String(length=32),
            sa.ForeignKey("refrigerators.id"),
            primary_key=True,
        ),
        sa.Column(
            "subcategory_id",
            sa.String(length=32),
            sa.ForeignKey("food_categories.id"),
            primary_key=True,
        ),
        sa.Column("last_added_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_recent_subcategory_usage_last_added_at",
        "recent_subcategory_usage",
        ["last_added_at"],
    )
    op.create_table(
        "icon_generation_sessions",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "refrigerator_id",
            sa.String(length=32),
            sa.ForeignKey("refrigerators.id"),
            nullable=False,
        ),
        sa.Column("subcategory_name", sa.String(length=80), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_icon_generation_sessions_refrigerator_id",
        "icon_generation_sessions",
        ["refrigerator_id"],
    )
    op.create_index(
        "ix_icon_generation_sessions_expires_at",
        "icon_generation_sessions",
        ["expires_at"],
    )
    op.create_table(
        "icon_generation_candidates",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(length=32),
            sa.ForeignKey("icon_generation_sessions.id"),
            nullable=False,
        ),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
    )
    op.create_index(
        "ix_icon_generation_candidates_session_id",
        "icon_generation_candidates",
        ["session_id"],
    )

    with op.batch_alter_table("inventory_batches") as batch_op:
        batch_op.add_column(sa.Column("item_name", sa.String(length=160), nullable=True))
    op.execute(sa.text("UPDATE inventory_batches SET item_name = food_name"))
    with op.batch_alter_table("inventory_batches") as batch_op:
        batch_op.alter_column("item_name", existing_type=sa.String(length=160), nullable=False)
        batch_op.drop_index("ix_inventory_batches_category_id")
        batch_op.drop_column("category_id")
        batch_op.drop_column("food_name")

    op.drop_table("category_location_preferences")


def downgrade() -> None:
    """Restore the legacy inventory columns and remove catalog asset tables."""
    op.create_table(
        "category_location_preferences",
        sa.Column(
            "refrigerator_id",
            sa.String(length=32),
            sa.ForeignKey("refrigerators.id"),
            primary_key=True,
        ),
        sa.Column(
            "category_id",
            sa.String(length=32),
            sa.ForeignKey("food_categories.id"),
            primary_key=True,
        ),
        sa.Column(
            "storage_slot_id",
            sa.String(length=32),
            sa.ForeignKey("storage_slots.id"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    with op.batch_alter_table("inventory_batches") as batch_op:
        batch_op.add_column(sa.Column("food_name", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("category_id", sa.String(length=32), nullable=True))
    op.execute(sa.text("UPDATE inventory_batches SET food_name = item_name"))
    op.execute(
        sa.text(
            "UPDATE inventory_batches SET category_id = CASE "
            "WHEN EXISTS (SELECT 1 FROM item_catalog_legacy_parentage legacy "
            "WHERE legacy.category_id = inventory_batches.subcategory_id) "
            "THEN (SELECT legacy.parent_id FROM item_catalog_legacy_parentage legacy "
            "WHERE legacy.category_id = inventory_batches.subcategory_id) "
            "ELSE 'builtin-category-other' END"
        )
    )
    with op.batch_alter_table("inventory_batches") as batch_op:
        batch_op.alter_column("food_name", existing_type=sa.String(length=160), nullable=False)
        batch_op.create_index("ix_inventory_batches_category_id", ["category_id"])
        batch_op.drop_column("item_name")

    op.drop_index(
        "ix_icon_generation_candidates_session_id", table_name="icon_generation_candidates"
    )
    op.drop_table("icon_generation_candidates")
    op.drop_index("ix_icon_generation_sessions_expires_at", table_name="icon_generation_sessions")
    op.drop_index(
        "ix_icon_generation_sessions_refrigerator_id", table_name="icon_generation_sessions"
    )
    op.drop_table("icon_generation_sessions")
    op.drop_index(
        "ix_recent_subcategory_usage_last_added_at", table_name="recent_subcategory_usage"
    )
    op.drop_table("recent_subcategory_usage")
    op.drop_index("ix_icon_assets_refrigerator_id", table_name="icon_assets")
    op.drop_table("icon_assets")
    group_ids = (
        "builtin-group-meat-protein",
        "builtin-group-produce",
        "builtin-group-prepared-staples",
        "builtin-group-pantry",
        "builtin-group-drinks",
        "builtin-group-snacks",
        "builtin-group-personal-care",
        "builtin-group-cleaning",
    )
    quoted_ids = ", ".join(f"'{group_id}'" for group_id in group_ids)
    op.execute(
        sa.text(
            "UPDATE food_categories SET parent_id = 'builtin-category-other' "
            "WHERE id NOT IN (SELECT category_id FROM item_catalog_legacy_parentage) "
            f"AND parent_id IN ({quoted_ids})"
        )
    )
    op.execute(
        sa.text(
            "UPDATE food_categories SET parent_id = "
            "(SELECT legacy.parent_id FROM item_catalog_legacy_parentage legacy "
            "WHERE legacy.category_id = food_categories.id) "
            "WHERE id IN (SELECT category_id FROM item_catalog_legacy_parentage)"
        )
    )
    op.execute(
        sa.text(
            "DELETE FROM food_categories "
            "WHERE is_custom = 1 AND parent_id IS NULL "
            "AND id NOT IN (SELECT category_id FROM item_catalog_legacy_parentage)"
        )
    )
    op.execute(sa.text(f"DELETE FROM food_categories WHERE id IN ({quoted_ids})"))
    op.drop_table("item_catalog_legacy_parentage")
    with op.batch_alter_table("food_categories") as batch_op:
        batch_op.drop_column("display_order")
