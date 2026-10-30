"""Read-only Lulo / Loopscale server polling normalization and wallet validation."""
from datetime import datetime, timezone
from unittest import TestCase
from unittest.mock import patch

from backend.yield_source_sync import (
    valid_wallet, registered_wallets, normalize_lulo, normalize_loopscale,
    stamp_ms, fetch_lulo, fetch_loopscale, USDC_MINT, ONYC_MINT, USDS_MINT,
)

LULO_WALLET = "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM"
OTHER_WALLET = "72eGAvpNKB8YcpbS15BjZ7fkb7Lm8GjQSyHyxEAq8YBH"


def lulo_fixture():
    return {
        "account": {
            "lusdUsdBalance": 50, "pusdUsdBalance": 40,
            "totalUsdValue": 100,
            "totalInterestEarned": 4.2,
            "regularInterestEarned": 2.5,
            "protectedInterestEarned": 1.7,
        },
        "custom": {
            "totalValue": 20, "interestEarned": 1.1,
            "realtimeAPY": 7.0,
            "tokenBalances": [{"mint": USDS_MINT, "usdValue": 20}],
        },
        "pools": {"regular": {"apy": .05}, "protected": {"apy": .03}},
        "v0Performance": [
            {"fromTimestamp": 1793206800,
             "balanceChanges": {"0": {"balance_change": .1}}},
        ],
        "v1Performance": [
            {"date": "2026-10-28T09:00:00Z", "regularInterestEarned": .2,
             "protectedInterestEarned": .03},
            {"date": "2026-10-29T09:00:00Z", "regularInterestEarned": .25},
        ],
    }


def loopscale_fixture():
    return {
        "items": [{
            "loan": {"borrower": LULO_WALLET, "address": "ONyc-loan",
                     "closed": False, "startTime": 1790000000},
            "loanType": 2,
            "ledgers": [{"isLoop": 1, "principalMint": USDC_MINT, "apy": 83300}],
            "collateral": [{"assetMint": ONYC_MINT, "amount": 12_000_000_000}],
            "collateralUsd": 15, "principalUsd": 10, "interestAccruedUsd": .1,
            "pendingYieldUsd": .012, "pnl": {"usdPnl": 1.98}, "pnlUsd": .81,
            "collateralYieldPct": .09,
        }],
        "aggregate": {"dailyCollateralYieldUsd": .03,
                      "dailyInterestUsd": .01,
                      "dailyPrincipalYieldUsd": .005},
        "snapshotTs": 1793400000,
    }


class YieldSourceNormalizationTests(TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 30, 20, 30, tzinfo=timezone.utc)

    def test_registered_wallets_deduped_validated_and_bounded(self):
        wallets = registered_wallets([LULO_WALLET, LULO_WALLET], LULO_WALLET)
        self.assertEqual(wallets, {"lulo": [LULO_WALLET], "loopscale": LULO_WALLET})
        for invalid in ("https://bad.example/", "", "O" * 44):
            with self.assertRaises(ValueError):
                registered_wallets([invalid], None)
        with self.assertRaises(ValueError):
            registered_wallets([{"not": "a wallet"}], None)
        with self.assertRaises(ValueError):
            registered_wallets([LULO_WALLET] * 9, None)

    def test_lulo_current_balance_and_weighted_apy(self):
        result = normalize_lulo(LULO_WALLET, lulo_fixture(), self.now)
        self.assertEqual(result["totalBalanceUsd"], 120)
        self.assertEqual(result["regularBalanceUsd"], 50)
        self.assertEqual(result["protectedBalanceUsd"], 40)
        self.assertEqual(result["usdsBalanceUsd"], 20)
        self.assertAlmostEqual(result["totalInterestEarnedUsd"], 5.3)
        self.assertAlmostEqual(result["weightedApy"], (50*5+40*3+20*7)/120)
        self.assertEqual(result["source"], "lulo_api")

    def test_lulo_dated_performance_dedup_and_completed_day(self):
        result = normalize_lulo(LULO_WALLET, lulo_fixture(), self.now)
        observations = {row["date"]: row["amount"] for row in result["dailyPerformance"]}
        self.assertAlmostEqual(observations["2026-10-28"], .33)
        self.assertAlmostEqual(observations["2026-10-29"], .25)
        self.assertAlmostEqual(result["fiveDayAverageUsd"], .29)

    def test_lulo_no_zero_balance_written_when_api_unusable(self):
        with self.assertRaises(ValueError):
            normalize_lulo(LULO_WALLET, {"account": {}, "custom": {}}, self.now)
        with self.assertRaises(ValueError):
            normalize_lulo(LULO_WALLET, {"account": {"totalUsdValue": 0}}, self.now)

    def test_timestamp_seconds_millis_and_iso(self):
        self.assertEqual(stamp_ms(1793206800), 1793206800000)
        self.assertEqual(stamp_ms("2026-10-28T09:00:00Z"), 1793178000000)
        self.assertIsNone(stamp_ms("not-a-time"))

    def test_loopscale_uses_ui_pnl_and_net_equity(self):
        result = normalize_loopscale(LULO_WALLET, loopscale_fixture(), self.now)
        self.assertAlmostEqual(result["positionValueUsd"], 4.9)
        self.assertAlmostEqual(result["suppliedOnyc"], 12)
        self.assertAlmostEqual(result["priceUsd"], 1.25)
        self.assertAlmostEqual(result["quantity"], 4.9/1.25)
        self.assertAlmostEqual(result["pnlUsd"], 1.98)
        self.assertAlmostEqual(result["dailyNetYieldUsd"], .015)
        self.assertAlmostEqual(result["netApy"], (.015 * 365 / 4.9) * 100)
        self.assertEqual(result["source"], "loopscale")
        self.assertIsNone(result["health"])

    def test_loopscale_filters_other_wallets_and_closed_positions(self):
        payload = loopscale_fixture()
        payload["items"].insert(0, {
            "loan": {"borrower": OTHER_WALLET, "closed": False},
            "loanType": 2, "collateralUsd": 999,
        })
        self.assertEqual(normalize_loopscale(LULO_WALLET, payload, self.now)["loanAddress"], "ONyc-loan")
        with self.assertRaises(ValueError):
            normalize_loopscale(LULO_WALLET, {"items": [payload["items"][0]]}, self.now)

    def test_loopscale_fallback_when_aggregate_unavailable(self):
        payload = loopscale_fixture()
        payload.pop("aggregate")
        result = normalize_loopscale(LULO_WALLET, payload, self.now)
        self.assertAlmostEqual(result["dailyNetYieldUsd"],
                               (15 * .09 - 10 * (83300 / 1_000_000)) / 365)

    def test_lulo_missing_key_does_not_fetch(self):
        with patch.dict("os.environ", {"LULO_API_KEY": ""}):
            with self.assertRaises(RuntimeError):
                fetch_lulo(LULO_WALLET)

    def test_loopscale_rejects_invalid_wallet_without_http(self):
        self.assertFalse(valid_wallet("abc.com"))
        with self.assertRaises(ValueError):
            fetch_loopscale("abc.com")


if __name__ == "__main__":
    import unittest
    unittest.main()
