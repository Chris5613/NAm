"""Regression checks for non-destructive snapshot reconciliation."""
import unittest

from backend.monthly_snapshot_guard import guard_monthly_snapshots


class MonthlySnapshotGuardTests(unittest.TestCase):
    MONTH = "2026-11"

    def test_stale_browser_cannot_reduce_extension_provider_income(self):
        before = {
            "2026-10": {"monthKey": "2026-10", "locked": True,
                        "total": 99, "platforms": [
                            {"platform": "Kryptex", "amount": 99}]},
            self.MONTH: {"monthKey": self.MONTH, "locked": False,
                         "platforms": [{"platform": "RollerCoin", "amount": 7.1},
                                       {"platform": "Unetwork", "amount": 9.7},
                                       {"platform": "Loopscale", "amount": 12.5}]},
        }
        incoming = {self.MONTH: {
            "monthKey": self.MONTH, "locked": False,
            "platforms": [{"platform": "RollerCoin", "amount": 5.0},
                          {"platform": "Unetwork", "amount": 6.9},
                          {"platform": "Kryptex", "amount": 40.0},
                          {"platform": "Salad", "amount": 4.0},
                          {"platform": "Loopscale", "amount": 12.2}]}}
        authoritative = [{
            "monthKey": self.MONTH, "platforms": [
                {"platform": "RollerCoin", "amount": 7.14},
                {"platform": "Unetwork", "amount": 9.78},
                {"platform": "Kryptex", "amount": 41.76},
                {"platform": "Salad", "amount": 4.24},
            ],
        }]
        old_before = str(before), str(incoming)
        saved = guard_monthly_snapshots(before, incoming, authoritative, self.MONTH)
        amounts = {item["platform"]: item["amount"]
                   for item in saved[self.MONTH]["platforms"]}
        self.assertEqual(amounts, {
            "RollerCoin": 7.14, "Unetwork": 9.78, "Kryptex": 41.76,
            "Salad": 4.24, "Loopscale": 12.2,
        })
        self.assertAlmostEqual(saved[self.MONTH]["total"], 75.12)
        self.assertEqual(saved["2026-10"], before["2026-10"])
        self.assertEqual(old_before, (str(before), str(incoming)))

    def test_signed_loopscale_pnl_can_fall_without_freezing_extension_income(self):
        before = {self.MONTH: {"platforms": [
            {"platform": "Kryptex", "amount": 4.0},
            {"platform": "Loopscale", "amount": 8.0}]}}
        incoming = {self.MONTH: {"platforms": [
            {"platform": "Kryptex", "amount": 2.0},
            {"platform": "Loopscale", "amount": -1.5}]}}
        authority = [{"monthKey": self.MONTH, "platforms": [
            {"platform": "Kryptex", "amount": 3.0}]}]
        saved = guard_monthly_snapshots(before, incoming, authority, self.MONTH)
        self.assertEqual(saved[self.MONTH]["total"], 1.5)

    def test_missing_backend_provider_keeps_previous_amount(self):
        before = {self.MONTH: {"platforms": [
            {"platform": "Unetwork", "amount": 10.0}]}}
        proposed = {self.MONTH: {"platforms": [
            {"platform": "Unetwork", "amount": 6.0},
            {"platform": "Lulo", "amount": 2.0}]}}
        result = guard_monthly_snapshots(before, proposed, [], self.MONTH)
        self.assertEqual({p["platform"]: p["amount"]
                          for p in result[self.MONTH]["platforms"]},
                         {"Unetwork": 10.0, "Lulo": 2.0})

    def test_locked_prior_month_cannot_be_clobbered_or_removed(self):
        before = {"2026-10": {"locked": True, "total": 45,
                              "platforms": [{"platform": "Kryptex", "amount": 45}]}}
        result = guard_monthly_snapshots(before, {"2026-10": {"total": 0}}, [],
                                         "2026-11")
        self.assertEqual(result["2026-10"], before["2026-10"])

    def test_invalid_wholesale_browser_clear_keeps_financial_history(self):
        before = {"2026-10": {"locked": True, "total": 45}}
        self.assertEqual(guard_monthly_snapshots(before, None, [], self.MONTH), before)

    def test_owner_confirmed_legacy_values_replace_only_open_month(self):
        from backend.legacy_income_reconciliation import confirmed_november_sources
        from datetime import date, timedelta
        start = date(2026, 11, 1)
        receipts = {
            (start + timedelta(days=i)).isoformat(): {"sources": {
                "Lulo": 4.623146 if i == 0 else 0,
                "Loopscale": 15.208745 if i == 0 else 0,
            }} for i in range(14)
        }
        confirmed = confirmed_november_sources(receipts, self.MONTH, "2026-11-14")
        self.assertEqual(confirmed, {"Lulo": 4.623146, "Loopscale": 15.208745})
        initial = {self.MONTH: {
            "platforms": [{"platform": "Kryptex", "amount": 41.826961},
                          {"platform": "Loopscale", "amount": 12.57}],
        }}
        canonical = [{"monthKey": self.MONTH, "platforms": [
            {"platform": "Kryptex", "amount": 41.826961}]}]
        updated = guard_monthly_snapshots(
            initial, initial, canonical, self.MONTH, confirmed_legacy=confirmed)
        values = {p["platform"]: p["amount"]
                  for p in updated[self.MONTH]["platforms"]}
        self.assertEqual(values["Lulo"], 4.623146)
        self.assertEqual(values["Loopscale"], 15.208745)
        self.assertAlmostEqual(updated[self.MONTH]["total"], sum(values.values()))
        self.assertEqual(initial[self.MONTH]["platforms"][1]["amount"], 12.57)
        # The same approval is idempotent and never applies to another month.
        self.assertEqual(guard_monthly_snapshots(
            updated, updated, canonical, self.MONTH, confirmed_legacy=confirmed),
            updated)
        self.assertEqual(confirmed_november_sources(
            receipts, "2026-12", "2026-12-01"), {})
        self.assertEqual(confirmed_november_sources(
            {"2026-11-01": {"sources": {"Lulo": 4.62, "Loopscale": 15.21}}},
            self.MONTH, "2026-11-14"), {})

    def test_confirmed_receipts_include_new_days_without_double_count(self):
        from backend.legacy_income_reconciliation import confirmed_november_sources
        from datetime import date, timedelta
        start = date(2026, 11, 1)
        receipts = {
            (start + timedelta(days=i)).isoformat(): {"sources": {
                "Lulo": 4.623146 if i == 0 else 0,
                "Loopscale": 15.208745 if i == 0 else 0,
            }} for i in range(14)
        }
        receipts["2026-11-15"] = {"sources": {"Loopscale": .3, "Lulo": .1}}
        values = confirmed_november_sources(receipts, self.MONTH, "2026-11-15")
        self.assertEqual(values, {"Loopscale": 15.508745, "Lulo": 4.723146})
        original = {self.MONTH: {"locked": True,
            "platforms": [{"platform": "Loopscale", "amount": 12.57}]}}
        result = guard_monthly_snapshots(
            original, original, [], self.MONTH, confirmed_legacy=values)
        self.assertEqual(result, original)


if __name__ == "__main__":
    unittest.main()
