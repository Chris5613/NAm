"""Kryptex reward reconciliation and audit.

A bitcoin-denominated account's USD balance is not mined income. Preserve
reported satoshi rewards separately and never let a downward BTC/USD conversion
erase previously confirmed USD mining rewards. Zero USD readings are not proof
of zero mining and must not mark a day as confirmed.
"""
from datetime import datetime, timezone
from math import isfinite
import re
from zoneinfo import ZoneInfo

_DAY_RE = re.compile(r"\d{4}-\d{2}-\d{2}\Z")
_PACIFIC = ZoneInfo("America/Los_Angeles")


def _amount(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (ValueError, TypeError):
        return None
    return number if isfinite(number) and number >= 0 else None


def _valid_day(value, today):
    return isinstance(value, str) and _DAY_RE.fullmatch(value) and "2026-11-01" <= value <= today


def reconcile_kryptex_rewards(tracker, earnings, received_at=None):
    """Merge chart observations without changing market-value balances.

    An isolated satoshi reading is retained as evidence, but won't be turned
    into fabricated USD income without a dated conversion. All stored amounts
    are high-water observations; larger previous confirmations are preserved.
    """
    now = received_at or datetime.now(timezone.utc)
    today = now.astimezone(_PACIFIC).date().isoformat()
    incoming = earnings if isinstance(earnings, dict) else {}
    usd = incoming.get("daily_usd") if isinstance(incoming.get("daily_usd"), dict) else {}
    sats = incoming.get("daily_sats") if isinstance(incoming.get("daily_sats"), dict) else {}

    recorded = dict(tracker.get("kryptexMiningDaily") or {})
    confirmed = dict(tracker.get("kryptexConfirmedDays") or {})
    observed_sats = dict(tracker.get("kryptexMiningSatsDaily") or {})
    before = sum((_amount(v) or 0) for d, v in recorded.items() if confirmed.get(d))
    touched = set()
    for day, raw in list(sats.items())[:400]:
        if not _valid_day(day, today):
            continue
        value = _amount(raw)
        if value is None:
            continue
        observed_sats[day] = max(value, _amount(observed_sats.get(day)) or 0)
    for day, raw in list(usd.items())[:400]:
        if not _valid_day(day, today):
            continue
        value = _amount(raw)
        if value is None or value == 0:
            # A BTC price or missing conversion cannot confirm zero income.
            continue
        previous = (_amount(recorded.get(day)) or 0) if confirmed.get(day) else 0
        recorded[day] = max(value, previous)
        confirmed[day] = True
        touched.add(day[:7])

    monthly = dict(tracker.get("monthlyEarnings") or {})
    for month in touched:
        monthly[month] = round(sum(
            (_amount(v) or 0) for day, v in recorded.items()
            if str(day).startswith(month + "-") and confirmed.get(day)
        ), 8)
    after = sum((_amount(v) or 0) for d, v in recorded.items() if confirmed.get(d))
    lifetime = _amount(tracker.get("lifetimeEarnedUsd"))
    # The lifetime total must not fall if a legacy total was previously higher.
    next_lifetime = max(lifetime or 0, (lifetime or 0) + max(0, after - before))
    pending = sorted(
        day for day, amount in observed_sats.items()
        if _valid_day(day, today) and (_amount(amount) or 0) > 0
        and not (confirmed.get(day) and (_amount(recorded.get(day)) or 0) > 0)
    )
    result = {
        "kryptexMiningDaily": recorded,
        "kryptexConfirmedDays": confirmed,
        "kryptexMiningSatsDaily": observed_sats,
        "kryptexPendingEarningsDays": pending,
        "monthlyEarnings": monthly,
        "kryptexLastChartSyncAt": now.isoformat(),
    }
    if lifetime is not None or after > before:
        result["lifetimeEarnedUsd"] = round(next_lifetime, 8)
    return result


def audit_kryptex_days(tracker, start_date, end_date):
    """Read-only dated audit; avoid assuming missing earnings on idle days."""
    from datetime import date, timedelta
    start, end = date.fromisoformat(start_date), date.fromisoformat(end_date)
    if end < start or (end - start).days > 365:
        raise ValueError("Invalid Kryptex audit range")
    usd = tracker.get("kryptexMiningDaily") or {}
    confirmed = tracker.get("kryptexConfirmedDays") or {}
    sats = tracker.get("kryptexMiningSatsDaily") or {}
    rows = []
    day = start
    while day <= end:
        key = day.isoformat()
        amount = _amount(usd.get(key))
        sat = _amount(sats.get(key))
        valid = bool(confirmed.get(key) and amount is not None and amount > 0)
        rows.append({
            "date": key,
            "confirmed": valid,
            "incomeUsd": amount if valid else None,
            "observedSats": sat,
            "status": "confirmed" if valid else "needs-review" if (sat or 0) > 0 else "no-evidence",
        })
        day += timedelta(days=1)
    return rows
