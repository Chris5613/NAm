"""Backend-only power cost valuation. Metered energy is not a paid expense.

Existing NAm user policy: mining electricity supplied free from November 2026
until that policy is explicitly changed. A nominal utility estimate remains
visible for monitoring but MUST NOT become a bill, expense or income offset.
"""
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from calendar import monthrange
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")
FREE_FROM = "2026-11"
FREE_THROUGH = None
TIME_OF_USE_FROM = "2026-12"
DEFAULT_RATES = {
    "basic": Decimal("0.1691"),
    "offPeak": Decimal("0.0893"),
    "midPeak": Decimal("0.1670"),
    "peak": Decimal("0.4313"),
}
KEYS = {"basic":"basicRate","offPeak":"offPeakRate",
        "midPeak":"midPeakRate","peak":"peakRate"}


def decimal_nonnegative(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        n = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return n if n.is_finite() and n >= 0 else None


def money(value):
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def is_free_month(month):
    return (isinstance(month, str) and
            len(month) == 7 and month[4] == "-" and
            month >= FREE_FROM and (FREE_THROUGH is None or month <= FREE_THROUGH))


def read_rates(settings):
    obj = settings if isinstance(settings, dict) else {}
    rates = {}
    for name, key in KEYS.items():
        raw = obj.get(key)
        val = DEFAULT_RATES[name] if raw is None else decimal_nonnegative(raw)
        if val is None or val > Decimal("10"):
            return None
        rates[name] = val
    return rates


def rate_for_now(now, rates):
    local = now.astimezone(PACIFIC)
    if local < datetime(2026, 12, 10, tzinfo=PACIFIC):
        return "basic"
    if local.weekday() >= 5 or local.hour >= 21 or local.hour < 7:
        return "offPeak"
    if 17 <= local.hour < 21:
        return "peak"
    return "midPeak"


def usage_nominal_cost(usage, rates):
    if not isinstance(usage, dict):
        return None, "missing-meter-usage"
    month = str(usage.get("month") or "")
    if len(month) != 7 or month[4] != "-" or not ("01" <= month[5:7] <= "12"):
        return None, "invalid-month"
    kwh = decimal_nonnegative(usage.get("totalKwh", usage.get("kwh")))
    if kwh is None:
        return None, "unobserved-kwh"
    if month < TIME_OF_USE_FROM:
        return kwh * rates["basic"], None
    tiers = usage.get("tiers")
    if not isinstance(tiers, dict):
        return None, "missing-time-of-use-tiers"
    values = {}
    for name in KEYS:
        parsed = decimal_nonnegative(tiers.get(name, 0))
        if parsed is None:
            return None, "invalid-time-of-use-tier"
        values[name] = parsed
    # Tiers are cumulative observed energy, not a free second set of kWh.
    if abs(sum(values.values(), Decimal("0")) - kwh) > Decimal("0.05"):
        return None, "tier-kwh-do-not-reconcile"
    return sum((value * rates[name] for name, value in values.items()), Decimal("0")), None


def server_power_cost_preview(usage, settings, latest=None, now=None, month_override=None):
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(PACIFIC)
    month = local.strftime("%Y-%m")
    rates = read_rates(settings)
    row = usage if isinstance(usage, dict) else None
    if month_override is not None:
        month = month_override
    elif row is not None and row.get("month"):
        month = str(row["month"])
    free = is_free_month(month)
    if rates is None:
        return {
            "sourceOfCalculation": "backend-power-meter-tariffs",
            "month": month, "complete": False, "reason": "invalid-power-rates",
            "nominalUsd": None, "outOfPocketUsd": None,
            "currentRate": None, "dailyOutOfPocketUsd": None,
            "freeMiningPower": free, "deviceCosts": {},
        }
    current_tier = rate_for_now(now, rates)
    nominal, reason = usage_nominal_cost(row, rates)
    nominal_usd = money(nominal) if nominal is not None else None
    # Even when electricity is supplied free, unknown metering is not a
    # verified $0 cost observation.
    paid_usd = None if nominal is None else (0.0 if free else nominal_usd)
    measured = decimal_nonnegative(row.get("totalKwh")) if row else None
    device_costs = {}
    for key, item in (row.get("devices") or {}).items() if row and isinstance(row.get("devices"), dict) else []:
        if not isinstance(item, dict):
            continue
        dev_usage = {
            "month": month, "totalKwh": item.get("kwh"),
            "tiers": item.get("tiers"),
        }
        value, fault = usage_nominal_cost(dev_usage, rates)
        device_costs[str(key)] = {
            "nominalUsd": money(value) if value is not None else None,
            "outOfPocketUsd": None if value is None else (0.0 if free else money(value)),
            "complete": fault is None,
        }
    observation = latest if isinstance(latest, dict) else {}
    try:
        observed = datetime.fromisoformat(str(observation.get("observedAt")))
        if observed.tzinfo is None:
            observed = observed.replace(tzinfo=timezone.utc)
        age = (now - observed.astimezone(timezone.utc)).total_seconds()
    except (ValueError, TypeError, OverflowError):
        age = float("inf")
    watts = decimal_nonnegative(observation.get("totalWatts"))
    fresh = 0 <= age <= 90 and watts is not None
    daily_nominal = (watts / Decimal(1000) * rates[current_tier] * 24) if fresh else None
    daily_paid = (0.0 if free else money(daily_nominal)) if daily_nominal is not None else None
    tracked_seconds = decimal_nonnegative(row.get("trackedSeconds")) if row else None
    tracked_days = tracked_seconds / Decimal(86400) if tracked_seconds else None
    days_in_month = monthrange(local.year, local.month)[1] if month == local.strftime("%Y-%m") else None
    projection = (
        money(Decimal(str(paid_usd)) / tracked_days * days_in_month)
        if paid_usd is not None and tracked_days is not None
        and tracked_seconds >= Decimal(900) and days_in_month is not None else None
    )
    return {
        "sourceOfCalculation": "backend-power-meter-tariffs",
        "month": month, "complete": reason is None,
        "reason": reason, "measuredKwh": float(measured) if measured is not None else None,
        "nominalUsd": nominal_usd, "outOfPocketUsd": paid_usd,
        "freeMiningPower": free,
        "currentRate": {
            "tier": current_tier,
            "label": {"basic":"Basic","offPeak":"Off-peak",
                      "midPeak":"Mid-peak","peak":"Peak"}[current_tier],
            "nominalUsdPerKwh": float(rates[current_tier]),
            "effectiveUsdPerKwh": 0.0 if is_free_month(local.strftime("%Y-%m"))
                                     else float(rates[current_tier]),
            "calculatedAt": now.isoformat(),
        },
        "dailyNominalUsd": money(daily_nominal) if daily_nominal is not None else None,
        "hourlyOutOfPocketUsd": round(daily_paid / 24, 5) if daily_paid is not None else None,
        "dailyOutOfPocketUsd": daily_paid,
        "projectedOutOfPocketMonthEndUsd": projection,
        "deviceCosts": device_costs,
        "calculatedAt": now.isoformat(),
        "isLiveMeter": fresh,
        "recordsFinancialExpense": False,
    }
