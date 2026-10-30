"""Backend source polling must work without a browser process or DOM.

The test patches persistence and upstream HTTP; it exercises the actual
poll_sources_for_user orchestration and both shadow earnings ledgers.
"""
from copy import deepcopy
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from backend import yield_source_sync as sync

WALLET = "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM"
LOOP_WALLET = "72eGAvpNKB8YcpbS15BjZ7fkb7Lm8GjQSyHyxEAq8YBH"


class FakeSession:
    def __init__(self, projects):
        self.projects = projects
        self.commits = 0

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def scalars(self, stmt):
        # A relational transaction query should return its independent
        # rows rather than treating Project rows as transactions.
        entity = stmt.column_descriptions[0].get("entity")
        if entity is sync.ProjectTransaction:
            return SimpleNamespace(all=lambda: [])
        return SimpleNamespace(all=lambda: self.projects)

    def commit(self):
        self.commits += 1


class ClosedBrowserPollingTests(TestCase):
    def test_polling_persists_independent_ledgers_and_replays_idempotently(self):
        storage = {(1, sync.REGISTRATION_KEY): {
            "lulo": [WALLET], "loopscale": LOOP_WALLET,
        }}
        project = SimpleNamespace(
            id="lulo-1", invested=1000.0, earned=10.0,
            data={
                "yield_tracking": "lulo_lending",
                "lulo_wallet_address": WALLET,
                "lulo_last_synced_at": "2026-10-30T17:00:00Z",
                "lulo_last_raw_interest_usd": 10,
                "lulo_last_interest_usd": 10,
                "lulo_total_balance_usd": 1000,
                "lulo_weighted_apy": 6,
                "lulo_initial_earned": 10,
                "transactions": [],
            },
        )
        session = FakeSession([project])
        lulo_snapshot = {
            "walletAddress": WALLET,
            "syncedAt": "2026-10-30T18:00:00Z",
            "totalBalanceUsd": 1000, "totalInterestEarnedUsd": 10.1,
            "weightedApy": 6,
        }
        loop_snapshot = {
            "walletAddress": LOOP_WALLET,
            "loanAddress": "loop-one",
            "syncedAt": "2026-10-30T18:00:00Z",
            "positionValueUsd": 30, "pnlUsd": 2,
            "startTime": "2026-09-01T00:00:00Z",
        }

        def read(_db, uid, key):
            return deepcopy(storage.get((uid, key), {}))

        def write(_db, uid, key, value):
            storage[(uid, key)] = deepcopy(value)

        with (
            patch.object(sync, "SessionLocal", return_value=session),
            patch.object(sync, "_read", side_effect=read),
            patch.object(sync, "_write", side_effect=write),
            patch.object(sync, "fetch_lulo", return_value=lulo_snapshot),
            patch.object(sync, "fetch_loopscale", return_value=loop_snapshot),
        ):
            self.assertEqual(sync.poll_sources_for_user(1), 2)
            first_lulo = deepcopy(storage[(1, sync.LULO_SERVER_LEDGER_KEY)])
            first_loop = deepcopy(storage[(1, sync.LOOPSCALE_SERVER_LEDGER_KEY)])
            first_preview = deepcopy(storage[(1, sync.LULO_TRANSACTION_PREVIEW_KEY)])
            backup_key = sync.LULO_CUTOVER_BACKUP_PREFIX + "lulo-1"
            original_project = deepcopy(storage[(1, backup_key)])
            self.assertEqual(original_project["project"]["earned"], 10.0)
            self.assertEqual(original_project["project"]["lulo_last_synced_at"],
                             "2026-10-30T17:00:00Z")
            self.assertIn("lulo-1", first_lulo)
            self.assertEqual(first_loop["positions"]["loop-one"]["lastPnlUsd"], 2)
            self.assertIn("lulo-1", first_preview)
            self.assertEqual(sync.poll_sources_for_user(1), 2)
            # Two identical source sync timestamps can produce more raw
            # observations but may NEVER book the same earned delta twice.
            self.assertEqual(storage[(1, sync.LULO_SERVER_LEDGER_KEY)], first_lulo)
            self.assertEqual(storage[(1, sync.LOOPSCALE_SERVER_LEDGER_KEY)], first_loop)
            self.assertEqual(storage[(1, sync.LULO_TRANSACTION_PREVIEW_KEY)], first_preview)
            self.assertEqual(storage[(1, backup_key)], original_project)
            self.assertEqual(project.data["lulo_last_synced_at"], "2026-10-30T17:00:00Z")
            self.assertEqual(project.earned, 10.0)


if __name__ == "__main__":
    import unittest
    unittest.main()
