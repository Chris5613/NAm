"""Server-owned Home daily and monthly net-worth history.

Keep prior recorded months immutable. Current-day baselines are captured once,
and current-month value updates are not interpreted as earnings.
"""
from datetime import datetime
from math import isfinite

CATEGORIES = ("stocks", "crypto", "cash", "other", "debts")
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug",
          "Sep", "Oct", "Nov", "Dec")


def finite(raw):
    if raw is None or isinstance(raw, bool):
        return None
    try:
        n = float(raw)
        return n if isfinite(n) else None
    except (TypeError, ValueError, OverflowError):
        return None


def networth_trends(
    value, breakdown, today, daily_saved=None, categories_saved=None,
    months_saved=None,
):
    """Return (view, updated_settings) without mutating inputs.

    The new 'today' is established by the backend's Pacific clock, not by
    client-side Date formatting. Reject invalid/unknown net worth instead of
    fabricating a zero baseline or erasing a closed reporting month.
    """
    amount = finite(value)
    if amount is None or amount <= 0:
        raise ValueError("An accurate positive net worth is required.")
    if not isinstance(today, str) or len(today) != 10:
        raise ValueError("Invalid reporting date")
    try:
        local = datetime.strptime(today, "%Y-%m-%d")
        if local.strftime("%Y-%m-%d") != today:
            raise ValueError()
    except ValueError:
        raise ValueError("Invalid reporting date") from None
    if not isinstance(breakdown, dict):
        raise ValueError("Missing net-worth categories")
    current_categories = {}
    for key in CATEGORIES:
        amount_for_key = finite(breakdown.get(key))
        if amount_for_key is None:
            raise ValueError("Missing verified net-worth category: " + key)
        current_categories[key] = amount_for_key

    saved_daily = daily_saved if isinstance(daily_saved, dict) else {}
    saved_categories = categories_saved if isinstance(categories_saved, dict) else {}
    today_categories = saved_categories.get("baseline") if (
        saved_categories.get("dateKey") == today and
        isinstance(saved_categories.get("baseline"), dict)) else None
    if not today_categories or any(finite(today_categories.get(key)) is None
                                   for key in CATEGORIES):
        baseline_categories = dict(current_categories)
        category_record = {"dateKey": today, "baseline": baseline_categories}
    else:
        baseline_categories = {key: finite(today_categories[key])
                               for key in CATEGORIES}
        category_record = saved_categories
    category_change = {key: current_categories[key] - baseline_categories[key]
                       for key in CATEGORIES}

    original_base = finite(saved_daily.get("baseline"))
    if (saved_daily.get("dateKey") != today or original_base is None or
            original_base <= 0):
        baseline = amount
        daily_record = {"dateKey": today, "baseline": baseline}
    else:
        baseline = original_base
        daily_record = saved_daily
    change = amount - baseline

    current_month = today[:7]
    current_label = MONTHS[local.month - 1] + " " + str(local.year)
    saved_months = months_saved if isinstance(months_saved, list) else []
    history = []
    seen = set()
    for row in saved_months:
        if not isinstance(row, dict):
            continue
        month = row.get("monthKey")
        if not isinstance(month, str) or len(month) != 7 or (
                not month[:4].isdigit() or month[4] != "-" or
                not month[5:7].isdigit() or
                not (1 <= int(month[5:7]) <= 12)):
            continue
        if month in seen:
            # The first saved month is preserved, rather than counting the
            # same month as two separate historical observations.
            continue
        seen.add(month)
        value_at_month = row.get("value")
        history.append({
            "monthKey": month,
            "month": row.get("month") or row.get("label") or
                     row.get("time") or month,
            "value": value_at_month,
            "live": month == current_month,
        })
    if current_month in seen:
        for row in history:
            if row["monthKey"] == current_month:
                row.update({"month": current_label, "value": amount, "live": True})
                break
    else:
        history.append({
            "monthKey": current_month,
            "month": current_label,
            "value": amount,
            "live": True,
        })
    history.sort(key=lambda row: row["monthKey"])
    view = {
        "sourceOfCalculation": "backend-networth-trends-v1",
        "dateKey": today,
        "dailyChange": {
            "baseline": baseline,
            "change": change,
            "percentChange": change / baseline * 100 if baseline else 0,
            "dateKey": today,
        },
        "categoryChanges": category_change,
        "monthlyHistory": history,
    }
    return view, {
        "daily_net_worth_baseline_pst": daily_record,
        "daily_category_baseline_pst": category_record,
        "monthly_net_worth_history_v2": history,
    }
