"""Sealing of old business months must not invent or reprice holdings."""
import copy
import unittest

from backend.monthly_changes_seal import (
    seal_completed_business_months, preserve_locked_business_months,
)


class MonthlyChangesSealTests(unittest.TestCase):
    def setUp(self):
        self.records = {
            "2026-09": {
                "items": [{"name": "Unetwork", "start": 0, "end": 15.47}],
                "locked": True, "revenueSnapshot": 330.062266,
            },
            "2026-10": {
                "items": [{"name": "RollerCoin", "start": 129.54, "end": 11.79}],
            },
            "2026-11": {
                "items": [{"name": "Unetwork", "start": 37.95, "end": None}],
            },
        }
        self.snapshots = {
            "2026-09": {"total": 330.062266, "locked": True},
            "2026-10": {"total": 202.769111, "locked": True},
            "2026-11": {"total": 83.047734, "locked": False},
        }

    def test_seal_only_completed_months_without_modifying_balances(self):
        old = copy.deepcopy(self.records)
        result = seal_completed_business_months(self.records, self.snapshots, "2026-11")
        self.assertEqual(result["2026-09"], old["2026-09"])
        self.assertTrue(result["2026-10"]["locked"])
        self.assertEqual(result["2026-10"]["revenueSnapshot"], 202.769111)
        self.assertEqual(result["2026-10"]["items"], old["2026-10"]["items"])
        self.assertEqual(result["2026-11"], old["2026-11"])
        self.assertEqual(self.records, old)

    def test_unconfirmed_historical_income_stays_unknown(self):
        result = seal_completed_business_months(self.records, {}, "2026-11")
        self.assertIsNone(result["2026-10"]["revenueSnapshot"])
        self.assertTrue(result["2026-10"]["locked"])

    def test_idempotent_never_revises_saved_past_earnings(self):
        first = seal_completed_business_months(self.records, self.snapshots, "2026-11")
        next_source = {"2026-10": {"total": 99999, "locked": True}}
        second = seal_completed_business_months(first, next_source, "2026-11")
        self.assertEqual(second, first)

    def test_previous_locked_month_cannot_be_deleted_or_edited(self):
        old = seal_completed_business_months(self.records, self.snapshots, "2026-11")
        for proposed in (
            {k: v for k, v in old.items() if k != "2026-10"},
            {**old, "2026-10": {
                **old["2026-10"], "items": [
                    {"name": "RollerCoin", "start": 129.54, "end": 99999}]}},
        ):
            with self.subTest(proposed=proposed), self.assertRaises(ValueError):
                preserve_locked_business_months(old, proposed, "2026-11")

    def test_current_month_remains_editable(self):
        old = seal_completed_business_months(self.records, self.snapshots, "2026-11")
        next_month = {**old, "2026-11": {
            "items": [{"name": "Unetwork", "start": 37.95, "end": 50.0}]}}
        self.assertEqual(
            preserve_locked_business_months(old, next_month, "2026-11"),
            next_month,
        )


if __name__ == "__main__":
    unittest.main()
