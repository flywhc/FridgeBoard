"""Store theme-specific variants for logical category icon sets.

Revision ID: 20260826_27
Revises: 20260825_26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260826_27"
down_revision: str | None = "20260825_26"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Add variant metadata and migrate existing single-file assets to ink."""
    with op.batch_alter_table("icon_assets") as batch_op:
        batch_op.add_column(
            sa.Column("fallback_theme", sa.String(length=24), nullable=False, server_default="ink")
        )
        batch_op.create_check_constraint(
            "ck_icon_assets_fallback_theme",
            "fallback_theme IN ('ink', 'skeuomorphic', 'cartoon')",
        )
        batch_op.create_check_constraint(
            "ck_icon_assets_media_type", "media_type IN ('image/svg+xml', 'image/png')"
        )
        batch_op.create_check_constraint(
            "ck_icon_assets_source",
            "source IN ('builtin', 'upload', 'iconify', 'thiings', 'agnes', 'library', "
            "'copy', 'draft')",
        )
    with op.batch_alter_table("food_categories") as batch_op:
        batch_op.add_column(sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
    op.create_table(
        "icon_asset_variants",
        sa.Column("icon_key", sa.String(length=160), nullable=False),
        sa.Column("theme_key", sa.String(length=24), nullable=False),
        sa.Column("media_type", sa.String(length=40), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("source_id", sa.String(length=240)),
        sa.Column("source_url", sa.String(length=1000)),
        sa.Column("license_spdx", sa.String(length=80)),
        sa.Column("license_url", sa.String(length=1000)),
        sa.Column("attribution", sa.String(length=500)),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["icon_key"], ["icon_assets.key"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("icon_key", "theme_key"),
        sa.CheckConstraint(
            "theme_key IN ('ink', 'skeuomorphic', 'cartoon')",
            name="ck_icon_asset_variants_theme_key",
        ),
        sa.CheckConstraint(
            "media_type IN ('image/svg+xml', 'image/png')",
            name="ck_icon_asset_variants_media_type",
        ),
        sa.CheckConstraint(
            "source IN ('builtin', 'upload', 'iconify', 'thiings', 'agnes', 'library', "
            "'copy', 'draft')",
            name="ck_icon_asset_variants_source",
        ),
    )
    op.create_index("ix_icon_asset_variants_icon_key", "icon_asset_variants", ["icon_key"])
    with op.batch_alter_table("icon_generation_candidates") as batch_op:
        batch_op.add_column(
            sa.Column(
                "media_type", sa.String(length=40), nullable=False, server_default="image/png"
            )
        )
    op.create_table(
        "icon_drafts",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("refrigerator_id", sa.String(length=32), nullable=False),
        sa.Column("category_id", sa.String(length=32)),
        sa.Column("parent_id", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("base_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("fallback_theme", sa.String(length=24), nullable=False, server_default="ink"),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "fallback_theme IN ('ink', 'skeuomorphic', 'cartoon')",
            name="ck_icon_drafts_fallback_theme",
        ),
        sa.ForeignKeyConstraint(["refrigerator_id"], ["refrigerators.id"]),
        sa.ForeignKeyConstraint(["category_id"], ["food_categories.id"]),
    )
    op.create_index("ix_icon_drafts_refrigerator_id", "icon_drafts", ["refrigerator_id"])
    op.create_index("ix_icon_drafts_expires_at", "icon_drafts", ["expires_at"])
    op.create_table(
        "icon_draft_variants",
        sa.Column("draft_id", sa.String(length=32), nullable=False),
        sa.Column("theme_key", sa.String(length=24), nullable=False),
        sa.Column("media_type", sa.String(length=40), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("source_id", sa.String(length=240)),
        sa.Column("source_url", sa.String(length=1000)),
        sa.Column("license_spdx", sa.String(length=80)),
        sa.Column("license_url", sa.String(length=1000)),
        sa.Column("attribution", sa.String(length=500)),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["draft_id"], ["icon_drafts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("draft_id", "theme_key"),
        sa.CheckConstraint(
            "theme_key IN ('ink', 'skeuomorphic', 'cartoon')",
            name="ck_icon_draft_variants_theme_key",
        ),
        sa.CheckConstraint(
            "media_type IN ('image/svg+xml', 'image/png')",
            name="ck_icon_draft_variants_media_type",
        ),
        sa.CheckConstraint(
            "source IN ('builtin', 'upload', 'iconify', 'thiings', 'agnes', 'library', "
            "'copy', 'draft')",
            name="ck_icon_draft_variants_source",
        ),
    )
    op.execute(
        sa.text(
            "INSERT INTO icon_asset_variants "
            "(icon_key, theme_key, media_type, storage_path, source, revision, created_at) "
            "SELECT key, 'ink', media_type, storage_path, source, 1, created_at FROM icon_assets"
        )
    )


def downgrade() -> None:
    """Remove theme variants while preserving the existing ink asset columns."""
    op.execute(
        sa.text(
            "UPDATE icon_assets SET "
            "storage_path = (SELECT v.storage_path FROM icon_asset_variants v "
            "WHERE v.icon_key = icon_assets.key ORDER BY "
            "CASE WHEN v.theme_key = 'ink' THEN 0 ELSE 1 END, v.theme_key LIMIT 1), "
            "media_type = (SELECT v.media_type FROM icon_asset_variants v "
            "WHERE v.icon_key = icon_assets.key ORDER BY "
            "CASE WHEN v.theme_key = 'ink' THEN 0 ELSE 1 END, v.theme_key LIMIT 1), "
            "source = (SELECT v.source FROM icon_asset_variants v "
            "WHERE v.icon_key = icon_assets.key ORDER BY "
            "CASE WHEN v.theme_key = 'ink' THEN 0 ELSE 1 END, v.theme_key LIMIT 1) "
            "WHERE EXISTS (SELECT 1 FROM icon_asset_variants v WHERE v.icon_key = icon_assets.key)"
        )
    )
    op.drop_index("ix_icon_asset_variants_icon_key", table_name="icon_asset_variants")
    op.drop_table("icon_asset_variants")
    op.drop_table("icon_draft_variants")
    op.drop_index("ix_icon_drafts_expires_at", table_name="icon_drafts")
    op.drop_index("ix_icon_drafts_refrigerator_id", table_name="icon_drafts")
    op.drop_table("icon_drafts")
    with op.batch_alter_table("icon_generation_candidates") as batch_op:
        batch_op.drop_column("media_type")
    with op.batch_alter_table("food_categories") as batch_op:
        batch_op.drop_column("revision")
    with op.batch_alter_table("icon_assets") as batch_op:
        batch_op.drop_constraint("ck_icon_assets_fallback_theme", type_="check")
        batch_op.drop_constraint("ck_icon_assets_media_type", type_="check")
        batch_op.drop_constraint("ck_icon_assets_source", type_="check")
        batch_op.drop_column("fallback_theme")
