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


def recognize_mined_satoshi_increment(previous_usd, previous_sats, total_sats, latest_total_usd):
    """Recognize newly mined sats without repricing previously earned sats.

    Kryptex's reported daily USD value is a mark-to-market conversion of
    *all* sats mined that day, not a sum of USD-denominated reward credits.
    Once a sats+USD observation is on file, add only the newly mined portion
    valued at the incoming observation's implied BTC/USD rate.
    """
    old_usd = _amount(previous_usd) or 0.0
    old_sats = _amount(previous_sats) or 0.0
    current_sats = _amount(total_sats) or 0.0
    chart_usd = _amount(latest_total_usd)
    if chart_usd is None or chart_usd <= 0:
        return old_usd
    if old_usd <= 0:
        # First positive dated earnings observation: recognize once.
        return chart_usd
    if old_sats <= 0:
        # Existing income with no historical satoshi basis cannot be
        # repriced safely. Keep that USD amount fixed while establishing a
        # sats baseline; later *increases* in sats can then be recognized.
        return old_usd
    if current_sats <= old_sats:
        # BTC price appreciation alone is not mining income.
        return old_usd
    increment_usd = chart_usd * ((current_sats - old_sats) / current_sats)
    return round(old_usd + max(0.0, increment_usd), 8)


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
    prior_sats = dict(tracker.get("kryptexMiningSatsDaily") or {})
    observed_sats = dict(prior_sats)
    # Observed satoshi rewards may arrive before their USD conversion.
    # Track the satoshi quantity already credited to income separately.
    credited_sats = dict(tracker.get("kryptexIncomeCreditedSatsDaily") or {})
    for day, amount in prior_sats.items():
        if day not in credited_sats and confirmed.get(day) and (_amount(recorded.get(day)) or 0) > 0:
            credited_sats[day] = amount
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
        credited_before = credited_sats.get(day)
        recorded[day] = recognize_mined_satoshi_increment(
            previous, credited_before, observed_sats.get(day), value
        )
        confirmed[day] = True
        observed_count = _amount(observed_sats.get(day)) or 0
        if observed_count > 0:
            credited_sats[day] = max(
                _amount(credited_before) or 0, observed_count
            )
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
        and (
            not (confirmed.get(day) and (_amount(recorded.get(day)) or 0) > 0)
            or (_amount(amount) or 0) > (_amount(credited_sats.get(day)) or 0) + 0.000001
        )
    )
    result = {
        "kryptexMiningDaily": recorded,
        "kryptexConfirmedDays": confirmed,
        "kryptexMiningSatsDaily": observed_sats,
        "kryptexIncomeCreditedSatsDaily": credited_sats,
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
    credited = tracker.get("kryptexIncomeCreditedSatsDaily") or {}
    rows = []
    day = start
    while day <= end:
        key = day.isoformat()
        amount = _amount(usd.get(key))
        sat = _amount(sats.get(key))
        valid = bool(confirmed.get(key) and amount is not None and amount > 0)
        recorded_sats = _amount(credited.get(key))
        # Legacy confirmed days without an explicit credited-sats field have
        # already been recognized; migration uses their observed sats as the
        # initial accounted baseline.
        if recorded_sats is None and valid:
            recorded_sats = sat
        awaiting_conversion = (sat or 0) > (recorded_sats or 0) + 0.000001
        rows.append({
            "date": key,
            "confirmed": valid,
            "incomeUsd": amount if valid else None,
            "observedSats": sat,
            "creditedSats": recorded_sats,
            "status": "needs-review" if awaiting_conversion else
                "confirmed" if valid else "needs-review" if (sat or 0) > 0
                else "no-evidence",
        })
        day += timedelta(days=1)
    return rows
