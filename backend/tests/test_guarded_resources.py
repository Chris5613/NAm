import asyncio
import unittest
from unittest.mock import MagicMock
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from backend.models import User, Asset, Setting
from backend.routers.resources import patch_resource_records, patch_setting, replace_collection, put_setting, lock_setting_key

@compiles(JSONB, "sqlite")
def sqlite_json(element, compiler, **kwargs): return "JSON"

class GuardedResourceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        for model in (User, Asset, Setting): model.__table__.create(self.engine)
        self.db = Session(self.engine)
        self.user = User(id=1, username="user", password_hash="unused")
        self.db.add(self.user)
        self.db.add(Asset(id="a", user_id=1, name="First", category="cash", data={"note": "original"}))
        self.db.commit()

    def tearDown(self): self.db.close(); self.engine.dispose()

    def test_settings_use_distinct_postgres_transaction_locks_per_key(self):
        db = MagicMock()
        db.get_bind.return_value.dialect.name = "postgresql"
        lock_setting_key(db, 1, "tracker-one")
        lock_setting_key(db, 1, "tracker-two")
        first, second = [call.args[1]["lock_id"] for call in db.execute.call_args_list]
        self.assertNotEqual(first, second)
        db.scalar.assert_not_called()

    def test_independent_asset_edits_and_stale_rejection(self):
        from backend.schemas import row_to_dict, RESOURCES
        before = row_to_dict(self.db.get(Asset, "a"), RESOURCES["assets"][1])
        one = {**before, "note": "updated"}
        result = asyncio.run(patch_resource_records("assets", {"changes": [
            {"id": "a", "before": before, "after": one},
            {"id": "b", "before": None, "after": {"id": "b", "name": "Second", "category": "cash"}},
        ]}, self.user, self.db))
        self.assertEqual(len(result), 2)
        with self.assertRaises(HTTPException) as conflict:
            asyncio.run(patch_resource_records("assets", {"changes": [{"id": "a", "before": before,
                "after": {**before, "note": "stale"}}]}, self.user, self.db))
        self.assertEqual(conflict.exception.status_code, 409)
        self.db.rollback()
        self.assertEqual(self.db.get(Asset, "b").name, "Second")
        with self.assertRaises(HTTPException) as legacy:
            asyncio.run(replace_collection("assets", [], self.user, self.db))
        self.assertEqual(legacy.exception.status_code, 409)

    def test_setting_cas_and_legacy_rejection(self):
        first = {"days": {"2026-10-30": {"a": 1}}}
        asyncio.run(patch_setting("yield_daily_earnings_by_source_v2", {"before": None, "after": first}, self.user, self.db))
        with self.assertRaises(HTTPException) as conflict:
            asyncio.run(patch_setting("yield_daily_earnings_by_source_v2", {"before": None, "after": {"days": {}}}, self.user, self.db))
        self.assertEqual(conflict.exception.status_code, 409)
        with self.assertRaises(HTTPException) as legacy:
            asyncio.run(put_setting("yield_daily_earnings_by_source_v2", {"value": {}}, self.user, self.db))
        self.assertEqual(legacy.exception.status_code, 409)
        self.assertEqual(self.db.scalar(select(Setting).where(Setting.key == "yield_daily_earnings_by_source_v2")).value, first)
