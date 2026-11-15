"""Verify dated Salad rewards from monotonic saved lifetime snapshots.

The first snapshot on the target Pacific day must match the final verified
lifetime checkpoint from the preceding day. Both days require late-day
samples, preventing unobserved overnight earnings from being assigned to a
guessed date. No recorded reward or journal entry is modified.
"""
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")
TOLERANCE = Decimal("0.00000001")


def verified_salad_day(tracker, day, current_day=None):
    """Return earned USD for a completed, covered day; otherwise None."""
    if not isinstance(tracker, dict):
        return None
    try:
        target = date.fromisoformat(day)
        current = (date.fromisoformat(current_day) if current_day
                   else datetime.now(timezone.utc).astimezone(PACIFIC).date())
    except (TypeError, ValueError):
        return None
    if target >= current:
        return None
    rows = tracker.get("earningSnapshots")
    if not isinstance(rows, list) or len(rows) > 20000:
        return None
    by_date = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            stamp = datetime.fromisoformat(
                str(row.get("syncedAt") or "").replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                continue
            stamp = stamp.astimezone(PACIFIC)
            value = Decimal(str(row.get("lifetimeBalance")))
            if not value.is_finite() or value < 0:
                continue
        except (TypeError, ValueError, InvalidOperation, OverflowError):
            continue
        if stamp.date() in (target, target - timedelta(days=1)):
            by_date.setdefault(stamp.date(), []).append((stamp, value))
    previous = sorted(by_date.get(target - timedelta(days=1), []))
    current_rows = sorted(by_date.get(target, []))
    if not previous or not current_rows:
        return None
    # Reject partial daily observations and an ambiguous night gap.
    # These require an actual observed previous-day closing checkpoint.
    if previous[-1][0].hour < 22 or current_rows[-1][0].hour < 22:
        return None
    opening = previous[-1][1]
    if abs(current_rows[0][1] - opening) > TOLERANCE:
        return None
    values = [opening] + [value for _, value in current_rows]
    if any(new + TOLERANCE < old for old, new in zip(values, values[1:])):
        return None
    earned = values[-1] - opening
    return float(earned) if earned >= 0 else None
