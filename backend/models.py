"""SQLAlchemy models.

Domains I fully own (spending, SimpleFIN) use typed columns. Legacy domains carried
over from localStorage keep a JSONB `data` column alongside indexed core fields so
the migration cannot lose attributes whose shapes vary across records.
"""

from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    security_answer_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Setting(Base, TimestampMixin):
    """Key/value store for preferences, integration configs, and cached payloads."""

    __tablename__ = "settings"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_settings_user_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(128))
    value: Mapped[dict] = mapped_column(JSONB, default=dict)


class Asset(Base, TimestampMixin):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    symbol: Mapped[str | None] = mapped_column(String(64), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    manual_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    data: Mapped[dict] = mapped_column(JSONB, default=dict)


class Phone(Base, TimestampMixin):
    __tablename__ = "phones"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    market_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    market_value_source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    data: Mapped[dict] = mapped_column(JSONB, default=dict)


class Wallet(Base, TimestampMixin):
    __tablename__ = "wallets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    chain: Mapped[str | None] = mapped_column(String(64), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    data: Mapped[dict] = mapped_column(JSONB, default=dict)


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    invested: Mapped[float] = mapped_column(Float, default=0)
    earned: Mapped[float] = mapped_column(Float, default=0)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    inactive: Mapped[bool] = mapped_column(Boolean, default=False)
    data: Mapped[dict] = mapped_column(JSONB, default=dict)

    transactions: Mapped[list["ProjectTransaction"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", passive_deletes=True
    )


class ProjectTransaction(Base, TimestampMixin):
    __tablename__ = "project_transactions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    amount: Mapped[float] = mapped_column(Float, default=0)
    occurred_at: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    data: Mapped[dict] = mapped_column(JSONB, default=dict)

    project: Mapped[Project] = relationship(back_populates="transactions")


class SpendingAccount(Base, TimestampMixin):
    __tablename__ = "spending_accounts"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_balance: Mapped[float | None] = mapped_column(Float, nullable=True)
    provider_account_id: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    linked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SpendingTransaction(Base, TimestampMixin):
    __tablename__ = "spending_transactions"
    __table_args__ = (Index("ix_spending_txn_user_date", "user_id", "date"),)

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    merchant: Mapped[str] = mapped_column(String(255))
    amount: Mapped[float] = mapped_column(Float)
    date: Mapped[str] = mapped_column(String(10))
    category: Mapped[str] = mapped_column(String(64), default="Other")
    account_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    pending: Mapped[bool] = mapped_column(Boolean, default=False)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    source: Mapped[str] = mapped_column(String(32), default="manual")


class Bet(Base, TimestampMixin):
    __tablename__ = "bets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    amount: Mapped[float] = mapped_column(Float, default=0)
    date: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    result: Mapped[str | None] = mapped_column(String(32), nullable=True)
    data: Mapped[dict] = mapped_column(JSONB, default=dict)


class NetWorthSnapshot(Base):
    __tablename__ = "net_worth_snapshots"
    __table_args__ = (Index("ix_snapshot_user_ts", "user_id", "timestamp"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    timestamp: Mapped[str] = mapped_column(String(32))
    value: Mapped[float] = mapped_column(Float, default=0)
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    data: Mapped[dict] = mapped_column(JSONB, default=dict)


class SimplefinConnection(Base, TimestampMixin):
    __tablename__ = "simplefin_connections"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    access_url: Mapped[str] = mapped_column(Text)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SnaptradeConnection(Base, TimestampMixin):
    __tablename__ = "snaptrade_connections"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    snaptrade_user_id: Mapped[str] = mapped_column(String(255))
    user_secret: Mapped[str] = mapped_column(Text)
    brokerage: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
