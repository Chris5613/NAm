"""Database engine, session handling, and versioned schema setup."""

import os
from collections.abc import Iterator
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker

from .models import Base

DEFAULT_DATABASE_URL = "postgresql+psycopg://nam:namlocaldev@localhost:5432/nam"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)

# Heroku/Railway style URLs need the driver spelled out for SQLAlchemy 2.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

# A synchronous ORM call inside an async route can otherwise hold the sole
# request loop indefinitely while PostgreSQL waits on a lock or a dead socket.
# Keep each wait bounded so Render's health checks can recover.
connection_options = (
    {"connect_timeout": 5, "options": "-c statement_timeout=8000 -c lock_timeout=3000"}
    if DATABASE_URL.startswith("postgresql") else {}
)
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_timeout=5,
    connect_args=connection_options,
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def _alembic_config() -> Config:
    root = Path(__file__).resolve().parents[1]
    return Config(str(root / "alembic.ini"))


def init_db() -> None:
    """Bootstrap an empty database, otherwise apply reviewed Alembic revisions.

    create_all() is intentionally limited to a completely empty database.
    Existing databases never receive ad-hoc startup ALTER statements.
    """
    tables = set(inspect(engine).get_table_names()) - {"alembic_version"}
    config = _alembic_config()

    if not tables:
        Base.metadata.create_all(bind=engine)
        # The bootstrap schema is generated from current models, so record it
        # at the current migration head rather than replaying historical ALTERs.
        command.stamp(config, "head")
        return

    # Existing databases fail closed if the baseline/revisions do not match.
    command.upgrade(config, "head")


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
