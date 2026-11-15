"""Read-only integration invariants for NAm provider and accounting data.

The goal is to expose independently testable facts, not to force unlike
accounting concepts (mark-to-market balances, realized income, and projected
profitability) to match. Never mutates settings or journal entries.
"""
from datetime import datetime, timezone
from math import isfinite


def safe_number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
        return number if isfinite(number) else None
    except (ValueError, TypeError):
        return None


def as_object(value):
    return value if isinstance(value, dict) else {}


def audit_integration_settings(values, now=None):
    """Return a concise, non-mutating audit of live authoritative records."""
    now = now or datetime.now(timezone.utc)
    values = as_object(values)
    checks = []

    def add(code, status, explanation, **details):
        checks.append({"code": code, "status": status, "message": explanation, **details})

    tracker = as_object(values.get("project_income_kryptex_tracker_v1"))
    mining = as_object(tracker.get("kryptexMiningDaily"))
    confirmations = as_object(tracker.get("kryptexConfirmedDays"))
    by_month = as_object(tracker.get("monthlyEarnings"))
    sats = as_object(tracker.get("kryptexMiningSatsDaily"))
    pending = tracker.get("kryptexPendingEarningsDays")
    pending = [d for d in pending if isinstance(d, str)] if isinstance(pending, list) else []
    observed_months = sorted({str(d)[:7] for d in mining if confirmations.get(d)})

    for month in observed_months:
        observed = sum(
            max(0, safe_number(value) or 0) for day, value in mining.items()
            if str(day).startswith(month + "-") and confirmations.get(day)
        )
        reported = safe_number(by_month.get(month))
        if reported is None:
            add("kryptex_monthly_" + month, "warning",
                "Confirmed daily rewards exist but monthly Kryptex total is absent.",
                observedUsd=round(observed, 8))
        elif abs(reported - observed) > 0.02:
            add("kryptex_monthly_" + month, "error",
                "Kryptex monthly total does not reconcile with confirmed daily rewards.",
                monthlyUsd=round(reported, 8), confirmedDailyUsd=round(observed, 8),
                differenceUsd=round(reported - observed, 8))
        else:
            add("kryptex_monthly_" + month, "pass",
                "Confirmed daily Kryptex rewards reconcile to monthly total.",
                monthlyUsd=round(reported, 8))

    flagged = sorted({
        day for day in pending if (safe_number(sats.get(day)) or 0) > 0
    } | {
        day for day, value in sats.items()
        if (safe_number(value) or 0) > 0 and not
        (confirmations.get(day) and (safe_number(mining.get(day)) or 0) > 0)
    })
    add("kryptex_missing_conversions", "warning" if flagged else "pass",
        "Kryptex satoshi rewards without confirmed positive USD income." if flagged
        else "No recorded Kryptex satoshi rewards awaiting USD conversion.",
        days=flagged)

    snapshots = as_object(values.get("yield_monthly_snapshots_v1"))
    for month, raw in sorted(snapshots.items()):
        row = as_object(raw)
        platforms = row.get("platforms")
        if not isinstance(platforms, list) or not platforms:
            continue
        total = safe_number(row.get("total"))
        provider_sum = sum(
            safe_number(as_object(provider).get("amount")) or 0 for provider in platforms
        )
        if total is None or abs(total-provider_sum) > 0.02:
            add("monthly_snapshot_sum_" + month, "error",
                "Monthly snapshot does not equal the sum of its project rows.",
                totalUsd=total, summedProjectsUsd=round(provider_sum, 8))
        else:
            add("monthly_snapshot_sum_" + month, "pass",
                "Monthly snapshot matches its project rows.",
                totalUsd=round(total, 8))
        # The tracker is the authoritative Kryptex income ledger. An unlocked
        # current monthly snapshot should match it after provider sync.
        if not row.get("locked"):
            project = next(
                (as_object(p) for p in platforms
                 if str(as_object(p).get("platform", "")).lower() == "kryptex"), None
            )
            canonical = safe_number(by_month.get(month))
            snapshot_kryptex = safe_number(project.get("amount")) if project else None
            if canonical is not None and snapshot_kryptex is not None:
                delta = canonical - snapshot_kryptex
                add("kryptex_snapshot_" + month,
                    "warning" if abs(delta) > 0.02 else "pass",
                    "Kryptex provider snapshot differs from the mining income ledger."
                    if abs(delta) > 0.02 else
                    "Kryptex snapshot matches the mining income ledger.",
                    trackerUsd=round(canonical, 8),
                    snapshotUsd=round(snapshot_kryptex, 8),
                    differenceUsd=round(delta, 8))

    journal = values.get("financials_journal_v1")
    entries = journal if isinstance(journal, list) else []
    invalid = []
    for entry in entries:
        entry = as_object(entry)
        lines = entry.get("lines")
        if not isinstance(lines, list):
            continue  # Legacy simple 2-account entries balance by construction.
        debit = sum(safe_number(as_object(line).get("debit")) or 0 for line in lines)
        credit = sum(safe_number(as_object(line).get("credit")) or 0 for line in lines)
        if abs(debit - credit) > 0.01:
            invalid.append({"id": str(entry.get("id", ""))[:100],
                            "differenceUsd": round(debit-credit, 2)})
    add("journal_balanced", "error" if invalid else "pass",
        "Journal has unbalanced compound entries." if invalid else
        "All compound journal entries have equal debits and credits.",
        unbalanced=invalid, checked=len(entries))

    devices = values.get("hardware_payback_devices_v1")
    devices = devices if isinstance(devices, list) else []
    device_ids = [str(as_object(device).get("id") or "") for device in devices]
    bad_ids = any(not d for d in device_ids) or len(set(device_ids)) != len(device_ids)
    bad_costs = [str(as_object(device).get("id") or "") for device in devices
                 if (safe_number(as_object(device).get("cost")) or 0) <= 0]
    add("hardware_register", "error" if bad_ids or bad_costs else "pass",
        "Hardware register has missing/duplicate IDs or invalid costs."
        if bad_ids or bad_costs else "Hardware IDs and purchase costs are valid.",
        devices=len(devices), duplicateOrMissingIds=bad_ids,
        invalidCostIds=bad_costs)

    published = as_object(values.get("passive_income_monthly_chart_total_v1"))
    published_month = str(published.get("month") or "")
    published_amount = safe_number(published.get("amount"))
    if published_month and published_amount is not None:
        # Daily chart and month-end provider snapshots can differ legitimately:
        # do not assert they are interchangeable or silently reconcile them.
        add("monthly_chart_source", "info",
            "Passive Income's current-month figure is a sum of dated sources, "
            "not necessarily the separate provider snapshot's accounting total.",
            month=published_month, publishedDailyUsd=round(published_amount, 8))

    recovery = as_object(values.get("kryptex_recovery_verified_2026_11_01_06_v1"))
    if recovery:
        add("historical_mining_provenance", "pass",
            "Recovered historical Kryptex earnings retain source metadata and backup.")
    else:
        add("historical_mining_provenance", "info",
            "No historical Kryptex recovery metadata present for this account.")

    status = "error" if any(c["status"] == "error" for c in checks) else (
        "warning" if any(c["status"] == "warning" for c in checks) else "pass"
    )
    return {
        "status": status,
        "checkedAt": now.isoformat(),
        "checks": checks,
        "summary": {
            status: sum(c["status"] == status for c in checks)
            for status in ("pass", "warning", "error", "info")
        },
    }
