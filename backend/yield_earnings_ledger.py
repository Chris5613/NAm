"""Pure, replayable Lulo monthly and Loopscale observed-P/L reconciliation.

Ported from yieldFarmingAccounting.js and YieldFarmingPage.jsx.
These functions never call providers, write transactions, or infer precise
earning timestamps from differences between periodic balances.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from math import isfinite
from typing import Any
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")
LULO_MONTHLY_ACCOUNTING_VERSION = 5
LULO_SEPTEMBER_2026_OPENING_EARNED = 9.05
HISTORY_OBSERVATION_LIMIT = 1440


def as_float(value: Any, fallback: float | None = 0) -> float | None:
    if value is None or isinstance(value, bool):
        return fallback
    try:
        result = float(value)
    except (ValueError, TypeError, OverflowError):
        return fallback
    return result if isfinite(result) else fallback


def parse_time(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def pacific_day(value: datetime) -> str:
    return value.astimezone(PACIFIC).date().isoformat()


def pacific_month(value: datetime) -> str:
    return value.astimezone(PACIFIC).strftime("%Y-%m")


def month_of(value: Any) -> str:
    # Preserve the JS helper's exact handling for literal date strings:
    # a YYYY-MM-DD date means that local calendar month, not UTC conversion.
    if isinstance(value, str) and len(value) == 10 and value[4] == "-" and value[7] == "-":
        return value[:7]
    parsed = parse_time(value)
    return pacific_month(parsed) if parsed else ""


def advance_loopscale_history(history: dict | None, snapshot: dict,
                              now: datetime | None = None) -> dict:
    """Add observed P/L deltas on the observed Pacific day, once per sync.

    Loopscale pnl.usdPnl is already flow-adjusted upstream; do not subtract
    principal or assume these observations are hourly accrual timestamps.
    """
    state = deepcopy(history) if isinstance(history, dict) else {}
    positions = state.get("positions") if isinstance(state.get("positions"), dict) else {}
    pnl = as_float(snapshot.get("pnlUsd"), None)
    balance = as_float(snapshot.get("positionValueUsd"), None)
    incoming = parse_time(snapshot.get("syncedAt"))
    if incoming is None or pnl is None or balance is None or balance <= 0:
        return state
    position_key = str(snapshot.get("loanAddress") or "loopscale-onyc")
    existing = positions.get(position_key)
    existing = existing if isinstance(existing, dict) else {}
    previous = parse_time(existing.get("lastSyncedAt"))
    if previous and incoming <= previous:
        return state  # crucial: repeated polling must not book a second change
    previous_pnl = as_float(existing.get("lastPnlUsd"), None)
    observed_daily = dict(existing.get("observedDaily") or {})
    if previous and previous_pnl is not None:
        increase = pnl - previous_pnl
        if abs(increase) > 0.000000001:
            day = pacific_day(incoming)
            observed_daily[day] = round(as_float(observed_daily.get(day)) + increase, 8)

    current_month = pacific_month(incoming)
    start_month = month_of(snapshot.get("startTime"))
    monthly_earnings = dict(existing.get("monthlyEarnings") or {})
    baselines = dict(existing.get("monthBaselines") or {})
    if current_month not in baselines or as_float(baselines[current_month], None) is None:
        previous_month = month_of(existing.get("lastSyncedAt"))
        baselines[current_month] = (
            0.0 if start_month == current_month
            else previous_pnl if previous_month and previous_month < current_month and previous_pnl is not None
            else pnl
        )
    monthly_earnings[current_month] = round(pnl - as_float(baselines[current_month]), 8)

    observations = list(existing.get("observations") or [])[-(HISTORY_OBSERVATION_LIMIT - 1):]
    observations.append({"syncedAt": snapshot["syncedAt"], "pnlUsd": pnl})
    item = {
        **existing,
        "key": position_key,
        "loanAddress": snapshot.get("loanAddress") or position_key,
        "asset": snapshot.get("asset") or "ONyc",
        "startTime": snapshot.get("startTime") or existing.get("startTime"),
        "lastPnlUsd": pnl,
        "lastValueUsd": balance,
        "lastApy": as_float(snapshot.get("netApy")),
        "lastSyncedAt": snapshot["syncedAt"],
        "monthBaselines": baselines,
        "monthlyEarnings": monthly_earnings,
        "observations": observations,
        "observedDaily": observed_daily,
    }
    state["positions"] = {**positions, position_key: item}
    return state


def advance_lulo_monthly(monthly: dict | None, project: dict, snapshot: dict,
                         now: datetime | None = None) -> dict:
    """Preserve monotonic income through principal moves and interest resets.

    A meaningful cash-flow event reanchors lifetime interest and must never
    book the balance jump as income. API snapshots may include imperfect
    lifetime interest; large implausible deltas are rejected and reanchored.
    """
    state = deepcopy(monthly) if isinstance(monthly, dict) else {}
    project_id = str(project.get("id") or "")
    observation = parse_time(snapshot.get("syncedAt"))
    raw_interest = as_float(snapshot.get("totalInterestEarnedUsd"), None)
    offset = as_float(project.get("lulo_interest_offset_usd"))
    # The browser's Lulo engine records a correction offset after
    # deposits/withdrawals or impossible interest jumps. Compare normalized
    # lifetime interest, not the provider's possibly reset raw counter.
    interest = max(0, raw_interest - offset) if raw_interest is not None else None
    balance = as_float(snapshot.get("totalBalanceUsd"), None)
    if not project_id or observation is None or interest is None or interest < 0 or balance is None or balance < 0:
        return state
    month = pacific_month(observation)
    if month < "2026-09":
        return state
    project_months = dict(state.get(project_id) or {})
    previous = project_months.get(month)
    previous = previous if isinstance(previous, dict) else {}
    earlier = parse_time(previous.get("lastSyncedAt") or previous.get("createdAt"))
    if earlier and observation <= earlier:
        return state

    if as_float(previous.get("version"), 0) != LULO_MONTHLY_ACCOUNTING_VERSION:
        project_months[month] = {
            "version": LULO_MONTHLY_ACCOUNTING_VERSION,
            "monthEarned": LULO_SEPTEMBER_2026_OPENING_EARNED if month == "2026-09" else 0,
            "lastLifetimeInterest": interest,
            "lastBalanceUsd": balance,
            "createdAt": snapshot["syncedAt"],
            "lastSyncedAt": snapshot["syncedAt"],
        }
        state[project_id] = project_months
        return state

    previous_interest = as_float(previous.get("lastLifetimeInterest"), None)
    previous_balance = as_float(previous.get("lastBalanceUsd"), None)
    interest_delta = interest - previous_interest if previous_interest is not None else 0
    balance_delta = balance - previous_balance if previous_balance is not None else 0
    reference_balance = max(balance, previous_balance if previous_balance is not None else 0)
    cash_flow_threshold = max(5, reference_balance * 0.0025)
    principal_moved = previous_balance is not None and abs(balance_delta) >= cash_flow_threshold
    accepted = False
    if not principal_moved and interest_delta > 0:
        elapsed_days = max(
            (observation - earlier).total_seconds() / 86400 if earlier else 0,
            1 / 1440,
        )
        apy = max(0, as_float(snapshot.get("weightedApy")) or as_float(project.get("lulo_weighted_apy")))
        expected_interest = reference_balance * (apy / 100) * (elapsed_days / 365)
        plausible_limit = max(0.5, expected_interest * 5 + 0.1)
        accepted = interest_delta <= plausible_limit

    observed_daily = dict(previous.get("observedDaily") or {})
    earned = as_float(previous.get("monthEarned"))
    if accepted:
        earned += interest_delta
        day = pacific_day(observation)
        observed_daily[day] = round(as_float(observed_daily.get(day)) + interest_delta, 8)

    next_record = {
        **previous, "version": LULO_MONTHLY_ACCOUNTING_VERSION,
        "monthEarned": round(max(0, earned), 6),
        "observedDaily": observed_daily,
        "lastLifetimeInterest": interest,
        "lastBalanceUsd": balance,
        "lastSyncedAt": snapshot["syncedAt"],
        "lastCashFlowAt": snapshot["syncedAt"] if principal_moved else previous.get("lastCashFlowAt"),
    }
    # The legacy page intentionally doesn't save timestamp-only changes.
    # Persist timestamps here because they also enforce idempotence.
    project_months[month] = next_record
    state[project_id] = project_months
    return state


def lulo_monthly_backfills(baselines: dict) -> dict:
    """Derived monthly earnings; does not read raw transaction sums twice."""
    return {
        str(pid): {
            str(month): as_float(value.get("monthEarned"))
            for month, value in months.items()
            if isinstance(value, dict) and as_float(value.get("version")) == LULO_MONTHLY_ACCOUNTING_VERSION
        }
        for pid, months in baselines.items() if isinstance(months, dict)
    }
