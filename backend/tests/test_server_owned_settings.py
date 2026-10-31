"""Phase 7: server-owned income evidence cannot be forged by settings PUT."""

import asyncio
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session

from backend.models import Setting, User
from backend.routers.resources import put_setting
from backend.server_owned_settings import is_server_owned_setting


@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"


class AccountingSettingsWriteProtectionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        User.__table__.create(self.engine)
        Setting.__table__.create(self.engine)
        self.db = Session(self.engine)
        self.user = User(id=1, username="phase7", password_hash="unused")
        self.db.add(self.user)
        self.db.add(Setting(
            user_id=1, key="yield_backend_lulo_monthly_ledger_v1",
            value={"lastSyncedAt": "2026-10-30T00:00:00Z", "earned": 3},
        ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_existing_and_future_server_owned_keys_are_immutable_to_generic_put(self):
        reserved = (
            "yield_backend_source_wallets_v1",
            "yield_backend_source_snapshots_v1",
            "yield_backend_source_observations_v1",
            "yield_backend_lulo_monthly_ledger_v1",
            "yield_backend_loopscale_pnl_ledger_v1",
            "yield_backend_lulo_transaction_previews_v1",
            "yield_lulo_transaction_parity_reports_v1",
            "yield_lulo_cutover_backup_v1_project-1",
            "yield_loopscale_cutover_backup_v1",
            "yield_project_latest_balance_feed_v1",
            "yield_project_sync_alerts_v1",
            "yield_project_balance_backup_2026-10-30",
            "yield_server_daily_income_2026-10-30",
        )
        for key in reserved:
            with self.subTest(key=key):
                self.assertTrue(is_server_owned_setting(key))
                with self.assertRaises(HTTPException) as error:
                    asyncio.run(put_setting(key, {"value": {"earned": 999999}}, self.user, self.db))
                self.assertEqual(error.exception.status_code, 403)
                self.assertEqual(
                    self.db.scalar(select(Setting).where(
                        Setting.user_id == self.user.id, Setting.key == key
                    )).value if key == "yield_backend_lulo_monthly_ledger_v1" else
                    self.db.scalar(select(Setting).where(
                        Setting.user_id == self.user.id, Setting.key == key
                    )),
                    {"lastSyncedAt": "2026-10-30T00:00:00Z", "earned": 3}
                    if key == "yield_backend_lulo_monthly_ledger_v1" else None,
                )

    def test_existing_browser_history_and_normal_preferences_still_save(self):
        for key in (
            "yield_lulo_monthly_baselines_v1",
            "yield_loopscale_position_history_v1",
            "some_user_display_preference",
        ):
            with self.subTest(key=key):
                self.assertFalse(is_server_owned_setting(key))
                value = {"note": "user setting"}
                result = asyncio.run(put_setting(key, {"value": value}, self.user, self.db))
                self.assertEqual(result["value"], value)
                self.assertEqual(
                    self.db.scalar(select(Setting).where(
                        Setting.user_id == self.user.id, Setting.key == key
                    )).value, value
                )


if __name__ == "__main__":
    unittest.main()
