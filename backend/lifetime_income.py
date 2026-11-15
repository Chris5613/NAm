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
