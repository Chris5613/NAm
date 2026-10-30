"""Authenticated project balance ingestion, validation and recovery candidates.

Readings are reference data, not independently verified rewards. Currency-price
moves and transfers must never be silently recorded as mining earnings.
"""
from datetime import datetime, timezone
from math import isfinite
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Setting, User

router = APIRouter(prefix="/api/project-tracking", tags=["project tracking"])
LATEST_KEY = "yield_project_latest_balance_feed_v1"
ALERT_KEY = "yield_project_sync_alerts_v1"
BACKUP_PREFIX = "yield_project_balance_backup_"


def setting(db: Session, uid: int, key: str) -> Any:
    row = db.scalar(select(Setting).where(Setting.user_id == uid, Setting.key == key))
    return row.value if row else None


def save_setting(db: Session, uid: int, key: str, value: Any) -> None:
    row = db.scalar(select(Setting).where(Setting.user_id == uid, Setting.key == key))
    if row is None:
        db.add(Setting(user_id=uid, key=key, value=value))
    else:
        row.value = value


def timestamp(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    except (TypeError, ValueError):
        return None


def number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if isfinite(result) else None
    except (ValueError, TypeError):
        return None


def validate_item(item: dict, old: dict | None, now: datetime) -> dict | None:
    project_id = str(item.get("id") or "")[:128]
    if not project_id:
        return None
    prior = old or {}
    synced_at = timestamp(item.get("sourceLastSyncedAt"))
    prior_synced_at = timestamp(prior.get("sourceLastSyncedAt"))
    balance = number(item.get("balanceUsd"))
    # Reject a missing, future-dated, or regressed source reading, but keep
    # existing last good data. Zero is legitimate only with a fresh reading.
    if balance is None or balance < 0 or (
        synced_at and synced_at > now
    ) or (prior_synced_at and (synced_at is None or synced_at < prior_synced_at)):
        return prior or None
    if balance == 0 and synced_at is None and number(prior.get("balanceUsd")) not in (None, 0):
        return prior
    normalized = {
        "id": project_id,
        "name": str(item.get("name") or project_id)[:128],
        "balanceUsd": balance,
        "inactive": bool(item.get("inactive", False)),
        "sourceLastSyncedAt": synced_at.isoformat() if synced_at else None,
        "observedAt": now.isoformat(),
        "requiresLiveSync": bool(item.get("requiresLiveSync", False)),
        "stale": bool(item.get("requiresLiveSync", False)) and (synced_at is None or (now - synced_at).total_seconds() > 1200),
    }
    for attr in ("balanceTrx", "trxUsdPrice", "lifetimeEarnedUsd"):
        val = number(item.get(attr))
        if val is not None and val >= 0:
            normalized[attr] = val
    assets = item.get("assetBalances")
    if isinstance(assets, list):
        normalized["assetBalances"] = [
            {
                "symbol": str(a.get("symbol") or "")[:32],
                "amount": number(a.get("amount")),
                "balanceUsd": number(a.get("balanceUsd")),
            }
            for a in assets[:100] if isinstance(a, dict)
        ]
    return normalized


@router.put("/latest")
async def receive_latest(payload: dict, user: User = Depends(current_user),
                         db: Session = Depends(get_db)) -> dict:
    now = datetime.now(timezone.utc)
    old = setting(db, user.id, LATEST_KEY)
    old = old if isinstance(old, dict) else {}
    previous = {str(p.get("id")): p for p in old.get("projects", [])
                if isinstance(p, dict) and p.get("id")}
    incoming = payload.get("projects")
    if not isinstance(incoming, list):
        return {"status": "ignored", "reason": "invalid projects"}
    projects = dict(previous)
    for item in incoming[:100]:
        if not isinstance(item, dict):
            continue
        current = validate_item(item, previous.get(str(item.get("id"))), now)
        if current:
            projects[current["id"]] = current
    stored = {"receivedAt": now.isoformat(), "projects": list(projects.values())}
    save_setting(db, user.id, LATEST_KEY, stored)
    stale = [p["id"] for p in projects.values() if p.get("stale")]
    save_setting(db, user.id, ALERT_KEY, {
        "lastCheckedAt": now.isoformat(), "staleProjects": stale,
        "lastGoodFeedAt": now.isoformat(),
    })
    db.commit()
    return {"status": "ok", "staleProjects": stale}


@router.get("/status")
async def tracking_status(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    latest = setting(db, user.id, LATEST_KEY) or {}
    alerts = setting(db, user.id, ALERT_KEY) or {}
    now = datetime.now(timezone.utc)
    received = timestamp(latest.get("receivedAt"))
    age = (now - received).total_seconds() if received else None
    projects = latest.get("projects") if isinstance(latest.get("projects"), list) else []
    stale = [
        p.get("id") for p in projects if
        p.get("requiresLiveSync") and (
            not timestamp(p.get("sourceLastSyncedAt")) or
            (now - timestamp(p.get("sourceLastSyncedAt"))).total_seconds() > 1200
        )
    ]
    return {"feedAgeSeconds": round(age) if age is not None else None,
            "staleProjects": stale, "alerts": alerts}


@router.get("/recovery")
async def recovery_candidates(user: User = Depends(current_user),
                              db: Session = Depends(get_db)) -> dict:
    """Compare latest quantities with the most recent persisted nightly backup.
    Returns candidates for safe review, never auto-books transfers as earnings.
    """
    rows = db.scalars(select(Setting).where(
        Setting.user_id == user.id,
        Setting.key.like(f"{BACKUP_PREFIX}%")
    ).order_by(Setting.key.desc())).all()
    latest = setting(db, user.id, LATEST_KEY) or {}
    current = {p["id"]: p for p in latest.get("projects", [])
               if isinstance(p, dict) and p.get("id")}
    for row in rows:
        snapshot = row.value or {}
        before = snapshot.get("projects", [])
        if not isinstance(before, list) or not before:
            continue
        candidates = []
        for earlier in before:
            now = current.get(earlier.get("id"))
            if not now:
                continue
            old_trx = number(earlier.get("balanceTrx"))
            new_trx = number(now.get("balanceTrx"))
            price = number(now.get("trxUsdPrice"))
            if old_trx is not None and new_trx is not None and price and price > 0:
                delta = new_trx - old_trx
                old_price = number(earlier.get("trxUsdPrice"))
                # This separation is accounting-only: market P/L on existing
                # holdings must not be mixed with the new token quantity.
                market_pnl = old_trx * (price - old_price) if old_price and old_price > 0 else None
                reference_time = timestamp(earlier.get("sourceLastSyncedAt"))
                recent_reference = reference_time and (
                    datetime.now(timezone.utc) - reference_time
                ).total_seconds() < 36 * 3600
                # RollerCoin's user-reported baseline: 1.403988 TRX/day.
                # Guard against large external transfers or false scraping.
                max_possible = 1.403988 * 1.5
                eligible = bool(
                    earlier.get("stale") is False and recent_reference and
                    not now.get("stale") and 0 <= delta <= max_possible
                )
                candidates.append({
                    "id": now["id"], "quantityDeltaTrx": round(delta, 8),
                    "usdAtCurrentPrice": round(delta * price, 8),
                    "marketPnlOnPriorTrxUsd": round(market_pnl, 8) if market_pnl is not None else None,
                    "eligibleForGuardedRecovery": eligible if now["id"] == "rollercoin-project" else False,
                    "status": "unverified-wallet-change",
                })
            else:
                old_amounts = {a.get("symbol"): number(a.get("amount"))
                               for a in earlier.get("assetBalances", [])
                               if isinstance(a, dict) and a.get("symbol")}
                new_amounts = {a.get("symbol"): number(a.get("amount"))
                               for a in now.get("assetBalances", [])
                               if isinstance(a, dict) and a.get("symbol")}
                deltas = {symbol: round(value - old_amounts[symbol], 8)
                          for symbol, value in new_amounts.items()
                          if value is not None and old_amounts.get(symbol) is not None}
                if deltas:
                    old_assets = {a.get("symbol"): a for a in earlier.get("assetBalances", [])
                                  if isinstance(a, dict) and a.get("symbol")}
                    new_assets = {a.get("symbol"): a for a in now.get("assetBalances", [])
                                  if isinstance(a, dict) and a.get("symbol")}
                    earned_at_market = 0.0
                    market_pnl = 0.0
                    priced_symbols = 0
                    for symbol, delta in deltas.items():
                        old_qty = old_amounts.get(symbol)
                        new_qty = new_amounts.get(symbol)
                        old_usd = number(old_assets[symbol].get("balanceUsd"))
                        new_usd = number(new_assets[symbol].get("balanceUsd"))
                        if not old_qty or not new_qty or old_usd is None or new_usd is None:
                            continue
                        old_price, new_price = old_usd / old_qty, new_usd / new_qty
                        earned_at_market += delta * new_price
                        market_pnl += old_qty * (new_price - old_price)
                        priced_symbols += 1
                    candidates.append({
                        "id": now["id"], "assetQuantityDeltas": deltas,
                        "quantityChangeUsd": round(earned_at_market, 8) if priced_symbols else None,
                        "marketPnlOnPriorHoldingsUsd": round(market_pnl, 8) if priced_symbols else None,
                        "status": "unverified-asset-change",
                    })
        return {"referenceDate": snapshot.get("date"),
                "referenceCapturedAt": snapshot.get("capturedAt"),
                "candidates": candidates}
    return {"referenceDate": None, "candidates": []}
