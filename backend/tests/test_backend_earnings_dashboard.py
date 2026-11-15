"""Regression coverage for backend-owned daily/weekly/monthly display math."""
from datetime import datetime, timezone
import unittest

from backend.earnings_dashboard import build_backend_earnings_dashboard, provider_entries


class BackendEarningsDashboardTests(unittest.TestCase):
    def test_verified_kryptex_correction_does_not_rewrite_legacy_record(self):
        record = {"sources": {"Kryptex": 12.26862279, "Loopscale": .73005606,
                              "Unetwork": .772215}}
        trackers = {"Kryptex": {"kryptexConfirmedDays": {"2026-11-04": True},
                                  "kryptexMiningDaily": {"2026-11-04": 2.790868}}}
        original = str(record)
        row = provider_entries("2026-11-04", record, trackers)
        self.assertAlmostEqual(row["sources"]["Kryptex"], 2.790868)
        self.assertAlmostEqual(row["value"], 4.29313906)
        self.assertIn("Loopscale", row["provisionalSources"])
        self.assertGreater(abs(row["correctedSourcesUsd"]["Kryptex"]), 9)
        self.assertEqual(str(record), original)

    def test_all_rendered_totals_are_derived_from_same_server_daily_rows(self):
        today = "2026-11-14"
        rows = {
            "2026-11-13": {"sources": {"Kryptex": 2.8, "Unetwork": .62}},
            today: {"sources": {"Kryptex": 3.1, "Loopscale": 1.37,
                                "Unetwork": .620796, "RollerCoin": .37592862}},
        }
        trackers = {
            "Kryptex": {"kryptexConfirmedDays": {today: True},
                        "kryptexMiningDaily": {today: 3.43481163}},
            "Unetwork": {"daily": {today: {"usd": .620796, "micros": 620796}}},
            "RollerCoin": {"walletDaily": {today: {"usd": .37592862}}},
        }
        dashboard = build_backend_earnings_dashboard("2026-11", today, rows, trackers)
        current = dashboard["days"][13]
        self.assertAlmostEqual(current["value"], 3.43481163 + 1.37 + .620796 + .37592862)
        self.assertAlmostEqual(dashboard["todayTotalUsd"], current["value"])
        self.assertAlmostEqual(dashboard["weeklyTotalUsd"],
                               dashboard["days"][12]["value"] + current["value"])
        self.assertAlmostEqual(dashboard["monthTotalUsd"],
                               dashboard["days"][12]["value"] + current["value"])
        self.assertEqual(dashboard["days"][14]["value"], None)
        self.assertEqual(dashboard["days"][14]["future"], True)
        self.assertEqual(dashboard["sourceOfCalculation"], "backend-postgres")

    def test_no_legacy_entry_is_not_invented_as_zero(self):
        rows = build_backend_earnings_dashboard(
            "2026-11", "2026-11-14", {}, {})
        self.assertIsNone(rows["todayTotalUsd"])
        self.assertIsNone(rows["days"][12]["value"])
        self.assertEqual(rows["monthTotalUsd"], 0)

    def test_dated_provider_credit_replaces_legacy_without_double_count(self):
        record = {"sources": {"Unetwork": .8, "RollerCoin": .5, "Salad": .3}}
        trackers = {
            "Unetwork": {"daily": {"2026-11-14": {"micros": 620796,"usd":.620796}}},
            "RollerCoin": {"walletDaily": {"2026-11-14": {"usd": .37592862}}},
            "Salad": {"daily": {"2026-11-14": .22}},
        }
        row = provider_entries("2026-11-14", record, trackers)
        self.assertAlmostEqual(row["value"], .620796 + .37592862 + .22)
        self.assertNotIn("Unetwork", row["provisionalSources"])
        self.assertNotIn("RollerCoin", row["provisionalSources"])

    def test_corrected_confirmed_reward_does_not_make_month_unverified(self):
        day = "2026-11-14"
        rows = {day: {"sources": {"Kryptex": 10.0}}}
        trackers = {"Kryptex": {
            "kryptexConfirmedDays": {day: True},
            "kryptexMiningDaily": {day: 3.0},
        }}
        result = build_backend_earnings_dashboard("2026-11", day, rows, trackers)
        self.assertTrue(result["fullyVerified"])
        self.assertEqual(result["reviewDays"][0]["corrections"]["Kryptex"], -7.0)
        self.assertEqual(result["reviewDays"][0]["sources"], [])
        self.assertEqual(result["monthTotalUsd"], 3.0)

    def test_unreconciled_legacy_income_remains_explicit_and_unverified(self):
        day = "2026-11-14"
        rows = {day: {"sources": {"Loopscale": 2.5, "Lulo": 0,
                                 "Kryptex": 5.0}}}
        trackers = {"Kryptex": {
            "kryptexConfirmedDays": {day: True},
            "kryptexMiningDaily": {day: 3.0},
        }}
        result = build_backend_earnings_dashboard("2026-11", day, rows, trackers)
        self.assertFalse(result["fullyVerified"])
        self.assertEqual(result["reviewDays"][0]["sources"], ["Loopscale"])
        self.assertEqual(result["monthTotalUsd"], 5.5)
        self.assertEqual(result["days"][13]["provisionalSources"], ["Loopscale"])

    def test_bad_numeric_does_not_become_fake_credit(self):
        row = provider_entries("2026-11-14", {"sources": {"Kryptex": float("nan"),
                                  "Salad": -2, "Loopscale": 1.1}}, {})
        self.assertEqual(row["value"], 1.1)
        self.assertEqual(row["sources"], {"Loopscale": 1.1})


if __name__ == "__main__":
    unittest.main()
