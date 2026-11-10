"""Secure ingestion and readback for local smart-plug power telemetry."""

from datetime import datetime, timezone
import hashlib
import hmac
import secrets
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Setting, User

router = APIRouter(prefix="/api/power", tags=["power"])

TOKEN_KEY = "power_ingest_token_v1"
TELEMETRY_KEY = "power_telemetry_v1"
MAX_WATTS_PER_DEVICE = 3000.0
MAX_DEVICES = 8
HISTORY_LIMIT = 288


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _setting(db: Session, user_id: int, key: str) -> Setting | None:
    return db.scalar(select(Setting).where(Setting.user_id == user_id, Setting.key == key))


def _write_setting(db: Session, user_id: int, key: str, value: dict[str, Any]) -> None:
    row = _setting(db, user_id, key)
    if row is None:
        row = Setting(user_id=user_id, key=key, value=value)
        db.add(row)
    else:
        row.value = value


def _parse_token(authorization: str | None) -> tuple[int, str]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing power ingest token.")
    raw = authorization[7:].strip()
    if "." not in raw:
        raise HTTPException(401, "Invalid power ingest token.")
    user_part, secret = raw.split(".", 1)
    try:
        user_id = int(user_part)
    except ValueError as error:
        raise HTTPException(401, "Invalid power ingest token.") from error
    if user_id <= 0 or len(secret) < 24:
        raise HTTPException(401, "Invalid power ingest token.")
    return user_id, secret


def _authorize_ingest(db: Session, authorization: str | None) -> int:
    user_id, secret = _parse_token(authorization)
    row = _setting(db, user_id, TOKEN_KEY)
    expected = str((row.value if row else {}).get("sha256") or "")
    actual = hashlib.sha256(secret.encode("utf-8")).hexdigest()
    if not expected or not hmac.compare_digest(expected, actual):
        raise HTTPException(401, "Invalid power ingest token.")
    return user_id


@router.post("/token")
async def create_power_token(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Rotate the per-user bridge token. The plaintext token is returned once."""
    secret = secrets.token_urlsafe(36)
    token = f"{user.id}.{secret}"
    _write_setting(db, user.id, TOKEN_KEY, {
        "sha256": hashlib.sha256(secret.encode("utf-8")).hexdigest(),
        "createdAt": _now_iso(),
    })
    db.commit()
    return {"token": token, "createdAt": _now_iso()}


@router.get("/status")
async def power_status(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    token_row = _setting(db, user.id, TOKEN_KEY)
    telemetry = _setting(db, user.id, TELEMETRY_KEY)
    value = dict(telemetry.value or {}) if telemetry else {}
    return {
        "configured": bool(token_row and (token_row.value or {}).get("sha256")),
        "latest": value.get("latest"),
        "history": value.get("history") or [],
    }


@router.post("/ingest")
async def ingest_power(
    payload: dict[str, Any],
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    user_id = _authorize_ingest(db, authorization)
    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise HTTPException(401, "Invalid power ingest token.")

    raw_devices = payload.get("devices")
    if not isinstance(raw_devices, list) or not raw_devices or len(raw_devices) > MAX_DEVICES:
        raise HTTPException(422, "Expected 1 to 8 power devices.")

    devices = []
    seen = set()
    for index, raw in enumerate(raw_devices):
        if not isinstance(raw, dict):
            raise HTTPException(422, "Invalid power device.")
        device_id = str(raw.get("id") or f"device-{index + 1}").strip()[:64]
        label = str(raw.get("label") or device_id).strip()[:80]
        if not device_id or device_id in seen:
            raise HTTPException(422, "Power device IDs must be unique and nonempty.")
        seen.add(device_id)
        try:
            watts = float(raw.get("watts"))
        except (TypeError, ValueError) as error:
            raise HTTPException(422, "Device watts must be numeric.") from error
        if watts < 0 or watts > MAX_WATTS_PER_DEVICE:
            raise HTTPException(422, "Device watts are outside the allowed range.")
        device = {"id": device_id, "label": label, "watts": round(watts, 2)}
        today_kwh = raw.get("today_kwh")
        if today_kwh is not None:
            try:
                today_kwh = float(today_kwh)
            except (TypeError, ValueError):
                today_kwh = None
            if today_kwh is not None and 0 <= today_kwh <= 1000:
                device["today_kwh"] = round(today_kwh, 4)
        devices.append(device)

    observed_at = _now_iso()
    latest = {
        "observedAt": observed_at,
        "devices": devices,
        "totalWatts": round(sum(item["watts"] for item in devices), 2),
    }

    row = _setting(db, user_id, TELEMETRY_KEY)
    previous = dict(row.value or {}) if row else {}
    history = list(previous.get("history") or [])
    history.append({"observedAt": observed_at, "totalWatts": latest["totalWatts"]})
    history = history[-HISTORY_LIMIT:]

    _write_setting(db, user_id, TELEMETRY_KEY, {"latest": latest, "history": history})
    db.commit()
    return {"ok": True, **latest}
