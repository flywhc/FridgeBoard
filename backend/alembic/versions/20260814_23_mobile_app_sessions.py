"""Add mobile authorization codes and revocable App sessions."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260814_23"
down_revision: str | None = "20260814_22"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Create hashed one-time codes and mobile access sessions."""
    op.create_table(
        "mobile_authorization_codes",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("owner_user_id", sa.String(length=128), nullable=False),
        sa.Column("redirect_uri", sa.String(length=512), nullable=False),
        sa.Column("code_challenge", sa.String(length=128), nullable=False),
        sa.Column(
            "code_challenge_method",
            sa.String(length=10),
            server_default="S256",
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code_hash"),
    )
    op.create_index(
        "ix_mobile_authorization_codes_owner_user_id",
        "mobile_authorization_codes",
        ["owner_user_id"],
    )
    op.create_index(
        "ix_mobile_authorization_codes_expires_at",
        "mobile_authorization_codes",
        ["expires_at"],
    )
    op.create_table(
        "mobile_sessions",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("owner_user_id", sa.String(length=128), nullable=False),
        sa.Column("access_token_hash", sa.String(length=64), nullable=False),
        sa.Column("refresh_token_hash", sa.String(length=64), nullable=False),
        sa.Column("access_expires_at", sa.DateTime(), nullable=False),
        sa.Column("refresh_expires_at", sa.DateTime(), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("access_token_hash"),
        sa.UniqueConstraint("refresh_token_hash"),
    )
    op.create_index("ix_mobile_sessions_owner_user_id", "mobile_sessions", ["owner_user_id"])
    op.create_index(
        "ix_mobile_sessions_access_expires_at", "mobile_sessions", ["access_expires_at"]
    )
    op.create_index(
        "ix_mobile_sessions_refresh_expires_at", "mobile_sessions", ["refresh_expires_at"]
    )
    op.create_index("ix_mobile_sessions_revoked_at", "mobile_sessions", ["revoked_at"])


def downgrade() -> None:
    """Remove mobile authorization codes and sessions."""
    op.drop_index("ix_mobile_sessions_revoked_at", table_name="mobile_sessions")
    op.drop_index("ix_mobile_sessions_refresh_expires_at", table_name="mobile_sessions")
    op.drop_index("ix_mobile_sessions_access_expires_at", table_name="mobile_sessions")
    op.drop_index("ix_mobile_sessions_owner_user_id", table_name="mobile_sessions")
    op.drop_table("mobile_sessions")
    op.drop_index(
        "ix_mobile_authorization_codes_expires_at",
        table_name="mobile_authorization_codes",
    )
    op.drop_index(
        "ix_mobile_authorization_codes_owner_user_id",
        table_name="mobile_authorization_codes",
    )
    op.drop_table("mobile_authorization_codes")
