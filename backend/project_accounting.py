"""Pure, deterministic portfolio accounting for validated project observations.

No HTTP, database, browser, or live-price calls here: inputs are previously
validated snapshots. UI and API can share the server's canonical total.
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

CENT = Decimal("0.01")
PRECISION = Decimal("0.00000001")


def amount(value: Any) -> Decimal | None:
    """Return a finite non-negative monetary amount, never coerce None to 0."""
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return result if result.is_finite() and result >= 0 else None


def portfolio_summary(projects: list[dict[str, Any]]) -> dict[str, Any]:
    """Deduplicate by stable project ID and sum current wallet USD values.

    Earnings histories must not enter this sum; only current holdings count.
    Keep inactive entries in the all-project total to match NAm's existing
    project cards. Also calculate the active-only total for future consumers.
    """
    by_id: dict[str, dict[str, Any]] = {}
    for item in projects:
        if isinstance(item, dict) and item.get("id"):
            by_id[str(item["id"])] = item

    total = Decimal(0)
    active_total = Decimal(0)
    balance_count = 0
    missing_ids: list[str] = []
    stale_ids: list[str] = []
    for project_id, item in by_id.items():
        value = amount(item.get("balanceUsd"))
        if value is None:
            missing_ids.append(project_id)
            continue
        balance_count += 1
        total += value
        if not bool(item.get("inactive")):
            active_total += value
        if item.get("stale"):
            stale_ids.append(project_id)

    def as_number(value: Decimal) -> float:
        return float(value.quantize(PRECISION, rounding=ROUND_HALF_UP))

    return {
        "totalUsd": as_number(total),
        "activeTotalUsd": as_number(active_total),
        "projectCount": len(by_id),
        "valuedProjectCount": balance_count,
        "missingProjectIds": missing_ids,
        "staleProjectIds": stale_ids,
        "complete": len(missing_ids) == 0 and bool(by_id),
    }


def signed_amount(value: Any) -> Decimal | None:
    """Signed earnings/P&L accepts losses, but never NaN or booleans."""
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return result if result.is_finite() and abs(result) <= Decimal("100000000") else None


def daily_income_summary(sources: dict[str, Any]) -> dict[str, Any]:
    """Canonical signed day total from already-derived per-project accruals.

    Does not reprice token holdings, invent missing earnings, or convert an
    absent source into a zero. Returns an explicit error list for bad inputs.
    """
    normalized: dict[str, Decimal] = {}
    rejected: list[str] = []
    for raw_name, raw_value in sources.items():
        name = str(raw_name).strip()
        value = signed_amount(raw_value)
        if not name or len(name) > 100 or value is None:
            rejected.append(name or "(unnamed)")
            continue
        normalized[name] = value

    total = sum(normalized.values(), Decimal(0))
    to_number = lambda n: float(n.quantize(PRECISION, rounding=ROUND_HALF_UP))
    return {
        "totalUsd": to_number(total),
        "sources": {name: to_number(value) for name, value in normalized.items()},
        "rejected": rejected,
        "complete": len(rejected) == 0,
    }
