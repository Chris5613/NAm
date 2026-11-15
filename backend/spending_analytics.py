"""Server-owned Spending tab summaries and charts.

Read-only aggregation from user-scoped PostgreSQL transaction rows.
Backend recorded Passive Income month totals can be supplied from the
separate read-only backend history consumer; never writes either ledger.
"""
from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation
import re

MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
EXCLUDED = {"Income", "Transfers", "Payments"}


def amount(value):
    try:
        value = Decimal(str(value or 0))
        return value if value.is_finite() else Decimal(0)
    except (InvalidOperation, ValueError, TypeError):
        return Decimal(0)


def render(value):
    return float(value)


def is_expense(row):
    return row.get("category") not in EXCLUDED


def is_income(row):
    return row.get("category") == "Income"


def cumulative_by_day(rows, month, days, selector):
    daily = defaultdict(lambda: Decimal(0))
    for row in rows:
        day = str(row.get("date") or "")
        if day[:7] == month and len(day) == 10 and selector(row):
            daily[int(day[8:10])] += abs(amount(row.get("amount")))
    result = []
    running = Decimal(0)
    for index in range(days):
        running += daily[index + 1]
        result.append(render(running))
    return result


def spending_analytics(rows, passive_months, selected_month, span,
                       today, elapsed_days):
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", selected_month or ""):
        raise ValueError("Invalid spending month")
    if span not in {"month", "ytd"}:
        raise ValueError("Invalid spending range")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", today or ""):
        raise ValueError("Invalid current date")
    if not 1 <= elapsed_days <= 31:
        raise ValueError("Invalid elapsed day count")
    selected_year = selected_month[:4]
    year_rows = [r for r in rows if isinstance(r, dict) and
                 str(r.get("date") or "").startswith(selected_year) and
                 str(r.get("date") or "") <= today]
    month_rows = [r for r in year_rows if str(r.get("date") or "")[:7] == selected_month]
    selected = year_rows if span == "ytd" else month_rows
    spent = sum((abs(amount(r.get("amount"))) for r in selected if is_expense(r)), Decimal(0))
    bank_income = sum((abs(amount(r.get("amount"))) for r in selected if is_income(r)), Decimal(0))
    annual_spent = sum((abs(amount(r.get("amount"))) for r in year_rows if is_expense(r)), Decimal(0))
    passive = Decimal(0)
    for month in passive_months:
        if not isinstance(month, dict):
            continue
        key = str(month.get("monthKey") or "")
        if (span == "ytd" and key.startswith(selected_year)) or (
            span == "month" and key == selected_month
        ):
            passive += max(Decimal(0), amount(month.get("total")))
    income = bank_income + passive
    monthly_rows = []
    tiles = defaultdict(lambda: Decimal(0))
    for row in year_rows:
        if is_expense(row):
            key = str(row.get("date") or "")[:7]
            tiles[key] += amount(row.get("amount"))
    for index, label in enumerate(MONTHS, start=1):
        month_key = f"{selected_year}-{index:02d}"
        monthly_rows.append({"key": month_key, "label": label,
                             "total": render(tiles[month_key])})
    categories = defaultdict(lambda: Decimal(0))
    for row in selected:
        if is_expense(row):
            categories[str(row.get("category") or "Other")] += amount(row.get("amount"))
    by_category = [
        {"category": key, "amount": render(value),
         "share": render(value / spent * 100) if spent else 0}
        for key, value in categories.items()
    ]
    by_category.sort(key=lambda item: item["amount"], reverse=True)
    year = int(selected_year)
    month_num = int(selected_month[5:])
    previous = f"{year - 1}-12" if month_num == 1 else f"{year}-{month_num - 1:02d}"
    previous_cumulative = cumulative_by_day(rows, previous, elapsed_days, is_expense)
    prev_amount = previous_cumulative[-1] if previous_cumulative else 0
    if span == "ytd":
        by_month_expenses = defaultdict(lambda: Decimal(0))
        by_month_income = defaultdict(lambda: Decimal(0))
        for row in year_rows:
            index = int(str(row["date"])[5:7])
            if is_income(row):
                by_month_income[index] += abs(amount(row.get("amount")))
            elif is_expense(row):
                by_month_expenses[index] += abs(amount(row.get("amount")))
        length = int(today[5:7]) if selected_year == today[:4] else 12
        cumulative_expense = cumulative_income = Decimal(0)
        chart = []
        for index in range(1, length + 1):
            cumulative_expense += by_month_expenses[index]
            cumulative_income += by_month_income[index]
            chart.append({"label": MONTHS[index - 1],
                          "spent": render(cumulative_expense),
                          "income": render(cumulative_income)})
    else:
        current_expense = cumulative_by_day(rows, selected_month, elapsed_days, is_expense)
        current_income = cumulative_by_day(rows, selected_month, elapsed_days, is_income)
        chart = [{"label": str(index + 1), "spent": value,
                  "income": current_income[index],
                  "previous": previous_cumulative[index]}
                 for index, value in enumerate(current_expense)]
    return {
        "sourceOfCalculation": "backend-spending-analytics-v1",
        "readOnly": True,
        "financialLedgerMutated": False,
        "month": selected_month,
        "range": span,
        "totalSpent": render(spent),
        "bankIncome": render(bank_income),
        "passiveIncome": render(passive),
        "totalIncome": render(income),
        "netCashFlow": render(income - spent),
        "yearTotal": render(annual_spent),
        "monthTiles": monthly_rows,
        "chartData": chart,
        "previousMonthToDate": prev_amount,
        "monthDelta": render(spent) - prev_amount,
        "categoryBreakdown": by_category,
        "transactionCount": len(rows),
    }
