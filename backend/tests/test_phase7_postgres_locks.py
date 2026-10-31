"""Phase 7 PostgreSQL integration: verify actual cross-connection row locking.

This test runs only with an explicitly configured DISPOSABLE PostgreSQL database
named 'nam_phase7_ci'. It never uses the app's production DATABASE_URL.
SQLite unit tests alone do not exercise PostgreSQL SELECT ... FOR UPDATE.
"""
import asyncio
import os
import threading
import unittest
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import create_engine, event, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from backend.models import Project, ProjectTransaction, User
from backend.routers.resources import patch_projects, list_records


TEST_URL = os.environ.get("PHASE7_POSTGRES_TEST_URL")


@unittest.skipUnless(TEST_URL, "Set PHASE7_POSTGRES_TEST_URL to run PostgreSQL integration tests")
class PostgreSQLProjectLockTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not TEST_URL:
            return
        # This suite creates/drops tables. Never point it at a real user DB.
        if make_url(TEST_URL).database != "nam_phase7_ci":
            raise RuntimeError("Phase 7 PostgreSQL tests require disposable nam_phase7_ci database")
        cls.engine = create_engine(TEST_URL, pool_pre_ping=True)
        for model in (User, Project, ProjectTransaction):
            model.__table__.create(cls.engine, checkfirst=True)

    @classmethod
    def tearDownClass(cls):
        if not TEST_URL or not hasattr(cls, "engine"):
            return
        for model in (ProjectTransaction, Project, User):
            model.__table__.drop(cls.engine, checkfirst=True)
        cls.engine.dispose()

    def setUp(self):
        self.uid = 700000
        self.project_id = "phase7-" + uuid4().hex[:18]
        self.tx_id = "tx-" + uuid4().hex[:18]
        with Session(self.engine) as db:
            db.add(User(id=self.uid, username="phase7-ci", password_hash="not-a-real-password"))
            db.add(Project(
                id=self.project_id, user_id=self.uid, name="Opening",
                invested=100.0, earned=4.0, inactive=False,
                data={"transactions": [{"id": "embedded-opening", "amount": 4}]},
            ))
            db.commit()
            db.add(ProjectTransaction(
                id=self.tx_id, project_id=self.project_id, user_id=self.uid,
                amount=4.0, type="earning", data={"source": "manual"},
            ))
            db.commit()

    def tearDown(self):
        with Session(self.engine) as db:
            db.query(ProjectTransaction).filter_by(user_id=self.uid).delete()
            db.query(Project).filter_by(user_id=self.uid).delete()
            db.query(User).filter_by(id=self.uid).delete()
            db.commit()

    def test_stale_concurrent_write_waits_for_lock_then_rejects(self):
        with Session(self.engine) as winner:
            account = winner.get(User, self.uid)
            before = next(x for x in asyncio.run(list_records("projects", account, winner))
                          if x["id"] == self.project_id)

            # Deliberately hold the user row lock while the second database
            # connection attempts its own PATCH. It must not read/commit
            # behind the first writer's back.
            winner.scalar(select(User).where(User.id == self.uid).with_for_update())

            attempting = threading.Event()
            finished = threading.Event()
            results = []

            def notice_lock_attempt(conn, cursor, statement, parameters, context, executemany):
                if threading.current_thread().name == "phase7-stale-writer" and "for update" in statement.lower():
                    attempting.set()

            event.listen(self.engine, "before_cursor_execute", notice_lock_attempt)
            def losing_writer():
                try:
                    with Session(self.engine) as loser:
                        user = loser.get(User, self.uid)
                        stale = {**before, "name": "Stale edit"}
                        try:
                            asyncio.run(patch_projects({
                                "changes": [{"id": self.project_id, "before": before, "after": stale}],
                            }, user, loser))
                            results.append("incorrectly-accepted")
                        except HTTPException as error:
                            loser.rollback()
                            results.append(error.status_code)
                except Exception as error:
                    results.append(type(error).__name__)
                finally:
                    finished.set()

            thread = threading.Thread(target=losing_writer, name="phase7-stale-writer", daemon=True)
            try:
                thread.start()
                self.assertTrue(attempting.wait(timeout=8), "Second connection never reached row-lock SQL")
                self.assertFalse(finished.wait(timeout=0.25), "Second writer skipped the held PostgreSQL lock")
                asyncio.run(patch_projects({
                    "changes": [{"id": self.project_id, "before": before,
                                 "after": {**before, "name": "Fresh saved edit"}}],
                }, account, winner))
                self.assertTrue(finished.wait(timeout=8), "Second writer remained blocked after commit")
            finally:
                # Ensure a failed assertion cannot leave the lock held.
                winner.rollback()
                thread.join(timeout=8)
                event.remove(self.engine, "before_cursor_execute", notice_lock_attempt)

        self.assertEqual(results, [409], "Stale writer must receive HTTP 409")
        with Session(self.engine) as db:
            actual = db.get(Project, self.project_id)
            self.assertEqual(actual.name, "Fresh saved edit")
            self.assertEqual(actual.earned, 4.0)
            self.assertEqual(actual.data["transactions"], [{"id": "embedded-opening", "amount": 4}])
            transaction = db.get(ProjectTransaction, self.tx_id)
            self.assertIsNotNone(transaction)
            self.assertEqual(transaction.amount, 4.0)
            self.assertEqual(transaction.data["source"], "manual")


if __name__ == "__main__":
    unittest.main()
