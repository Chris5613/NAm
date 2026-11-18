"""Account-wide Bixberry balance observations; no device earnings."""
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

KEY = "project_income_bixberry_tracker_v1"
UNIT = Decimal("0.0001")

def amount(raw):
    if isinstance(raw, bool) or raw is None:
        raise ValueError("Invalid USD balance")
    try:
        value = Decimal(str(raw))
        if not value.is_finite() or value < 0 or value > 1000000 or value != value.quantize(UNIT):
            raise ValueError("Invalid USD balance")
        return value.quantize(UNIT)
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid USD balance") from None

def observe(previous, raw, at):
    balance = amount(raw)
    old = dict(previous or {})
    last = old.get("lastSyncedAt")
    if last and at <= datetime.fromisoformat(last):
        return old
    day = at.astimezone(ZoneInfo("America/Los_Angeles")).date().isoformat()
    daily = dict(old.get("daily") or {})
    monthly = dict(old.get("monthlyEarnings") or {})
    drops = list(old.get("balanceDrops") or [])
    delta = Decimal(0)
    if "currentBalance" in old:
        diff = balance - amount(old["currentBalance"])
        if diff < 0:
            drops.append({"observedAt": at.isoformat(), "amountUsd": float(-diff)})
        else:
            delta = diff
    else:
        old["openingBalance"] = float(balance)
        old["trackingStartedAt"] = at.isoformat()
    daily[day] = float(amount(daily.get(day, 0)) + delta)
    month = day[:7]
    monthly[month] = float(amount(monthly.get(month, 0)) + delta)
    return {**old, "currentBalance": float(balance), "lastSyncedAt": at.isoformat(),
            "daily": daily, "monthlyEarnings": monthly,
            "balanceDrops": drops, "lifetimeEarnedUsd": float(sum(Decimal(str(v)) for v in monthly.values())),
            "basis": "observed-account-balance-increases"}
