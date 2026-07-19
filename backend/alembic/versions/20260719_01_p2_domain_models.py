"""创建 P2 领域模型。

Revision ID: 20260719_01
Revises:
Create Date: 2026-07-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260719_01"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """创建冰箱、库存、设备凭证和食谱所需的初始表。"""
    op.create_table(
        "refrigerators",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("owner_user_id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("template_key", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime()),
    )
    op.create_index("ix_refrigerators_owner_user_id", "refrigerators", ["owner_user_id"])
    op.create_table(
        "storage_zones",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "refrigerator_id",
            sa.String(length=32),
            sa.ForeignKey("refrigerators.id"),
            nullable=False,
        ),
        sa.Column("zone_key", sa.String(length=80), nullable=False),
        sa.Column("temperature_mode", sa.String(length=20), nullable=False),
        sa.Column("geometry", sa.JSON(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.UniqueConstraint("refrigerator_id", "zone_key"),
    )
    op.create_index("ix_storage_zones_refrigerator_id", "storage_zones", ["refrigerator_id"])
    op.create_table(
        "storage_slots",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "zone_id", sa.String(length=32), sa.ForeignKey("storage_zones.id"), nullable=False
        ),
        sa.Column("slot_key", sa.String(length=80), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("geometry", sa.JSON(), nullable=False),
        sa.UniqueConstraint("zone_id", "slot_key"),
    )
    op.create_index("ix_storage_slots_zone_id", "storage_slots", ["zone_id"])
    op.create_table(
        "food_categories",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("refrigerator_id", sa.String(length=32), sa.ForeignKey("refrigerators.id")),
        sa.Column("parent_id", sa.String(length=32), sa.ForeignKey("food_categories.id")),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("icon_key", sa.String(length=160)),
        sa.Column("is_custom", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_food_categories_refrigerator_id", "food_categories", ["refrigerator_id"])
    op.create_index("ix_food_categories_parent_id", "food_categories", ["parent_id"])
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
    op.create_table(
        "inventory_batches",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "refrigerator_id",
            sa.String(length=32),
            sa.ForeignKey("refrigerators.id"),
            nullable=False,
        ),
        sa.Column(
            "category_id", sa.String(length=32), sa.ForeignKey("food_categories.id"), nullable=False
        ),
        sa.Column(
            "subcategory_id",
            sa.String(length=32),
            sa.ForeignKey("food_categories.id"),
            nullable=False,
        ),
        sa.Column(
            "storage_slot_id",
            sa.String(length=32),
            sa.ForeignKey("storage_slots.id"),
            nullable=False,
        ),
        sa.Column("food_name", sa.String(length=160), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("best_before", sa.Date()),
        sa.Column("shelf_life_days", sa.Integer()),
        sa.Column("product_description", sa.Text()),
        sa.Column("barcode", sa.String(length=128)),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("quantity >= 0", name="ck_inventory_quantity_nonnegative"),
        sa.CheckConstraint(
            "shelf_life_days IS NULL OR shelf_life_days >= 0",
            name="ck_inventory_shelf_life_nonnegative",
        ),
    )
    for column in (
        "refrigerator_id",
        "category_id",
        "subcategory_id",
        "storage_slot_id",
        "created_at",
    ):
        op.create_index(f"ix_inventory_batches_{column}", "inventory_batches", [column])
    op.create_table(
        "device_credentials",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "refrigerator_id",
            sa.String(length=32),
            sa.ForeignKey("refrigerators.id"),
            nullable=False,
        ),
        sa.Column("device_kind", sa.String(length=20), nullable=False),
        sa.Column("credential_hash", sa.String(length=255), nullable=False, unique=True),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime()),
        sa.Column("revoked_at", sa.DateTime()),
    )
    op.create_index(
        "ix_device_credentials_refrigerator_id", "device_credentials", ["refrigerator_id"]
    )
    op.create_index("ix_device_credentials_revoked_at", "device_credentials", ["revoked_at"])
    op.create_table(
        "recipe_plans",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "refrigerator_id",
            sa.String(length=32),
            sa.ForeignKey("refrigerators.id"),
            nullable=False,
        ),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("refrigerator_id", "week_start"),
    )
    op.create_index("ix_recipe_plans_refrigerator_id", "recipe_plans", ["refrigerator_id"])
    op.create_table(
        "recipe_entries",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "recipe_plan_id", sa.String(length=32), sa.ForeignKey("recipe_plans.id"), nullable=False
        ),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("dish_name", sa.String(length=160), nullable=False),
        sa.Column("completed_at", sa.DateTime()),
        sa.UniqueConstraint("recipe_plan_id", "weekday", "dish_name"),
        sa.CheckConstraint("weekday >= 0 AND weekday <= 6", name="ck_recipe_entry_weekday"),
    )
    op.create_index("ix_recipe_entries_recipe_plan_id", "recipe_entries", ["recipe_plan_id"])
    op.create_table(
        "recipe_ingredients",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "recipe_entry_id",
            sa.String(length=32),
            sa.ForeignKey("recipe_entries.id"),
            nullable=False,
        ),
        sa.Column(
            "subcategory_id",
            sa.String(length=32),
            sa.ForeignKey("food_categories.id"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.CheckConstraint("quantity >= 1", name="ck_recipe_ingredient_quantity"),
    )
    op.create_index(
        "ix_recipe_ingredients_recipe_entry_id", "recipe_ingredients", ["recipe_entry_id"]
    )
    op.create_index(
        "ix_recipe_ingredients_subcategory_id", "recipe_ingredients", ["subcategory_id"]
    )
    op.create_table(
        "recipe_completions",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "recipe_entry_id",
            sa.String(length=32),
            sa.ForeignKey("recipe_entries.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("completed_at", sa.DateTime(), nullable=False),
        sa.Column("undone_at", sa.DateTime()),
    )
    op.create_table(
        "consumption_lines",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column(
            "completion_id",
            sa.String(length=32),
            sa.ForeignKey("recipe_completions.id"),
            nullable=False,
        ),
        sa.Column(
            "inventory_batch_id",
            sa.String(length=32),
            sa.ForeignKey("inventory_batches.id"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.CheckConstraint("quantity >= 1", name="ck_consumption_line_quantity"),
    )
    op.create_index("ix_consumption_lines_completion_id", "consumption_lines", ["completion_id"])
    op.create_table(
        "expiry_settings",
        sa.Column(
            "refrigerator_id",
            sa.String(length=32),
            sa.ForeignKey("refrigerators.id"),
            primary_key=True,
        ),
        sa.Column("ratio_percent", sa.Integer(), nullable=False),
        sa.Column("minimum_days", sa.Integer(), nullable=False),
        sa.Column("maximum_days", sa.Integer(), nullable=False),
        sa.CheckConstraint("ratio_percent > 0", name="ck_expiry_ratio_positive"),
        sa.CheckConstraint("minimum_days >= 1", name="ck_expiry_minimum_positive"),
        sa.CheckConstraint("maximum_days >= minimum_days", name="ck_expiry_maximum_valid"),
    )


def downgrade() -> None:
    """按依赖反向删除 P2 初始表。"""
    for table in (
        "expiry_settings",
        "consumption_lines",
        "recipe_completions",
        "recipe_ingredients",
        "recipe_entries",
        "recipe_plans",
        "device_credentials",
        "inventory_batches",
        "category_location_preferences",
        "food_categories",
        "storage_slots",
        "storage_zones",
        "refrigerators",
    ):
        op.drop_table(table)
