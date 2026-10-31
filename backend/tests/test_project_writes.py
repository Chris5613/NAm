"""Project CAS regression: preserve histories and reject stale batches atomically."""
import asyncio
import unittest

from backend.project_writes import plan_project_changes, ProjectConflict


class ProjectWritePlanTests(unittest.TestCase):
    def setUp(self):
        self.old = {"id": "p", "earned": 2, "transactions": [{"amount": -1, "note": "correction"}]}

    def test_stale_tab_cannot_overwrite_new_earnings(self):
        new = {**self.old, "earned": 3}
        with self.assertRaises(ProjectConflict):
            plan_project_changes({"p": new}, [{"id": "p", "before": self.old, "after": {**self.old, "name": "edited"}}])

    def test_replay_and_unrelated_records_are_preserved(self):
        new = {**self.old, "earned": 3}
        changes = [{"id": "p", "before": self.old, "after": new}]
        self.assertEqual(plan_project_changes({"p": new, "other": {"id": "other"}}, changes), {"p": new})
        self.assertEqual(new["transactions"], self.old["transactions"])

    def test_stale_delete_rejected(self):
        with self.assertRaises(ProjectConflict):
            plan_project_changes({"p": {**self.old, "earned": 4}}, [{"id": "p", "before": self.old, "after": None}])

    def test_creation_collision_rejected(self):
        with self.assertRaises(ProjectConflict):
            plan_project_changes({"p": self.old}, [{"id": "p", "before": None, "after": {"id": "p"}}])

    def test_duplicate_and_mismatched_ids_rejected(self):
        for changes in ([{"id": "p", "after": {"id": "x"}}], [{"id": "p", "after": self.old}] * 2):
            with self.assertRaises(ValueError):
                plan_project_changes({}, changes)


class ProjectRouteTests(unittest.TestCase):
    def setUp(self):
        from sqlalchemy import create_engine
        from sqlalchemy.ext.compiler import compiles
        from sqlalchemy.dialects.postgresql import JSONB
        from sqlalchemy.orm import Session
        from backend.models import User, Project, ProjectTransaction
        @compiles(JSONB, "sqlite")
        def sqlite_json(element, compiler, **kw):
            return "JSON"
        self.engine = create_engine("sqlite://")
        for table in (User.__table__, Project.__table__, ProjectTransaction.__table__):
            table.create(self.engine)
        self.db = Session(self.engine)
        self.user = User(id=1, username="test", password_hash="unused")
        self.db.add(self.user)
        self.db.add(Project(id="p", user_id=1, name="Lulo", invested=100, earned=2, inactive=False, data={"transactions": [{"amount": -1}]}))
        self.db.add(ProjectTransaction(id="tx", project_id="p", user_id=1, amount=-1, data={}))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_atomic_conflict_then_success_without_recreating_row(self):
        from fastapi import HTTPException
        from backend.routers.resources import patch_projects, list_records
        before = asyncio.run(list_records("projects", self.user, self.db))[0]
        after = {**before, "earned": 3}
        changes = [{"id": "new", "before": None, "after": {"id": "new"}}, {"id": "p", "before": {**before, "earned": 0}, "after": after}]
        with self.assertRaises(HTTPException) as error:
            asyncio.run(patch_projects({"changes": changes}, self.user, self.db))
        self.assertEqual(error.exception.status_code, 409)
        self.db.rollback()
        self.assertEqual(asyncio.run(list_records("projects", self.user, self.db)), [before])
        changes = [{"id": "p", "before": before, "after": after}]
        result = asyncio.run(patch_projects({"changes": changes}, self.user, self.db))
        self.assertEqual(result, [after])
        from backend.models import ProjectTransaction
        self.assertIsNotNone(self.db.get(ProjectTransaction, "tx"))
        self.assertEqual(asyncio.run(patch_projects({"changes": changes}, self.user, self.db)), result)

    def test_legacy_collection_write_is_blocked(self):
        from fastapi import HTTPException
        from backend.routers.resources import replace_collection
        with self.assertRaises(HTTPException) as error:
            asyncio.run(replace_collection("projects", [], self.user, self.db))
        self.assertEqual(error.exception.status_code, 409)

    def test_creation_defaults_and_replay(self):
        from backend.routers.resources import patch_projects
        changes = [{"id": "new", "before": None, "after": {"id": "new", "earned": "3.5"}}]
        result = asyncio.run(patch_projects({"changes": changes}, self.user, self.db))
        self.assertEqual(asyncio.run(patch_projects({"changes": changes}, self.user, self.db)), result)

    def test_cross_user_id_cannot_be_replaced(self):
        from backend.models import User
        from backend.routers.resources import patch_projects
        from fastapi import HTTPException
        other = User(id=2, username="other", password_hash="unused")
        self.db.add(other)
        self.db.commit()
        with self.assertRaises(HTTPException) as error:
            asyncio.run(patch_projects({"changes": [{"id": "p", "before": None, "after": {"id": "p"}}]}, other, self.db))
        self.assertEqual(error.exception.status_code, 409)
