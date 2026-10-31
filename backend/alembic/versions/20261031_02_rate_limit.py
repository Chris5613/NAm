"""Create shared rate-limit windows without replacing existing data.

Revision ID: 20261031_02
Revises: 20261031_01
"""
from alembic import op
from sqlalchemy import Column, Float, String, inspect
from sqlalchemy.dialects.postgresql import JSONB

revision = "20261031_02"
down_revision = "20261031_01"
branch_labels = None
depends_on = None


def upgrade():
    # Startup may already have created the table through init_db().
    if "rate_limit_buckets" not in inspect(op.get_bind()).get_table_names():
        op.create_table("rate_limit_buckets",
                        Column("key", String(64), primary_key=True),
                        Column("hits", JSONB, nullable=False),
                        Column("expires_at", Float, nullable=False))
    op.execute("CREATE INDEX IF NOT EXISTS ix_rate_limit_buckets_expires_at ON rate_limit_buckets (expires_at)")


def downgrade():
    # Preserve live attempt windows; a rollback of app code need not remove them.
    pass
