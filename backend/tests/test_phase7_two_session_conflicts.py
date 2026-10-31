"""Phase 7: simulate two browser tabs with independent database sessions.

SQLite checks compare-and-swap behavior, not PostgreSQL row-lock timing.
Run the separate production two-tab check before enabling financial writes.
"""

import asyncio
from pathlib import Path
import tempfile
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session

from backend.models import User, Project, ProjectTransaction
from backend.routers.resources import list_records, patch_projects


@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"


class IndependentSessionProjectTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        path = Path(self.folder.name) / "phase7_test.sqlite"
        self.engine = create_engine(f"sqlite:///{path}")
        for model in (User, Project, ProjectTransaction):
            model.__table__.create(self.engine)
        with Session(self.engine) as db:
            db.add(User(id=1, username="phase7tabs", password_hash="unused"))
            db.add_all([
                Project(id="p1", user_id=1, name="Original", invested=100,
                        earned=2, inactive=False, data={"transactions": [{"id": "embedded"}]}),
                Project(id="p2", user_id=1, name="Independent", invested=50,
                        earned=1, inactive=False, data={}),
            ])
            db.commit()
            db.add(ProjectTransaction(id="tx-original", project_id="p1",
                                      user_id=1, amount=0.5, data={"source": "manual"}))
            db.commit()
        self.tab_a = Session(self.engine)
        self.tab_b = Session(self.engine)
        self.user = self.tab_a.get(User, 1)

    def tearDown(self):
        self.tab_a.close()
        self.tab_b.close()
        self.engine.dispose()
        self.folder.cleanup()

    def snapshot(self, session):
        return {item["id"]: item for item in asyncio.run(
            list_records("projects", self.user, session)
        )}

    def patch(self, session, before, after):
        return asyncio.run(patch_projects(
            {"changes": [{"id": before["id"], "before": before, "after": after}]},
            self.user, session,
        ))

    def test_stale_tab_rejected_and_transaction_row_survives(self):
        original_a = self.snapshot(self.tab_a)["p1"]
        original_b = self.snapshot(self.tab_b)["p1"]
        updated_a = {**original_a, "name": "Saved by tab A"}
        self.patch(self.tab_a, original_a, updated_a)

        with self.assertRaises(HTTPException) as conflict:
            self.patch(self.tab_b, original_b, {**original_b, "name": "Stale tab B"})
        self.assertEqual(conflict.exception.status_code, 409)
        self.tab_b.rollback()

        actual = self.snapshot(self.tab_b)["p1"]
        self.assertEqual(actual["name"], "Saved by tab A")
        self.assertEqual(actual["earned"], 2)
        self.assertEqual(actual["transactions"], [{"id": "embedded"}])
        self.assertIsNotNone(self.tab_b.get(ProjectTransaction, "tx-original"))

        # A retry of an already applied change must be an exact no-op.
        self.patch(self.tab_a, original_a, updated_a)
        self.assertEqual(self.snapshot(self.tab_b)["p1"], actual)

    def test_unrelated_projects_can_save_from_separate_tabs(self):
        first = self.snapshot(self.tab_a)["p1"]
        second = self.snapshot(self.tab_b)["p2"]
        self.patch(self.tab_a, first, {**first, "name": "A only"})
        self.patch(self.tab_b, second, {**second, "name": "B only"})
        # Session A previously loaded p2; expire its identity map so this
        # assertion checks fresh persisted rows, not its old ORM cache.
        self.tab_a.expire_all()
        resulting = self.snapshot(self.tab_a)
        self.assertEqual(resulting["p1"]["name"], "A only")
        self.assertEqual(resulting["p2"]["name"], "B only")
        self.assertEqual(len(resulting), 2)
        self.assertIsNotNone(self.tab_a.get(ProjectTransaction, "tx-original"))


if __name__ == "__main__":
    unittest.main()
