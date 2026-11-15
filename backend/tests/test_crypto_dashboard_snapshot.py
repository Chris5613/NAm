"""Crypto Dashboard must not regress to browser-derived valuations."""
import asyncio
from datetime import datetime, timezone, timedelta
import unittest
from fastapi import Response
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session

from backend.models import User, Setting
from backend.crypto_dashboard_snapshot import crypto_dashboard_snapshot
from backend.routers.project_tracking import crypto_dashboard


@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"


class CryptoDashboardSnapshotTests(unittest.TestCase):
    def test_canonical_total_and_inactive_holding_are_distinct(self):
        now = datetime(2026, 11, 15, 18, 0, tzinfo=timezone.utc)
        timestamp = datetime(2026, 11, 15, 1, 17, tzinfo=timezone.utc).isoformat()
        feed = {
            "receivedAt": now.isoformat(),
            "projects": [
                {"id": "lulo-project", "name": "Lulo", "inactive": True,
                 "balanceUsd": 1500.64, "sourceLastSyncedAt": "2026-11-10T00:00:00Z",
                 "requiresLiveSync": True},
                {"id": "unetwork-project", "name": "Unetwork", "inactive": False,
                 "balanceUsd": 44.90, "sourceLastSyncedAt": timestamp,
                 "requiresLiveSync": True, "invested": 100000},
                {"id": "unetwork-project", "name": "Unetwork", "inactive": False,
                 "balanceUsd": 44.90, "sourceLastSyncedAt": timestamp,
                 "requiresLiveSync": True},
            ],
        }
        result = crypto_dashboard_snapshot(19, feed, now)
        self.assertTrue(result["complete"])
        self.assertEqual(result["userId"], 19)
        self.assertEqual(result["projectCount"], 2)
        self.assertAlmostEqual(result["totalUsd"], 1545.54)
        self.assertAlmostEqual(result["activeTotalUsd"], 44.90)
        self.assertEqual(result["activePositions"], 1)
        self.assertEqual(result["staleProjectIds"], [])
        self.assertEqual(result["sourceOfCalculation"], "backend-project-feed")
        self.assertNotIn("invested", result["projects"][1])

    def test_missing_data_is_null_not_fake_zero(self):
        result = crypto_dashboard_snapshot(19, {})
        self.assertFalse(result["complete"])
        self.assertIsNone(result["totalUsd"])
        self.assertIsNone(result["activeTotalUsd"])
        self.assertEqual(result["projects"], [])

    def test_stale_active_feed_is_identified_but_does_not_zero_balance(self):
        now = datetime(2026, 11, 15, 20, 0, tzinfo=timezone.utc)
        result = crypto_dashboard_snapshot(3, {
            "receivedAt": now.isoformat(),
            "projects": [{"id": "salad-project", "name": "Salad",
                          "balanceUsd": 10.25, "requiresLiveSync": True,
                          "sourceLastSyncedAt": (now - timedelta(hours=1)).isoformat()}],
        }, now)
        self.assertEqual(result["staleProjectIds"], ["salad-project"])
        self.assertEqual(result["totalUsd"], 10.25)

    def test_authenticated_route_is_user_scoped_and_not_shared_cache(self):
        engine = create_engine("sqlite://")
        User.__table__.create(engine)
        Setting.__table__.create(engine)
        with Session(engine) as db:
            a = User(id=1, username="first", password_hash="unused")
            b = User(id=2, username="second", password_hash="unused")
            db.add_all([a, b])
            db.add_all([
                Setting(user_id=1, key="yield_project_latest_balance_feed_v1",
                        value={"receivedAt": "2026-11-15T01:00:00Z",
                               "projects": [{"id": "one", "balanceUsd": 8.5}]}),
                Setting(user_id=2, key="yield_project_latest_balance_feed_v1",
                        value={"receivedAt": "2026-11-15T01:00:00Z",
                               "projects": [{"id": "two", "balanceUsd": 950.0}]}),
            ])
            db.commit()
            response = Response()
            first = asyncio.run(crypto_dashboard(response, a, db))
            second = asyncio.run(crypto_dashboard(Response(), b, db))
            self.assertEqual(first["totalUsd"], 8.5)
            self.assertEqual(second["totalUsd"], 950.0)
            self.assertEqual(first["userId"], 1)
            self.assertEqual(response.headers["Cache-Control"], "private, no-store")
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
