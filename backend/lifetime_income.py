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
        by_month[month] = {
            "monthKey": month, "sources": sources,
            "projectTotal": total, "stocks": 0, "total": total,
        }
    return {**result, "months": [by_month[key] for key in sorted(by_month)],
            "bookedChartSource": "validated-monthly-provider-snapshots"}
