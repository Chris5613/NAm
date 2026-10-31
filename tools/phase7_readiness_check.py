"""Phase 7 read-only cutover gate checker.

Consumes two authenticated GET responses saved locally as JSON:
  GET /api/yield-sources/migration-status
  GET /api/yield-sources/cutover-backups

Never writes any API state or enables backend-owned financial transactions.
These gates are diagnostics only: live two-tab, closed-browser, and disaster
recovery checks MUST still be completed manually before any cutover.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

MAX_POLL_AGE_SECONDS = 10 * 60


def inspect_diagnostics(status: Any, backups: Any) -> dict:
    blockers: list[str] = []
    if not isinstance(status, dict) or not isinstance(backups, dict):
        return {"diagnosticReady": False, "blockers": ["invalid-status-or-backups"],
                "projectsReviewed": 0, "manualChecksRequired": True,
                "financialWritesMayBeEnabled": False}

    if status.get("cutoverEnabled") is not False:
        blockers.append("cutover-must-remain-disabled-pending-review")
    if status.get("projectWriteProtocol") != "per-project-compare-and-swap-v1":
        blockers.append("conflict-safe-project-saves-not-confirmed")
    if status.get("legacyProjectReplacementBlocked") is not True:
        blockers.append("legacy-project-replacement-not-blocked")
    age = status.get("lastSuccessfulPollAgeSeconds")
    if isinstance(age, bool) or not isinstance(age, (float, int)) or not 0 <= age <= MAX_POLL_AGE_SECONDS:
        blockers.append("independent-server-poll-missing-or-stale")
    if status.get("providerErrors"):
        blockers.append("provider-poll-errors-present")

    projects = status.get("luloProjects")
    if not isinstance(projects, dict) or not projects:
        blockers.append("no-lulo-projects-with-verifiable-parity")
        projects = {}

    entries = backups.get("lulo")
    backup_projects = {x.get("projectId"): x for x in entries if isinstance(x, dict) and
                       isinstance(x.get("projectId"), str)} if isinstance(entries, list) else {}
    for project_id, evidence in projects.items():
        # IDs are reported as-is only in an operator's local output; no raw
        # transactions or API payloads are printed to stdout.
        label = f"project:{project_id}"
        if not isinstance(evidence, dict):
            blockers.append(label + ":invalid-evidence")
            continue
        match_count = evidence.get("parityMatches")
        if (evidence.get("sameInputDiagnosticsPassed") is not True or
                isinstance(match_count, bool) or not isinstance(match_count, int) or
                match_count < 5):
            blockers.append(label + ":five-distinct-same-input-matches-missing")
        parity = evidence.get("persistedLedgerParity")
        if (not isinstance(parity, dict) or parity.get("status") != "matched" or
                parity.get("ready") is not True):
            blockers.append(label + ":saved-ledger-parity-unverified")
        if evidence.get("independentProviderPollFresh") is not True:
            blockers.append(label + ":fresh-independent-poll-missing")
        if evidence.get("originalLedgerBackupPresent") is not True:
            blockers.append(label + ":original-ledger-backup-flag-missing")
        entry = backup_projects.get(project_id) or {}
        if entry.get("available") is not True or not entry.get("capturedAt"):
            blockers.append(label + ":cutover-backup-not-confirmed")
        readiness = evidence.get("cutoverReadiness")
        if (not isinstance(readiness, dict) or readiness.get("readyForManualReview") is not True or
                readiness.get("blockers")):
            blockers.append(label + ":server-readiness-blocked")
        if evidence.get("eligibleForAutomaticWrites") is not False:
            blockers.append(label + ":unexpected-auto-write-eligibility")

    provider_freshness = status.get("providerFreshness")
    loop_freshness = provider_freshness.get("loopscale") if isinstance(provider_freshness, dict) else None
    if not isinstance(loop_freshness, dict):
        loop_freshness = {}
    if loop_freshness.get("lastSyncedAt"):
        loop_backup = backups.get("loopscale")
        if not isinstance(loop_backup, dict) or loop_backup.get("available") is not True or not loop_backup.get("capturedAt"):
            blockers.append("loopscale-history-backup-unverified")
        if loop_freshness.get("fresh") is not True:
            blockers.append("loopscale-provider-poll-stale")

    return {
        "diagnosticReady": not blockers,
        "blockers": blockers,
        "projectsReviewed": len(projects),
        # A green status cannot authorize writes without manual live gates.
        "manualChecksRequired": True,
        "financialWritesMayBeEnabled": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Offline read-only NAm phase 7 diagnostic checker")
    parser.add_argument("--status-file", type=Path, required=True,
                        help="Local JSON export from GET /api/yield-sources/migration-status")
    parser.add_argument("--backups-file", type=Path, required=True,
                        help="Local JSON export from GET /api/yield-sources/cutover-backups")
    args = parser.parse_args()
    # Do not print input JSON, which can contain user-specific project data.
    try:
        summary = inspect_diagnostics(json.loads(args.status_file.read_text()),
                                      json.loads(args.backups_file.read_text()))
    except (OSError, UnicodeError, ValueError) as exc:
        parser.error("Unable to parse local diagnostic JSON files: " + type(exc).__name__)
    print(json.dumps(summary, indent=2))
    return 0 if summary["diagnosticReady"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
