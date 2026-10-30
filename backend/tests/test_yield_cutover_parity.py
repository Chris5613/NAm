"""Parity tests for browser-vs-backend Lulo cutover diagnostics."""
from datetime import datetime, timedelta, timezone
from copy import deepcopy
import unittest

from backend.yield_cutover_parity import (
    parity_observation, compare_lulo_outputs, update_parity_history,
    REQUIRED_DISTINCT_SUCCESSES, persisted_project_parity, source_poll_health,
)
from backend.lulo_transaction_reconciliation import reconcile_lulo_project


WALLET = "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM"
NOW = datetime(2026, 10, 30, 20, 1, tzinfo=timezone.utc)
APPLIED = datetime(2026, 10, 30, 20, 0, tzinfo=timezone.utc)


def before_project():
    return {
        "id": "lulo-1", "name": "Lulo",
        "yield_tracking": "lulo_lending",
        "lulo_wallet_address": WALLET,
        "invested": 1000, "earned": 10,
        "lulo_balance_model": "multi_token_v2",
        "lulo_last_balance_usd": 1000,
        "lulo_last_synced_at": "2026-10-30T19:00:00Z",
        "lulo_last_raw_interest_usd": 10,
        "lulo_last_interest_usd": 10,
        "lulo_initial_earned": 10,
        "lulo_interest_offset_usd": 0,
        "lulo_weighted_apy": 5,
        "transactions": [],
    }


def snapshot():
    return {
        "walletAddress": WALLET,
        "syncedAt": "2026-10-30T19:59:00Z",
        "totalBalanceUsd": 1000,
        "totalInterestEarnedUsd": 10.1,
        "weightedApy": 5,
        "regularBalanceUsd": 1000,
        "protectedBalanceUsd": 0,
        "usdcBalanceUsd": 1000,
        "usdsBalanceUsd": 0,
        "dailyPerformance": [],
    }


class LuloCutoverParityTests(unittest.TestCase):
    def setUp(self):
        self.before = before_project()
        self.source = snapshot()
        self.after = reconcile_lulo_project(
            deepcopy(self.before), deepcopy(self.source), now=APPLIED
        )

    def test_matching_browser_output_is_verified_for_identical_inputs(self):
        response = parity_observation(
            self.before, self.source, self.after,
            "2026-10-30T20:00:00.000Z", NOW
        )
        self.assertEqual(response["status"], "match")
        self.assertEqual(response["differenceCount"], 0)
        self.assertEqual(response["projectId"], "lulo-1")

    def test_browser_iso_js_millisecond_timestamp_does_not_false_fail(self):
        browser = deepcopy(self.after)
        browser["lulo_last_synced_at"] = "2026-10-30T20:00:00.000Z"
        browser["transactions"][0]["sync_to"] = "2026-10-30T20:00:00.000Z"
        self.assertEqual(compare_lulo_outputs(self.after, browser), [])

    def test_financial_disagreement_is_reported_without_changing_input(self):
        browser = deepcopy(self.after)
        browser["earned"] += 0.2
        browser["transactions"][0]["amount"] += 0.2
        original = deepcopy(browser)
        response = parity_observation(
            self.before, self.source, browser, APPLIED.isoformat(), NOW
        )
        self.assertEqual(response["status"], "mismatch")
        self.assertIn("earned", response["changedFields"])
        self.assertIn("transactions[0].amount", response["changedFields"])
        self.assertEqual(browser, original)

    def test_ignores_generated_client_transaction_ids(self):
        browser = deepcopy(self.after)
        browser["transactions"][0]["id"] = "random-generated-uuid"
        browser["transactions"][0]["_id"] = "random-generated-uuid"
        self.assertEqual(compare_lulo_outputs(self.after, browser), [])

    def test_reject_wrong_wallet_or_project_identity(self):
        bad_snapshot = {**self.source, "walletAddress": "incorrect"}
        invalid = parity_observation(
            self.before, bad_snapshot, self.after, APPLIED, NOW
        )
        self.assertEqual(invalid["status"], "invalid")
        self.assertEqual(invalid["reason"], "wallet-mismatch")
        different = {**self.after, "id": "different"}
        self.assertEqual(
            parity_observation(self.before, self.source, different, APPLIED, NOW)["status"],
            "invalid"
        )

    def test_expired_or_future_comparison_does_not_count(self):
        stale = parity_observation(
            self.before, self.source, self.after, APPLIED,
            NOW + timedelta(hours=1)
        )
        self.assertEqual(stale["reason"], "expired-application")
        future = parity_observation(
            self.before, self.source, self.after,
            NOW + timedelta(hours=1), NOW
        )
        self.assertEqual(future["status"], "invalid")

    def test_diagnostic_requires_five_distinct_matching_snapshots(self):
        history = {}
        for number in range(REQUIRED_DISTINCT_SUCCESSES):
            sample = {
                "status": "match", "projectId": "lulo-1",
                "snapshotAt": (NOW + timedelta(minutes=number)).isoformat(),
                "differenceCount": 0,
            }
            new_history = update_parity_history(history, sample)
            # Same observation must not count twice.
            self.assertEqual(update_parity_history(new_history, sample), new_history)
            history = new_history
        status = history["latestByProject"]["lulo-1"]
        self.assertEqual(status["consecutiveMatches"], REQUIRED_DISTINCT_SUCCESSES)
        self.assertTrue(status["diagnosticThresholdMet"])
        self.assertFalse(status["backendWritesEnabled"])

    def test_mismatch_resets_parity_streak_and_older_samples_do_not_advance(self):
        history = {}
        for minute in range(3):
            history = update_parity_history(history, {
                "status": "match", "projectId": "lulo-1",
                "snapshotAt": (NOW + timedelta(minutes=minute)).isoformat(),
            })
        older = {
            "status": "match", "projectId": "lulo-1",
            "snapshotAt": (NOW - timedelta(minutes=1)).isoformat(),
        }
        self.assertEqual(update_parity_history(history, older), history)
        history = update_parity_history(history, {
            "status": "mismatch", "projectId": "lulo-1",
            "snapshotAt": (NOW + timedelta(minutes=3)).isoformat(),
        })
        self.assertEqual(history["latestByProject"]["lulo-1"]["consecutiveMatches"], 0)

    def test_real_persisted_ledger_parity_requires_same_observation(self):
        current = deepcopy(self.after)
        preview = deepcopy(self.after)
        equal = persisted_project_parity(current, preview)
        self.assertEqual(equal["status"], "matched")
        self.assertTrue(equal["ready"])
        newer = deepcopy(preview)
        newer["lulo_last_synced_at"] = "2026-10-30T20:05:00Z"
        self.assertEqual(persisted_project_parity(current, newer)["status"], "server-ahead")
        older = deepcopy(preview)
        older["lulo_last_synced_at"] = "2026-10-30T19:30:00Z"
        self.assertEqual(persisted_project_parity(current, older)["status"], "browser-ahead")
        self.assertFalse(persisted_project_parity(current, older)["ready"])

    def test_real_ledger_disagreement_blocks_cutover(self):
        current = deepcopy(self.after)
        preview = deepcopy(self.after)
        current["earned"] += 100
        result = persisted_project_parity(current, preview)
        self.assertEqual(result["status"], "mismatch")
        self.assertIn("earned", result["differences"])
        self.assertFalse(result["ready"])
        self.assertFalse(persisted_project_parity(current, None)["ready"])

    def test_backend_poll_freshness_distinguishes_cached_readings(self):
        readings = {
            "lulo": {
                WALLET: {
                    "syncedAt": (NOW - timedelta(minutes=3)).isoformat(),
                },
                "older": {
                    "syncedAt": (NOW - timedelta(hours=2)).isoformat(),
                },
            },
            "loopscale": {
                "syncedAt": (NOW - timedelta(minutes=7)).isoformat(),
            },
        }
        statuses = source_poll_health(readings, NOW)
        self.assertTrue(statuses["lulo"][WALLET]["fresh"])
        self.assertFalse(statuses["lulo"]["older"]["fresh"])
        self.assertTrue(statuses["loopscale"]["fresh"])
        self.assertFalse(source_poll_health({}, NOW)["loopscale"]["fresh"])

    def test_other_projects_do_not_affect_current_streak(self):
        a = update_parity_history({}, {
            "status": "match", "projectId": "a", "snapshotAt": NOW.isoformat(),
        })
        b = update_parity_history(a, {
            "status": "mismatch", "projectId": "b", "snapshotAt": NOW.isoformat(),
        })
        self.assertEqual(b["latestByProject"]["a"]["consecutiveMatches"], 1)


if __name__ == "__main__":
    unittest.main()
