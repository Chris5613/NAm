"""Authenticated configuration and read-only server snapshots for yield sources."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import User
from ..yield_source_sync import (
    REGISTRATION_KEY, SNAPSHOTS_KEY, HISTORY_KEY,
    registered_wallets, _read, _write,
)
from ..yield_earnings_state import (
    LULO_SERVER_LEDGER_KEY, LOOPSCALE_SERVER_LEDGER_KEY,
)
from ..yield_earnings_ledger import lulo_monthly_backfills

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
    return {
        "luloMonthly": lulo,
        "luloBackfills": lulo_monthly_backfills(lulo),
        "loopscaleHistory": loopscale,
        "sourceCheckedAt": source.get("checkedAt"),
        "sourceSuccessfulAt": source.get("successfulAt"),
        "migrationMode": "independent-server-ledger",
    }
