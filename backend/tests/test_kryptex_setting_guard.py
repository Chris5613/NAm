"""Regression tests for legacy browser writes to the Kryptex settings key."""
import unittest

from backend.kryptex_setting_guard import merge_legacy_kryptex_setting


class KryptexSettingGuardTests(unittest.TestCase):
    def test_old_browser_does_not_delete_recovered_rewards(self):
        original = {
            "initialized": True,
            "kryptexMiningDaily": {
                "2026-11-01": 0.353683,
                "2026-11-06": 4.158506,
                "2026-11-07": 3.2,
            },
            "kryptexConfirmedDays": {
                "2026-11-01": True,
                "2026-11-06": True,
                "2026-11-07": True,
            },
            "kryptexMiningSatsDaily": {
                "2026-11-01": 452,
                "2026-11-06": 5490,
                "2026-11-07": 4500,
            },
            "kryptexPendingEarningsDays": [],
            "kryptexLastChartSyncAt": "2026-11-14T22:00:00Z",
            "monthlyEarnings": {"2026-11": 7.712189},
            "lifetimeEarnedUsd": 388.16,
            "activeMachineCount": 2,
            "currentBalance": 268,
            "profitabilityUsdDay": 4.9,
        }
        old_client = {
            "initialized": True,
            "kryptexMiningDaily": {
                "2026-11-01": 0,
                "2026-11-06": 3.2,
                "2026-11-07": 2.0,
                "2026-11-08": 2.8,
            },
            "kryptexConfirmedDays": {
                "2026-11-01": False,
                "2026-11-06": True,
                "2026-11-07": True,
                "2026-11-08": True,
            },
            "monthlyEarnings": {"2026-11": 1.0},
            "lifetimeEarnedUsd": 220,
            "currentBalance": 256,
            "profitabilityUsdDay": 1.1,
        }
        result = merge_legacy_kryptex_setting(original, old_client)
        self.assertEqual(result["kryptexMiningSatsDaily"]["2026-11-01"], 452)
        self.assertEqual(result["kryptexMiningSatsDaily"]["2026-11-06"], 5490)
        self.assertEqual(result["kryptexMiningDaily"]["2026-11-06"], 4.158506)
        self.assertTrue(result["kryptexConfirmedDays"]["2026-11-01"])
        self.assertEqual(result["kryptexMiningDaily"]["2026-11-08"], 2.8)
        self.assertAlmostEqual(
            result["monthlyEarnings"]["2026-11"],
            0.353683 + 4.158506 + 3.2 + 2.8,
            places=6,
        )
        self.assertGreaterEqual(result["lifetimeEarnedUsd"], 390.96)
        self.assertEqual(result["currentBalance"], 268)
        self.assertEqual(result["profitabilityUsdDay"], 4.9)
        self.assertEqual(original["kryptexMiningDaily"]["2026-11-06"], 4.158506)

    def test_satoshi_readings_are_high_water_and_pending_clears_on_confirmation(self):
        original = {
            "kryptexMiningSatsDaily": {"2026-11-13": 4796, "2026-11-14": 1200},
            "kryptexPendingEarningsDays": ["2026-11-14"],
            "kryptexMiningDaily": {"2026-11-13": 3.0},
            "kryptexConfirmedDays": {"2026-11-13": True},
            "monthlyEarnings": {"2026-11": 3.0},
        }
        proposed = {
            "kryptexMiningSatsDaily": {"2026-11-13": 1000, "2026-11-14": 1500},
            "kryptexMiningDaily": {"2026-11-14": 1.15},
            "kryptexConfirmedDays": {"2026-11-14": True},
            "kryptexPendingEarningsDays": ["2026-11-14"],
        }
        result = merge_legacy_kryptex_setting(original, proposed)
        self.assertEqual(result["kryptexMiningSatsDaily"]["2026-11-13"], 4796)
        self.assertEqual(result["kryptexMiningSatsDaily"]["2026-11-14"], 1500)
        self.assertEqual(result["kryptexMiningDaily"]["2026-11-14"], 1.15)
        self.assertEqual(result["kryptexPendingEarningsDays"], [])
        self.assertEqual(result["monthlyEarnings"]["2026-11"], 4.15)


if __name__ == "__main__":
    unittest.main()
