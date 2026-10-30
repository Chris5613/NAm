"""Pure provider-specific project-income statistics.

Ported from yieldFarmingAccounting.js and kept side-by-side with its legacy
calculations during migration. All functions accept saved tracker observations,
never browser session cookies, and make no external requests.
"""
from datetime import datetime, timezone
from math import isfinite
from typing import Any
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")
KRYPTEX_OPENING_BALANCE_USD = 16.47
ROLLERCOIN_HISTORICAL_TRX = 69.123738
MONTH_DAYS = 30.4375


def numeric(raw: Any) -> float:
    if raw is None or isinstance(raw, bool):
        return 0.0
    try:
        result = float(raw)
    except (ValueError, TypeError, OverflowError):
        return 0.0
    return result if isfinite(result) else 0.0


def obj(raw: Any) -> dict:
    return raw if isinstance(raw, dict) else {}


def parse_timestamp(raw: Any) -> datetime | None:
    if not isinstance(raw, str) or not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
    except ValueError:
        return None


def current_keys(now: datetime | None = None) -> tuple[str, str]:
    local = (now or datetime.now(timezone.utc)).astimezone(PACIFIC)
    return local.date().isoformat(), local.strftime("%Y-%m")


def salad_stats(tracker: dict, today: str, month: str) -> dict:
    current = numeric(tracker.get("currentBalance"))
    lifetime = numeric(tracker.get("lifetimeBalance"))
    earnings = obj(tracker.get("monthlyEarnings"))
    month_usd = max(0.0, numeric(earnings.get(month)))
    day_index = max(1, int(today[8:10]))
    snapshots = []
    for entry in tracker.get("earningSnapshots") or []:
        if not isinstance(entry, dict):
            continue
        stamp = parse_timestamp(entry.get("syncedAt"))
        if stamp is None:
            continue
        # Missing balances are not valid references.
        raw_balance = entry.get("lifetimeBalance")
        if raw_balance is None:
            continue
        try:
            balance = float(raw_balance)
        except (ValueError, TypeError, OverflowError):
            continue
        if isfinite(balance):
            snapshots.append((stamp.timestamp(), balance))
    snapshots.sort(key=lambda pair: pair[0])
    hourly = None
    window_minutes = None
    if len(snapshots) >= 2:
        latest_time, latest_balance = snapshots[-1]
        desired = latest_time - 3600
        candidates = [
            (stamp, balance) for stamp, balance in snapshots
            if 45 <= (latest_time - stamp) / 60 <= 90
        ]
        if candidates:
            old_time, old_balance = min(
                candidates, key=lambda pair: abs(pair[0] - desired)
            )
            elapsed = (latest_time - old_time) / 3600
            gained = latest_balance - old_balance
            if elapsed > 0 and gained >= 0:
                hourly = gained / elapsed
                window_minutes = elapsed * 60
    fallback_daily = month_usd / day_index
    daily = hourly * 24 if hourly is not None else fallback_daily
    return {
        "currentBalance": current,
        "lifetimeUsd": lifetime,
        "monthUsd": month_usd,
        "withdrawals": 0,
        "estimatedHourlyUsd": hourly if hourly is not None else daily / 24,
        "estimatedDailyUsd": daily,
        "estimatedMonthlyUsd": daily * MONTH_DAYS,
        "estimatedYearlyUsd": daily * 365,
        "projectionSource": "recent_hour" if hourly is not None else "month_average",
        "projectionWindowMinutes": window_minutes,
        "lastSyncedAt": tracker.get("lastSyncedAt") or None,
    }


def unetwork_month_totals(tracker: dict) -> dict[str, float]:
    totals: dict[str, float] = {}
    for date, entry in obj(tracker.get("daily")).items():
        month = str(date)[:7]
        if len(month) != 7 or month[4] != "-" or not (
            month[:4] + month[5:]
        ).isdigit():
            continue
        val = numeric(entry if not isinstance(entry, dict) else entry.get("usd"))
        totals[month] = totals.get(month, 0) + val
    return totals


def unetwork_stats(tracker: dict, today: str, month: str) -> dict:
    month_totals = unetwork_month_totals(tracker)
    lifetime = max(sum(month_totals.values()), numeric(tracker.get("openingEarnedUsd")))
    month_usd = numeric(month_totals.get(month))
    if tracker.get("baselineInitialized") and tracker.get("openingMonth") == month:
        month_usd = numeric(tracker.get("openingEarnedUsd")) + max(
            0.0, month_usd - numeric(tracker.get("openingMonthRowsBaselineUsd"))
        )
    completed = []
    for date, row in obj(tracker.get("daily")).items():
        day = str(date)[:10]
        if (len(day) != 10 or day[4] != "-" or day[7] != "-"
            or not (day[:4] + day[5:7] + day[8:]).isdigit()
            or day >= today):
            continue
        value = numeric(row if not isinstance(row, dict) else row.get("usd"))
        if value >= 0:
            completed.append((day, value))
    completed.sort(key=lambda item: item[0], reverse=True)
    newest = completed[0] if completed else None
    daily = newest[1] if newest else 1.0
    return {
        "currentBalance": numeric(tracker.get("currentBalance")),
        "availableBalance": numeric(tracker.get("availableBalance")),
        "pendingBalance": numeric(tracker.get("pendingBalance")),
        "monthUsd": month_usd,
        "lifetimeUsd": lifetime,
        "withdrawals": numeric(tracker.get("withdrawals")),
        "estimatedDailyUsd": daily,
        "estimatedMonthlyUsd": daily * MONTH_DAYS,
        "estimatedYearlyUsd": daily * 365,
        "projectionSource": "latest_completed_day" if newest else "fallback",
        "projectionDate": newest[0] if newest else None,
        "lastSyncedAt": tracker.get("lastSyncedAt") or None,
        "transactionCount": len(obj(tracker.get("daily"))),
    }


def kryptex_stats(tracker: dict, month: str) -> dict:
    balance = numeric(tracker.get("currentBalance")) or KRYPTEX_OPENING_BALANCE_USD
    daily = numeric(tracker.get("profitabilityUsdDay"))
    lifetime = numeric(tracker.get("lifetimeEarnedUsd")) or KRYPTEX_OPENING_BALANCE_USD
    miners = tracker.get("miners")
    return {
        "currentBalanceUsd": balance,
        "openingBalanceUsd": KRYPTEX_OPENING_BALANCE_USD,
        "earnedSinceBaseline": max(0.0, lifetime - KRYPTEX_OPENING_BALANCE_USD),
        "lifetimeUsd": lifetime,
        "monthUsd": numeric(obj(tracker.get("monthlyEarnings")).get(month)),
        "dailyUsd": daily,
        "monthlyUsd": daily * MONTH_DAYS,
        "yearlyUsd": daily * 365,
        "withdrawableUsd": numeric(tracker.get("withdrawableUsd")),
        "lastSyncedAt": tracker.get("lastSyncedAt") or None,
        "reachable": bool(tracker.get("reachable")),
        "miners": miners if isinstance(miners, list) else [],
    }


def rollercoin_stats(tracker: dict, today: str, month: str) -> dict:
    daily_rows = obj(tracker.get("daily"))
    wallet_rows = obj(tracker.get("walletDaily"))
    today_usd = today_trx = month_usd = month_trx = lifetime_usd = lifetime_trx = 0.0
    for day, raw in daily_rows.items():
        entry = obj(raw)
        usd = numeric(entry.get("usd"))
        trx = numeric(entry.get("trx") if entry.get("trx") is not None else entry.get("sol"))
        lifetime_usd += usd
        lifetime_trx += trx
        if str(day)[:7] == month:
            month_usd += usd
            month_trx += trx
        if day == today:
            today_usd += usd
            today_trx += trx
    tracked_lifetime_trx = lifetime_trx
    lifetime_trx += ROLLERCOIN_HISTORICAL_TRX

    price = numeric(tracker.get("lastTrxPrice"))
    current_trx = max(0.0, numeric(tracker.get("currentTrxBalance")))
    current_usd = current_trx * price if price > 0 else 0.0

    wallet_today = obj(wallet_rows.get(today)) if today in wallet_rows else None
    if wallet_today is not None:
        today_trx = numeric(wallet_today.get("trx"))

    for day, raw in wallet_rows.items():
        entry = obj(raw)
        previous = obj(daily_rows.get(day)) if day in daily_rows else None
        delta_usd = numeric(entry.get("usd"))
        delta_trx = numeric(entry.get("trx"))
        if previous is not None:
            legacy_usd = numeric(previous.get("usd"))
            legacy_trx = numeric(
                previous.get("trx") if previous.get("trx") is not None else previous.get("sol")
            )
            lifetime_usd -= legacy_usd
            lifetime_trx -= legacy_trx
            if str(day)[:7] == month:
                month_usd -= legacy_usd
                month_trx -= legacy_trx
        lifetime_usd += delta_usd
        lifetime_trx += delta_trx
        if str(day)[:7] == month:
            month_usd += delta_usd
            month_trx += delta_trx

    if wallet_today is not None:
        stored_usd = wallet_today.get("usd")
        today_usd = numeric(stored_usd) if stored_usd is not None else today_trx * price
    reference_price = (
        max(0.0, lifetime_usd / tracked_lifetime_trx)
        if tracked_lifetime_trx > 0 else price
    )
    lifetime_usd += ROLLERCOIN_HISTORICAL_TRX * reference_price
    return {
        "todayUsd": today_usd,
        "todayTrx": today_trx,
        "monthUsd": month_usd,
        "monthTrx": month_trx,
        "lifetimeUsd": lifetime_usd,
        "lifetimeTrx": lifetime_trx,
        "currentTrxBalance": current_trx,
        "currentBalanceUsd": current_usd,
        "liveTrxPrice": price,
        "lastSyncedAt": tracker.get("balanceSyncedAt") or tracker.get("lastSyncedAt") or None,
        "transactionCount": len(daily_rows),
    }


def provider_stats(trackers: dict[str, Any], today: str, month: str) -> dict:
    """No mutation of input snapshots. No inferred income from wallet value."""
    return {
        "salad": salad_stats(obj(trackers.get("salad")), today, month),
        "unetwork": unetwork_stats(obj(trackers.get("unetwork")), today, month),
        "kryptex": kryptex_stats(obj(trackers.get("kryptex")), month),
        "rollercoin": rollercoin_stats(obj(trackers.get("rollercoin")), today, month),
    }
