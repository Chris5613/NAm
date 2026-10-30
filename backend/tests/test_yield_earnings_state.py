"""Legacy-seeding and replay compatibility tests for backend-owned ledgers."""
import unittest

from backend.yield_earnings_state import (
    reconcile_backend_ledgers, seed_lulo_monthly, seed_loopscale_history,
)

LOAN = "my-onyc-loan"
WALLET = "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM"


class BackendLedgerMigrationTests(unittest.TestCase):
    def test_imports_browser_legacy_and_keeps_all_prior_months(self):
        local = {
            "lulo-1": {
                "2026-09": {"version": 5, "monthEarned": 9.05,
                            "lastSyncedAt": "2026-09-30T22:00:00Z"},
                "2026-10": {"version": 5, "monthEarned": 0.3,
                            "lastSyncedAt": "2026-10-30T18:00:00Z"},
            }
        }
        imported = seed_lulo_monthly({}, local)
        self.assertEqual(imported, local)
        local["lulo-1"]["2026-10"]["monthEarned"] = 999
        self.assertEqual(imported["lulo-1"]["2026-10"]["monthEarned"], 0.3)

    def test_newer_browser_legacy_wins_if_it_was_saved_after_server(self):
        old_server = {"lulo-1": {"2026-10": {
            "version": 5, "monthEarned": .3, "lastSyncedAt": "2026-10-30T17:00:00Z",
        }}}
        new_browser = {"lulo-1": {"2026-10": {
            "version": 5, "monthEarned": .6, "lastSyncedAt": "2026-10-30T18:00:00Z",
        }}}
        merged = seed_lulo_monthly(old_server, new_browser)
        self.assertEqual(merged["lulo-1"]["2026-10"]["monthEarned"], .6)
        stale_browser = {"lulo-1": {"2026-10": {
            "version": 5, "monthEarned": 99,
            "lastSyncedAt": "2026-10-30T16:00:00Z",
        }}}
        self.assertEqual(seed_lulo_monthly(merged, stale_browser), merged)

    def test_newer_loopscale_browser_history_preserves_manual_adjustments(self):
        saved = {"positions": {LOAN: {
            "lastPnlUsd": 2, "lastSyncedAt": "2026-10-30T17:00:00Z",
            "monthlyEarnings": {"2026-09": 1.2, "2026-10": .4},
        }}}
        browser = {"positions": {LOAN: {
            "lastPnlUsd": 3, "lastSyncedAt": "2026-10-30T18:00:00Z",
            "monthlyEarnings": {"2026-09": 1.4, "2026-10": .6},
        }}}
        self.assertEqual(seed_loopscale_history(saved, browser)["positions"][LOAN],
                         browser["positions"][LOAN])
        older = {"positions": {LOAN: {
            "lastPnlUsd": 100, "lastSyncedAt": "2026-10-30T16:00:00Z",
        }}}
        self.assertEqual(seed_loopscale_history(browser, older), browser)

    def test_loopscale_replay_updates_daily_once_and_does_not_mutate_input(self):
        legacy = {"positions": {LOAN: {
            "lastPnlUsd": 2, "lastSyncedAt": "2026-10-30T17:00:00Z",
            "monthBaselines": {"2026-10": 1},
            "monthlyEarnings": {"2026-10": 1},
            "observedDaily": {"2026-10-30": .2},
        }}}
        snapshots = {
            "loopscale": {"loanAddress": LOAN, "syncedAt": "2026-10-30T18:00:00Z",
                          "pnlUsd": 2.1, "positionValueUsd": 100,
                          "startTime": "2026-09-15T00:00:00Z"},
        }
        output = reconcile_backend_ledgers({}, {}, {}, legacy, [], snapshots)
        result = output["loopscale"]["positions"][LOAN]
        self.assertAlmostEqual(result["observedDaily"]["2026-10-30"], .3)
        self.assertAlmostEqual(result["monthlyEarnings"]["2026-10"], 1.1)
        self.assertEqual(legacy["positions"][LOAN]["lastPnlUsd"], 2)
        replay = reconcile_backend_ledgers({}, output["loopscale"], {}, legacy, [], snapshots)
        self.assertEqual(replay["loopscale"], output["loopscale"])
        self.assertEqual(replay["updatedLoopscaleLoans"], 0)

    def test_lulo_replay_records_plausible_increase_and_keeps_opening_month(self):
        previous = {"lulo-1": {"2026-10": {
            "version": 5, "monthEarned": .3,
            "lastBalanceUsd": 1000, "lastLifetimeInterest": 5,
            "lastSyncedAt": "2026-10-30T17:00:00Z",
        }}}
        project = {"id": "lulo-1", "yield_tracking": "lulo_lending",
                   "lulo_wallet_address": WALLET, "lulo_weighted_apy": 6}
        observations = {"lulo": {WALLET: {
            "walletAddress": WALLET, "syncedAt": "2026-10-30T18:00:00Z",
            "totalInterestEarnedUsd": 5.1, "totalBalanceUsd": 1000,
            "weightedApy": 6,
        }}}
        output = reconcile_backend_ledgers(
            previous, {}, previous, {}, [project], observations
        )
        self.assertAlmostEqual(output["lulo"]["lulo-1"]["2026-10"]["monthEarned"], .4)
        self.assertAlmostEqual(output["luloBackfills"]["lulo-1"]["2026-10"], .4)
        self.assertEqual(output["updatedLuloProjects"], 1)
        again = reconcile_backend_ledgers(
            output["lulo"], {}, previous, {}, [project], observations
        )
        self.assertEqual(again["lulo"], output["lulo"])
        self.assertEqual(again["updatedLuloProjects"], 0)


if __name__ == "__main__":
    unittest.main()
