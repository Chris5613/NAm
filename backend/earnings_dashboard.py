"""Server-owned display projection of recorded daily income.

The existing daily server ledger contains legacy browser-calculated inputs.
Keep those immutable. Replace overlapping values ONLY when the durable
provider-specific ledger establishes a confirmed dated reward. Unverified
residuals remain explicit provisional evidence, never silently approved.
"""
import calendar
from datetime import date, datetime, timedelta, timezone
from math import isfinite
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")
TRACKERS = {
    "Kryptex": "project_income_kryptex_tracker_v1",
    "Unetwork": "project_income_unetwork_tracker_v1",
    "RollerCoin": "project_income_rollercoin_tracker_v2",
    "Salad": "project_income_salad_tracker_v1",
}


def safe(raw):
    if raw is None or isinstance(raw, bool):
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError, OverflowError):
        return None
    return value if isfinite(value) and value >= 0 else None


def mapping(raw):
    return raw if isinstance(raw, dict) else {}


def provider_entries(day, server_record, trackers):
    """Compute today's providers on the server; label unverifiable legacy rows."""
    previous = mapping(mapping(server_record).get("sources"))
    sources = {}
    provenance = {}
    for name, value in previous.items():
        amount = safe(value)
        if amount is not None and name and len(str(name)) <= 100:
            sources[str(name)] = amount
            provenance[str(name)] = "legacy-server-receipt"

    def overwrite(provider, evidence, evidence_type):
        amount = safe(evidence)
        if amount is None:
            return
        sources[provider] = amount
        provenance[provider] = evidence_type

    k = mapping(trackers.get("Kryptex"))
    confirmed = mapping(k.get("kryptexConfirmedDays"))
    if confirmed.get(day) is True:
        overwrite("Kryptex", mapping(k.get("kryptexMiningDaily")).get(day),
                  "confirmed-kryptex-mining-day")

    u = mapping(mapping(trackers.get("Unetwork")).get("daily")).get(day)
    if isinstance(u, dict) and (safe(u.get("micros")) or 0) > 0:
        overwrite("Unetwork", u.get("usd"), "dated-unetwork-reward")

    r = mapping(trackers.get("RollerCoin"))
    roller_wallet = mapping(mapping(r.get("walletDaily")).get(day))
    roller_api = mapping(mapping(r.get("daily")).get(day))
    if roller_wallet.get("usd") is not None:
        overwrite("RollerCoin", roller_wallet["usd"], "dated-rollercoin-wallet")
    elif roller_api.get("usd") is not None:
        overwrite("RollerCoin", roller_api["usd"], "dated-rollercoin-reward")

    salad_daily = mapping(mapping(trackers.get("Salad")).get("daily"))
    if day in salad_daily:
        overwrite("Salad", salad_daily[day], "dated-salad-reward")

    provisional = sorted(
        name for name, source in provenance.items()
        if source == "legacy-server-receipt" and sources[name] > 0
    )
    corrected = {
        name: round(sources[name] - (safe(previous.get(name)) or 0), 8)
        for name, source in provenance.items()
        if source != "legacy-server-receipt" and
        abs(sources[name] - (safe(previous.get(name)) or 0)) > 0.02
    }
    return {
        "sources": sources,
        "value": round(sum(sources.values()), 8) if sources else None,
        "provenance": provenance,
        "provisionalSources": provisional,
        "correctedSourcesUsd": corrected,
    }


def build_backend_earnings_dashboard(month, today_key, records, trackers, now=None):
    """All chart math, time slicing, current-day/weekly/monthly totals in Python.

    Returned months include null for missing/unrecorded days. Never use
    browser-local balances or fabricate an earning for an absent observation.
    """
    try:
        year, month_num = map(int, str(month).split("-"))
        if len(str(month)) != 7 or not 1 <= month_num <= 12:
            raise ValueError()
        month_days = calendar.monthrange(year, month_num)[1]
        today = date.fromisoformat(today_key)
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid earnings month or Pacific date") from exc

    cache = {}
    def day_row(day):
        if day in cache:
            return cache[day]
        record = mapping(records.get(day))
        computed = provider_entries(day, record, trackers)
        recorded = day in records or bool(computed["sources"])
        result = {
            "key": day,
            "day": str(int(day[-2:])),
            "date": day,
            "label": date.fromisoformat(day).strftime("%b ") + str(int(day[-2:])),
            "value": computed["value"] if recorded else None,
            "future": day > today_key,
            **computed,
        }
        if result["future"]:
            result.update(value=None, sources={}, provisionalSources=[],
                          correctedSourcesUsd={}, provenance={})
        cache[day] = result
        return result

    days = [day_row(f"{month}-{i:02d}") for i in range(1, month_days + 1)]
    month_total = round(sum(row["value"] or 0 for row in days), 8)
    month_sources = {}
    for row in days:
        if row["future"]:
            continue
        for name, amount in row["sources"].items():
            month_sources[name] = round(month_sources.get(name, 0) + amount, 8)

    week_start = today - timedelta(days=today.weekday())
    week_days = []
    for offset in range(7):
        current = week_start + timedelta(days=offset)
        row = day_row(current.isoformat())
        week_days.append({
            "key": row["key"],
            "day": current.strftime("%a"),
            "date": row["label"],
            "value": row["value"],
            "live": current == today,
            "future": row["future"],
        })
    week_total = round(sum(row["value"] or 0 for row in week_days), 8)

    today_row = day_row(today_key)
    yesterday_row = day_row((today - timedelta(days=1)).isoformat())
    review_days = [
        {"date": row["key"], "sources": row["provisionalSources"],
         "corrections": row["correctedSourcesUsd"]}
        for row in days if not row["future"] and
        (row["provisionalSources"] or row["correctedSourcesUsd"])
    ]
    # No promise that old frontend-derived reward observations are independently
    # verified: label them for a later provider-by-provider migration.
    return {
        "month": month,
        "todayKey": today_key,
        "monthTotalUsd": month_total,
        "monthlySources": month_sources,
        "todayTotalUsd": today_row["value"],
        "todaySources": today_row["sources"],
        "yesterdayTotalUsd": yesterday_row["value"],
        "yesterdayDay": yesterday_row["key"],
        "weeklyTotalUsd": week_total,
        "days": days,
        "weekDays": week_days,
        "reviewDays": review_days,
        # A corrected legacy observation is resolved evidence, not an
        # outstanding verification failure. Only unreconciled receipts keep
        # the monthly view provisional.
        "fullyVerified": not any(row["sources"] for row in review_days),
        "calculatedAt": (now or datetime.now(timezone.utc)).isoformat(),
        "sourceOfCalculation": "backend-postgres",
    }
