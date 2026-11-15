"""Source-owned monthly income projection for NAm history.

Never fabricate earnings from balances. The primary source is the backend
booked provider snapshot; separately recorded dividends, legacy project
rewards, and explicitly configured manual imports are added once only.
"""
from .income_history_core import historical_income, legacy_months


def source_income_history(snapshots, payouts, projects, manual, current_month):
    existing = snapshots if isinstance(snapshots, dict) else {}
    months = []
    for month, raw in sorted(existing.items()):
        if not isinstance(raw, dict) or raw.get("monthKey", month) != month:
            continue
        if not isinstance(raw.get("platforms"), list):
            continue
        months.append({**raw, "monthKey": month})
    known_payouts = payouts if isinstance(payouts, dict) else {}
    known_projects = projects if isinstance(projects, list) else []
    manual_values = manual.get("monthly", {}) if isinstance(manual, dict) else {}
    result = historical_income(
        months, known_payouts, current_month,
        legacy_months(known_projects), manual_values,
    )
    return {
        "sourceOfCalculation": "backend-persisted-income-history",
        "currentMonth": current_month,
        "months": result,
        "evidence": {
            "savedProviderMonthCount": len(months),
            "savedDividendRecordCount": len(known_payouts),
            "legacyProjectCount": len(known_projects),
            "manualMonthCount": len(manual_values),
        },
        "missingOptionalSources": (
            ["dividend-payout-setting-not-present"]
            if payouts is None else []
        ),
    }
