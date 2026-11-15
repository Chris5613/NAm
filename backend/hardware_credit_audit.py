"""Current-month hardware payback credit audit from backend daily evidence.

Device payback is a *display attribution*, not business income. When two
GPUs select Kryptex, each device can receive full credit under the user's
chosen payback method, but real mining income exists only ONCE.
No checkpoint, equipment or financial ledger is mutated.
"""
from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation


def usd(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        n = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return n if n.is_finite() and n >= 0 else None


def normalize_source(source):
    name = "".join(c for c in str(source or "").lower() if c.isalnum())
    return {"unitynetwork":"unetwork", "rollercoin":"rollercoin"}.get(name, name)


def sources_for(device):
    raw = device.get("sources") if isinstance(device.get("sources"), list) else [device.get("source")]
    names = []
    for name in raw:
        key = normalize_source(name)
        if key and key not in names:
            names.append(key)
    return names


def hardware_credit_audit(month, devices, earnings):
    if not isinstance(earnings, dict) or earnings.get("sourceOfCalculation") != "backend-postgres" or earnings.get("month") != month:
        return {"month": month, "complete": False, "reason": "backend-earnings-unavailable",
                "financialLedgerMutated": False, "deviceCreditsAreUniqueIncome": False}
    rows = earnings.get("days")
    if not isinstance(rows, list) or not isinstance(devices, list):
        return {"month": month, "complete": False, "reason": "source-records-missing",
                "financialLedgerMutated": False, "deviceCreditsAreUniqueIncome": False}

    today = earnings.get("todayKey") or ""
    daily = {}
    for row in rows:
        if not isinstance(row, dict) or row.get("future") or not str(row.get("key") or "").startswith(month + "-"):
            continue
        day = str(row["key"])
        try:
            date.fromisoformat(day)
        except ValueError:
            continue
        providers = {}
        provenance = row.get("provenance") if isinstance(row.get("provenance"), dict) else {}
        for name, value in (row.get("sources") or {}).items():
            key = normalize_source(name)
            n = usd(value)
            if not key or n is None:
                continue
            if key in providers:
                # Duplicate source aliases must never become extra revenue.
                providers[key]["unverifiableAlias"] = True
                continue
            providers[key] = {
                "usd": n,
                "provisional": provenance.get(name) == "legacy-server-receipt",
                "unverifiableAlias": False,
            }
        daily[day] = providers

    result_devices = []
    credits = Decimal("0")
    eligible = defaultdict(list)
    observed_days = defaultdict(int)
    provisional = Decimal("0")
    unknown_starts = []
    for raw in devices[:100]:
        if not isinstance(raw, dict) or not raw.get("id"):
            continue
        device_id = str(raw["id"])[:128]
        sources = sources_for(raw)
        start = str(raw.get("earningsStartDay") or "")
        if not start:
            unknown_starts.append(device_id)
            result_devices.append({
                "id": device_id, "name": str(raw.get("name") or "")[:128],
                "sources": sources, "observedMonthCreditUsd": None,
                "reason": "no-explicit-earnings-start-day",
            })
            continue
        try:
            date.fromisoformat(start)
            if start > today:
                raise ValueError()
        except ValueError:
            unknown_starts.append(device_id)
            result_devices.append({
                "id": device_id, "name": str(raw.get("name") or "")[:128],
                "sources": sources, "observedMonthCreditUsd": None,
                "reason": "invalid-earnings-start-day",
            })
            continue

        amount = Decimal("0")
        provisional_credit = Decimal("0")
        source_missing_days = 0
        for day, row_sources in daily.items():
            if day < start:
                continue
            for source in sources:
                match = row_sources.get(source)
                if match is None:
                    source_missing_days += 1
                    continue
                if match["unverifiableAlias"]:
                    source_missing_days += 1
                    continue
                amount += match["usd"]
                if match["provisional"]:
                    provisional_credit += match["usd"]
                observed_days[(source, day)] += 1
                eligible[(source, day)].append(device_id)
        credits += amount
        provisional += provisional_credit
        result_devices.append({
            "id": device_id, "name": str(raw.get("name") or "")[:128],
            "sources": sources, "earningsStartDay": start,
            "observedMonthCreditUsd": round(float(amount), 8),
            "provisionalCreditUsd": round(float(provisional_credit), 8),
            "missingSourceDays": source_missing_days,
            "historicalCheckpointApplied": False,
        })

    unique = Decimal("0")
    duplicate = Decimal("0")
    shared = set()
    for (source, day), ids in eligible.items():
        entry = daily[day][source]
        unique += entry["usd"]
        if len(ids) > 1:
            duplicate += entry["usd"] * (len(ids) - 1)
            shared.add(source)

    # Distinct credited cash income for this selected hardware subset is
    # unique; any extra per-device allocation is not new business revenue.
    return {
        "month": month,
        "sourceOfCalculation": "backend-daily-earnings-hardware-attribution",
        "calculatedAt": earnings.get("calculatedAt"),
        "devices": result_devices,
        "devicesWithUnknownStart": unknown_starts,
        "sharedSources": sorted(shared),
        "selectedSourceRevenueUsd": round(float(unique), 8),
        "sumDeviceCreditsUsd": round(float(credits), 8),
        "duplicateDeviceCreditsUsd": round(float(duplicate), 8),
        "provisionalDeviceCreditsUsd": round(float(provisional), 8),
        "differenceReconciles": abs(credits - unique - duplicate) <= Decimal("0.00000002"),
        "complete": not bool(unknown_starts) and provisional == 0 and
                    all(row.get("missingSourceDays",0) == 0 for row in result_devices),
        "deviceCreditsAreUniqueIncome": False,
        "financialLedgerMutated": False,
        "paybackCheckpointsNotApplied": True,
        "scope": "current-month observed provider revenue attributed to eligible devices; not full lifetime device recovery",
    }
