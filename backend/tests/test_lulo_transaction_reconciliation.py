"""Lulo transaction reconciliation parity and transfer-safety tests."""
import unittest
from copy import deepcopy

from backend.lulo_transaction_reconciliation import (
    reconcile_lulo_project, sanitize_transactions, expected_yield, interest_limit,
)
from backend.yield_earnings_ledger import parse_time

NOW = "2026-10-30T20:00:00Z"


def project():
    return {
        "id": "lulo-1", "yield_tracking": "lulo_lending",
        "invested": 1000,
        "lulo_balance_model": "multi_token_v2",
        "lulo_total_balance_usd": 1000, "lulo_last_balance_usd": 1000,
        "lulo_last_synced_at": "2026-10-30T19:00:00Z",
        "lulo_weighted_apy": 5,
        "lulo_last_interest_usd": 10,
        "lulo_last_raw_interest_usd": 10,
        "lulo_interest_offset_usd": 0,
        "lulo_initial_earned": 10,
        "transactions": [],
    }


def sample(interest=10.1, balance=1000, stamp=NOW):
    return {
        "syncedAt": stamp, "totalBalanceUsd": balance,
        "totalInterestEarnedUsd": interest,
        "weightedApy": 5,
        "regularBalanceUsd": balance,
        "protectedBalanceUsd": 0, "usdcBalanceUsd": balance,
        "usdsBalanceUsd": 0, "dailyPerformance": [],
    }


class LuloTransactionReconciliationTests(unittest.TestCase):
    def test_normal_interest_adds_one_dated_transaction(self):
        before = project()
        after = reconcile_lulo_project(before, sample())
        self.assertEqual(before["transactions"], [])
        self.assertAlmostEqual(after["earned"], 10.1)
        self.assertEqual(len(after["transactions"]), 1)
        txn = after["transactions"][0]
        self.assertEqual(txn["source"], "lulo_yield")
        self.assertEqual(txn["source_date"], "2026-10-30")
        self.assertAlmostEqual(txn["amount"], .1)

    def test_repeated_and_older_readings_do_not_double_count(self):
        updated = reconcile_lulo_project(project(), sample())
        self.assertEqual(reconcile_lulo_project(updated, sample()), updated)
        self.assertEqual(reconcile_lulo_project(updated, sample(
            99, stamp="2026-10-30T19:30:00Z"
        )), updated)

    def test_one_calendar_day_merges_consecutive_verified_increases(self):
        first = reconcile_lulo_project(project(), sample())
        second = reconcile_lulo_project(first, sample(
            10.15, stamp="2026-10-30T21:00:00Z"
        ))
        self.assertEqual(len(second["transactions"]), 1)
        self.assertAlmostEqual(second["transactions"][0]["amount"], .15)
        self.assertAlmostEqual(second["earned"], 10.15)

    def test_cashflow_withdrawal_does_not_inflate_interest_counter(self):
        first = project()
        after = reconcile_lulo_project(first, sample(30, balance=900))
        self.assertLess(after["earned"], 10.01)
        self.assertGreater(after["lulo_ignored_interest_artifact_usd"], 19.9)
        self.assertEqual(after["lulo_last_cash_flow_at"], NOW)

    def test_deposit_with_raw_counter_reset_does_not_erase_prior_yield(self):
        earlier = project()
        deposit = reconcile_lulo_project(earlier, sample(1, balance=1200))
        self.assertAlmostEqual(deposit["lulo_last_interest_usd"], 10)
        self.assertAlmostEqual(deposit["lulo_interest_offset_usd"], -9)
        self.assertAlmostEqual(deposit["earned"], 10)
        self.assertEqual(deposit["transactions"], [])

    def test_impossible_yield_jump_without_deposit_is_ignored(self):
        updated = reconcile_lulo_project(project(), sample(100))
        self.assertEqual(updated["earned"], 10)
        self.assertGreater(updated["lulo_ignored_interest_artifact_usd"], 80)

    def test_user_transactions_are_preserved_and_old_false_interest_removed(self):
        original = project()
        original["transactions"] = [
            {"type": "deposit", "amount": 30, "source": "manual"},
            {"source": "lulo_yield", "amount": 100,
             "interest_from_usd": 0, "interest_to_usd": 100,
             "sync_from": "2026-10-29T19:00:00Z",
             "sync_to": "2026-10-30T19:00:00Z"},
        ]
        before = deepcopy(original)
        after = reconcile_lulo_project(original, sample(10))
        self.assertEqual(original, before)
        self.assertEqual(after["transactions"], [{"type": "deposit", "amount": 30, "source": "manual"}])
        self.assertEqual(after["earned"], 10)

    def test_unknown_source_or_invalid_snapshot_never_rewrites_project(self):
        prior = project()
        bad = {**prior, "yield_tracking": "manual"}
        self.assertEqual(reconcile_lulo_project(bad, sample(20)), bad)
        self.assertEqual(reconcile_lulo_project(prior, sample(balance=float("nan"))), prior)

    def test_interest_limits_are_bounded(self):
        self.assertEqual(expected_yield(0, 5, 1), 0)
        self.assertEqual(interest_limit(1000, 5, 1), 2)
        self.assertGreaterEqual(interest_limit(1000, 5, 10), 2)


if __name__ == "__main__":
    unittest.main()
