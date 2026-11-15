"""Read-only dated Salad coverage for registered hardware earning periods.

An old provider month total is not a substitute for receipts on a device's
eligible earning days. User attestation and anchored lifetime snapshots are
accepted as *different* documented evidence classes. Incomplete current day
cannot be prematurely certified or treated as missing historical income.
"""
from datetime import date, timedelta
from .earnings_dashboard import provider_entries
from .hardware_source_segments import (
    normalize_source, checked_segments, sources_on_day, InvalidSourceSegments,
)
from .financial_historical_ledger import mapping, sequence


def salad_device_day_coverage(devices, daily_records, trackers, today_key):
    current = date.fromisoformat(today_key)
    daily = mapping(daily_records)
    providers = mapping(trackers)
    device_reports = []
    for device in sequence(devices):
        if not isinstance(device, dict):
            continue
        sources = sequence(device.get("sources"))
        # Use the same validated historical source periods as Hardware Payback.
        # Invalid source timelines must fail closed, not silently reassign
        # earlier earnings to the current GPU configuration.
        try:
            segments = checked_segments(device)
        except InvalidSourceSegments:
            device_reports.append({
                "id": device.get("id"), "status": "invalid-source-segments",
                "verifiedDays": [], "provisionalDays": [], "missingDays": [],
                "incompleteDays": [], "reason": "Invalid hardware source timeline",
            })
            continue
        names = {normalize_source(source) for source in sources}
        if segments:
            for segment in segments:
                names.update(segment["sources"])
        if "salad" not in names:
            continue
        start_raw = device.get("earningsStartDay")
        try:
            start = date.fromisoformat(str(start_raw))
        except (ValueError, TypeError):
            device_reports.append({
                "id": device.get("id"), "status": "invalid-start",
                "verifiedDays": [], "provisionalDays": [],
                "missingDays": [], "incompleteDays": [], "reason": "Invalid earnings start date",
            })
            continue
        if start > current:
            device_reports.append({
                "id": device.get("id"), "status": "future-start",
                "verifiedDays": [], "provisionalDays": [],
                "missingDays": [], "incompleteDays": [],
            })
            continue
        verified, provisional, missing, incomplete = [], [], [], []
        day = start
        while day <= current and (day - start).days < 1096:
            day_key = day.isoformat()
            # Choose saved segment active on this day; do not use a later
            # device source change to rewrite historical provider attribution.
            selected = sources_on_day(segments, day_key, sources)
            if selected is None:
                missing.append(day_key)
                day += timedelta(days=1)
                continue
            if "salad" not in {normalize_source(x) for x in sequence(selected)}:
                day += timedelta(days=1)
                continue
            if day == current:
                incomplete.append(day_key)
            else:
                receipt = provider_entries(
                    day_key, daily.get(day_key), providers)
                amount = receipt["sources"].get("Salad")
                provenance = receipt["provenance"].get("Salad")
                if provenance in {
                    "user-attested-recorded-daily-receipt",
                    "dated-salad-lifetime-delta",
                    "dated-salad-reward",
                } and amount is not None:
                    verified.append({
                        "day": day_key, "amountUsd": amount,
                        "provenance": provenance,
                    })
                elif amount is not None:
                    provisional.append({
                        "day": day_key, "amountUsd": amount,
                        "provenance": provenance or "unverified",
                    })
                else:
                    missing.append(day_key)
            day += timedelta(days=1)
        device_reports.append({
            "id": device.get("id"), "status": (
                "needs-evidence" if provisional or missing else "covered"
            ),
            "verifiedDays": verified, "provisionalDays": provisional,
            "missingDays": missing, "incompleteDays": incomplete,
        })
    return {
        "sourceOfCalculation": "backend-salad-device-day-coverage-v1",
        "devices": device_reports,
        "allCompletedDaysCovered": all(
            item["status"] in {"covered", "future-start"}
            for item in device_reports
        ),
        "readOnly": True, "financialLedgerMutated": False,
    }
