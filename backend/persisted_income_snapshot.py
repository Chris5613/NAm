"""Source-owned monthly income projection for NAm history.

Never fabricate earnings from balances. The primary source is the backend
booked provider snapshot; separately recorded dividends, legacy project
rewards, and explicitly configured manual imports are added once only.
"""
from .income_history_core import historical_income, legacy_months
from .monthly_snapshot_guard import guard_monthly_snapshots


def project_history_rows(projects, relational_by_project):
    """Prefer relational rows when present, else preserve embedded legacy rows.

    Both formats are mirrors of the same project accounting history and must
    not be added together. This is a read-only compatibility projection.
    """
    rows = []
    for project in projects:
        embedded_data = getattr(project, "data", None)
        info = embedded_data if isinstance(embedded_data, dict) else {}
        relational = relational_by_project.get(project.id, [])
        embedded = info.get("transactions")
        history = relational if relational else (
            embedded if isinstance(embedded, list) else [])
        rows.append({
            **info, "id": project.id, "name": project.name,
            "earned": project.earned, "transactions": history,
        })
    return rows


def source_income_history(snapshots, payouts, projects, manual, current_month,
                          current_provider_months=None, confirmed_legacy=None):
    # The scheduler reconciles every five minutes. During that interval
    # today's provider earnings can change while the saved snapshot is old.
    # Compute an up-to-date read-only projection from durable trackers. Never
    # persist the projection, and never change a locked historical month.
    existing = snapshots if isinstance(snapshots, dict) else {}
    if isinstance(current_provider_months, list) or confirmed_legacy:
        existing = guard_monthly_snapshots(
            existing, existing, current_provider_months, current_month,
            confirmed_legacy=confirmed_legacy)
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
