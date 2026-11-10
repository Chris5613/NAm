"""Secure ingestion and readback for local smart-plug power telemetry."""

from datetime import datetime, timedelta, timezone
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

router = APIRouter(prefix="/api/power", tags=["power"])

TOKEN_KEY = "power_ingest_token_v1"
TELEMETRY_KEY = "power_telemetry_v1"
MAX_WATTS_PER_DEVICE = 3000.0
MAX_DEVICES = 8
HISTORY_LIMIT = 288
PACIFIC = ZoneInfo("America/Los_Angeles")
MAX_INTEGRATION_GAP_SECONDS = 300
USAGE_MONTH_LIMIT = 13
MAX_BACKFILL_INTERVALS = 24 * 8
BACKFILL_KEY_LIMIT = 24 * 31 * (MAX_DEVICES + 1)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _usage_tier(moment: datetime) -> str:
    """Return the Time of Day bucket for a Pacific-local timestamp."""
    local = moment.astimezone(PACIFIC)
    if local.weekday() >= 5:
        return "offPeak"
    hour = local.hour
    if 17 <= hour < 21:
        return "peak"
    if hour >= 21 or hour < 7:
        return "offPeak"
    return "midPeak"


def _month_key(moment: datetime) -> str:
    return moment.astimezone(PACIFIC).strftime("%Y-%m")


def _day_key(moment: datetime) -> str:
    return moment.astimezone(PACIFIC).strftime("%Y-%m-%d")


def _current_month_usage(value: dict[str, Any], now: datetime) -> dict[str, Any] | None:
    usage = dict(value.get("usage") or {})
    months = dict(usage.get("months") or {})
    return months.get(_month_key(now))


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
    now = datetime.now(timezone.utc)
    return {
        "configured": bool(token_row and (token_row.value or {}).get("sha256")),
        "latest": value.get("latest"),
        "history": value.get("history") or [],
        "currentMonth": _current_month_usage(value, now),
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

    now = datetime.now(timezone.utc)
    observed_at = now.isoformat()
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

    usage = dict(previous.get("usage") or {})
    months = dict(usage.get("months") or {})
    previous_latest = previous.get("latest") if isinstance(previous.get("latest"), dict) else None

    if previous_latest and previous_latest.get("observedAt") is not None:
        try:
            previous_time = datetime.fromisoformat(str(previous_latest["observedAt"]))
            if previous_time.tzinfo is None:
                previous_time = previous_time.replace(tzinfo=timezone.utc)
            elapsed_seconds = (now - previous_time.astimezone(timezone.utc)).total_seconds()
        except (TypeError, ValueError):
            elapsed_seconds = 0.0
            previous_time = now

        if 0 < elapsed_seconds <= MAX_INTEGRATION_GAP_SECONDS:
            midpoint = previous_time + (now - previous_time) / 2
            key = _month_key(midpoint)
            day = _day_key(midpoint)
            tier = _usage_tier(midpoint)

            previous_watts = float(previous_latest.get("totalWatts") or latest["totalWatts"])
            average_watts = max(0.0, (previous_watts + latest["totalWatts"]) / 2)
            interval_kwh = average_watts * elapsed_seconds / 3_600_000

            month = dict(months.get(key) or {})
            tiers = dict(month.get("tiers") or {})
            days = dict(month.get("days") or {})
            month_devices = dict(month.get("devices") or {})

            if not month.get("startedAt"):
                month["startedAt"] = previous_time.astimezone(timezone.utc).isoformat()

            tiers.setdefault("offPeak", 0.0)
            tiers.setdefault("midPeak", 0.0)
            tiers.setdefault("peak", 0.0)

            tiers[tier] = float(tiers.get(tier) or 0) + interval_kwh
            total_kwh = float(month.get("totalKwh") or 0) + interval_kwh
            tracked_seconds = float(month.get("trackedSeconds") or 0) + elapsed_seconds

            day_entry = dict(days.get(day) or {})
            day_entry["kwh"] = float(day_entry.get("kwh") or 0) + interval_kwh
            day_entry["trackedSeconds"] = float(day_entry.get("trackedSeconds") or 0) + elapsed_seconds
            days[day] = day_entry

            previous_devices = {
                str(item.get("id")): item
                for item in (previous_latest.get("devices") or [])
                if isinstance(item, dict) and item.get("id")
            }
            for device in devices:
                device_id = str(device["id"])
                previous_device = previous_devices.get(device_id) or {}
                previous_device_watts = float(previous_device.get("watts") or device["watts"])
                average_device_watts = max(
                    0.0,
                    (previous_device_watts + float(device["watts"])) / 2,
                )
                device_kwh = average_device_watts * elapsed_seconds / 3_600_000

                device_usage = dict(month_devices.get(device_id) or {})
                device_tiers = dict(device_usage.get("tiers") or {})
                device_tiers.setdefault("offPeak", 0.0)
                device_tiers.setdefault("midPeak", 0.0)
                device_tiers.setdefault("peak", 0.0)
                device_tiers[tier] = float(device_tiers.get(tier) or 0) + device_kwh

                device_usage.update({
                    "id": device_id,
                    "label": device.get("label") or device_id,
                    "kwh": round(float(device_usage.get("kwh") or 0) + device_kwh, 6),
                    "trackedSeconds": round(
                        float(device_usage.get("trackedSeconds") or 0) + elapsed_seconds,
                        2,
                    ),
                    "tiers": {
                        name: round(float(value or 0), 6)
                        for name, value in device_tiers.items()
                    },
                })
                month_devices[device_id] = device_usage

            month.update({
                "month": key,
                "lastUpdatedAt": observed_at,
                "totalKwh": round(total_kwh, 6),
                "trackedSeconds": round(tracked_seconds, 2),
                "tiers": {name: round(float(value or 0), 6) for name, value in tiers.items()},
                "days": days,
                "devices": month_devices,
            })
            months[key] = month

    if len(months) > USAGE_MONTH_LIMIT:
        for old_key in sorted(months.keys())[:-USAGE_MONTH_LIMIT]:
            months.pop(old_key, None)

    usage["months"] = months

    _write_setting(
        db,
        user_id,
        TELEMETRY_KEY,
        {"latest": latest, "history": history, "usage": usage},
    )
    db.commit()
    return {"ok": True, **latest}


@router.post("/backfill")
async def backfill_power_history(
    payload: dict[str, Any],
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Import completed hourly P115 energy history before live tracking began."""
    user_id = _authorize_ingest(db, authorization)
    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise HTTPException(401, "Invalid power ingest token.")

    raw_intervals = payload.get("intervals")
    if not isinstance(raw_intervals, list) or len(raw_intervals) > MAX_BACKFILL_INTERVALS:
        raise HTTPException(422, "Expected up to 192 hourly history intervals.")

    row = _setting(db, user_id, TELEMETRY_KEY)
    previous = dict(row.value or {}) if row else {}
    usage = dict(previous.get("usage") or {})
    months = dict(usage.get("months") or {})
    seen_keys = list(usage.get("backfillKeys") or [])
    seen = set(str(key) for key in seen_keys)

    latest = previous.get("latest") if isinstance(previous.get("latest"), dict) else {}
    cutoff = None
    current_key = _month_key(datetime.now(timezone.utc))
    current_month = dict(months.get(current_key) or {})

    cutoff_raw = current_month.get("startedAt") or latest.get("observedAt")
    if cutoff_raw:
        try:
            cutoff = datetime.fromisoformat(str(cutoff_raw))
            if cutoff.tzinfo is None:
                cutoff = cutoff.replace(tzinfo=timezone.utc)
            cutoff = cutoff.astimezone(timezone.utc)
        except (TypeError, ValueError):
            cutoff = None

    imported = 0
    imported_kwh = 0.0

    for raw in raw_intervals:
        if not isinstance(raw, dict):
            continue

        try:
            start_at = datetime.fromisoformat(str(raw.get("startAt")))
            if start_at.tzinfo is None:
                start_at = start_at.replace(tzinfo=timezone.utc)
            start_at = start_at.astimezone(timezone.utc)
            kwh = float(raw.get("kwh"))
        except (TypeError, ValueError):
            continue

        if kwh < 0 or kwh > 20:
            continue

        interval_end = start_at + timedelta(hours=1)
        if cutoff is not None and interval_end > cutoff:
            continue

        normalized_start = start_at.replace(minute=0, second=0, microsecond=0)
        midpoint = normalized_start + timedelta(minutes=30)
        key = _month_key(midpoint)
        day = _day_key(midpoint)
        tier = _usage_tier(midpoint)

        month = dict(months.get(key) or {})
        tiers = dict(month.get("tiers") or {})
        days = dict(month.get("days") or {})
        month_devices = dict(month.get("devices") or {})

        aggregate_key = "tapo-hour:" + normalized_start.isoformat()
        if aggregate_key not in seen:
            tiers.setdefault("offPeak", 0.0)
            tiers.setdefault("midPeak", 0.0)
            tiers.setdefault("peak", 0.0)
            tiers[tier] = float(tiers.get(tier) or 0) + kwh

            day_entry = dict(days.get(day) or {})
            day_entry["kwh"] = float(day_entry.get("kwh") or 0) + kwh
            day_entry["trackedSeconds"] = float(day_entry.get("trackedSeconds") or 0) + 3600
            days[day] = day_entry

            month["totalKwh"] = round(float(month.get("totalKwh") or 0) + kwh, 6)
            month["trackedSeconds"] = round(
                float(month.get("trackedSeconds") or 0) + 3600,
                2,
            )

            seen.add(aggregate_key)
            seen_keys.append(aggregate_key)
            imported += 1
            imported_kwh += kwh

        raw_devices = raw.get("devices")
        if isinstance(raw_devices, list):
            for raw_device in raw_devices:
                if not isinstance(raw_device, dict):
                    continue
                device_id = str(raw_device.get("id") or "").strip()[:64]
                if not device_id:
                    continue
                try:
                    device_kwh = float(raw_device.get("kwh"))
                except (TypeError, ValueError):
                    continue
                if device_kwh < 0 or device_kwh > 10:
                    continue

                device_key = (
                    "tapo-device:"
                    + device_id
                    + ":"
                    + normalized_start.isoformat()
                )
                if device_key in seen:
                    continue

                device_usage = dict(month_devices.get(device_id) or {})
                device_tiers = dict(device_usage.get("tiers") or {})
                device_tiers.setdefault("offPeak", 0.0)
                device_tiers.setdefault("midPeak", 0.0)
                device_tiers.setdefault("peak", 0.0)
                device_tiers[tier] = float(device_tiers.get(tier) or 0) + device_kwh

                device_usage.update({
                    "id": device_id,
                    "label": str(raw_device.get("label") or device_id)[:80],
                    "kwh": round(
                        float(device_usage.get("kwh") or 0) + device_kwh,
                        6,
                    ),
                    "trackedSeconds": round(
                        float(device_usage.get("trackedSeconds") or 0) + 3600,
                        2,
                    ),
                    "tiers": {
                        name: round(float(value or 0), 6)
                        for name, value in device_tiers.items()
                    },
                })
                month_devices[device_id] = device_usage
                seen.add(device_key)
                seen_keys.append(device_key)

        started_at = month.get("startedAt")
        if not started_at:
            month["startedAt"] = normalized_start.isoformat()
        else:
            try:
                existing_start = datetime.fromisoformat(str(started_at))
                if existing_start.tzinfo is None:
                    existing_start = existing_start.replace(tzinfo=timezone.utc)
                if normalized_start < existing_start.astimezone(timezone.utc):
                    month["startedAt"] = normalized_start.isoformat()
            except (TypeError, ValueError):
                month["startedAt"] = normalized_start.isoformat()

        month.update({
            "month": key,
            "lastUpdatedAt": _now_iso(),
            "tiers": {
                name: round(float(value or 0), 6)
                for name, value in tiers.items()
            },
            "days": days,
            "devices": month_devices,
        })
        months[key] = month

    if len(months) > USAGE_MONTH_LIMIT:
        for old_key in sorted(months.keys())[:-USAGE_MONTH_LIMIT]:
            months.pop(old_key, None)

    usage["months"] = months
    usage["backfillKeys"] = seen_keys[-BACKFILL_KEY_LIMIT:]

    _write_setting(
        db,
        user_id,
        TELEMETRY_KEY,
        {
            "latest": previous.get("latest"),
            "history": previous.get("history") or [],
            "usage": usage,
        },
    )
    db.commit()

    return {
        "ok": True,
        "imported": imported,
        "importedKwh": round(imported_kwh, 6),
        "cutoff": cutoff.isoformat() if cutoff else None,
    }
