"""Provider-statistics parity fixtures for Phase 2 backend migration.

These assert the legacy application's exact high-risk accounting cases:
withdrawable balance is not earnings, opening baselines are not new income,
and TRX market repricing does not add mined rewards.
"""
from datetime import datetime, timezone
import unittest

from backend.provider_stats import (
    salad_stats, unetwork_stats, rollercoin_stats, kryptex_stats,
    provider_stats, current_keys,
)


class ProviderStatisticsTests(unittest.TestCase):
    def test_salad_projects_from_hour_apart_lifetime_samples(self):
        tracker = {
            "currentBalance": 4.1,
            "lifetimeBalance": 230.0,
            "monthlyEarnings": {"2026-10": 5.25},
            "earningSnapshots": [
                {"syncedAt": "2026-10-30T16:00:00Z", "lifetimeBalance": 100.15},
                {"syncedAt": "2026-10-30T17:00:00Z", "lifetimeBalance": 100.35},
            ],
        }
        result = salad_stats(tracker, "2026-10-30", "2026-10")
        self.assertAlmostEqual(result["estimatedHourlyUsd"], .20)
        self.assertAlmostEqual(result["estimatedDailyUsd"], 4.8)
        self.assertEqual(result["projectionSource"], "recent_hour")
        self.assertAlmostEqual(result["monthUsd"], 5.25)
        self.assertAlmostEqual(result["currentBalance"], 4.1)
        self.assertEqual(result["projectionWindowMinutes"], 60)

    def test_salad_uses_month_bucket_not_available_balance(self):
        result = salad_stats({
            "currentBalance": 90, "lifetimeBalance": 250,
            "monthlyEarnings": {"2026-10": 3},
            "earningSnapshots": [],
        }, "2026-10-30", "2026-10")
        self.assertEqual(result["monthUsd"], 3)
        self.assertAlmostEqual(result["estimatedDailyUsd"], 3 / 30)
        self.assertEqual(result["projectionSource"], "month_average")

    def test_salad_rejects_negative_hour_delta_and_uses_average(self):
        result = salad_stats({
            "monthlyEarnings": {"2026-10": 9},
            "earningSnapshots": [
                {"syncedAt": "2026-10-30T12:00:00Z", "lifetimeBalance": 10},
                {"syncedAt": "2026-10-30T13:00:00Z", "lifetimeBalance": 9},
            ]
        }, "2026-10-30", "2026-10")
        self.assertEqual(result["projectionSource"], "month_average")
        self.assertAlmostEqual(result["estimatedDailyUsd"], .3)

    def test_unetwork_baseline_and_completed_day_projection(self):
        result = unetwork_stats({
            "baselineInitialized": True,
            "openingMonth": "2026-10",
            "openingEarnedUsd": 1.99,
            "openingMonthRowsBaselineUsd": 1.0,
            "daily": {
                "2026-10-28": {"usd": 1.0},
                "2026-10-29": {"usd": 1.5},
                "2026-10-30": {"usd": .3},
            },
        }, "2026-10-30", "2026-10")
        self.assertAlmostEqual(result["monthUsd"], 1.99 + (2.8 - 1.0))
        self.assertEqual(result["projectionSource"], "latest_completed_day")
        self.assertEqual(result["projectionDate"], "2026-10-29")
        self.assertEqual(result["estimatedDailyUsd"], 1.5)
        self.assertAlmostEqual(result["lifetimeUsd"], 2.8)

    def test_unetwork_projection_fallback(self):
        result = unetwork_stats({"daily": {"2026-10-30": {"usd": .8}}},
                                "2026-10-30", "2026-10")
        self.assertEqual(result["projectionSource"], "fallback")
        self.assertEqual(result["estimatedDailyUsd"], 1)

    def test_rollercoin_wallet_replaces_overlapping_legacy_row(self):
        tracker = {
            "daily": {
                "2026-10-30": {"trx": .8, "usd": .24},
                "2026-10-29": {"trx": 1.5, "usd": .45},
            },
            "walletDaily": {
                "2026-10-30": {"trx": 1.0, "usd": .31},
            },
            "currentTrxBalance": 35.269272,
            "lastTrxPrice": .33,
        }
        result = rollercoin_stats(tracker, "2026-10-30", "2026-10")
        self.assertAlmostEqual(result["todayTrx"], 1.0)
        self.assertAlmostEqual(result["todayUsd"], .31)
        self.assertAlmostEqual(result["monthUsd"], .45 + .31)
        self.assertAlmostEqual(result["monthTrx"], 2.5)
        self.assertAlmostEqual(result["currentBalanceUsd"], 35.269272 * .33)
        self.assertEqual(result["transactionCount"], 2)

    def test_rollercoin_does_not_reprice_recorded_usd(self):
        tracker = {"daily": {"2026-10-29": {"usd": .12, "trx": .4}},
                   "lastTrxPrice": .8, "currentTrxBalance": 20}
        result = rollercoin_stats(tracker, "2026-10-30", "2026-10")
        self.assertEqual(result["monthUsd"], .12)
        self.assertEqual(result["todayUsd"], 0)
        self.assertEqual(result["currentBalanceUsd"], 16.0)

    def test_kryptex_known_legacy_opening_balance_and_profitability(self):
        result = kryptex_stats({
            "currentBalance": 0, "lifetimeEarnedUsd": 20,
            "profitabilityUsdDay": 1.2,
            "monthlyEarnings": {"2026-10": 2.15},
            "miners": [{"id": "1"}],
        }, "2026-10")
        self.assertEqual(result["currentBalanceUsd"], 16.47)
        self.assertAlmostEqual(result["earnedSinceBaseline"], 3.53)
        self.assertEqual(result["monthUsd"], 2.15)
        self.assertEqual(result["dailyUsd"], 1.2)
        self.assertEqual(len(result["miners"]), 1)

    def test_timezone_uses_pacific_near_midnight(self):
        day, month = current_keys(datetime(2026, 11, 1, 5, 0, tzinfo=timezone.utc))
        self.assertEqual((day, month), ("2026-10-31", "2026-10"))

    def test_all_four_providers_returned_without_network(self):
        result = provider_stats({}, "2026-10-30", "2026-10")
        self.assertEqual(set(result), {"salad", "unetwork", "kryptex", "rollercoin"})
        self.assertEqual(result["unetwork"]["estimatedDailyUsd"], 1.0)


if __name__ == "__main__":
    unittest.main()
