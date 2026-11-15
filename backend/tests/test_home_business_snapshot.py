import copy
import unittest

from backend.home_business_snapshot import (
    home_business_snapshot, current_live_assets, cash_opening,
)


class HomeBusinessSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.saved = {
            "monthly_business_changes_v1": {
                "2026-11": {"items": [
                    {"name": "Lulo", "start": 2484.14, "end": 0},
                    {"name": "Cash / Bank", "start": 100, "end": 100},
                    {"name": "BTC", "start": 50},
                ]},
            },
            "financials_journal_v1": [],
            "hardware_payback_devices_v1": [],
            "financials_unetwork_business_phones_v1": [],
            "financials_bank_openings_v1": {"2026-11": 100},
            "yield_project_latest_balance_feed_v1": {
                "receivedAt": "2026-11-15T12:00:00Z",
                "projects": [
                    {"name": "Lulo", "balanceUsd": "1500.639169"},
                    {"name": "Kryptex", "balanceUsd": "200"},
                ],
            },
        }

    def test_lulo_withdrawal_is_not_reintroduced_by_stale_project_feed(self):
        first = home_business_snapshot(self.saved, "2026-11", 50)
        changed = copy.deepcopy(self.saved)
        changed["yield_project_latest_balance_feed_v1"]["projects"][0][
            "balanceUsd"] = "99999"
        second = home_business_snapshot(changed, "2026-11", 50)
        self.assertEqual(first["business"], second["business"])
        self.assertEqual(current_live_assets(self.saved, 50)["lulo"], 0)
        self.assertEqual(first["business"]["bankCashValue"], 100)

    def test_missing_bitcoin_quote_is_not_assumed_to_be_zero(self):
        result = home_business_snapshot(self.saved, "2026-11")
        self.assertTrue(result["business"]["incomplete"])
        self.assertFalse(result["complete"])
        self.assertFalse(result["bitcoinIncluded"])

    def test_free_power_month_does_not_post_saved_nominal_cost(self):
        saved = copy.deepcopy(self.saved)
        saved["financials_power_estimates_v1"] = {
            "2026-11": {"cost": 200, "estimated": True},
        }
        with_estimate = home_business_snapshot(saved, "2026-11", 50)
        without_estimate = home_business_snapshot(
            self.saved, "2026-11", 50)
        self.assertEqual(with_estimate["business"],
                         without_estimate["business"])

    def test_bank_carry_forward_preserves_posted_activity(self):
        openings = {"2026-11": 500}
        ledger = [{"date": "2026-11-12", "debitAccount": "equipment",
                   "creditAccount": "cash", "amount": 200}]
        self.assertEqual(cash_opening("2026-12", openings, ledger, []), 300)

    def test_locked_month_missing_asset_remains_unverified(self):
        saved = copy.deepcopy(self.saved)
        saved["financials_month_closes_v1"] = {
            "2026-11": {"rows": [
                {"id": "ledger:cash", "category": "cash", "end": 100},
                {"id": "bitcoin", "category": "digital", "end": None},
                {"id": "payable", "category": "liabilities", "end": 0},
            ]},
        }
        result = home_business_snapshot(saved, "2026-11", 50)
        self.assertEqual(result["source"], "locked-month-rows")
        self.assertFalse(result["complete"])
        self.assertTrue(result["business"]["incomplete"])
        self.assertIsNone(result["business"]["netValue"])

    def test_locked_month_missing_liability_remains_unverified(self):
        saved = copy.deepcopy(self.saved)
        saved["financials_month_closes_v1"] = {
            "2026-11": {"rows": [
                {"id": "ledger:cash", "category": "cash", "end": 100},
                {"id": "payable", "category": "liabilities", "end": None},
            ]},
        }
        result = home_business_snapshot(saved, "2026-11", 50)
        self.assertFalse(result["complete"])
        self.assertTrue(result["business"]["liabilitiesIncomplete"])
        self.assertIsNone(result["business"]["netValue"])

    def test_source_assets_are_read_only(self):
        original = copy.deepcopy(self.saved)
        home_business_snapshot(self.saved, "2026-11", 100)
        self.assertEqual(self.saved, original)


if __name__ == "__main__":
    unittest.main()
