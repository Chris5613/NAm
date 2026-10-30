"""Backend replay and cash-flow protection tests for Phase 4 earnings ledgers."""
from copy import deepcopy
from datetime import datetime, timezone
import unittest

from backend.yield_earnings_ledger import (
    advance_loopscale_history, advance_lulo_monthly, lulo_monthly_backfills,
)

LOAN = "onyc-loan-1"
PROJECT = {"id": "lulo-a", "lulo_weighted_apy": 5, "lulo_interest_offset_usd": 0}


def loop_sample(pnl, observed_at="2026-10-30T18:00:00Z", value=100, started="2026-10-01T12:00:00Z"):
    return {"loanAddress": LOAN, "asset": "ONyc", "pnlUsd": pnl,
            "positionValueUsd": value, "netApy": 7.2, "startTime": started,
            "syncedAt": observed_at}


def lulo_sample(interest, balance=1000, stamp="2026-10-30T18:00:00Z"):
    return {"totalInterestEarnedUsd": interest, "totalBalanceUsd": balance,
            "weightedApy": 5, "syncedAt": stamp}


class LoopscaleLedgerTests(unittest.TestCase):
    def test_first_observation_of_existing_loan_becomes_baseline(self):
        result = advance_loopscale_history({}, loop_sample(1.8))
        position = result["positions"][LOAN]
        self.assertEqual(position["monthBaselines"]["2026-10"], 1.8)
        self.assertEqual(position["monthlyEarnings"]["2026-10"], 0)
        self.assertEqual(position["observedDaily"], {})
        self.assertEqual(len(position["observations"]), 1)

    def test_new_loan_starting_this_month_uses_zero_baseline(self):
        result = advance_loopscale_history(
            {}, loop_sample(1.8, started="2026-10-01T12:00:00Z")
        )
        self.assertEqual(result["positions"][LOAN]["monthBaselines"]["2026-10"], 0)
        self.assertEqual(result["positions"][LOAN]["monthlyEarnings"]["2026-10"], 1.8)

    def test_repeated_and_old_observations_are_idempotent(self):
        a = advance_loopscale_history({}, loop_sample(0.5))
        b = advance_loopscale_history(a, loop_sample(0.5))
        older = advance_loopscale_history(b, loop_sample(99, "2026-10-30T17:00:00Z"))
        self.assertEqual(a, b)
        self.assertEqual(a, older)

    def test_positive_and_negative_daily_pnl_and_no_double_count(self):
        a = advance_loopscale_history({}, loop_sample(2.5))
        b = advance_loopscale_history(a, loop_sample(2.25, "2026-10-30T19:00:00Z"))
        c = advance_loopscale_history(b, loop_sample(2.75, "2026-10-30T20:00:00Z"))
        self.assertAlmostEqual(c["positions"][LOAN]["observedDaily"]["2026-10-30"], .25)
        self.assertEqual(len(c["positions"][LOAN]["observations"]), 3)
        self.assertEqual(advance_loopscale_history(c, loop_sample(2.75, "2026-10-30T20:00:00Z")), c)

    def test_month_rollover_uses_previous_pnl_as_baseline(self):
        first = advance_loopscale_history({}, loop_sample(2.5, "2026-10-31T23:00:00Z",
                                                          started="2026-09-01T00:00:00Z"))
        following = advance_loopscale_history(first, loop_sample(2.6, "2026-11-01T15:00:00Z",
                                                               started="2026-09-01T00:00:00Z"))
        entry = following["positions"][LOAN]
        self.assertEqual(entry["monthBaselines"]["2026-11"], 2.5)
        self.assertAlmostEqual(entry["monthlyEarnings"]["2026-11"], .1)
        self.assertAlmostEqual(entry["observedDaily"]["2026-11-01"], .1)

    def test_lagging_source_cannot_remove_other_positions(self):
        original = {"positions": {"another-loan": {"lastPnlUsd": 19.3}}}
        result = advance_loopscale_history(original, loop_sample(2.5))
        self.assertIn("another-loan", result["positions"])
        self.assertEqual(original, {"positions": {"another-loan": {"lastPnlUsd": 19.3}}})

    def test_invalid_pnl_is_not_saved(self):
        prior = advance_loopscale_history({}, loop_sample(3))
        for pnl in ("nope", float("nan"), float("inf")):
            self.assertEqual(advance_loopscale_history(prior, loop_sample(pnl, "2026-10-30T20:00:00Z")), prior)


class LuloMonthlyLedgerTests(unittest.TestCase):
    def test_first_sync_preserves_zero_opening_income_in_october(self):
        result = advance_lulo_monthly({}, PROJECT, lulo_sample(12))
        entry = result["lulo-a"]["2026-10"]
        self.assertEqual(entry["version"], 5)
        self.assertEqual(entry["monthEarned"], 0)
        self.assertEqual(entry["lastLifetimeInterest"], 12)

    def test_first_september_observation_preserves_905_baseline(self):
        record = advance_lulo_monthly({}, PROJECT, lulo_sample(9.1, stamp="2026-09-30T18:00:00Z"))
        self.assertEqual(record["lulo-a"]["2026-09"]["monthEarned"], 9.05)

    def test_small_plausible_interest_adds_once(self):
        old = advance_lulo_monthly({}, PROJECT, lulo_sample(10))
        next_one = advance_lulo_monthly(old, PROJECT, lulo_sample(10.15, stamp="2026-10-30T19:00:00Z"))
        latest = advance_lulo_monthly(next_one, PROJECT, lulo_sample(10.15, stamp="2026-10-30T19:00:00Z"))
        self.assertEqual(next_one, latest)
        self.assertAlmostEqual(latest["lulo-a"]["2026-10"]["monthEarned"], .15)
        self.assertAlmostEqual(latest["lulo-a"]["2026-10"]["observedDaily"]["2026-10-30"], .15)

    def test_deposit_or_withdrawal_reanchors_without_income(self):
        old = advance_lulo_monthly({}, PROJECT, lulo_sample(10))
        deposit = advance_lulo_monthly(old, PROJECT, lulo_sample(25, balance=1050, stamp="2026-10-30T19:00:00Z"))
        withdraw = advance_lulo_monthly(deposit, PROJECT, lulo_sample(3, balance=900, stamp="2026-10-30T20:00:00Z"))
        entry = withdraw["lulo-a"]["2026-10"]
        self.assertEqual(entry["monthEarned"], 0)
        self.assertEqual(entry["lastLifetimeInterest"], 3)
        self.assertEqual(entry["lastCashFlowAt"], "2026-10-30T20:00:00Z")

    def test_implausible_interest_is_rejected_then_reanchored(self):
        old = advance_lulo_monthly({}, PROJECT, lulo_sample(10))
        spike = advance_lulo_monthly(old, PROJECT, lulo_sample(300, stamp="2026-10-30T19:00:00Z"))
        self.assertEqual(spike["lulo-a"]["2026-10"]["monthEarned"], 0)
        tiny = advance_lulo_monthly(spike, PROJECT, lulo_sample(300.03, stamp="2026-10-30T20:00:00Z"))
        self.assertAlmostEqual(tiny["lulo-a"]["2026-10"]["monthEarned"], .03)

    def test_offset_applied_before_comparison_with_legacy_month(self):
        project = {**PROJECT, "lulo_interest_offset_usd": 5}
        old = advance_lulo_monthly({}, project, lulo_sample(15))
        self.assertEqual(old["lulo-a"]["2026-10"]["lastLifetimeInterest"], 10)
        updated = advance_lulo_monthly(old, project, lulo_sample(15.2, stamp="2026-10-30T19:00:00Z"))
        self.assertAlmostEqual(updated["lulo-a"]["2026-10"]["monthEarned"], .2)

    def test_saved_history_not_reset_at_start_of_another_month(self):
        old = advance_lulo_monthly({}, PROJECT, lulo_sample(10))
        november = advance_lulo_monthly(old, PROJECT, lulo_sample(10.5, stamp="2026-11-01T20:00:00Z"))
        self.assertIn("2026-10", november["lulo-a"])
        self.assertEqual(november["lulo-a"]["2026-11"]["monthEarned"], 0)

    def test_backfills_are_derived_without_double_counting_transactions(self):
        old = advance_lulo_monthly({}, PROJECT, lulo_sample(10))
        earned = advance_lulo_monthly(old, PROJECT, lulo_sample(10.2, stamp="2026-10-30T19:00:00Z"))
        self.assertAlmostEqual(lulo_monthly_backfills(earned)["lulo-a"]["2026-10"], .2)


if __name__ == "__main__":
    unittest.main()
