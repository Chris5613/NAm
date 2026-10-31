"""Authenticated configuration and read-only server snapshots for yield sources."""
from datetime import datetime, timezone
import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import User, Project
from ..yield_source_sync import (
    REGISTRATION_KEY, SNAPSHOTS_KEY, HISTORY_KEY,
    registered_wallets, _read, _write,
)
from ..yield_earnings_state import (
    LULO_SERVER_LEDGER_KEY, LOOPSCALE_SERVER_LEDGER_KEY,
)
from ..yield_earnings_ledger import lulo_monthly_backfills
from ..yield_source_sync import (
    LULO_TRANSACTION_PREVIEW_KEY, LULO_CUTOVER_BACKUP_PREFIX,
    LOOPSCALE_CUTOVER_BACKUP_KEY,
)
from ..yield_cutover_parity import (
    parity_observation, update_parity_history, persisted_project_parity, source_poll_health,
)

router = APIRouter(prefix="/api/yield-sources", tags=["yield sources"])


@router.put("/wallets")
async def register_wallets(
    payload: dict, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Register public wallet IDs for backend polling, not private keys."""
    try:
        wallets = registered_wallets(payload.get("lulo", []), payload.get("loopscale"))
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    current = _read(db, user.id, REGISTRATION_KEY)
    if current.get("lulo") == wallets["lulo"] and current.get("loopscale") == wallets["loopscale"]:
        return {"registered": True, **wallets}
    value = {
        **wallets,
        "registeredAt": current.get("registeredAt") or datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    _write(db, user.id, REGISTRATION_KEY, value)
    db.commit()
    return {"registered": True, **wallets}


@router.get("/latest")
async def latest_sources(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Latest *successful* observations, with original sync timestamps."""
    snapshot = _read(db, user.id, SNAPSHOTS_KEY)
    return {
        "checkedAt": snapshot.get("checkedAt"),
        "successfulAt": snapshot.get("successfulAt"),
        "lulo": snapshot.get("lulo") or {},
        "loopscale": snapshot.get("loopscale"),
        "errors": snapshot.get("errors") or {},
    }


@router.get("/history")
async def source_history(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    history = _read(db, user.id, HISTORY_KEY)
    return {"items": history.get("items") or [], "updatedAt": history.get("updatedAt")}


@router.get("/earnings")
async def backend_earnings_ledger(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Get server-reconciled history without changing the original ledger.

    Values remain independent during the migration. Clients can compare
    saved browser history against server observations before promotion.
    """
    lulo = _read(db, user.id, LULO_SERVER_LEDGER_KEY)
    loopscale = _read(db, user.id, LOOPSCALE_SERVER_LEDGER_KEY)
    source = _read(db, user.id, SNAPSHOTS_KEY)
    previews = _read(db, user.id, LULO_TRANSACTION_PREVIEW_KEY)
    preview_status = {
        project_id: {
            "lastSyncedAt": value.get("lulo_last_synced_at"),
            "projectEarnedUsd": value.get("earned"),
            "normalizedLifetimeInterestUsd": value.get("lulo_last_interest_usd"),
            "ignoredInterestArtifactsUsd": value.get("lulo_ignored_interest_artifact_usd"),
            "transactionCount": len(value.get("transactions") or []),
        }
        for project_id, value in previews.items() if isinstance(value, dict)
    }
    return {
        "luloMonthly": lulo,
        "luloBackfills": lulo_monthly_backfills(lulo),
        "luloTransactionPreviewStatus": preview_status,
        "loopscaleHistory": loopscale,
        "sourceCheckedAt": source.get("checkedAt"),
        "sourceSuccessfulAt": source.get("successfulAt"),
        "migrationMode": "independent-server-ledger",
    }


PARITY_SETTINGS_KEY = "yield_lulo_transaction_parity_reports_v1"


@router.post("/lulo-parity")
async def record_lulo_parity(
    payload: dict, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Compare the browser and backend against the exact SAME provider read.

    This endpoint is diagnostic and can never mutate actual transactions.
    Client-supplied output is not proof of persisted ledger correctness.
    """
    before = payload.get("before")
    snapshot = payload.get("snapshot")
    after = payload.get("after")
    if not all(isinstance(value, dict) for value in (before, snapshot, after)):
        raise HTTPException(status_code=422, detail="Invalid parity inputs.")
    project_id = str(before.get("id") or "")
    project = db.get(Project, project_id)
    if project is None or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project unavailable.")
    if (project.data or {}).get("lulo_wallet_address") != before.get("lulo_wallet_address"):
        raise HTTPException(status_code=422, detail="Project wallet changed.")
    if not isinstance(before.get("transactions", []), list) or len(before.get("transactions", [])) > 2000:
        raise HTTPException(status_code=422, detail="Too many transactions to compare.")
    if not isinstance(after.get("transactions", []), list) or len(after.get("transactions", [])) > 2000:
        raise HTTPException(status_code=422, detail="Too many transactions to compare.")
    observed = parity_observation(before, snapshot, after, payload.get("appliedAt"))
    if observed["status"] == "invalid":
        raise HTTPException(status_code=422, detail=observed["reason"])
    previous = _read(db, user.id, PARITY_SETTINGS_KEY)
    next_report = update_parity_history(previous, observed)
    if next_report != previous:
        _write(db, user.id, PARITY_SETTINGS_KEY, next_report)
        db.commit()
    return observed


@router.get("/migration-status")
async def yield_migration_status(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Live deployment diagnostics; cutover remains disabled by design."""
    now = datetime.now(timezone.utc)
    sources = _read(db, user.id, SNAPSHOTS_KEY)
    latest = sources.get("successfulAt")
    from ..yield_earnings_ledger import parse_time
    synced_at = parse_time(latest)
    age = max(0, (now - synced_at).total_seconds()) if synced_at else None
    parity = _read(db, user.id, PARITY_SETTINGS_KEY)
    previews = _read(db, user.id, LULO_TRANSACTION_PREVIEW_KEY)
    provider_health = source_poll_health(sources, now)
    real_projects = db.query(Project).filter(
        Project.user_id == user.id
    ).all()
    project_status = {}
    for project in real_projects:
        if (project.data or {}).get("yield_tracking") != "lulo_lending":
            continue
        latest_report = (parity.get("latestByProject") or {}).get(project.id) or {}
        preview = previews.get(project.id)
        last_browser_sync = (project.data or {}).get("lulo_last_synced_at")
        last_preview_sync = preview.get("lulo_last_synced_at") if isinstance(preview, dict) else None
        persisted = {
            **(project.data or {}),
            "id": project.id,
            "earned": project.earned,
            "invested": project.invested,
        }
        parity_result = persisted_project_parity(
            persisted, preview if isinstance(preview, dict) else None
        )
        lulo_wallet = (project.data or {}).get("lulo_wallet_address")
        source_fresh = bool((provider_health["lulo"].get(lulo_wallet) or {}).get("fresh"))
        backup = _read(db, user.id, LULO_CUTOVER_BACKUP_PREFIX + project.id)
        backup_present = bool(backup.get("project"))
        reasons = []
        if not latest_report.get("diagnosticThresholdMet"):
            reasons.append("need-more-distinct-same-input-matches")
        if parity_result.get("status") != "matched":
            reasons.append("persisted-ledger-needs-verification")
        if not source_fresh:
            reasons.append("backend-poll-not-fresh")
        if not backup_present:
            reasons.append("original-ledger-backup-not-yet-created")
        project_status[project.id] = {
            "parityMatches": latest_report.get("consecutiveMatches", 0),
            "sameInputDiagnosticsPassed": bool(latest_report.get("diagnosticThresholdMet")),
            "persistedLedgerParity": parity_result,
            "browserLastSyncedAt": last_browser_sync,
            "backendPreviewLastSyncedAt": last_preview_sync,
            "independentProviderPollFresh": source_fresh,
            "originalLedgerBackupPresent": backup_present,
            "cutoverReadiness": {
                "readyForManualReview": not reasons,
                "blockers": reasons,
            },
            "comparisonMode": True,
            "eligibleForAutomaticWrites": False,
        }
    return {
        "polledAt": sources.get("checkedAt"),
        "lastSuccessfulPollAt": latest,
        "lastSuccessfulPollAgeSeconds": round(age) if age is not None else None,
        "providerErrors": sources.get("errors") or {},
        "providerFreshness": provider_health,
        "luloApiKeyConfigured": bool(os.getenv("LULO_API_KEY")),
        "luloProjects": project_status,
        "projectWriteProtocol": "per-project-compare-and-swap-v1",
        "legacyProjectReplacementBlocked": True,
        "cutoverEnabled": False,
        "note": "Live history parity and safe write ownership still require verification.",
    }


@router.get("/cutover-backups")
async def list_cutover_backups(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Show one-time safety checkpoints before transfer of write authority."""
    projects = db.query(Project).filter(Project.user_id == user.id).all()
    entries = []
    for project in projects:
        if (project.data or {}).get("yield_tracking") != "lulo_lending":
            continue
        saved = _read(db, user.id, LULO_CUTOVER_BACKUP_PREFIX + project.id)
        entries.append({
            "projectId": project.id,
            "capturedAt": saved.get("capturedAt"),
            "available": bool(saved.get("project")),
        })
    loop = _read(db, user.id, LOOPSCALE_CUTOVER_BACKUP_KEY)
    return {
        "lulo": entries,
        "loopscale": {
            "capturedAt": loop.get("capturedAt"),
            "available": bool(loop.get("history")),
        },
    }


@router.get("/cutover-backups/lulo/{project_id}")
async def retrieve_lulo_cutover_backup(
    project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    project = db.get(Project, project_id)
    if project is None or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found.")
    backup = _read(db, user.id, LULO_CUTOVER_BACKUP_PREFIX + project_id)
    if not backup.get("project"):
        raise HTTPException(status_code=404, detail="Backup not available.")
    return backup


@router.get("/cutover-backups/loopscale")
async def retrieve_loopscale_cutover_backup(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    backup = _read(db, user.id, LOOPSCALE_CUTOVER_BACKUP_KEY)
    if not backup.get("history"):
        raise HTTPException(status_code=404, detail="Backup not available.")
    return backup
