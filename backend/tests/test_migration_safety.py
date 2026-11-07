"""Regression tests for safe legacy import preview and deduplication."""
import asyncio
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session

from backend.models import Asset, SpendingAccount, SpendingTransaction, User
from backend.routers.migration import import_dump, preview_dump


@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"


class MigrationSafetyTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        User.__table__.create(self.engine)
        Asset.__table__.create(self.engine)
        SpendingAccount.__table__.create(self.engine)
        SpendingTransaction.__table__.create(self.engine)
        self.db = Session(self.engine)
        self.user = User(id=1, username="owner", password_hash="unused")
        self.other = User(id=2, username="other", password_hash="unused")
        self.db.add_all([self.user, self.other])
        self.db.add(Asset(
            id="existing",
            user_id=1,
            name="Savings",
            category="cash",
            manual_value=100,
            data={},
        ))
        self.db.add(Asset(
            id="foreign",
            user_id=2,
            name="Other Asset",
            category="cash",
            manual_value=999,
            data={},
        ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def asset_count(self):
        return self.db.scalar(select(func.count()).select_from(Asset))

    def test_preview_is_read_only_and_same_name_records_are_not_dropped(self):
        payload = {
            "networth_assets": [
                {"name": "Savings", "category": "cash", "manual_value": 200},
                {"name": "Savings", "category": "cash", "manual_value": 300},
            ]
        }
        preview = asyncio.run(preview_dump(payload, self.user, self.db))
        self.assertEqual(preview["mode"], "preview")
        self.assertEqual(preview["imported"]["assets"], 2)
        self.assertEqual(self.asset_count(), 2)

        result = asyncio.run(import_dump(payload, self.user, self.db))
        self.assertEqual(result["mode"], "import")
        self.assertEqual(result["imported"]["assets"], 2)
        self.assertEqual(self.asset_count(), 4)

    def test_exact_no_id_duplicate_is_reported_not_reimported(self):
        result = asyncio.run(preview_dump({
            "networth_assets": [
                {"name": "Savings", "category": "cash", "manual_value": 100},
            ]
        }, self.user, self.db))
        self.assertEqual(result["imported"]["assets"], 0)
        self.assertEqual(result["skipped"]["duplicate_identity"], 1)
        self.assertEqual(result["skip_details"][0]["reason"], "duplicate_identity")

    def test_foreign_primary_key_is_skipped_without_changing_owner(self):
        result = asyncio.run(import_dump({
            "networth_assets": [
                {"id": "foreign", "name": "Hijack", "category": "cash", "manual_value": 1},
            ]
        }, self.user, self.db))
        self.assertEqual(result["imported"]["assets"], 0)
        self.assertEqual(result["skipped"]["foreign_id"], 1)
        row = self.db.get(Asset, "foreign")
        self.assertEqual(row.user_id, 2)
        self.assertEqual(row.name, "Other Asset")

    def test_snapshot_month_keys_normalize_and_bad_timestamps_skip(self):
        preview = asyncio.run(preview_dump({
            "networth_history": [
                {"monthKey": "2026-11", "value": 100},
                {"timestamp": "not-a-date", "value": 200},
            ]
        }, self.user, self.db))
        self.assertEqual(preview["imported"]["net_worth_snapshots"], 1)
        self.assertEqual(preview["skipped"]["invalid_record"], 1)

    def test_preview_runs_spending_validation_without_writes(self):
        before = self.db.scalar(select(func.count()).select_from(SpendingAccount))
        with self.assertRaises(HTTPException) as caught:
            asyncio.run(preview_dump({
                "networth_spending_accounts": [{
                    "name": "Checking",
                    "currentBalance": "12.34",
                    "linkedAt": "not-a-timestamp",
                }]
            }, self.user, self.db))
        self.assertEqual(caught.exception.status_code, 422)
        after = self.db.scalar(select(func.count()).select_from(SpendingAccount))
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
