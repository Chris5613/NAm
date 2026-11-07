"""Store spending money in exact NUMERIC columns.

Revision ID: 20261107_03
Revises: 20261031_02
"""
from alembic import op
import sqlalchemy as sa

revision = "20261107_03"
down_revision = "20261031_02"
branch_labels = None
depends_on = None

MONEY = sa.Numeric(20, 6)


def upgrade():
    op.alter_column(
        "spending_accounts",
        "current_balance",
        existing_type=sa.Float(),
        type_=MONEY,
        existing_nullable=True,
        postgresql_using="current_balance::numeric(20,6)",
    )
    op.alter_column(
        "spending_transactions",
        "amount",
        existing_type=sa.Float(),
        type_=MONEY,
        existing_nullable=False,
        postgresql_using="amount::numeric(20,6)",
    )


def downgrade():
    op.alter_column(
        "spending_accounts",
        "current_balance",
        existing_type=MONEY,
        type_=sa.Float(),
        existing_nullable=True,
        postgresql_using="current_balance::double precision",
    )
    op.alter_column(
        "spending_transactions",
        "amount",
        existing_type=MONEY,
        type_=sa.Float(),
        existing_nullable=False,
        postgresql_using="amount::double precision",
    )
