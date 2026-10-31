"""Baseline for NAm's existing PostgreSQL schema.

This revision is intentionally non-destructive. The existing app has already
created its tables with backend.db.init_db(). This revision records migration
versioning only after verifying that the expected tables and columns exist.

Revision ID: 20261031_01
Revises:
"""
from alembic import op
from sqlalchemy import inspect

from backend.models import Base

revision = "20261031_01"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    inspector = inspect(op.get_bind())
    found = set(inspector.get_table_names())
    # Keep the baseline fixed as the pre-migration schema as models grow.
    expected = set(Base.metadata.tables.keys()) - {"rate_limit_buckets"}
    missing_tables = sorted(expected - found)
    if missing_tables:
        raise RuntimeError("Existing NAm schema is missing tables: " + ", ".join(missing_tables))

    for name in sorted(expected):
        present_columns = {row["name"] for row in inspector.get_columns(name)}
        expected_columns = set(Base.metadata.tables[name].columns.keys())
        missing_columns = sorted(expected_columns - present_columns)
        if missing_columns:
            raise RuntimeError(
                f"Existing NAm table {name} lacks columns: {', '.join(missing_columns)}"
            )
    # No CREATE/DROP/ALTER. Alembic records the version after inspection.

def downgrade():
    raise RuntimeError(
        "The pre-Alembic schema is not reversible through this baseline. "
        "Use a reviewed database restore procedure instead."
    )
