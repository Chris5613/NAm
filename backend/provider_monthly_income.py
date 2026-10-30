"""Extension-provider monthly earned USD, independent of portfolio holdings.

Mirror the legacy buildProjectIncome aggregation for Salad, RollerCoin,
Unetwork and Kryptex. Lulo and Loopscale require separate provider adapters,
so their previously recorded monthly income remains in the frontend for now.
"""
from math import isfinite
from typing import Any

from .provider_stats import (
    KRYPTEX_OPENING_BALANCE_USD, obj, numeric, unetwork_month_totals,
)

FIRST_MONTH = "2026-09"
ROLLERCOIN_SEPT_14 = "2026-09-14"
ROLLERCOIN_SEPT_BASELINE_TRX = 45.443264


def month_from_day(value: Any) -> str | None:
    day = str(value or "")[:7]
    if len(day) == 7 and day[4] == "-" and (day[:4] + day[5:]).isdigit():
        return day
    return None


def monthly_provider_income(trackers: dict, current_month: str) -> list[dict]:
    """Return the four extension providers' earned USD by calendar month.

    The current portfolio balance is intentionally never counted as income.
    Historic USD values are kept fixed against market repricing.
    """
    amounts: dict[str, dict[str, float]] = {}

    def add(month: str | None, source: str, amount: float) -> None:
        if not month or month < FIRST_MONTH or not isfinite(amount) or amount <= 0:
            return
        row = amounts.setdefault(month, {})
        row[source] = row.get(source, 0.0) + amount

    salad = obj(trackers.get("salad"))
    salad_daily_months = set()
    for date, raw in obj(salad.get("daily")).items():
        month = month_from_day(date)
        if not month or month == current_month:
            continue
        salad_daily_months.add(month)
        add(month, "Salad", numeric(raw))
    for month, raw in obj(salad.get("monthlyEarnings")).items():
        if month in salad_daily_months:
            continue
        add(month, "Salad", max(0.0, numeric(raw)))

    rollercoin = obj(trackers.get("rollercoin"))
    dated = obj(rollercoin.get("daily"))
    wallet = obj(rollercoin.get("walletDaily"))
    rollercoin_months: dict[str, float] = {}
    for date, raw in dated.items():
        month = month_from_day(date)
        if not month or (month == FIRST_MONTH and str(date) <= ROLLERCOIN_SEPT_14):
            continue
        rollercoin_months[month] = rollercoin_months.get(month, 0.0) + numeric(obj(raw).get("usd"))
    # This is a verified TRX baseline, not a timestamped USD valuation;
    # the original aggregator never invented a USD amount for it.
    rollercoin_months.setdefault(FIRST_MONTH, 0.0)
    trx_price = numeric(rollercoin.get("lastTrxPrice"))
    for month, stored_usd in rollercoin_months.items():
        covered_usd = sum(
            numeric(obj(raw).get("usd"))
            for date, raw in dated.items()
            if str(date)[:7] == month and date not in wallet and
            not (month == FIRST_MONTH and str(date) <= ROLLERCOIN_SEPT_14)
        )
        wallet_entries = [
            obj(raw) for date, raw in wallet.items() if str(date)[:7] == month
        ]
        wallet_usd = sum(
            numeric(row.get("usd")) if row.get("usd") is not None
            else numeric(row.get("trx")) * trx_price
            for row in wallet_entries
        )
        baseline_usd = max(0.0, stored_usd - covered_usd) if month == FIRST_MONTH else 0.0
        amount = baseline_usd + covered_usd + wallet_usd if wallet_entries else stored_usd
        add(month, "RollerCoin", amount)

    # A new month may have wallet observations but no dated API rows.
    if current_month not in rollercoin_months:
        entries = [obj(raw) for day, raw in wallet.items()
                   if str(day)[:7] == current_month]
        if entries:
            add(current_month, "RollerCoin", sum(
                numeric(row.get("usd")) if row.get("usd") is not None
                else numeric(row.get("trx")) * trx_price
                for row in entries
            ))

    unetwork = obj(trackers.get("unetwork"))
    month_totals = unetwork_month_totals(unetwork)
    baseline_enabled = bool(unetwork.get("baselineInitialized"))
    opening_month = unetwork.get("openingMonth")
    for month, value in month_totals.items():
        if baseline_enabled and month == opening_month:
            value = numeric(unetwork.get("openingEarnedUsd")) + max(
                0.0, value - numeric(unetwork.get("openingMonthRowsBaselineUsd"))
            )
        add(month, "Unetwork", value)
    if baseline_enabled and opening_month and opening_month not in month_totals:
        add(opening_month, "Unetwork", numeric(unetwork.get("openingEarnedUsd")))

    kryptex = obj(trackers.get("kryptex"))
    kryptex_monthly = kryptex.get("monthlyEarnings")
    if not isinstance(kryptex_monthly, dict):
        kryptex_monthly = {FIRST_MONTH: KRYPTEX_OPENING_BALANCE_USD}
    for month, raw in kryptex_monthly.items():
        add(month, "Kryptex", numeric(raw))

    return [
        {
            "monthKey": month,
            "total": round(sum(values.values()), 6),
            "platforms": [
                {"platform": key, "amount": round(value, 6)}
                for key, value in sorted(values.items(), key=lambda pair: -pair[1])
            ],
        }
        for month, values in sorted(amounts.items())
    ]
