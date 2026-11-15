"""Regression tests for the 2026-11-01..06 Kryptex chart recovery."""
import unittest
from decimal import Decimal

from backend.kryptex_historical_recovery import build_verified_kryptex_recovery


class KryptexHistoricalRecoveryTests(unittest.TestCase):
    def test_screenshots_are_daily_rewards_not_cumulative_differences(self):
        original = {
            "kryptexMiningDaily": {
                "2026-11-01": 0,
                "2026-11-02": 0,
                "2026-11-03": 0,
                "2026-11-04": 0,
                "2026-11-05": 0,
                "2026-11-06": 0.16742608,
                "2026-11-07": 4.23816911,
            },
            "kryptexConfirmedDays": {
                **{f"2026-11-{day:02d}": True for day in range(1, 8)}
            },
            "monthlyEarnings": {"2026-11": 4.40559519, "2026-10": 99.654086},
            "lifetimeEarnedUsd": 374.68346382,
            "currentBalance": 280,
        }
        corrected, audit = build_verified_kryptex_recovery(original)
        self.assertEqual(
            [audit["days"][f"2026-11-{day:02d}"]["minedSats"] for day in range(1, 7)],
            [452, 1232, 1890, 3471, 5098, 5490],
        )
        self.assertEqual(audit["days"]["2026-11-06"]["minedBtc"], "0.00005490")
        self.assertAlmostEqual(corrected["kryptexMiningDaily"]["2026-11-06"], 4.15850646)
        self.assertAlmostEqual(corrected["kryptexMiningDaily"]["2026-11-04"], 2.79086762)
        self.assertAlmostEqual(audit["totalAddedUsd"], 13.58107263 - 0.16742608, places=5)
        self.assertAlmostEqual(
            corrected["lifetimeEarnedUsd"] - original["lifetimeEarnedUsd"],
            audit["totalAddedUsd"], places=6,
        )
        self.assertEqual(corrected["monthlyEarnings"]["2026-10"], 99.654086)
        self.assertEqual(corrected["currentBalance"], 280)
        self.assertEqual(original["kryptexMiningDaily"]["2026-11-01"], 0)
        again, second = build_verified_kryptex_recovery(corrected)
        self.assertEqual(second["totalAddedUsd"], 0)
        self.assertEqual(again["monthlyEarnings"], corrected["monthlyEarnings"])

    def test_existing_larger_verified_earning_is_not_reduced(self):
        original = {
            "kryptexMiningDaily": {"2026-11-05": 5.0, "2026-11-07": 1},
            "kryptexConfirmedDays": {"2026-11-05": True, "2026-11-07": True},
            "monthlyEarnings": {"2026-11": 6},
            "lifetimeEarnedUsd": 10,
        }
        next_tracker, audit = build_verified_kryptex_recovery(original)
        self.assertEqual(next_tracker["kryptexMiningDaily"]["2026-11-05"], 5)
        self.assertEqual(audit["days"]["2026-11-05"]["restoredUsd"], 0)


if __name__ == "__main__":
    unittest.main()
