"""Make custom categories and icon assets shared by all refrigerators of one owner.

Revision ID: 20260830_32
Revises: 20260830_31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260830_32"
down_revision: str | None = "20260830_31"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_CATEGORY_REFERENCE_COLUMNS = (
    ("inventory_batches", "subcategory_id"),
    ("recipe_ingredients", "subcategory_id"),
    ("custom_shopping_items", "subcategory_id"),
    ("item_category_mappings", "subcategory_id"),
    ("global_item_category_mappings", "subcategory_id"),
    ("icon_drafts", "category_id"),
)


def _reference_count(connection: sa.Connection, category_id: str) -> int:
    """Return the number of persisted business references to one category."""
    total = 0
    for table, column in _CATEGORY_REFERENCE_COLUMNS:
        total += int(
            connection.execute(
                sa.text(f"SELECT COUNT(*) FROM {table} WHERE {column} = :category_id"),
                {"category_id": category_id},
            ).scalar_one()
        )
    total += int(
        connection.execute(
            sa.text(
                "SELECT COUNT(*) FROM recent_subcategory_usage "
                "WHERE subcategory_id = :category_id"
            ),
            {"category_id": category_id},
        ).scalar_one()
    )
    return total


def _canonical_id(connection: sa.Connection, rows: list[sa.RowMapping]) -> str:
    """Choose the most edited and most referenced category as the canonical row."""
    return str(
        max(
            rows,
            key=lambda row: (
                int(row["revision"]),
                _reference_count(connection, str(row["id"])),
                str(row["id"]),
            ),
        )["id"]
    )


def _replace_category_references(
    connection: sa.Connection, duplicate_id: str, canonical_id: str
) -> None:
    """Rewrite all category foreign keys while preserving recent-usage uniqueness."""
    connection.execute(
        sa.text(
            "DELETE FROM recent_subcategory_usage AS duplicate "
            "WHERE duplicate.subcategory_id = :duplicate_id "
            "AND EXISTS (SELECT 1 FROM recent_subcategory_usage AS canonical "
            "WHERE canonical.refrigerator_id = duplicate.refrigerator_id "
            "AND canonical.subcategory_id = :canonical_id)"
        ),
        {"duplicate_id": duplicate_id, "canonical_id": canonical_id},
    )
    connection.execute(
        sa.text(
            "UPDATE recent_subcategory_usage SET subcategory_id = :canonical_id "
            "WHERE subcategory_id = :duplicate_id"
        ),
        {"duplicate_id": duplicate_id, "canonical_id": canonical_id},
    )
    for table, column in _CATEGORY_REFERENCE_COLUMNS:
        connection.execute(
            sa.text(
                f"UPDATE {table} SET {column} = :canonical_id "
                f"WHERE {column} = :duplicate_id"
            ),
            {"duplicate_id": duplicate_id, "canonical_id": canonical_id},
        )


def _merge_duplicate_categories(connection: sa.Connection, *, groups: bool) -> None:
    """Merge owner-level groups or subcategories after their parent IDs are canonical."""
    parent_predicate = "parent_id IS NULL" if groups else "parent_id IS NOT NULL"
    rows = list(
        connection.execute(
            sa.text(
                "SELECT id, owner_user_id, parent_id, name, revision "
                "FROM food_categories WHERE is_custom = 1 "
                f"AND owner_user_id IS NOT NULL AND {parent_predicate}"
            )
        ).mappings()
    )
    grouped: dict[tuple[str, str | None, str], list[sa.RowMapping]] = {}
    for row in rows:
        key = (str(row["owner_user_id"]), row["parent_id"], str(row["name"]))
        grouped.setdefault(key, []).append(row)
    for duplicates in grouped.values():
        if len(duplicates) < 2:
            continue
        canonical_id = _canonical_id(connection, duplicates)
        for row in duplicates:
            duplicate_id = str(row["id"])
            if duplicate_id == canonical_id:
                continue
            if groups:
                connection.execute(
                    sa.text(
                        "UPDATE food_categories SET parent_id = :canonical_id "
                        "WHERE parent_id = :duplicate_id"
                    ),
                    {"duplicate_id": duplicate_id, "canonical_id": canonical_id},
                )
                connection.execute(
                    sa.text(
                        "UPDATE icon_drafts SET parent_id = :canonical_id "
                        "WHERE parent_id = :duplicate_id"
                    ),
                    {"duplicate_id": duplicate_id, "canonical_id": canonical_id},
                )
            else:
                _replace_category_references(connection, duplicate_id, canonical_id)
            connection.execute(
                sa.text("DELETE FROM food_categories WHERE id = :duplicate_id"),
                {"duplicate_id": duplicate_id},
            )


def _reassign_fridge_scoped_round_cabbage(
    connection: sa.Connection, table: str, name_column: str
) -> None:
    """Point one refrigerator-scoped round-cabbage record set to the owner's kale category."""
    connection.execute(
        sa.text(
            f"UPDATE {table} SET subcategory_id = ("
            "SELECT category.id FROM food_categories AS category "
            "JOIN refrigerators AS refrigerator "
            "ON refrigerator.owner_user_id = category.owner_user_id "
            f"WHERE refrigerator.id = {table}.refrigerator_id "
            "AND category.name = '甘蓝' "
            "AND category.parent_id = 'builtin-group-produce' LIMIT 1) "
            f"WHERE TRIM({name_column}) = '圆白菜' AND EXISTS ("
            "SELECT 1 FROM food_categories AS category "
            "JOIN refrigerators AS refrigerator "
            "ON refrigerator.owner_user_id = category.owner_user_id "
            f"WHERE refrigerator.id = {table}.refrigerator_id "
            "AND category.name = '甘蓝' "
            "AND category.parent_id = 'builtin-group-produce')"
        )
    )


def _reassign_recipe_round_cabbage(connection: sa.Connection) -> None:
    """Point round-cabbage recipe ingredients to the recipe owner's kale category."""
    connection.execute(
        sa.text(
            "UPDATE recipe_ingredients SET subcategory_id = ("
            "SELECT category.id FROM food_categories AS category "
            "JOIN recipe_entries AS entry ON entry.id = recipe_ingredients.recipe_entry_id "
            "JOIN recipe_plans AS plan ON plan.id = entry.recipe_plan_id "
            "JOIN refrigerators AS refrigerator ON refrigerator.id = plan.refrigerator_id "
            "WHERE category.owner_user_id = refrigerator.owner_user_id "
            "AND category.name = '甘蓝' "
            "AND category.parent_id = 'builtin-group-produce' LIMIT 1) "
            "WHERE TRIM(raw_name) = '圆白菜' AND EXISTS ("
            "SELECT 1 FROM food_categories AS category "
            "JOIN recipe_entries AS entry ON entry.id = recipe_ingredients.recipe_entry_id "
            "JOIN recipe_plans AS plan ON plan.id = entry.recipe_plan_id "
            "JOIN refrigerators AS refrigerator ON refrigerator.id = plan.refrigerator_id "
            "WHERE category.owner_user_id = refrigerator.owner_user_id "
            "AND category.name = '甘蓝' "
            "AND category.parent_id = 'builtin-group-produce')"
        )
    )


def _repair_reported_category_semantics(connection: sa.Connection) -> None:
    """Repair the confirmed grain and round-cabbage category inconsistencies."""
    connection.execute(
        sa.text(
            "UPDATE food_categories SET parent_id = 'builtin-group-produce' "
            "WHERE owner_user_id IS NOT NULL AND name IN ('白菜', '甘蓝') "
            "AND EXISTS (SELECT 1 FROM food_categories AS parent "
            "WHERE parent.id = 'builtin-group-produce')"
        )
    )
    _merge_duplicate_categories(connection, groups=False)
    connection.execute(
        sa.text(
            "UPDATE food_categories SET icon_key = 'bean' "
            "WHERE owner_user_id IS NOT NULL AND name = '杂粮' AND icon_key IS NULL "
            "AND EXISTS (SELECT 1 FROM icon_assets WHERE key = 'bean')"
        )
    )
    for table, name_column in (
        ("inventory_batches", "item_name"),
        ("item_category_mappings", "normalized_item_name"),
        ("custom_shopping_items", "item_name"),
    ):
        _reassign_fridge_scoped_round_cabbage(connection, table, name_column)
    _reassign_recipe_round_cabbage(connection)


def upgrade() -> None:
    """Promote custom categories and icon assets to owner scope and merge old clones."""
    with op.batch_alter_table("food_categories") as batch_op:
        batch_op.add_column(sa.Column("owner_user_id", sa.String(length=128), nullable=True))
    with op.batch_alter_table("icon_assets") as batch_op:
        batch_op.add_column(sa.Column("owner_user_id", sa.String(length=128), nullable=True))

    connection = op.get_bind()
    connection.execute(
        sa.text(
            "UPDATE food_categories SET owner_user_id = "
            "(SELECT owner_user_id FROM refrigerators "
            "WHERE refrigerators.id = food_categories.refrigerator_id) "
            "WHERE is_custom = 1"
        )
    )
    connection.execute(
        sa.text(
            "UPDATE food_categories SET created_by_user_id = owner_user_id "
            "WHERE is_custom = 1 AND created_by_user_id IS NULL"
        )
    )
    connection.execute(
        sa.text(
            "UPDATE icon_assets SET owner_user_id = "
            "(SELECT owner_user_id FROM refrigerators "
            "WHERE refrigerators.id = icon_assets.refrigerator_id) "
            "WHERE source != 'builtin'"
        )
    )

    _merge_duplicate_categories(connection, groups=True)
    _merge_duplicate_categories(connection, groups=False)
    _repair_reported_category_semantics(connection)
    connection.execute(
        sa.text(
            "UPDATE icon_assets SET label = ("
            "SELECT MIN(category.name) FROM food_categories AS category "
            "WHERE category.icon_key = icon_assets.key) "
            "WHERE source != 'builtin' AND ("
            "SELECT COUNT(DISTINCT category.name) FROM food_categories AS category "
            "WHERE category.icon_key = icon_assets.key) = 1"
        )
    )

    with op.batch_alter_table("food_categories") as batch_op:
        batch_op.drop_index("ix_food_categories_refrigerator_id")
        batch_op.drop_column("refrigerator_id")
        batch_op.create_check_constraint(
            "ck_food_categories_owner_scope",
            "(is_custom = 0 AND owner_user_id IS NULL) OR "
            "(is_custom = 1 AND owner_user_id IS NOT NULL)",
        )
        batch_op.create_index("ix_food_categories_owner_user_id", ["owner_user_id"], unique=False)
    with op.batch_alter_table("icon_assets") as batch_op:
        batch_op.drop_index("ix_icon_assets_refrigerator_id")
        batch_op.drop_column("refrigerator_id")
        batch_op.create_check_constraint(
            "ck_icon_assets_owner_scope",
            "(source = 'builtin' AND owner_user_id IS NULL) OR "
            "(source != 'builtin' AND owner_user_id IS NOT NULL)",
        )
        batch_op.create_index("ix_icon_assets_owner_user_id", ["owner_user_id"], unique=False)
    op.create_index(
        "uq_food_categories_owner_group_name",
        "food_categories",
        ["owner_user_id", "name"],
        unique=True,
        sqlite_where=sa.text("owner_user_id IS NOT NULL AND parent_id IS NULL"),
    )
    op.create_index(
        "uq_food_categories_owner_subcategory_name",
        "food_categories",
        ["owner_user_id", "parent_id", "name"],
        unique=True,
        sqlite_where=sa.text("owner_user_id IS NOT NULL AND parent_id IS NOT NULL"),
    )


def downgrade() -> None:
    """Restore nullable refrigerator scope columns without recreating merged clones."""
    op.drop_index("uq_food_categories_owner_subcategory_name", table_name="food_categories")
    op.drop_index("uq_food_categories_owner_group_name", table_name="food_categories")
    with op.batch_alter_table("food_categories") as batch_op:
        batch_op.add_column(sa.Column("refrigerator_id", sa.String(length=32), nullable=True))
        batch_op.drop_constraint("ck_food_categories_owner_scope", type_="check")
        batch_op.drop_index("ix_food_categories_owner_user_id")
        batch_op.drop_column("owner_user_id")
        batch_op.create_index("ix_food_categories_refrigerator_id", ["refrigerator_id"])
    with op.batch_alter_table("icon_assets") as batch_op:
        batch_op.add_column(sa.Column("refrigerator_id", sa.String(length=32), nullable=True))
        batch_op.drop_constraint("ck_icon_assets_owner_scope", type_="check")
        batch_op.drop_index("ix_icon_assets_owner_user_id")
        batch_op.drop_column("owner_user_id")
        batch_op.create_index("ix_icon_assets_refrigerator_id", ["refrigerator_id"])
