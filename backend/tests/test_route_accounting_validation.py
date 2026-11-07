"""Route-level accounting validation and raw-vs-display regressions."""
import asyncio
from datetime import datetime
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from backend.routers import project_tracking, resources


class FakeDb:
    def __init__(self):
        self.commits = 0
        self.added = []

    def add(self, row):
        self.added.append(row)

    def commit(self):
        self.commits += 1


class RouteAccountingTests(unittest.TestCase):
    def test_snapshot_rejects_bad_timestamp_and_nonfinite_value(self):
        user = SimpleNamespace(id=1)
        db = FakeDb()

        with self.assertRaises(HTTPException) as bad_date:
            asyncio.run(resources.add_snapshot(
                {"timestamp": "not-a-date", "value": 10},
                user,
                db,
            ))
        self.assertEqual(bad_date.exception.status_code, 422)

        with self.assertRaises(HTTPException) as bad_value:
            asyncio.run(resources.add_snapshot(
                {"timestamp": "2026-11-07T12:00:00Z", "value": "NaN"},
                user,
                db,
            ))
        self.assertEqual(bad_value.exception.status_code, 422)
        self.assertEqual(db.commits, 0)

    def test_daily_earnings_preserve_raw_downward_correction(self):
        user = SimpleNamespace(id=1)
        db = FakeDb()
        store = {}
        day = datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()

        def read_setting(_db, user_id, key):
            return store.get((user_id, key))

        def write_setting(_db, user_id, key, value):
            store[(user_id, key)] = value

        with patch.object(project_tracking, "setting", side_effect=read_setting), \
             patch.object(project_tracking, "save_setting", side_effect=write_setting):
            first = asyncio.run(project_tracking.store_daily_earnings(
                {"date": day, "sources": {"Kryptex": 1.25}},
                user,
                db,
            ))
            second = asyncio.run(project_tracking.store_daily_earnings(
                {"date": day, "sources": {"Kryptex": 0.90}},
                user,
                db,
            ))

        self.assertEqual(first["totalUsd"], 1.25)
        self.assertEqual(first["rawTotalUsd"], 1.25)
        self.assertEqual(second["totalUsd"], 1.25)
        self.assertEqual(second["rawTotalUsd"], 0.9)

        saved = store[(1, f"yield_server_daily_income_{day}")]
        self.assertEqual(saved["sources"]["Kryptex"], 1.25)
        self.assertEqual(saved["rawSources"]["Kryptex"], 0.9)
        self.assertEqual(saved["observations"][-1]["totalUsd"], 1.25)
        self.assertEqual(saved["rawObservations"][-1]["totalUsd"], 0.9)


if __name__ == "__main__":
    unittest.main()
