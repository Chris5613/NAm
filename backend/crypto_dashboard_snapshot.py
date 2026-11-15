"""Fast, read-only crypto Project Income snapshot.

Only persisted validated provider feed rows participate in valuations. No
browser session cache, BTC wallet estimate, mined lifetime income, project
investment principal or Financials PPE enters this summary.
"""
from datetime import datetime, timezone
from typing import Any

from .project_accounting import portfolio_summary
from .project_freshness import is_project_stale


def crypto_dashboard_snapshot(user_id: int, feed: Any, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    stored = feed if isinstance(feed, dict) else {}
    raw_rows = stored.get("projects")
    rows = raw_rows if isinstance(raw_rows, list) else []

    # Revalidate at read time; the source cadence (daily Unetwork, inactive
    # Lulo, 20 minute continuously updated sources) is the only policy.
    by_id: dict[str, dict] = {}
    for row in rows:
        if not isinstance(row, dict) or not row.get("id"):
            continue
        value = {**row, "stale": is_project_stale(row, now)}
        by_id[str(row["id"])] = value

    validated = list(by_id.values())
    summary = portfolio_summary(validated)
    projects = sorted(
        ({
            "id": str(row.get("id") or "")[:128],
            "name": str(row.get("name") or row.get("id") or "")[:128],
            "balanceUsd": row.get("balanceUsd"),
            "inactive": bool(row.get("inactive")),
            "stale": bool(row.get("stale")),
            "sourceLastSyncedAt": row.get("sourceLastSyncedAt"),
            "balanceSource": row.get("balanceSource") or "validated-project-observation",
        } for row in validated),
        key=lambda row: (row["inactive"], row["name"].casefold(), row["id"]),
    )
    complete = bool(summary["complete"]) and bool(stored.get("receivedAt"))
    return {
        "version": 1,
        "userId": user_id,
        "sourceOfCalculation": "backend-project-feed",
        # A missing/incomplete feed is UNKNOWN, never an invented $0.
        "complete": complete,
        "totalUsd": summary["totalUsd"] if complete else None,
        "activeTotalUsd": summary["activeTotalUsd"] if complete else None,
        "activePositions": sum(not row["inactive"] for row in projects),
        "projectCount": summary["projectCount"],
        "missingProjectIds": summary["missingProjectIds"],
        "staleProjectIds": summary["staleProjectIds"],
        "projects": projects,
        "receivedAt": stored.get("receivedAt"),
        "calculatedAt": now.isoformat(),
    }
