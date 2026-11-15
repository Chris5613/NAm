"""The backend must repair open-month provider snapshots without a browser."""
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session

from backend.models import User, Setting
from backend.scheduler import reconcile_open_monthly_snapshots


@compiles(JSONB, "sqlite")
def sqlite_json(element, compiler, **kwargs):
    return "JSON"


class OpenMonthlyReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        User.__table__.create(self.engine)
        Setting.__table__.create(self.engine)
        self.month = datetime.now(timezone.utc).astimezone(
            ZoneInfo("America/Los_Angeles")).strftime("%Y-%m")
        self.day = self.month + "-14"
        with Session(self.engine) as db:
            db.add(User(id=1, username="owner", password_hash="unused"))
            db.commit()

    def tearDown(self):
        self.engine.dispose()

    def seed(self, key, value):
        with Session(self.engine) as db:
            db.add(Setting(user_id=1, key=key, value=value))
            db.commit()

    def stored(self, key):
        with Session(self.engine) as db:
            row = db.scalar(select(Setting).where(Setting.user_id == 1,
                                                 Setting.key == key))
            return row.value if row else None

    def run_reconcile(self):
        with patch("backend.scheduler.SessionLocal",
                   side_effect=lambda: Session(self.engine)):
            return reconcile_open_monthly_snapshots()

    def test_stale_browser_snapshot_recovers_all_four_providers_and_is_idempotent(self):
        self.seed("project_income_kryptex_tracker_v1", {
            "monthlyEarnings": {self.month: 41.76}})
        self.seed("project_income_salad_tracker_v1", {
            "monthlyEarnings": {self.month: 4.24}})
        self.seed("project_income_rollercoin_tracker_v2", {
            "walletDaily": {self.day: {"usd": 7.14}}})
        self.seed("project_income_unetwork_tracker_v1", {
            "daily": {self.day: {"usd": 9.78}}})
        before = {
            "2026-10": {"monthKey": "2026-10", "locked": True, "total": 50,
                        "platforms": [{"platform": "Kryptex", "amount": 50}]},
            self.month: {"monthKey": self.month, "locked": False, "total": 68.0,
                         "platforms": [
                             {"platform": "Kryptex", "amount": 40.0},
                             {"platform": "RollerCoin", "amount": 5.0},
                             {"platform": "Unetwork", "amount": 6.0},
                             {"platform": "Salad", "amount": 4.0},
                             {"platform": "Loopscale", "amount": 13.0},
                         ]},
        }
        self.seed("yield_monthly_snapshots_v1", before)
        self.assertEqual(self.run_reconcile(), 1)
        fixed = self.stored("yield_monthly_snapshots_v1")
        amounts = {p["platform"]: p["amount"]
                   for p in fixed[self.month]["platforms"]}
        self.assertEqual(amounts, {
            "Kryptex": 41.76, "RollerCoin": 7.14, "Unetwork": 9.78,
            "Salad": 4.24, "Loopscale": 13.0,
        })
        self.assertAlmostEqual(fixed[self.month]["total"], 75.92)
        self.assertEqual(fixed["2026-10"], before["2026-10"])
        self.assertEqual(self.run_reconcile(), 0)
        self.assertEqual(self.stored("yield_monthly_snapshots_v1"), fixed)

    def test_month_created_from_confirmed_rewards_even_without_browser(self):
        self.seed("project_income_kryptex_tracker_v1",
                  {"monthlyEarnings": {self.month: 20}})
        self.assertEqual(self.run_reconcile(), 1)
        stored = self.stored("yield_monthly_snapshots_v1")
        self.assertEqual(stored[self.month]["total"], 20)
        self.assertEqual(stored[self.month]["platforms"],
                         [{"platform": "Kryptex", "amount": 20}])
        self.assertEqual(self.run_reconcile(), 0)

    def test_wallet_balance_alone_cannot_become_monthly_income(self):
        self.seed("project_income_salad_tracker_v1",
                  {"currentBalance": 500})
        self.assertEqual(self.run_reconcile(), 0)
        self.assertIsNone(self.stored("yield_monthly_snapshots_v1"))

    def test_expired_snapshot_is_locked_without_changing_amounts(self):
        historical = {"2026-10": {"monthKey": "2026-10",
                                  "total": 13.5,
                                  "platforms": [{"platform": "Kryptex",
                                                 "amount": 13.5}],
                                  "locked": False}}
        self.seed("yield_monthly_snapshots_v1", historical)
        self.assertEqual(self.run_reconcile(), 1)
        stored = self.stored("yield_monthly_snapshots_v1")
        self.assertEqual(stored["2026-10"]["total"], 13.5)
        self.assertTrue(stored["2026-10"]["locked"])
        self.assertIsNotNone(stored["2026-10"]["lockedAt"])
        self.assertEqual(self.run_reconcile(), 0)

    def test_locked_current_month_cannot_be_rewritten(self):
        self.seed("project_income_kryptex_tracker_v1",
                  {"monthlyEarnings": {self.month: 20}})
        saved = {self.month: {"monthKey": self.month, "locked": True,
                             "total": 1, "platforms": []}}
        self.seed("yield_monthly_snapshots_v1", saved)
        self.assertEqual(self.run_reconcile(), 0)
        self.assertEqual(self.stored("yield_monthly_snapshots_v1"), saved)


if __name__ == "__main__":
    unittest.main()
