"""Fail-closed Phase 7 sign-off checklist (never invokes git or writes money)."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

# Every item must be attested only after inspecting independent evidence.
# This never turns on backend financial writes or performs an actual release.
REQUIRED = (
    "source_reviewed_against_current_main",
    "complete_backend_test_suite_passed",
    "frontend_jest_suite_passed",
    "frontend_production_build_passed",
    "disposable_postgres_row_lock_test_passed",
    "production_scheduler_verified",
    "browser_closed_provider_observations_advanced",
    "all_financial_backups_verified",
    "same_input_lulo_parity_verified",
    "persisted_lulo_history_parity_verified",
    "two_real_tabs_conflicts_rejected",
    "unrelated_project_updates_preserved",
    "relational_transaction_rows_unchanged",
    "replayed_updates_idempotent",
    "legacy_project_replace_all_blocked",
    "backend_accounting_write_boundary_confirmed",
    "rollback_and_restore_procedure_reviewed",
)


def inspect_evidence(document):
    blockers = []
    if not isinstance(document, dict):
        blockers.append("invalid-manifest")
        document = {}
    if not isinstance(document.get("reviewedCommit"), str) or len(document.get("reviewedCommit", "")) != 40:
        blockers.append("reviewed-commit-missing")
    if document.get("financialWritesEnabled") is not False:
        blockers.append("financial-write-cutover-must-remain-disabled")
    evidence = document.get("verified")
    if not isinstance(evidence, dict):
        evidence = {}
    blockers.extend(name for name in REQUIRED if evidence.get(name) is not True)
    return {
        "phase7ReadyForFinalReview": not blockers,
        "outstandingGates": blockers,
        "checksPassed": sum(evidence.get(name) is True for name in REQUIRED),
        "checksRequired": len(REQUIRED),
        "automaticFinancialWritesAllowed": False,
        "automaticCommitAllowed": False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Fail-closed phase 7 evidence checklist")
    parser.add_argument("--manifest", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        data = json.loads(args.manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeError):
        print(json.dumps({"phase7ReadyForFinalReview": False, "automaticCommitAllowed": False,
                          "outstandingGates": ["manifest-unreadable"]}))
        return 2
    report = inspect_evidence(data)
    print(json.dumps(report, indent=2))
    return 0 if report["phase7ReadyForFinalReview"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
