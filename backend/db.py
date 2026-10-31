"""Database engine, session handling, and schema setup."""

import os
from collections.abc import Iterator

from sqlalchemy import create_engine, inspect, text
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
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_timeout=5,
                       connect_args=connection_options, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        # ADD COLUMN IF NOT EXISTS still requests an ACCESS EXCLUSIVE lock in
        # Postgres. Repeating it on every boot can queue behind an active
        # transaction and block all subsequent reads, including auth/health.
        inspector = inspect(connection)
        if "security_answer_hash" not in {column["name"] for column in inspector.get_columns("users")}:
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer_hash TEXT"))
        if "hidden" not in {column["name"] for column in inspector.get_columns("spending_transactions")}:
            connection.execute(text("ALTER TABLE spending_transactions ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE"))


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
