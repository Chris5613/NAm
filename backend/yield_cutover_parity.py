"""Production Lulo cutover parity: compare two engines with identical inputs.

This is a *diagnostic* guard and never mutates money or project transactions.
Only a reproducible same-snapshot match may count toward cutover readiness.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from math import isfinite
from typing import Any

from .lulo_transaction_reconciliation import reconcile_lulo_project
from .yield_earnings_ledger import parse_time

PARITY_HISTORY_LIMIT = 80
REQUIRED_DISTINCT_SUCCESSES = 5
MAX_OBSERVATION_AGE_SECONDS = 15 * 60
NUMERIC_FIELDS = (
    "earned", "invested", "lulo_total_balance_usd", "lulo_last_balance_usd",
    "lulo_lifetime_interest_usd", "lulo_last_interest_usd",
    "lulo_last_raw_interest_usd", "lulo_interest_offset_usd",
    "lulo_ignored_interest_artifact_usd", "lulo_initial_earned",
    "lulo_regular_balance_usd", "lulo_protected_balance_usd",
    "lulo_usdc_balance_usd", "lulo_usds_balance_usd",
    "lulo_weighted_apy", "lulo_five_day_average_usd",
)
TEXT_FIELDS = ("lulo_last_cash_flow_at", "lulo_last_synced_at", "lulo_balance_model")
TRANSACTION_FIELDS = (
    "source", "source_date", "type", "date", "amount",
    "interest_from_usd", "interest_to_usd", "raw_interest_to_usd", "sync_to", "sync_from",
)


def finite(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if isfinite(number) else None


def canonical_time(value: Any) -> Any:
    parsed = parse_time(value)
    return parsed.isoformat() if parsed else value


def canonical_transactions(project: dict) -> list[dict]:
    rows = project.get("transactions")
    if not isinstance(rows, list):
        return []
    normalized = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        item = {}
        for name in TRANSACTION_FIELDS:
            if name not in row:
                continue
            val = row[name]
            if name in ("amount", "interest_from_usd", "interest_to_usd", "raw_interest_to_usd"):
                val = finite(val)
            if name in ("sync_to", "sync_from"):
                val = canonical_time(val)
            item[name] = val
        normalized.append(item)
    return normalized


def compare_lulo_outputs(expected: dict, actual: dict, tolerance: float = 0.00001) -> list[str]:
    """Return differing field paths; exclude generated transaction IDs."""
    differences = []
    for key in NUMERIC_FIELDS:
        a = finite(expected.get(key))
        b = finite(actual.get(key))
        if a is None and b is None:
            continue
        if a is None or b is None or abs(a - b) > tolerance:
            differences.append(key)
    for key in TEXT_FIELDS:
        a = expected.get(key) or None
        b = actual.get(key) or None
        if key.endswith("_at") and (a is not None or b is not None):
            a = canonical_time(a)
            b = canonical_time(b)
        if a != b:
            differences.append(key)

    expected_rows = canonical_transactions(expected)
    actual_rows = canonical_transactions(actual)
    if len(expected_rows) != len(actual_rows):
        differences.append("transactions.count")
    else:
        for idx, (a, b) in enumerate(zip(expected_rows, actual_rows)):
            for key in set(a) | set(b):
                x, y = a.get(key), b.get(key)
                if key in ("amount", "interest_from_usd", "interest_to_usd", "raw_interest_to_usd"):
                    if x is not None and y is not None and abs(x - y) <= tolerance:
                        continue
                if x != y:
                    differences.append(f"transactions[{idx}].{key}")
    return differences


def parity_observation(
    before: dict, snapshot: dict, after: dict, applied_at: Any,
    now: datetime | None = None,
) -> dict:
    """Rerun backend engine against browser's exact input and application time."""
    now = now or datetime.now(timezone.utc)
    at = parse_time(applied_at)
    observed = parse_time(snapshot.get("syncedAt"))
    project_id = str(before.get("id") or "")
    if not project_id or before.get("yield_tracking") != "lulo_lending" or after.get("id") != project_id:
        return {"status": "invalid", "reason": "invalid-project"}
    if not snapshot.get("walletAddress") or snapshot.get("walletAddress") != before.get("lulo_wallet_address"):
        return {"status": "invalid", "reason": "wallet-mismatch"}
    # The browser stamps its batch at the start; parallel upstream fetches
    # can finish a little later. Both engines still use the SAME appliedAt.
    if at is None or observed is None or observed > at + timedelta(minutes=3) or at > now + timedelta(minutes=5):
        return {"status": "invalid", "reason": "invalid-time"}
    if abs((now - at).total_seconds()) > MAX_OBSERVATION_AGE_SECONDS:
        return {"status": "invalid", "reason": "expired-application"}
    expected = reconcile_lulo_project(deepcopy(before), deepcopy(snapshot), now=at)
    changed = compare_lulo_outputs(expected, after)
    return {
        "status": "match" if not changed else "mismatch",
        "projectId": project_id,
        "snapshotAt": snapshot.get("syncedAt"),
        "appliedAt": at.isoformat(),
        "checkedAt": now.isoformat(),
        "changedFields": changed[:40],
        "differenceCount": len(changed),
        "transactionCount": len(canonical_transactions(after)),
    }


def update_parity_history(existing: Any, observation: dict) -> dict:
    """Bound reports and count only distinct, sequential matching snapshots."""
    status = existing if isinstance(existing, dict) else {}
    reports = [x for x in status.get("reports", []) if isinstance(x, dict)]
    snapshot_at = observation.get("snapshotAt")
    project_id = observation.get("projectId")
    if not project_id or not snapshot_at:
        return status
    previous = next((x for x in reversed(reports) if x.get("projectId") == project_id), None)
    # Repeated or reordered observations must never increase confidence.
    incoming_time = parse_time(snapshot_at)
    last_time = parse_time(previous.get("snapshotAt")) if previous else None
    if previous and (incoming_time is None or (
        last_time is not None and incoming_time <= last_time
    )):
        return status
    reports = (reports + [observation])[-PARITY_HISTORY_LIMIT:]
    sequential = []
    for entry in reversed(reports):
        if entry.get("projectId") != project_id:
            continue
        if entry.get("status") != "match":
            break
        sequential.append(entry)
        if len(sequential) >= REQUIRED_DISTINCT_SUCCESSES:
            break
    # Never automatically enable writing based on this report: external
    # comparison must also be checked against saved real project history.
    return {
        "reports": reports,
        "latestByProject": {
            **(status.get("latestByProject") or {}),
            project_id: {
                "status": observation["status"],
                "lastSnapshotAt": snapshot_at,
                "consecutiveMatches": len(sequential),
                "diagnosticThresholdMet": len(sequential) >= REQUIRED_DISTINCT_SUCCESSES,
                "backendWritesEnabled": False,
            },
        },
    }


def persisted_project_parity(project: dict, preview: dict | None) -> dict:
    """Compare the REAL PostgreSQL project with a server shadow result.

    Only a same-snapshot comparison is definitive. A server poll ahead of
    the last browser write is pending, not evidence of incorrect accounting.
    """
    if not isinstance(preview, dict):
        return {"status": "missing-preview", "differences": [], "ready": False}
    if str(project.get("id")) != str(preview.get("id")) or (
        project.get("lulo_wallet_address") != preview.get("lulo_wallet_address")
    ):
        return {"status": "identity-mismatch", "differences": ["project-or-wallet"], "ready": False}
    real_at = parse_time(project.get("lulo_last_synced_at"))
    preview_at = parse_time(preview.get("lulo_last_synced_at"))
    if real_at is None or preview_at is None:
        return {"status": "missing-timestamp", "differences": [], "ready": False}
    if preview_at > real_at:
        return {"status": "server-ahead", "differences": [], "ready": False}
    if real_at > preview_at:
        return {"status": "browser-ahead", "differences": [], "ready": False}
    differences = compare_lulo_outputs(preview, project)
    return {
        "status": "matched" if not differences else "mismatch",
        "differences": differences[:40],
        "differenceCount": len(differences),
        "ready": not differences,
    }


def source_poll_health(source: dict, now: datetime | None = None) -> dict:
    """Distinguish fresh independent polling from cached browser data."""
    now = now or datetime.now(timezone.utc)
    accounts = source.get("lulo") if isinstance(source.get("lulo"), dict) else {}
    lulo = {}
    for wallet, snapshot in accounts.items():
        if not isinstance(snapshot, dict):
            continue
        stamp = parse_time(snapshot.get("syncedAt"))
        age = max(0.0, (now - stamp).total_seconds()) if stamp else None
        lulo[wallet] = {
            "lastSyncedAt": snapshot.get("syncedAt"),
            "ageSeconds": round(age) if age is not None else None,
            "fresh": age is not None and (now - stamp).total_seconds() >= 0 and age <= 10 * 60,
        }
    loop = source.get("loopscale")
    loop_at = parse_time(loop.get("syncedAt")) if isinstance(loop, dict) else None
    loop_age = max(0.0, (now - loop_at).total_seconds()) if loop_at else None
    return {
        "lulo": lulo,
        "loopscale": {
            "lastSyncedAt": loop.get("syncedAt") if isinstance(loop, dict) else None,
            "ageSeconds": round(loop_age) if loop_age is not None else None,
            "fresh": loop_age is not None and (now - loop_at).total_seconds() >= 0 and loop_age <= 10 * 60,
        },
    }
