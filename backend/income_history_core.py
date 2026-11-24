"""Backend version of cross-page month-income aggregation.

The browser remains responsible for display only after parity. This function
never increases an accounting ledger by combining duplicate Lulo baselines
or incorrectly interpreting a withdrawal as interest.
"""
from collections import defaultdict
from datetime import datetime, timezone
from math import isfinite
import re
from zoneinfo import ZoneInfo


def amount(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        n = float(value)
        return n if isfinite(n) else None
    except (TypeError, ValueError, OverflowError):
        return None


def valid_month(value):
    return isinstance(value, str) and re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", value)


def valid_day(value):
    return isinstance(value, str) and re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])", value)


def source_amounts(month):
    return [entry for entry in (month.get("platforms") or [])
            if isinstance(entry, dict)]


def reconcile_lulo_months(months, local_backfills, backend_backfills,
                          current_month, lulo_projects=(), current_day=None):
    projects = {}
    for backfills in (local_backfills, backend_backfills):
        if not isinstance(backfills, dict):
            continue
        for project_id, records in backfills.items():
            if not isinstance(records, dict):
                continue
            dst = projects.setdefault(str(project_id), {})
            for month, value in records.items():
                n = amount(value)
                if valid_month(month) and month <= current_month and n is not None and n >= 0:
                    dst[month] = max(dst.get(month, 0), n)
    for project in lulo_projects or []:
        if not isinstance(project, dict):
            continue
        key = str(project.get("id") or "")
        if not key:
            continue
        daily = {}
        for row in (project.get("lulo_daily_performance") or []):
            if not isinstance(row, dict):
                continue
            day, value = row.get("date"), amount(row.get("amount"))
            if (valid_day(day) and day[:7] == current_month and
                    (not current_day or day <= current_day) and
                    value is not None and value >= 0):
                daily[day] = max(daily.get(day, 0), value)
        total = sum(daily.values())
        if total > 0:
            record = projects.setdefault(key, {})
            record[current_month] = max(record.get(current_month, 0), total)
    expected = defaultdict(float)
    for project_months in projects.values():
        for month, value in project_months.items():
            expected[month] += value
    result = {row["monthKey"]: {**row, "platforms": [
        dict(p) for p in source_amounts(row)]}
        for row in months or [] if isinstance(row, dict) and
        isinstance(row.get("monthKey"), str)}
    for month_key, earned in expected.items():
        if earned <= 0:
            continue
        row = result.get(month_key, {"monthKey": month_key, "total": 0, "platforms": []})
        current = sum(amount(p.get("amount")) or 0 for p in row["platforms"]
                      if p.get("platform") == "Lulo")
        if current >= earned - .000001:
            continue
        listed = sum(amount(p.get("amount")) or 0 for p in row["platforms"])
        unlisted = max(0, (amount(row.get("total")) or 0) - listed)
        row["platforms"] = [p for p in row["platforms"]
                            if p.get("platform") != "Lulo"] + [
                                {"platform": "Lulo", "amount": earned}]
        row["total"] = round((amount(row.get("total")) or 0) +
                             max(0, earned - current - unlisted), 6)
        result[month_key] = row
    return [result[k] for k in sorted(result)]


TRACKED_SOURCES = {"lulo", "loopscale", "salad", "rollercoin", "unetwork", "kryptex", "bixberry"}
TRACKED_TYPES = {"lulo_lending", "jupiter_inf_loop", "sanctum_inf", "kryptex"}


def transaction_month(row):
    date = str(row.get("source_date") or row.get("date") or
               row.get("created_at") or row.get("occurred_at") or "")
    if valid_day(date):
        return date[:7]
    if not date:
        return None
    try:
        when = datetime.fromisoformat(date.replace("Z", "+00:00"))
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        return when.astimezone(ZoneInfo("America/Los_Angeles")).strftime("%Y-%m")
    except ValueError:
        return None


def legacy_months(projects, provider_daily=None):
    """Project earnings that are independent of tracked provider income.

    OWNER-CONFIRMED NOV 2026: "Unity Network" / "Unity  Network" is a
    legacy mirror of the canonical Unetwork tracker; it must not be ADDED
    to Unetwork's already correct ~$310.22 lifetime total. An earlier audit
    identified 17 identical dated Unity transactions ($14.770724), and the
    owner separately rejected adding the remaining legacy Unity amount.
    Keep historical records in storage for provenance, but exclude ALL Unity
    Network aliases from income history and lifetime projections. Do not
    repeatedly flag their exclusion in audits unless new contrary evidence
    requires reviewing it. Other legacy projects remain unaffected.
    """
    months = defaultdict(lambda: defaultdict(float))
    undated = []
    for project in projects or []:
        if not isinstance(project, dict):
            continue
        name = str(project.get("name") or "").strip()
        compact = re.sub(r"[^a-z0-9]", "", name.lower())
        if compact == "unitynetwork":
            continue
        if (not name or name.lower() in TRACKED_SOURCES or
                project.get("yield_tracking") in TRACKED_TYPES):
            continue
        earned_rows = []
        for row in project.get("transactions") or []:
            if not isinstance(row, dict):
                continue
            n = amount(row.get("amount"))
            if n is not None and n > 0 and row.get("type") in (None, "", "earning", "earned"):
                earned_rows.append((row, n))
        if not earned_rows:
            n = amount(project.get("earned"))
            if n is not None and n > 0:
                undated.append({"name": name, "amount": n})
            continue
        for entry, n in earned_rows:
            month = transaction_month(entry)
            if month:
                months[month][name] += n
            else:
                undated.append({"name": name, "amount": n})
    return {"months": {k: dict(v) for k, v in months.items()},
            "undated": undated}


def historical_income(months, payouts, current_month, legacy=None, manual=None):
    result = {}
    for row in months or []:
        if not isinstance(row, dict):
            continue
        key = row.get("monthKey")
        if not valid_month(key) or key > current_month:
            continue
        sources = defaultdict(float)
        for entry in source_amounts(row):
            name = str(entry.get("platform") or "").strip()
            value = amount(entry.get("amount"))
            if name and value is not None and value != 0:
                sources[name] += value
        project_total = max(0, amount(row.get("total")) or 0)
        listed = sum(sources.values())
        if project_total > listed + .005:
            sources["Other projects"] += project_total - listed
        result[key] = {"monthKey": key, "sources": dict(sources),
                       "projectTotal": project_total}
    dividend_totals = defaultdict(float)
    for row in (payouts or {}).values():
        if not isinstance(row, dict):
            continue
        date, symbol = row.get("date"), row.get("symbol")
        value = amount(row.get("amount"))
        if valid_day(date) and date[:7] <= current_month and symbol in ("VTI", "VOO") and value is not None and value > 0:
            dividend_totals[date[:7]] += value
    for month in dividend_totals:
        result.setdefault(month, {"monthKey": month, "sources": {}, "projectTotal": 0})
    legacy_rows = (legacy or {}).get("months") or {}
    for month, additions in legacy_rows.items():
        if not valid_month(month) or month > current_month or not isinstance(additions, dict):
            continue
        target = result.setdefault(month, {"monthKey": month, "sources": {},
                                           "projectTotal": 0})
        for name, raw in additions.items():
            value = amount(raw)
            if value is None or value <= 0:
                continue
            target["sources"][name] = target["sources"].get(name, 0) + value
            target["projectTotal"] += value
    for month, target in result.items():
        stocks = dividend_totals.get(month, 0)
        target["stocks"] = stocks
        if stocks > 0:
            target["sources"]["Stocks"] = stocks
        target["total"] = target["projectTotal"] + stocks
    for month, additions in (manual or {}).items():
        if not valid_month(month) or month > current_month or not isinstance(additions, dict):
            continue
        target = result.setdefault(month, {"monthKey": month, "sources": {},
                                           "projectTotal": 0, "stocks": 0, "total": 0})
        for source, raw in additions.items():
            value = amount(raw)
            name = re.sub(r"\s+", " ", str(source).lower()).strip()
            recorded = [
                re.sub(r"\s+", " ", label.lower()).strip()
                for label in target["sources"]]
            if (not source or value is None or value <= 0 or any(
                x == name or (name.startswith("gomining ") and x == "gomining") or
                (name == "nosana" and x.startswith("nosana "))
                for x in recorded)):
                continue
            target["sources"][source] = value
            target["projectTotal"] += value
            target["total"] += value
    return [result[k] for k in sorted(result)]
