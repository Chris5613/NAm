"""Tests for offline, non-authorizing Phase 7 production evidence inspection."""
import unittest
from copy import deepcopy
from tools.phase7_readiness_check import inspect_diagnostics


def status():
    return {
        "cutoverEnabled": False,
        "projectWriteProtocol": "per-project-compare-and-swap-v1",
        "legacyProjectReplacementBlocked": True,
        "lastSuccessfulPollAgeSeconds": 60,
        "providerErrors": {},
        "providerFreshness": {"loopscale": {"fresh": True, "lastSyncedAt": None}},
        "luloProjects": {
            "p": {"sameInputDiagnosticsPassed": True, "parityMatches": 5,
                  "persistedLedgerParity": {"status": "matched", "ready": True},
                  "independentProviderPollFresh": True,
                  "originalLedgerBackupPresent": True,
                  "cutoverReadiness": {"readyForManualReview": True, "blockers": []},
                  "eligibleForAutomaticWrites": False},
        },
    }


def backups():
    return {"lulo": [{"projectId": "p", "available": True,
                      "capturedAt": "2026-10-30T20:00:00Z"}],
            "loopscale": {"available": False, "capturedAt": None}}


class ReadinessTests(unittest.TestCase):
    def test_green_diagnostics_never_authorize_writes(self):
        result = inspect_diagnostics(status(), backups())
        self.assertTrue(result["diagnosticReady"])
        self.assertTrue(result["manualChecksRequired"])
        self.assertFalse(result["financialWritesMayBeEnabled"])

    def test_no_project_is_not_vacuously_ready(self):
        s = status()
        s["luloProjects"] = {}
        self.assertIn("no-lulo-projects-with-verifiable-parity",
                      inspect_diagnostics(s, backups())["blockers"])

    def test_mismatched_or_missing_backup_blocks_readiness(self):
        b = backups()
        b["lulo"][0]["available"] = False
        result = inspect_diagnostics(status(), b)
        self.assertFalse(result["diagnosticReady"])
        self.assertIn("project:p:cutover-backup-not-confirmed", result["blockers"])

    def test_stale_poll_and_parity_mismatch_block(self):
        s = status()
        s["lastSuccessfulPollAgeSeconds"] = 650
        s["luloProjects"]["p"]["persistedLedgerParity"]["status"] = "server-ahead"
        result = inspect_diagnostics(s, backups())
        self.assertIn("independent-server-poll-missing-or-stale", result["blockers"])
        self.assertIn("project:p:saved-ledger-parity-unverified", result["blockers"])

    def test_loopscale_requires_validated_backup_if_source_is_polled(self):
        s = status()
        s["providerFreshness"]["loopscale"]["lastSyncedAt"] = "2026-10-30T20:00:00Z"
        result = inspect_diagnostics(s, backups())
        self.assertIn("loopscale-history-backup-unverified", result["blockers"])

    def test_any_enabled_auto_write_flag_blocks_diagnostic(self):
        s = status()
        s["luloProjects"]["p"]["eligibleForAutomaticWrites"] = True
        result = inspect_diagnostics(s, backups())
        self.assertIn("project:p:unexpected-auto-write-eligibility", result["blockers"])

    def test_inputs_are_not_modified(self):
        s, b = status(), backups()
        old = deepcopy((s, b))
        inspect_diagnostics(s, b)
        self.assertEqual((s, b), old)


    def test_unexpected_response_types_fail_closed(self):
        for invalid in (None, [], "bad", 3):
            result = inspect_diagnostics(invalid, backups())
            self.assertFalse(result["diagnosticReady"])
            self.assertFalse(result["financialWritesMayBeEnabled"])
        s = status()
        s["luloProjects"]["p"]["persistedLedgerParity"] = None
        s["luloProjects"]["p"]["cutoverReadiness"] = "bad"
        s["providerFreshness"] = []
        result = inspect_diagnostics(s, backups())
        self.assertFalse(result["diagnosticReady"])
        self.assertFalse(result["financialWritesMayBeEnabled"])


    def test_reported_parity_flag_is_not_enough_without_five_matches(self):
        s = status()
        s["luloProjects"]["p"]["parityMatches"] = 4
        result = inspect_diagnostics(s, backups())
        self.assertIn("project:p:five-distinct-same-input-matches-missing", result["blockers"])
        s["luloProjects"]["p"]["parityMatches"] = 5
        s["luloProjects"]["p"]["cutoverReadiness"]["blockers"] = ["unresolved"]
        result = inspect_diagnostics(s, backups())
        self.assertIn("project:p:server-readiness-blocked", result["blockers"])


if __name__ == "__main__":
    unittest.main()
