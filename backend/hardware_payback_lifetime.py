"""Read-only lifetime device payback from dated canonical backend income.

Do not reinterpret month-to-date project earnings or market repricing as
device earnings after a checkpoint. An explicit earningsStartDay controls the
start of every selected provider, including multi-provider devices.
Old browser checkpoint baselines are evidence for audit, not USD revenue.
"""
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from .earnings_dashboard import provider_entries
from .hardware_credit_audit import normalize_source, sources_for
from .power_cost import is_free_month

CENT = Decimal("0.01")
EIGHT = Decimal("0.00000001")
TRUSTED_DATED = {
    "confirmed-kryptex-mining-day",
    "dated-unetwork-reward",
    "dated-rollercoin-wallet",
    "dated-rollercoin-reward",
    "dated-salad-reward",
}


def decimal_or_none(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        n = Decimal(str(value))
    except (ValueError, TypeError, InvalidOperation):
        return None
    return n if n.is_finite() and n >= 0 else None


def numeric(value):
    return float(value.quantize(EIGHT, rounding=ROUND_HALF_UP))


def days_in_range(first, last):
    if (last - first).days > 1096 or last < first:
        raise ValueError("Unbounded or inverted earnings date range")
    for offset in range((last - first).days + 1):
        yield (first + timedelta(days=offset)).isoformat()


def safe_day(raw):
    try:
        d = date.fromisoformat(str(raw))
        if d.isoformat() != str(raw):
            return None
        return d
    except (TypeError, ValueError):
        return None


def build_lifetime_hardware_payback(devices, records, trackers, today_key):
    """Diagnostic only: not a historical financial transaction writer.

    Daily provider amounts are the *same source logic* as the Crypto
    Dashboard /earnings-dashboard. Missing and legacy provisional daily
    observations are separately reported and never silently certified.
    """
    now_day = safe_day(today_key)
    if now_day is None or not isinstance(devices, list) or not isinstance(records, dict):
        return {
            "complete": False, "reason": "required-source-missing",
            "devices": [], "financialLedgerMutated": False,
        }
    trackers = trackers if isinstance(trackers, dict) else {}
    normalized = {}
    warnings = []
    for row in devices[:100]:
        if not isinstance(row, dict) or not row.get("id"):
            warnings.append("invalid-device-entry")
            continue
        identity = str(row["id"])[:128]
        if identity in normalized:
            warnings.append("duplicate-device-id:" + identity)
            continue
        normalized[identity] = row

    cached_days = {}
    def day_sources(day):
        if day not in cached_days:
            values = provider_entries(day, records.get(day), trackers)
            sources = {}
            conflicts = set()
            for name, amount in values["sources"].items():
                provider = normalize_source(name)
                value = decimal_or_none(amount)
                if not provider or value is None:
                    continue
                if provider in sources:
                    conflicts.add(provider)
                    continue
                sources[provider] = {
                    "usd": value,
                    "provenance": values["provenance"].get(name),
                    "trusted": values["provenance"].get(name) in TRUSTED_DATED,
                }
            for provider in conflicts:
                sources[provider]["trusted"] = False
                sources[provider]["provenance"] = "conflicting-provider-aliases"
            cached_days[day] = sources
        return cached_days[day]

    results = []
    eligible = defaultdict(list)
    missing_total = 0
    provisional_total = Decimal("0")
    for identity, device in normalized.items():
        start = safe_day(device.get("earningsStartDay"))
        acquired = safe_day(str(device.get("startMonth") or "") + "-01")
        selected = sources_for(device)
        saved_checkpoint = device.get("checkpoint") if isinstance(device.get("checkpoint"), dict) else {}
        checkpoint_month = str(saved_checkpoint.get("month") or "")
        checkpoint_baseline = decimal_or_none(saved_checkpoint.get("baseline"))
        carried = decimal_or_none(saved_checkpoint.get("carried"))
        cost = decimal_or_none(device.get("cost"))
        reasons = []
        if start is None or not selected:
            reasons.append("missing-explicit-start-or-sources")
        if start and acquired and start < acquired:
            reasons.append("income-start-before-purchase-month")
        if start and start > now_day:
            reasons.append("future-earnings-start")
        if cost is None or cost <= 0:
            reasons.append("missing-valid-cash-cost")
        if start and (now_day-start).days > 1096:
            reasons.append("earnings-window-exceeds-three-years")
        if start and any(not is_free_month((start+timedelta(days=i)).strftime("%Y-%m"))
                         for i in (0, max(0, (now_day-start).days))):
            reasons.append("historic-paid-power-not-yet-attributed")
        if reasons:
            results.append({
                "id": identity, "name": str(device.get("name") or "")[:128],
                "sources": selected, "startDay": device.get("earningsStartDay"),
                "verifiedRecoveryUsd": None, "observedCreditUsd": None,
                "observedRemainingUsd": None, "observedProgressPct": None,
                "complete": False, "reasons": reasons,
                "checkpointBaselineUsd": numeric(checkpoint_baseline) if checkpoint_baseline is not None else None,
                "checkpointCarriedUsd": numeric(carried) if carried is not None else None,
            })
            continue

        observed = Decimal("0")
        verified = Decimal("0")
        provisional = Decimal("0")
        missing = []
        unknown = []
        for day in days_in_range(start, now_day):
            values = day_sources(day)
            for source in selected:
                entry = values.get(source)
                if entry is None:
                    missing.append((day, source))
                    continue
                observed += entry["usd"]
                eligible[(day, source)].append((identity, entry["usd"], entry["trusted"]))
                if entry["trusted"]:
                    verified += entry["usd"]
                else:
                    provisional += entry["usd"]
                    unknown.append((day, source))
        missing_total += len(missing)
        provisional_total += provisional

        # Explicit start must replace month-to-date-minus-checkpoint
        # attribution. A stale checkpoint can already include recovered
        # income from before a device had permission to earn.
        pre_start_confirmed = Decimal("0")
        if checkpoint_month == start.strftime("%Y-%m"):
            start_month = start.replace(day=1)
            for day in days_in_range(start_month, start-timedelta(days=1)) if start > start_month else []:
                values = day_sources(day)
                for source in selected:
                    entry = values.get(source)
                    if entry and entry["trusted"]:
                        pre_start_confirmed += entry["usd"]
        baseline_understates_prior = (
            checkpoint_baseline is not None and
            pre_start_confirmed - checkpoint_baseline > CENT
        )
        if baseline_understates_prior:
            warnings.append("checkpoint-baseline-understates-pre-start-rewards:" + identity)

        complete = not missing and not unknown
        results.append({
            "id": identity, "name": str(device.get("name") or "")[:128],
            "sources": selected, "startDay": start.isoformat(),
            "cashCostUsd": numeric(cost),
            "observedCreditUsd": numeric(observed),
            "observedRemainingUsd": numeric(max(cost-observed, Decimal("0"))),
            "observedProgressPct": round(float(min(Decimal(100), observed/cost*100)), 4),
            "verifiedRewardSubtotalUsd": numeric(verified),
            "provisionalRewardSubtotalUsd": numeric(provisional),
            "verifiedRecoveryUsd": numeric(observed) if complete else None,
            "remainingUsd": numeric(max(cost - observed, Decimal("0"))) if complete else None,
            "creditPercentage": float(observed/cost*100) if complete else None,
            "missingSourceDayCount": len(missing),
            "missingSourceDays": [{"day": d, "source": s} for d, s in missing[:20]],
            "provisionalSourceDayCount": len(unknown),
            "provisionalSourceDays": [{"day": d, "source": s} for d, s in unknown[:20]],
            "complete": complete,
            "checkpointBaselineUsd": numeric(checkpoint_baseline) if checkpoint_baseline is not None else None,
            "checkpointCarriedUsd": numeric(carried) if carried is not None else None,
            "confirmedBeforeEarningsStartUsd": numeric(pre_start_confirmed),
            "checkpointBaselineUnderstatesPriorRewards": baseline_understates_prior,
            "checkpointAppliedToRevenue": False,
            "paidMiningPowerUsd": 0.0,
            "powerPolicy": "free-mining-electricity-from-2026-11",
        })

    unique = Decimal("0")
    repeated = Decimal("0")
    for (day, source), entries in eligible.items():
        first = entries[0][1]
        unique += first
        repeated += first*(len(entries)-1)
    assignments = sum(
        (Decimal(str(row["observedCreditUsd"])) for row in results
         if row.get("observedCreditUsd") is not None), Decimal("0")
    )
    device_costs = [decimal_or_none(row.get("cost"))
                    for row in normalized.values()]
    cost_sum = (sum(device_costs, Decimal("0"))
                if device_costs and all(v is not None and v > 0 for v in device_costs)
                else None)
    observed_remainings = [decimal_or_none(row.get("observedRemainingUsd"))
                           for row in results]
    remaining_sum = (sum(observed_remainings, Decimal("0"))
                     if len(observed_remainings) == len(normalized) and
                     all(v is not None for v in observed_remainings) else None)
    certified = bool(normalized) and not warnings and missing_total == 0 and provisional_total == 0 and all(
        row["complete"] for row in results
    )
    return {
        "sourceOfCalculation": "backend-dated-hardware-payback-v1",
        "asOfDay": today_key,
        "devices": results,
        "observedSelectedSourceRevenueUsd": numeric(unique),
        "sumObservedDeviceCreditsUsd": numeric(assignments),
        "sumDeviceCashCostUsd": numeric(cost_sum) if cost_sum is not None else None,
        "sumObservedRemainingUsd": numeric(remaining_sum) if remaining_sum is not None else None,
        "repeatedDeviceCreditsUsd": numeric(repeated),
        "unverifiedDeviceCreditsUsd": numeric(provisional_total),
        "sourceDayMissingCount": missing_total,
        "mathReconciles": abs(assignments-unique-repeated)<=CENT,
        "complete": certified,
        "reviewFlags": sorted(set(warnings)),
        "claimIsBusinessRevenue": False,
        "checkpointWrites": False,
        "financialLedgerMutated": False,
        "scope": "Cumulative source-day credits from explicit earningsStartDay; excludes unverified dates and other business assets",
    }
