"""Backfill the first 16 recent subcategories for existing refrigerators."""

from collections.abc import Sequence
from datetime import datetime, timedelta

import sqlalchemy as sa
from alembic import op

revision: str = "20260805_12"
down_revision: str | None = "20260802_11"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_LIMIT = 16


def upgrade() -> None:
    """Mark bootstrap records and backfill missing records for existing refrigerators."""
    with op.batch_alter_table("recent_subcategory_usage") as batch_op:
        batch_op.add_column(
            sa.Column("is_bootstrap", sa.Boolean(), nullable=False, server_default=sa.false())
        )

    connection = op.get_bind()
    refrigerator_ids = connection.execute(
        sa.text("SELECT id FROM refrigerators ORDER BY created_at, id")
    ).scalars()
    category_query = sa.text(
        "SELECT child.id, child.icon_key, child.display_order, child.name, "
        "parent.display_order AS parent_order "
        "FROM food_categories AS child "
        "JOIN food_categories AS parent ON parent.id = child.parent_id "
        "WHERE child.parent_id IS NOT NULL "
        "AND (child.refrigerator_id IS NULL OR child.refrigerator_id = :refrigerator_id) "
        "AND child.name != '面条' "
        "ORDER BY parent.display_order, child.display_order, child.name, child.id"
    )
    usage_query = sa.text(
        "SELECT subcategory_id FROM recent_subcategory_usage "
        "WHERE refrigerator_id = :refrigerator_id ORDER BY last_added_at DESC"
    )
    insert_usage = sa.text(
        "INSERT INTO recent_subcategory_usage "
        "(refrigerator_id, subcategory_id, last_added_at, is_bootstrap) "
        "VALUES (:refrigerator_id, :subcategory_id, :last_added_at, 1)"
    )
    seed_timestamp = datetime(1970, 1, 1)
    for refrigerator_id in refrigerator_ids:
        categories = connection.execute(
            category_query, {"refrigerator_id": refrigerator_id}
        ).mappings().all()
        categories_by_id = {item["id"]: item for item in categories}
        recent_ids = list(
            connection.execute(usage_query, {"refrigerator_id": refrigerator_id}).scalars()
        )
        existing_ids = set(recent_ids)
        seen_icons = {
            (categories_by_id[item_id]["icon_key"] or item_id)
            for item_id in recent_ids
            if item_id in categories_by_id
        }
        seed_index = 0
        for item in categories:
            if len(seen_icons) >= _LIMIT:
                break
            icon_key = item["icon_key"] or item["id"]
            if item["id"] in existing_ids or icon_key in seen_icons:
                continue
            connection.execute(
                insert_usage,
                {
                    "refrigerator_id": refrigerator_id,
                    "subcategory_id": item["id"],
                    "last_added_at": seed_timestamp - timedelta(microseconds=seed_index),
                },
            )
            existing_ids.add(item["id"])
            seen_icons.add(icon_key)
            seed_index += 1


def downgrade() -> None:
    """Remove only bootstrap records and the marker added by this migration."""
    op.execute(sa.text("DELETE FROM recent_subcategory_usage WHERE is_bootstrap = 1"))
    with op.batch_alter_table("recent_subcategory_usage") as batch_op:
        batch_op.drop_column("is_bootstrap")
