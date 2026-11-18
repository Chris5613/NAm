from datetime import datetime, timedelta, timezone
import unittest

from backend.bixberry import observe
from backend.earnings_dashboard import provider_entries
from backend.provider_monthly_income import monthly_provider_income
from backend.financial_core import auto_income_journal, split_revenue
from backend.server_owned_settings import is_server_owned_setting


class BixberryTests(unittest.TestCase):
    def test_balance_baseline_growth_repeat_withdrawal(self):
        t = datetime(2026, 11, 18, 18, tzinfo=timezone.utc)
        row = observe({}, "0.1173", t)
        self.assertEqual(row["lifetimeEarnedUsd"], .1173)
        row = observe(row, "0.1273", t + timedelta(minutes=1))
        self.assertEqual(row["lifetimeEarnedUsd"], .1273)
        self.assertEqual(observe(row, "0.9999", t), row)
        row = observe(row, "0.1273", t + timedelta(minutes=2))
        self.assertEqual(row["lifetimeEarnedUsd"], .1273)
        row = observe(row, "0.0173", t + timedelta(minutes=3))
        self.assertEqual(row["lifetimeEarnedUsd"], .1273)
        row = observe(row, "0.0273", t + timedelta(minutes=4))
        self.assertEqual(row["lifetimeEarnedUsd"], .1373)
        self.assertEqual(row["daily"]["2026-11-18"], .1373)
        self.assertEqual(len(row["balanceDrops"]), 1)
        self.assertEqual(provider_entries("2026-11-18", {}, {"Bixberry": row})["sources"]["Bixberry"], .1373)
        months = monthly_provider_income({"bixberry": row}, "2026-11")
        self.assertIn({"platform": "Bixberry", "amount": .1373}, months[-1]["platforms"])
        journal = auto_income_journal("2026-11", {"total": .02, "sources": {"Bixberry": .02}}, [], "2026-11", "2026-11-18")
        self.assertEqual(split_revenue(journal["entries"])["networkSharing"], .02)
        self.assertEqual(journal["entries"][0]["lines"][0]["account"], "platform:bixberry")

    def test_invalid_balance_and_owned_settings(self):
        for value in (None, True, -1, "NaN", "Infinity", "0.00001"):
            with self.assertRaises(ValueError):
                observe({}, value, datetime.now(timezone.utc))
        self.assertTrue(is_server_owned_setting("project_income_bixberry_tracker_v1"))
        self.assertTrue(is_server_owned_setting("bixberry_bridge_digest_v1"))

    def test_pacific_month_boundary(self):
        t = datetime(2026, 12, 1, 7, 59, tzinfo=timezone.utc)
        row = observe({}, "0.1", t)
        row = observe(row, "0.11", t + timedelta(minutes=1))
        self.assertEqual(row["daily"]["2026-12-01"], .01)
        self.assertEqual(row["monthlyEarnings"]["2026-11"], .1)

    def test_existing_first_day_credit_is_idempotent(self):
        t = datetime(2026, 11, 18, 19, tzinfo=timezone.utc)
        old = {"openingBalance": .135, "currentBalance": .135, "trackingStartedAt": t.isoformat(), "lastSyncedAt": t.isoformat(), "daily": {"2026-11-18": 0}, "monthlyEarnings": {"2026-11": 0}}
        row = observe(old, ".135", t + timedelta(minutes=1))
        self.assertEqual(row["daily"]["2026-11-18"], .135)
        row = observe(row, ".136", t + timedelta(minutes=2))
        self.assertEqual(row["daily"]["2026-11-18"], .136)
