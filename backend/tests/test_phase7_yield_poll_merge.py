"""Phase 7 tests: out-of-order workers and replay-resistant read-only polling."""
import unittest
from copy import deepcopy

from backend.yield_poll_merge import merge_poll_observations, filter_registered_source_snapshots, same_wallet_registration

W1 = "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM"
W2 = "72eGAvpNKB8YcpbS15BjZ7fkb7Lm8GjQSyHyxEAq8YBH"


def snap(wallet, at, balance):
    return {"walletAddress": wallet, "syncedAt": at, "totalBalanceUsd": balance, "totalInterestEarnedUsd": 0.0}


class PollMergeTests(unittest.TestCase):
    def test_independent_lulo_sources_are_not_lost_by_partial_poll(self):
        initial = {"checkedAt": "2026-10-30T19:00:00Z", "lulo": {
            W1: snap(W1, "2026-10-30T19:00:00Z", 10),
            W2: snap(W2, "2026-10-30T19:00:00Z", 20),
        }}
        original = deepcopy(initial)
        merged, accepted = merge_poll_observations(
            initial, checked_at="2026-10-30T19:05:00Z",
            lulo={W1: snap(W1, "2026-10-30T19:05:00Z", 11)},
            loopscale=None, loopscale_wallet=None, errors={"lulo:" + W2: "TimeoutError"},
        )
        self.assertEqual(accepted, {"lulo": [W1], "loopscale": False})
        self.assertEqual(merged["lulo"][W2]["totalBalanceUsd"], 20)
        self.assertEqual(merged["lulo"][W1]["totalBalanceUsd"], 11)
        self.assertEqual(initial, original)

    def test_late_older_worker_can_add_reading_but_cannot_rewind_health(self):
        newer = {"checkedAt": "2026-10-30T19:10:00+00:00", "errors": {
            "loopscale": "TimeoutError"}, "lulo": {
                W1: snap(W1, "2026-10-30T19:08:00Z", 18)
            }, "successfulAt": "2026-10-30T19:10:00Z"}
        merged, accepted = merge_poll_observations(
            newer, checked_at="2026-10-30T19:09:00Z",
            lulo={W1: snap(W1, "2026-10-30T19:09:00Z", 19)},
            loopscale={"walletAddress": W2, "syncedAt": "2026-10-30T19:09:00Z", "pnlUsd": -2, "positionValueUsd": 20},
            loopscale_wallet=W2, errors={},
        )
        self.assertEqual(merged["checkedAt"], newer["checkedAt"])
        self.assertEqual(merged["errors"], newer["errors"])
        self.assertEqual(merged["successfulAt"], newer["successfulAt"])
        self.assertEqual(accepted, {"lulo": [W1], "loopscale": True})
        self.assertEqual(merged["lulo"][W1]["totalBalanceUsd"], 19)

    def test_out_of_order_source_and_same_timestamp_replay_rejected(self):
        old = {"checkedAt": "2026-10-30T19:10:00Z", "lulo": {
            W1: snap(W1, "2026-10-30T19:10:00+00:00", 23)
        }}
        for attempted in ("2026-10-30T19:09:00Z", "2026-10-30T19:10:00Z"):
            merged, accepted = merge_poll_observations(
                old, checked_at="2026-10-30T19:12:00Z",
                lulo={W1: snap(W1, attempted, 1000)},
                loopscale=None, loopscale_wallet=None, errors={},
            )
            self.assertEqual(accepted["lulo"], [])
            self.assertEqual(merged["lulo"][W1]["totalBalanceUsd"], 23)

    def test_future_or_unidentified_source_is_not_promoted(self):
        for bad in (
            snap("different", "2026-10-30T19:10:00Z", 99),
            snap(W1, "2026-10-30T21:00:00Z", 99),
            snap(W1, "invalid", 99),
        ):
            _, admitted = merge_poll_observations(
                {}, checked_at="2026-10-30T19:10:00Z",
                lulo={W1: bad}, loopscale=None, loopscale_wallet=None, errors={},
            )
            self.assertEqual(admitted["lulo"], [])

    def test_completed_signed_loss_and_zero_not_filtered(self):
        result, accepted = merge_poll_observations(
            {}, checked_at="2026-10-30T19:10:00Z", lulo={},
            loopscale={"walletAddress": W2, "syncedAt": "2026-10-30T19:10:00Z", "pnlUsd": -0.34, "positionValueUsd": 0},
            loopscale_wallet=W2, errors={},
        )
        self.assertTrue(accepted["loopscale"])
        self.assertEqual(result["loopscale"]["pnlUsd"], -0.34)
        self.assertEqual(result["loopscale"]["positionValueUsd"], 0)

    def test_failed_poll_retains_last_success_and_both_source_balances(self):
        original = {
            "checkedAt": "2026-10-30T19:10:00Z",
            "successfulAt": "2026-10-30T19:05:00Z",
            "lulo": {W1: snap(W1, "2026-10-30T19:05:00Z", 42)},
            "loopscale": {"walletAddress": W2, "syncedAt": "2026-10-30T19:05:00Z", "pnlUsd": -1},
        }
        saved, accepted = merge_poll_observations(
            original, checked_at="2026-10-30T19:15:00Z",
            lulo={}, loopscale=None, loopscale_wallet=W2,
            errors={"lulo:" + W1: "RuntimeError", "loopscale": "TimeoutError"},
        )
        self.assertEqual(accepted, {"lulo": [], "loopscale": False})
        self.assertEqual(saved["successfulAt"], original["successfulAt"])
        self.assertEqual(saved["lulo"], original["lulo"])
        self.assertEqual(saved["loopscale"], original["loopscale"])
        self.assertEqual(saved["checkedAt"], "2026-10-30T19:15:00Z")

    def test_loopscale_wallet_mismatch_is_not_admitted(self):
        saved, accepted = merge_poll_observations(
            {}, checked_at="2026-10-30T19:15:00Z", lulo={},
            loopscale={"walletAddress": "different", "syncedAt": "2026-10-30T19:15:00Z", "pnlUsd": 1000},
            loopscale_wallet=W2, errors={},
        )
        self.assertFalse(accepted["loopscale"])
        self.assertNotIn("loopscale", saved)

    def test_reject_naive_and_malformed_clock(self):
        for clock in ("2026-10-30T19:10:00", "not a timestamp", ""):
            with self.assertRaises(ValueError):
                merge_poll_observations({}, checked_at=clock, lulo={}, loopscale=None, loopscale_wallet=None, errors={})


    def test_malformed_financial_values_never_poison_saved_provider_balances(self):
        initial = {"lulo": {W1: snap(W1, "2026-10-30T19:00:00Z", 50)},
                   "loopscale": {"walletAddress": W2, "syncedAt": "2026-10-30T19:00:00Z",
                                 "positionValueUsd": 25, "pnlUsd": -0.25}}
        invalid_lulo = (
            {**snap(W1, "2026-10-30T19:05:00Z", 90), "totalBalanceUsd": float("nan")},
            {**snap(W1, "2026-10-30T19:05:00Z", 90), "totalBalanceUsd": -1},
            {**snap(W1, "2026-10-30T19:05:00Z", 90), "totalBalanceUsd": True},
            {**snap(W1, "2026-10-30T19:05:00Z", 90), "totalInterestEarnedUsd": float("inf")},
        )
        for bad in invalid_lulo:
            with self.subTest(bad=repr(bad)):
                result, accepted = merge_poll_observations(
                    initial, checked_at="2026-10-30T19:06:00Z", lulo={W1: bad},
                    loopscale=None, loopscale_wallet=W2, errors={},
                )
                self.assertEqual(accepted["lulo"], [])
                self.assertEqual(result["lulo"], initial["lulo"])

        invalid_loopscale = (
            {"positionValueUsd": float("nan"), "pnlUsd": -1},
            {"positionValueUsd": -10, "pnlUsd": -1},
            {"positionValueUsd": 10, "pnlUsd": True},
            {"positionValueUsd": 10, "pnlUsd": float("inf")},
        )
        for money in invalid_loopscale:
            with self.subTest(money=repr(money)):
                bad = {"walletAddress": W2, "syncedAt": "2026-10-30T19:05:00Z", **money}
                result, accepted = merge_poll_observations(
                    initial, checked_at="2026-10-30T19:06:00Z", lulo={},
                    loopscale=bad, loopscale_wallet=W2, errors={},
                )
                self.assertFalse(accepted["loopscale"])
                self.assertEqual(result["loopscale"], initial["loopscale"])

    def test_randomized_out_of_order_polling_never_regresses_provider_readings(self):
        # Fixed seed ensures reproducible interleavings of concurrent workers.
        import random
        from datetime import datetime, timedelta, timezone
        rng = random.Random(710072)
        for case in range(100):
            n = rng.randrange(4, 14)
            start = datetime(2026, 10, 30, 18, tzinfo=timezone.utc)
            snapshots = []
            for tick in range(n):
                when = (start + timedelta(minutes=tick)).isoformat()
                snapshots.append((when, snap(W1, when, 100 + tick)))
            rng.shuffle(snapshots)
            saved = {}
            observed_newest = -1
            for checked_at, candidate in snapshots:
                result, accepted = merge_poll_observations(
                    saved, checked_at=checked_at, lulo={W1: candidate},
                    loopscale=None, loopscale_wallet=None, errors={},
                )
                tick = round((datetime.fromisoformat(checked_at) - start).total_seconds() / 60)
                if tick > observed_newest:
                    observed_newest = tick
                    self.assertEqual(accepted["lulo"], [W1])
                else:
                    self.assertEqual(accepted["lulo"], [])
                self.assertEqual(result["lulo"][W1]["totalBalanceUsd"], 100 + observed_newest)
                saved = result
            self.assertEqual(saved["lulo"][W1]["totalBalanceUsd"], 100 + n - 1)

    def test_replayed_checked_timestamp_cannot_replace_health_errors(self):
        prior = {"checkedAt": "2026-10-30T19:15:00Z", "errors": {"loopscale": "TimeoutError"}}
        latest, _ = merge_poll_observations(
            prior, checked_at="2026-10-30T19:15:00+00:00", lulo={},
            loopscale=None, loopscale_wallet=None, errors={},
        )
        self.assertEqual(latest["checkedAt"], prior["checkedAt"])
        self.assertEqual(latest["errors"], prior["errors"])


    def test_corrupted_provider_snapshot_is_visible_as_health_error(self):
        bad = snap(W1, "2026-10-30T19:00:00Z", float("inf"))
        merged, accepted = merge_poll_observations(
            {}, checked_at="2026-10-30T19:01:00Z", lulo={W1: bad},
            loopscale={"walletAddress": W2, "syncedAt": "2026-10-30T19:01:00Z",
                       "positionValueUsd": True, "pnlUsd": -1},
            loopscale_wallet=W2, errors={},
        )
        self.assertEqual(accepted, {"lulo": [], "loopscale": False})
        self.assertEqual(merged["errors"], {"lulo:" + W1: "InvalidSnapshot", "loopscale": "InvalidSnapshot"})
        self.assertNotIn(W1, merged["lulo"])

    def test_replayed_snapshot_is_not_a_provider_error(self):
        existing = {"checkedAt": "2026-10-30T19:01:00Z", "lulo": {
            W1: snap(W1, "2026-10-30T19:01:00Z", 50),
        }}
        merged, accepted = merge_poll_observations(
            existing, checked_at="2026-10-30T19:02:00Z",
            lulo={W1: snap(W1, "2026-10-30T19:01:00Z", 50)},
            loopscale=None, loopscale_wallet=None, errors={},
        )
        self.assertEqual(accepted["lulo"], [])
        self.assertEqual(merged["errors"], {})

    def test_registration_revision_detects_change_and_change_back(self):
        old = {"lulo": [W1], "loopscale": W2, "revision": 1,
               "updatedAt": "2026-10-30T19:00:00Z"}
        same = deepcopy(old)
        self.assertTrue(same_wallet_registration(old, same))
        same["revision"] = 3
        self.assertFalse(same_wallet_registration(old, same))
        same["revision"] = 1
        same["updatedAt"] = "2026-10-30T19:00:01Z"
        self.assertFalse(same_wallet_registration(old, same))
        self.assertFalse(same_wallet_registration(old, None))

    def test_wallet_rotation_removes_unregistered_live_cache_without_mutating_original(self):
        old = {
            "lulo": {W1: snap(W1, "2026-10-30T19:00:00Z", 12),
                     W2: snap(W2, "2026-10-30T19:00:00Z", 15)},
            "loopscale": {"walletAddress": W1, "syncedAt": "2026-10-30T19:00:00Z", "pnlUsd": -2},
            "checkedAt": "2026-10-30T19:00:00Z",
            "successfulAt": "2026-10-30T19:00:00Z",
            "errors": {"lulo:" + W1: "TimeoutError"},
        }
        original = deepcopy(old)
        filtered = filter_registered_source_snapshots(old, {"lulo": [W2], "loopscale": W2})
        self.assertEqual(list(filtered["lulo"]), [W2])
        self.assertIsNone(filtered["loopscale"])
        self.assertIsNone(filtered["checkedAt"])
        self.assertIsNone(filtered["successfulAt"])
        self.assertEqual(filtered["errors"], {})
        self.assertEqual(old, original)

    def test_unregistration_clears_live_cache_but_preserves_independent_history(self):
        old = {"lulo": {W1: snap(W1, "2026-10-30T19:00:00Z", 20)},
               "loopscale": {"walletAddress": W2}, "auditHistory": ["do not erase"]}
        cleared = filter_registered_source_snapshots(old, {"lulo": [], "loopscale": None})
        self.assertEqual(cleared["lulo"], {})
        self.assertIsNone(cleared["loopscale"])
        self.assertEqual(cleared["auditHistory"], ["do not erase"])


if __name__ == "__main__":
    unittest.main()
