"""Parity fixtures for monthly extension-provider income."""
import json
import os
import unittest

from backend.provider_monthly_income import monthly_provider_income


def monthly_sources(result):
    return {
        month["monthKey"]: {
            item["platform"]: item["amount"] for item in month["platforms"]
        }
        for month in result
    }


class MonthlyProviderTests(unittest.TestCase):
    def setUp(self):
        self._old_profile = os.environ.get("NAM_PRIVATE_ACCOUNTING_PROFILE_JSON")
        os.environ["NAM_PRIVATE_ACCOUNTING_PROFILE_JSON"] = json.dumps({
            "kryptexOpeningBalanceUsd": 12.5,
            "rollercoinSeptemberBaselineTrx": 40,
        })

    def tearDown(self):
        if self._old_profile is None:
            os.environ.pop("NAM_PRIVATE_ACCOUNTING_PROFILE_JSON", None)
        else:
            os.environ["NAM_PRIVATE_ACCOUNTING_PROFILE_JSON"] = self._old_profile

    def test_salad_current_month_uses_bucket_not_daily_or_balance(self):
        rows = monthly_sources(monthly_provider_income({
            "salad": {
                "currentBalance": 1000,
                "daily": {
                    "2026-09-28": .25,
                    "2026-09-29": .5,
                    "2026-10-30": 1.50,
                },
                "monthlyEarnings": {"2026-09": 100, "2026-10": 2.0},
            }
        }, "2026-10"))
        self.assertEqual(rows["2026-09"]["Salad"], .75)
        self.assertEqual(rows["2026-10"]["Salad"], 2.0)

    def test_rollcoin_dated_rows_and_wallet_overrides(self):
        rows = monthly_sources(monthly_provider_income({
            "rollercoin": {
                "lastTrxPrice": .31,
                "currentTrxBalance": 40,
                "daily": {
                    "2026-09-12": {"usd": 100, "trx": 45},
                    "2026-09-15": {"usd": .20, "trx": .6},
                    "2026-10-28": {"usd": .3, "trx": 1},
                    "2026-10-29": {"usd": .3, "trx": 1},
                },
                "walletDaily": {
                    "2026-10-29": {"usd": .27, "trx": 1},
                    "2026-10-30": {"usd": .33, "trx": 1},
                },
            }
        }, "2026-10"))
        self.assertEqual(rows["2026-09"]["RollerCoin"], .20)
        self.assertAlmostEqual(rows["2026-10"]["RollerCoin"], .3 + .27 + .33)

    def test_rollcoin_wallet_only_month_uses_stored_usd(self):
        rows = monthly_sources(monthly_provider_income({
            "rollercoin": {
                "lastTrxPrice": 100,
                "walletDaily": {"2026-11-01": {"usd": .15, "trx": .5}},
            }
        }, "2026-11"))
        self.assertEqual(rows["2026-11"]["RollerCoin"], .15)

    def test_unetwork_opening_month_baseline_avoids_recount(self):
        rows = monthly_sources(monthly_provider_income({
            "unetwork": {
                "openingMonth": "2026-10",
                "baselineInitialized": True,
                "openingEarnedUsd": 1.99,
                "openingMonthRowsBaselineUsd": 1.25,
                "daily": {
                    "2026-10-20": {"usd": 1.25},
                    "2026-10-21": {"usd": .65},
                },
            }
        }, "2026-10"))
        self.assertAlmostEqual(rows["2026-10"]["Unetwork"], 2.64)

    def test_unetwork_baseline_without_any_dated_allocation(self):
        rows = monthly_sources(monthly_provider_income({
            "unetwork": {
                "openingMonth": "2026-09",
                "baselineInitialized": True,
                "openingEarnedUsd": 2.25,
            }
        }, "2026-10"))
        self.assertEqual(rows["2026-09"]["Unetwork"], 2.25)

    def test_kryptex_legacy_baseline_and_monthly_profit(self):
        rows = monthly_sources(monthly_provider_income({
            "kryptex": {"monthlyEarnings": {
                "2026-09": 12.5, "2026-10": .47
            }}
        }, "2026-10"))
        self.assertEqual(rows["2026-09"]["Kryptex"], 12.5)
        self.assertEqual(rows["2026-10"]["Kryptex"], .47)

    def test_empty_and_unsupported_months(self):
        self.assertEqual(monthly_provider_income({
            "salad": {"monthlyEarnings": {"2026-08": 5, "2026-10": 0}},
            "kryptex": {"monthlyEarnings": {}},
        }, "2026-10"), [])


if __name__ == "__main__":
    unittest.main()
