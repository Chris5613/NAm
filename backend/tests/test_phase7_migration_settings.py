"""Phase 7: legacy import cannot bypass read-only server settings."""

import asyncio
import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session

from backend.models import Setting, User
from backend.routers.migration import import_dump


@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"


class LegacyImportEvidenceProtectionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        User.__table__.create(self.engine)
        Setting.__table__.create(self.engine)
        self.db = Session(self.engine)
        self.user = User(id=1, username="phase7import", password_hash="unused")
        self.db.add(self.user)
        self.db.add(Setting(user_id=1, key="yield_backend_lulo_monthly_ledger_v1",
                            value={"earned": 1, "source": "backend"}))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_import_skips_reserved_evidence_but_imports_legacy_history(self):
        response = asyncio.run(import_dump({
            "yield_backend_lulo_monthly_ledger_v1": {"earned": 9999},
            "yield_backend_source_snapshots_v1": {"forged": True},
            "yield_lulo_cutover_backup_v1_project": {"project": {"earned": 9999}},
            "yield_server_daily_income_2026-10-30": {"earned": 9999},
            "yield_lulo_monthly_baselines_v1": {"project": {"2026-10": {"earned": 4}}},
        }, self.user, self.db))
        self.assertEqual(response["imported"]["settings"], 1)
        keys = {
            row.key: row.value
            for row in self.db.scalars(select(Setting).where(Setting.user_id == 1)).all()
        }
        self.assertEqual(keys["yield_backend_lulo_monthly_ledger_v1"], {
            "earned": 1, "source": "backend",
        })
        self.assertNotIn("yield_backend_source_snapshots_v1", keys)
        self.assertNotIn("yield_lulo_cutover_backup_v1_project", keys)
        self.assertNotIn("yield_server_daily_income_2026-10-30", keys)
        self.assertEqual(keys["yield_lulo_monthly_baselines_v1"], {
            "project": {"2026-10": {"earned": 4}},
        })


if __name__ == "__main__":
    unittest.main()
