"""Server-owned, read-only Grass dashboard point observations.

Grass Uptime and Network points are NOT GRASS tokens or USD income.
Accept only explicitly labeled DOM values from the signed-in NAm client.
"""
from datetime import datetime, timezone
from math import isfinite
from zoneinfo import ZoneInfo
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..auth import current_user
from ..db import get_db
from ..models import Setting, User

router = APIRouter(prefix="/api/grass", tags=["grass"])
KEY = "grass_dashboard_observation_v1"
PACIFIC = ZoneInfo("America/Los_Angeles")
# Historical Stage 2 payout rates in USDC per point, not a promised Stage 3 conversion.
UPTIME_USDC_PER_POINT = 0.00000007
NETWORK_USDC_PER_POINT = 0.0049

def _num(payload: dict, name: str) -> float | None:
    raw = payload.get(name)
    if raw is None:
        return None
    if isinstance(raw, bool):
        raise HTTPException(422, f"{name} must be a number")
    try:
        number = float(raw)
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, f"{name} must be numeric") from exc
    if not isfinite(number) or number < 0 or number > 10**12:
        raise HTTPException(422, f"{name} out of range")
    return round(number, 6)

@router.post("/browser-ingest")
async def observe(payload: dict[str, Any], user: User = Depends(current_user),
                  db: Session = Depends(get_db)) -> dict:
    if payload.get("source") != "grass-visible-dashboard-v1":
        raise HTTPException(422, "Unrecognized Grass dashboard evidence")
    uptime = _num(payload, "uptimePoints")
    network = _num(payload, "networkPoints")
    uptime_epoch = payload.get("uptimeEpoch")
    network_epoch = payload.get("networkEpoch")
    for epoch in (uptime_epoch, network_epoch):
        if epoch is not None and (isinstance(epoch, bool) or not isinstance(epoch, int)
                                  or epoch < 0 or epoch > 1000):
            raise HTTPException(422, "Invalid Grass epoch")

    if uptime is None and network is None:
        raise HTTPException(422, "No labeled Grass points were found")
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    row = db.scalar(select(Setting).where(Setting.user_id == user.id, Setting.key == KEY))
    previous = dict(row.value or {}) if row else {}
    # Never replace a verified value with a missing field or guessed zero.
    latest = {
        "uptimePoints": uptime if uptime is not None else previous.get("uptimePoints"),
        "networkPoints": network if network is not None else previous.get("networkPoints"),
        "uptimeEpoch": uptime_epoch if uptime is not None else previous.get("uptimeEpoch"),
        "networkEpoch": network_epoch if network is not None else previous.get("networkEpoch"),
        "observedAt": datetime.now(timezone.utc).isoformat(),
        "source": "grass-chrome-background-tab",
    }
    # Persist UTC-date observations in Postgres. The epoch identifiers are
    # kept with each snapshot so resets are not misreported as negative income.
    day = datetime.now(timezone.utc).astimezone(PACIFIC).date().isoformat()
    history = dict(previous.get("dailyHistory") or {})
    earlier = dict(history.get(day) or {})
    samples = int(earlier.get("samples") or 0) + 1
    history[day] = {
        "first": earlier.get("first", {
            "uptimePoints": latest["uptimePoints"],
            "networkPoints": latest["networkPoints"],
            "uptimeEpoch": latest["uptimeEpoch"],
            "networkEpoch": latest["networkEpoch"],
        }),
        "latest": {
            "uptimePoints": latest["uptimePoints"],
            "networkPoints": latest["networkPoints"],
            "uptimeEpoch": latest["uptimeEpoch"],
            "networkEpoch": latest["networkEpoch"],
        },
        "firstObservedAt": earlier.get("firstObservedAt", latest["observedAt"]),
        "lastObservedAt": latest["observedAt"],
        "samples": samples,
    }
    history = dict(sorted(history.items())[-120:])
    stored = {**latest, "dailyHistory": history}
    if row:
        row.value = stored
    else:
        db.add(Setting(user_id=user.id, key=KEY, value=stored))
    db.commit()
    return {"ok": True, "latest": latest}

@router.get("/status")
async def status(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    row = db.scalar(select(Setting).where(Setting.user_id == user.id, Setting.key == KEY))
    stored = dict(row.value or {}) if row else {}
    latest = {key: value for key, value in stored.items() if key != "dailyHistory"} if stored else None
    uptime = latest.get("uptimePoints") if latest else None
    network = latest.get("networkPoints") if latest else None
    estimated_usd = (
        round((float(uptime or 0) * UPTIME_USDC_PER_POINT)
              + (float(network or 0) * NETWORK_USDC_PER_POINT), 8)
        if uptime is not None or network is not None else None
    )
    return {
        "latest": latest,
        "estimatedUsd": estimated_usd,
        "estimateRateBasis": "Grass Stage 2 historical USDC per-point rates (not guaranteed)",
        "estimatePartial": uptime is None or network is None,
        "uptimePoints": latest.get("uptimePoints") if latest else None,
        "networkPoints": latest.get("networkPoints") if latest else None,
        "uptimeEpoch": latest.get("uptimeEpoch") if latest else None,
        "networkEpoch": latest.get("networkEpoch") if latest else None,
        "balanceUsd": None,
        "grassTokens": None,
        "dailyHistory": stored.get("dailyHistory", {}),
        "historyTimezone": "America/Los_Angeles",
        "trackedBy": "NAm PostgreSQL backend; Chrome extension supplies observations",
        "bookedFinancialIncome": False,
        "note": "Points are not cash or GRASS tokens; no conversion is assumed.",
    }
