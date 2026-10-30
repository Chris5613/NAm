"""Conservative migration of legacy Lulo / Loopscale earnings ledgers.

The backend keeps independent versioned copies. On first use, seed from the
user's existing saved ledger rather than assuming an opening balance of zero.
New provider snapshots are reconciled against that seed. Legacy settings and
project transactions are NEVER rewritten by this module.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any

from .yield_earnings_ledger import (
    advance_loopscale_history, advance_lulo_monthly, lulo_monthly_backfills,
    parse_time,
)

LULO_SERVER_LEDGER_KEY = "yield_backend_lulo_monthly_ledger_v1"
LOOPSCALE_SERVER_LEDGER_KEY = "yield_backend_loopscale_pnl_ledger_v1"
LULO_LEGACY_LEDGER_KEY = "yield_lulo_monthly_baselines_v1"
LOOPSCALE_LEGACY_LEDGER_KEY = "yield_loopscale_position_history_v1"


def _positions(raw: Any) -> dict:
    if not isinstance(raw, dict):
        return {}
    positions = raw.get("positions")
    return positions if isinstance(positions, dict) else {}


def seed_loopscale_history(canonical: Any, legacy: Any) -> dict:
    """Import only newer legacy position observations, never erase history."""
    saved = deepcopy(canonical) if isinstance(canonical, dict) else {}
    existing = _positions(saved)
    originals = _positions(legacy)
    merged = dict(existing)
    for key, item in originals.items():
        if not isinstance(item, dict):
            continue
        previous = merged.get(key)
        if not isinstance(previous, dict):
            merged[key] = deepcopy(item)
            continue
        # Safe migration of a live browser observation that was saved after
        # the last backend reconciliation. Comparison is by source timestamp.
        incoming_at = parse_time(item.get("lastSyncedAt"))
        saved_at = parse_time(previous.get("lastSyncedAt"))
        if incoming_at and (saved_at is None or incoming_at > saved_at):
            # A browser can have the newest *position* while its local cache
            # is missing older months captured only by the backend. Keep
            # those periods and observation timestamps during promotion.
            combined = {**deepcopy(previous), **deepcopy(item)}
            for field in ("monthBaselines", "monthlyEarnings", "observedDaily"):
                combined[field] = {
                    **(previous.get(field) or {}),
                    **(item.get(field) or {}),
                }
            observations = {}
            for entry in (previous.get("observations") or []) + (item.get("observations") or []):
                if isinstance(entry, dict) and entry.get("syncedAt"):
                    observations[entry["syncedAt"]] = deepcopy(entry)
            combined["observations"] = [
                observations[key] for key in sorted(observations)
            ][-1440:]
            merged[key] = combined
    saved["positions"] = merged
    return saved


def seed_lulo_monthly(canonical: Any, legacy: Any) -> dict:
    """Preserve manual legacy correction and version-5 month totals."""
    saved = deepcopy(canonical) if isinstance(canonical, dict) else {}
    if not isinstance(legacy, dict):
        return saved
    for project_id, months in legacy.items():
        if not isinstance(months, dict):
            continue
        target = dict(saved.get(project_id) or {})
        for month, record in months.items():
            if not isinstance(record, dict):
                continue
            previous = target.get(month)
            if not isinstance(previous, dict):
                target[month] = deepcopy(record)
                continue
            incoming = parse_time(record.get("lastSyncedAt"))
            recorded = parse_time(previous.get("lastSyncedAt"))
            if incoming and (recorded is None or incoming > recorded):
                target[month] = deepcopy(record)
        saved[project_id] = target
    return saved


def reconcile_backend_ledgers(
    saved_lulo: Any, saved_loopscale: Any,
    legacy_lulo: Any, legacy_loopscale: Any,
    projects: list[dict], snapshots: dict,
) -> dict:
    """Advance only fresh source observations, retaining all earlier periods.

    No data is booked into ProjectTransaction. A browser/client can verify
    parity before promoting these independent server-maintained ledgers.
    """
    lulo = seed_lulo_monthly(saved_lulo, legacy_lulo)
    loopscale = seed_loopscale_history(saved_loopscale, legacy_loopscale)
    account_snapshots = snapshots.get("lulo") if isinstance(snapshots, dict) else {}
    if not isinstance(account_snapshots, dict):
        account_snapshots = {}

    processed_projects = 0
    for project in projects:
        if not isinstance(project, dict) or project.get("yield_tracking") != "lulo_lending":
            continue
        wallet = project.get("lulo_wallet_address")
        snap = account_snapshots.get(wallet)
        if not isinstance(snap, dict) or snap.get("walletAddress") != wallet:
            continue
        updated = advance_lulo_monthly(lulo, project, snap)
        if updated != lulo:
            lulo = updated
            processed_projects += 1

    loop_snapshot = snapshots.get("loopscale") if isinstance(snapshots, dict) else None
    processed_loans = 0
    if isinstance(loop_snapshot, dict):
        updated = advance_loopscale_history(loopscale, loop_snapshot)
        if updated != loopscale:
            loopscale = updated
            processed_loans = 1

    return {
        "lulo": lulo,
        "loopscale": loopscale,
        "luloBackfills": lulo_monthly_backfills(lulo),
        "updatedLuloProjects": processed_projects,
        "updatedLoopscaleLoans": processed_loans,
    }
