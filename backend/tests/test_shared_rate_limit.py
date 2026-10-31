"""Shared limiter stores only hashed identities and prunes expired windows."""
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine, event, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend import rate_limit
from backend.models import RateLimitBucket


@compiles(JSONB, "sqlite")
def sqlite_json(element, compiler, **kw):
    return "JSON"


class SharedRateLimitTests(unittest.TestCase):
    def test_shared_window_and_expiry(self):
        engine = create_engine("sqlite://")
        @event.listens_for(engine, "connect")
        def advisory_lock(connection, record):
            connection.create_function("pg_advisory_xact_lock", 1, lambda _: 1)
        RateLimitBucket.__table__.create(engine)
        sessions = sessionmaker(bind=engine)
        with patch.object(rate_limit, "SessionLocal", sessions), patch.object(rate_limit, "_last_cleanup", 0.0):
            rate_limit._shared_rate("login", "private-user", 2, 60, 1000)
            rate_limit._shared_rate("login", "private-user", 2, 60, 1001)
            with self.assertRaises(HTTPException) as error:
                rate_limit._shared_rate("login", "private-user", 2, 60, 1002)
            self.assertEqual(error.exception.status_code, 429)
            with sessions() as db:
                row = db.scalars(select(RateLimitBucket)).one()
                self.assertNotIn("private-user", row.key)
                self.assertEqual(row.hits, [1000, 1001])
            rate_limit._shared_rate("login", "private-user", 2, 60, 1062)
            with sessions() as db:
                self.assertEqual(db.scalars(select(RateLimitBucket)).one().hits, [1062])
        engine.dispose()
