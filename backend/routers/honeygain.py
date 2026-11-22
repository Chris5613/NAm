"""Read-only Honeygain bridge ingestion. Never stores Honeygain credentials.

This is an opt-in companion integration; the broker accepts already normalized
readings and never makes requests to undocumented Honeygain endpoints.
Honeygain and JumpTask values remain separate, non-booked observations.
"""
from datetime import datetime, timezone
from math import isfinite
import hashlib
import hmac
import secrets
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Setting, User

router = APIRouter(prefix="/api/honeygain", tags=["honeygain"])
TOKEN_KEY = "honeygain_bridge_token_v1"
DATA_KEY = "honeygain_bridge_observations_v1"
PACIFIC = ZoneInfo("America/Los_Angeles")
MAX_DAYS = 90


def _get(db: Session, uid: int, key: str) -> Setting | None:
    return db.scalar(select(Setting).where(Setting.user_id == uid, Setting.key == key))


def _save(db: Session, uid: int, key: str, value: dict) -> None:
    row = _get(db, uid, key)
    if row is None:
        db.add(Setting(user_id=uid, key=key, value=value))
    else:
        row.value = value


def _auth(db: Session, authorization: str | None) -> int:
    raw = (authorization or "").removeprefix("Bearer ").strip()
    if not authorization or not authorization.startswith("Bearer ") or "." not in raw:
        raise HTTPException(401, "Missing Honeygain bridge token.")
    user_id_str, secret = raw.split(".", 1)
    try:
        uid = int(user_id_str)
    except ValueError as e:
        raise HTTPException(401, "Invalid Honeygain bridge token.") from e
    if uid <= 0 or len(secret) < 24:
        raise HTTPException(401, "Invalid Honeygain bridge token.")
    row = _get(db, uid, TOKEN_KEY)
    expected = str((row.value if row else {}).get("sha256") or "")
    if not expected or not hmac.compare_digest(
        expected, hashlib.sha256(secret.encode()).hexdigest()
    ):
        raise HTTPException(401, "Invalid Honeygain bridge token.")
    return uid


def _credits(payload: dict, name: str) -> float | None:
    raw = payload.get(name)
    if raw is None:
        return None
    if isinstance(raw, bool):
        raise HTTPException(422, f"{name} must be numeric.")
    try:
        value = float(raw)
    except (TypeError, ValueError) as error:
        raise HTTPException(422, f"{name} must be numeric.") from error
    if not isfinite(value) or value < 0 or value > 1_000_000_000:
        raise HTTPException(422, f"{name} out of range.")
    return round(value, 6)


@router.post("/token")
async def issue_token(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    secret = secrets.token_urlsafe(36)
    token = f"{user.id}.{secret}"
    _save(db, user.id, TOKEN_KEY, {"sha256": hashlib.sha256(secret.encode()).hexdigest()})
    db.commit()
    return {"token": token, "warning": "Keep this token private. Regenerating it disconnects the old bridge."}


@router.post("/ingest")
async def ingest(payload: dict[str, Any], authorization: str | None = Header(None),
                 db: Session = Depends(get_db)) -> dict:
    uid = _auth(db, authorization)
    db.scalar(select(User).where(User.id == uid).with_for_update())
    now = datetime.now(timezone.utc)
    day = now.astimezone(PACIFIC).strftime("%Y-%m-%d")
    if payload.get("day") != day:
        raise HTTPException(422, "Only current Pacific-day samples accepted.")
    # A successful read of the daily credits counter is required. Never replace
    # missing provider evidence with zeros or fabricate rewards from balances.
    today = _credits(payload, "todayCredits")
    if today is None:
        raise HTTPException(422, "todayCredits is required.")
    balance = _credits(payload, "unpaidBalanceCredits")
    transferred = _credits(payload, "jumpTaskTransferredCredits")
    row = _get(db, uid, DATA_KEY)
    old = dict(row.value or {}) if row else {}
    days = dict(old.get("days") or {})
    days[day] = max(float(days.get(day) or 0), today)
    days = dict(sorted(days.items())[-MAX_DAYS:])
    latest = {
        "day": day,
        "todayCredits": days[day],
        "unpaidBalanceCredits": balance,
        "jumpTaskTransferredCredits": transferred,
        "observedAt": now.isoformat(),
        "source": "local-honeygain-bridge",
    }
    _save(db, uid, DATA_KEY, {"latest": latest, "days": days})
    db.commit()
    return {"ok": True, "day": day, "todayCredits": days[day]}


@router.get("/status")
async def status(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    row = _get(db, user.id, DATA_KEY)
    token_row = _get(db, user.id, TOKEN_KEY)
    value = dict(row.value or {}) if row else {}
    days = dict(value.get("days") or {})
    now = datetime.now(timezone.utc)
    month = now.astimezone(PACIFIC).strftime("%Y-%m")
    month_credits = round(sum(float(v) for k, v in days.items() if k.startswith(month)), 6)
    return {
        "configured": token_row is not None,
        "latest": value.get("latest"),
        "monthCredits": month_credits,
        "monthUsd": round(month_credits / 1000, 6),
        "days": days,
        "sourceOfCalculation": "backend-honeygain-readonly",
        "bookedFinancialIncome": False,
    }
