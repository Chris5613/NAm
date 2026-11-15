"""Kryptex daily satoshi evidence and missing-conversion safeguards."""
import unittest
from datetime import datetime, timezone

from backend.kryptex_earnings_audit import (
    audit_kryptex_days,
    reconcile_kryptex_rewards,
)


class KryptexRewardAuditTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 14, 21, 0, tzinfo=timezone.utc)

    def test_falling_btc_usd_cannot_reduce_earnings_or_lifetime(self):
        old = {
            "kryptexMiningDaily": {"2026-11-13": 4.25},
            "kryptexConfirmedDays": {"2026-11-13": True},
            "monthlyEarnings": {"2026-11": 4.25},
            "lifetimeEarnedUsd": 100,
            "currentBalance": 280,
        }
        next_tracker = reconcile_kryptex_rewards(
            old, {"daily_usd": {"2026-11-13": 3.25},
                  "daily_sats": {"2026-11-13": 4796.38}}, self.now
        )
        self.assertEqual(next_tracker["kryptexMiningDaily"]["2026-11-13"], 4.25)
        self.assertEqual(next_tracker["kryptexMiningSatsDaily"]["2026-11-13"], 4796.38)
        self.assertEqual(next_tracker["monthlyEarnings"]["2026-11"], 4.25)
        self.assertEqual(next_tracker["lifetimeEarnedUsd"], 100)
        self.assertEqual(old["currentBalance"], 280)

    def test_sats_without_valid_usd_are_persisted_and_flagged(self):
        tracker = reconcile_kryptex_rewards(
            {}, {"daily_sats": {"2026-11-12": 1400.5},
                 "daily_usd": {"2026-11-12": 0}}, self.now
        )
        self.assertNotIn("2026-11-12", tracker["kryptexConfirmedDays"])
        self.assertEqual(tracker["kryptexPendingEarningsDays"], ["2026-11-12"])
        report = audit_kryptex_days(tracker, "2026-11-12", "2026-11-14")
        self.assertEqual(report[0]["status"], "needs-review")
        self.assertEqual(report[1]["status"], "no-evidence")

        corrected = reconcile_kryptex_rewards(
            tracker, {"daily_usd": {"2026-11-12": 1.25}}, self.now
        )
        self.assertEqual(corrected["kryptexPendingEarningsDays"], [])
        self.assertEqual(corrected["kryptexMiningDaily"]["2026-11-12"], 1.25)

    def test_later_satoshi_snapshot_can_be_lower_without_erasing_previous(self):
        first = reconcile_kryptex_rewards(
            {}, {"daily_sats": {"2026-11-11": 5000},
                 "daily_usd": {"2026-11-11": 3.9}}, self.now
        )
        second = reconcile_kryptex_rewards(
            first, {"daily_sats": {"2026-11-11": 900},
                    "daily_usd": {"2026-11-11": 2.4}}, self.now
        )
        self.assertEqual(second["kryptexMiningSatsDaily"]["2026-11-11"], 5000)
        self.assertEqual(second["kryptexMiningDaily"]["2026-11-11"], 3.9)
        self.assertEqual(second["kryptexPendingEarningsDays"], [])

    def test_future_or_invalid_readings_are_discarded(self):
        result = reconcile_kryptex_rewards(
            {}, {"daily_usd": {"2026-11-20": 20, "2026-11-13": -4},
                 "daily_sats": {"2026-11-20": 7000, "2026-11-12": 1300}},
            self.now
        )
        self.assertNotIn("2026-11-20", result["kryptexMiningDaily"])
        self.assertNotIn("2026-11-20", result["kryptexMiningSatsDaily"])
        self.assertEqual(result["kryptexPendingEarningsDays"], ["2026-11-12"])


if __name__ == "__main__":
    unittest.main()
