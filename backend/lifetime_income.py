"""Read-only lifetime earned income from the recorded monthly provider ledger.

Month-end snapshots are booked income, distinct from current asset balances.
Do not add daily receipts, investment principal or mining payouts again.
Return unknown for gaps or inconsistent platform sums rather than inventing $0.
"""
from decimal import Decimal, InvalidOperation

START_MONTH = "2026-09"


def _amount(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        result = Decimal(str(value))
    except (ValueError, TypeError, InvalidOperation):
        return None
    return result if result.is_finite() else None


def lifetime_earned_from_snapshots(snapshots, current_month):
    if not isinstance(snapshots, dict) or current_month < START_MONTH:
        return None
    expected_year, expected_month = map(int, START_MONTH.split("-"))
    values = []
    while f"{expected_year:04d}-{expected_month:02d}" <= current_month:
        key = f"{expected_year:04d}-{expected_month:02d}"
        snapshot = snapshots.get(key)
        if not isinstance(snapshot, dict) or not isinstance(snapshot.get("platforms"), list):
            return None
        if snapshot.get("monthKey", key) != key:
            return None
        subtotal = Decimal("0")
        platforms = set()
        for row in snapshot["platforms"]:
            if not isinstance(row, dict) or not isinstance(row.get("platform"), str):
                return None
            name = row["platform"]
            amount = _amount(row.get("amount"))
            if not name or name in platforms or amount is None:
                return None
            platforms.add(name)
            subtotal += amount
        recorded = _amount(snapshot.get("total"))
        if recorded is None or abs(subtotal - recorded) > Decimal(".02"):
            return None
        if not snapshot.get("platforms"):
            return None
        values.append(subtotal)
        expected_month += 1
        if expected_month == 13:
            expected_year += 1
            expected_month = 1
    return {"totalUsd": round(float(sum(values)), 6),
            "fromMonth": START_MONTH,
            "throughMonth": current_month,
            "source": "booked-provider-monthly-ledger"}


def chart_history_with_booked_months(history, snapshots, current_month):
    """Display the same validated booked months in history and Lifetime Earned.

    Historical source projections can include overlapping legacy estimates and
    differ from the booked provider ledger. For months covered by a complete,
    internally reconciled booked ledger, use the exact snapshot amounts once.
    Months outside that ledger retain independently recorded history.
    Read-only: does not mutate either input.
    """
    if lifetime_earned_from_snapshots(snapshots, current_month) is None:
        return history
    result = dict(history) if isinstance(history, dict) else {}
    original = result.get("months")
    if not isinstance(original, list):
        return history
    by_month = {row["monthKey"]: dict(row) for row in original
                if isinstance(row, dict) and isinstance(row.get("monthKey"), str)}
    for month, raw in sorted(snapshots.items()):
        if not START_MONTH <= month <= current_month or not isinstance(raw, dict):
            continue
        sources = {}
        for item in raw["platforms"]:
            name = item["platform"]
            sources[name] = float(_amount(item["amount"]))
        total = round(sum(sources.values()), 6)
        # Keep independently dated stock payouts and other non-provider
        # earnings. Only replace providers whose booked snapshot already
        # represents those exact earnings; never erase earlier manual history.
        previous = by_month.get(month, {})
        other_sources = {
            name: amount for name, amount in (previous.get("sources") or {}).items()
            if name not in sources and
            isinstance(amount, (int, float)) and not isinstance(amount, bool)
        }
        combined = {**other_sources, **sources}
        stocks = float(other_sources.get("Stocks") or 0)
        by_month[month] = {
            **previous, "monthKey": month, "sources": combined,
            "projectTotal": round(sum(combined.values()) - stocks, 6),
            "stocks": stocks,
            "total": round(sum(combined.values()), 6),
        }
    return {**result, "months": [by_month[key] for key in sorted(by_month)],
            "bookedChartSource": "validated-monthly-provider-snapshots"}


def lifetime_earned_from_history(history, current_month, start_month="2025-01"):
    """Sum all recorded income from 2025 onward, not just booked recent months.

    Source rows already reconcile provider snapshots with separately dated
    historical earnings. Year-only imports are included once by provider/year,
    without claiming a false transaction month or counting a provider twice.
    """
    if not isinstance(history, dict) or not isinstance(history.get("months"), list):
        return None
    total = Decimal("0")
    covered = {}
    first = None
    for row in history["months"]:
        if not isinstance(row, dict):
            return None
        month = row.get("monthKey")
        if not isinstance(month, str) or len(month) != 7 or not (
                start_month <= month <= current_month):
            continue
        recorded = _amount(row.get("total"))
        sources = row.get("sources")
        if recorded is None or recorded < 0 or not isinstance(sources, dict):
            return None
        source_sum = Decimal("0")
        for name, value in sources.items():
            parsed = _amount(value)
            if not isinstance(name, str) or not name.strip() or parsed is None:
                return None
            source_sum += parsed
            covered.setdefault(month[:4], set()).add(name.strip().casefold())
        if abs(source_sum - recorded) > Decimal("0.02"):
            return None
        total += recorded
        first = min(first, month) if first else month
    for annual in history.get("annualUndated") or []:
        if not isinstance(annual, dict):
            return None
        year, sources = str(annual.get("year") or ""), annual.get("sources")
        if len(year) != 4 or not year.isdigit() or not isinstance(sources, dict):
            return None
        if not start_month[:4] <= year <= current_month[:4]:
            continue
        seen = covered.setdefault(year, set())
        for name, value in sources.items():
            parsed = _amount(value)
            if not isinstance(name, str) or not name.strip() or parsed is None or parsed < 0:
                return None
            normalized_name = name.strip().casefold()
            if normalized_name in seen:
                continue
            total += parsed
            seen.add(normalized_name)
            annual_first = year + "-01"
            first = min(first, annual_first) if first else annual_first
    if first is None:
        return None
    return {
        "totalUsd": round(float(total), 6),
        "fromMonth": first,
        "throughMonth": current_month,
        "source": "recorded-income-history-v1",
    }
