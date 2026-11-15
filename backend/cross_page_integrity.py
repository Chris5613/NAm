"""Authenticated, read-only cross-page financial integrity report.

This module compares independently assembled Home and Financials statements
using the same *stored* inputs, rather than comparing unlike concepts
(provider earnings, wallet value, cost basis, or repeated GPU credits).
It does not write, reprice, repair or backfill any financial record.
"""
from decimal import Decimal, InvalidOperation
from .crypto_dashboard_snapshot import crypto_dashboard_snapshot
from .home_business_snapshot import (
    home_business_snapshot, current_live_assets, financial_statement_openings,
    obj, arr,
)
from .financial_balance_rows import financial_balance_rows, with_journal_equipment
from .financial_core import (
    phone_asset_rows, evaluate_statement, activity, maybe_number,
)
from .financial_current_journal import current_financial_ledger
from .hardware_payback_lifetime import build_lifetime_hardware_payback
from .earnings_dashboard import build_backend_earnings_dashboard, compare_monthly_snapshot
from .financial_close_readiness import financial_close_readiness
from .salad_device_day_coverage import salad_device_day_coverage


def amount(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value))
    except (TypeError, ValueError, InvalidOperation):
        return None
    return result if result.is_finite() else None


def same(left, right, tolerance=Decimal("0.02")):
    a, b = amount(left), amount(right)
    return ((a is None and b is None) or
            (a is not None and b is not None and abs(a-b) <= tolerance))


def cross_page_integrity(settings, month, today_key, bitcoin_usd,
                         income_months, daily_records, trackers,
                         current_kryptex_daily=None):
    """Audit current saved source state; all comparisons are non-mutating."""
    saved = obj(settings)
    history = {row.get("monthKey"): row for row in arr(income_months)
               if isinstance(row, dict) and row.get("monthKey")}
    snapshots = obj(saved.get("yield_monthly_snapshots_v1"))
    daily_records = obj(daily_records)
    trackers = obj(trackers)
    checks = []

    def check(code, status, message, **evidence):
        checks.append({"code": code, "status": status,
                       "message": message, **evidence})

    booked_total = Decimal("0")
    for key, raw in sorted(snapshots.items()):
        row = obj(raw)
        platforms = row.get("platforms")
        if not isinstance(platforms, list) or not platforms:
            check("booked-month:" + key, "error",
                  "Missing provider breakdown; booked income is unverified")
            continue
        values = [amount(obj(p).get("amount")) for p in platforms]
        total = amount(row.get("total"))
        names = [str(obj(p).get("platform") or "") for p in platforms]
        if (total is None or any(x is None for x in values) or
                any(not name for name in names) or len(set(names)) != len(names)):
            check("booked-month:" + key, "error",
                  "Invalid or duplicated provider amount")
            continue
        difference = total - sum(values, Decimal("0"))
        check("booked-month:" + key,
              "pass" if abs(difference) <= Decimal(".02") else "error",
              "Bookable provider sources reconcile to the recorded month"
              if abs(difference) <= Decimal(".02") else
              "Recorded monthly income differs from its provider amounts",
              bookedUsd=float(total), sourceSumUsd=float(sum(values)),
              differenceUsd=float(difference), locked=bool(row.get("locked")))
        booked_total += total
        # Passive Income includes stock dividends and separately identified
        # legacy/manual sources, so its TOTAL need not equal provider-only
        # project income; compare the provider-only project component.
        passive = history.get(key)
        if passive is None:
            check("passive-history:" + key, "error",
                  "Booked provider month missing from Passive Income history")
        else:
            actual = amount(passive.get("projectTotal"))
            if actual is None or actual + Decimal(".02") < total:
                check("passive-history:" + key, "error",
                      "Passive Income lost booked provider revenue",
                      bookedUsd=float(total),
                      passiveProjectsUsd=float(actual) if actual is not None else None)
            else:
                extras = actual-total
                check("passive-history:" + key, "pass",
                      "Passive Income preserves booked provider revenue",
                      bookedUsd=float(total), additionalDatedProjectUsd=float(extras))
        if key < month and not row.get("locked"):
            check("historical-lock:" + key, "warning",
                  "Completed income month is not locked")

    crypto = crypto_dashboard_snapshot(0, saved.get(
        "yield_project_latest_balance_feed_v1"))
    summary = obj(saved.get("project_income_portfolio_summary_v1"))
    if crypto["complete"]:
        total_ok = same(summary.get("portfolioBalance"), crypto["totalUsd"])
        active_ok = same(summary.get("activePortfolioBalance"), crypto["activeTotalUsd"])
        check("crypto-portfolio", "pass" if total_ok and active_ok else "error",
              "Crypto Dashboard and saved provider portfolio agree"
              if total_ok and active_ok else "Provider portfolio has conflicting balances",
              allProjectsUsd=crypto["totalUsd"],
              activeProjectsUsd=crypto["activeTotalUsd"],
              savedAllProjectsUsd=summary.get("portfolioBalance"),
              savedActiveUsd=summary.get("activePortfolioBalance"))
        inactive = [row for row in crypto["projects"]
                    if row["inactive"] and amount(row.get("balanceUsd")) is not None
                    and amount(row["balanceUsd"]) > 0]
        check("inactive-portfolio-holdings", "info",
              "Inactive project holdings remain in the all-project portfolio, "
              "but are excluded from the active-only portfolio",
              inactiveProjects=[{
                  "name": row["name"], "balanceUsd": row["balanceUsd"],
              } for row in inactive])
    else:
        check("crypto-portfolio", "warning",
              "Provider feed is incomplete or stale; do not invent a portfolio value",
              staleIds=crypto["staleProjectIds"],
              missingIds=crypto["missingProjectIds"])

    # A withdrawn, inactive Lulo asset has a different accounting meaning
    # from a historical project card's cached portfolio value. Make the
    # divergence visible; never erase either saved historical record here.
    lulo_rows = [row for row in crypto.get("projects", [])
                 if str(row.get("name") or "").strip().lower() == "lulo"
                 and row.get("inactive")]
    if lulo_rows:
        lulo_value = sum((amount(row.get("balanceUsd")) or Decimal("0"))
                         for row in lulo_rows)
        lulo_financial = current_live_assets(saved, bitcoin_usd).get("lulo")
        if lulo_value > Decimal(".02") and same(lulo_financial, 0):
            check("inactive-lulo-valuation", "warning",
                  "Inactive Lulo project cards retain a historical balance "
                  "in all-project portfolio totals, while Home/Financials "
                  "correctly show zero following the recorded withdrawal. "
                  "These values must not be added together.",
                  historicalPortfolioLuloUsd=float(lulo_value),
                  currentBusinessLuloUsd=lulo_financial)
    if bitcoin_usd is None:
        check("btc-valuation-coverage", "warning",
              "A current Bitcoin wallet quotation was unavailable; "
              "Home/Financials parity is tested without inventing BTC value")

    records = obj(saved.get("monthly_business_changes_v1"))
    journal = arr(saved.get("financials_journal_v1"))
    phones = arr(saved.get("financials_unetwork_business_phones_v1"))
    devices = arr(saved.get("hardware_payback_devices_v1"))
    closed = obj(saved.get("financials_month_closes_v1"))
    for key, raw in sorted(snapshots.items()):
        if key >= month or not obj(raw).get("locked"):
            continue
        business_locked = bool(obj(records.get(key)).get("locked"))
        has_financial_close = isinstance(obj(closed.get(key)).get("rows"), list)
        if business_locked and not has_financial_close:
            readiness = financial_close_readiness(saved, key, month)
            check("unsealed-financial-ledger:" + key, "warning",
                  "Historical month is protected against journal edits; "
                  "independent Financials close remains uncertified until "
                  "actual missing evidence is supplied.",
                  businessLocked=True, financialClosePresent=False,
                  missingEvidence=readiness["missingEvidence"],
                  estimatedAssetRows=readiness["estimatedAssetRows"],
                  unknownAssetRows=readiness["unknownAssetRows"])
    live = current_live_assets(saved, bitcoin_usd)
    base = financial_balance_rows(month, records, live, devices, month)
    if not obj(records.get(month)).get("locked"):
        base += phone_asset_rows(phones, month)
    base = with_journal_equipment(
        base, journal, month, bool(obj(records.get(month)).get("locked")))
    manual = [row for row in journal if isinstance(row, dict) and
              str(row.get("date") or "").startswith(month)]
    estimates = obj(obj(saved.get("financials_power_estimates_v1")).get(month))
    power_observed = any(activity([row], "electric") > 0 for row in manual)
    saved_expense = maybe_number(obj(records.get(month)).get("expenses"))
    power = (0 if month >= "2026-11" or power_observed or
             (saved_expense is not None and saved_expense > 0)
             else maybe_number(estimates.get("cost")) or 0)
    ledger = current_financial_ledger({
        "month": month, "currentMonth": month, "todayKey": today_key,
        "journalPreview": journal, "phones": phones, "closedMonths": closed,
        "baseRows": base, "confirmedMovements":
            saved.get("financials_confirmed_movements_v1"),
        "incomeMonth": history.get(month), "autoPower": power,
    })
    openings = financial_statement_openings(saved, month)
    statement = evaluate_statement({
        "month": month, "entries": ledger["entries"], "rows": base,
        "savedExpenses": saved_expense, "devices": devices, **openings,
    })
    home = home_business_snapshot(saved, month, bitcoin_usd)
    compare = ("knownSubtotal", "value", "liabilityValue", "netValue",
               "bankCashValue", "incomplete", "liabilitiesIncomplete")
    differences = [field for field in compare
                   if not same(home["business"].get(field),
                               statement["business"].get(field))
                   if field not in ("incomplete", "liabilitiesIncomplete")]
    differences += [field for field in ("incomplete", "liabilitiesIncomplete")
                    if bool(home["business"].get(field)) !=
                    bool(statement["business"].get(field))]
    check("home-financials", "error" if differences else "pass",
          "Home and Financials agree on business assets, cash and liabilities"
          if not differences else
          "Home and Financials disagree on business Balance Sheet totals",
          differingFields=differences,
          home=home["business"], financials=statement["business"],
          bitcoinQuoteIncluded=bitcoin_usd is not None)
    check("journal-preview", "pass",
          "Financials current ledger is read-only; source income and approved "
          "transfers are assembled by the backend",
          ledgerEntries=len(ledger["entries"]),
          ledgerMutated=ledger["financialLedgerMutated"])

    hardware = build_lifetime_hardware_payback(
        devices, daily_records, trackers, today_key,
        current_kryptex_daily=current_kryptex_daily)
    # The payback calculator correctly treats an absent *current* provider
    # observation as incomplete. The integrity report must distinguish that
    # expected in-progress day from overdue missing completed-day evidence.
    # Historical checkpoint baselines remain audit-only, not booked income.
    evidence_rows = hardware.get("devices") or []
    missing_completed = [
        {"device": row.get("name"), **item}
        for row in evidence_rows
        for item in (row.get("missingSourceDays") or [])
        if item.get("day") < today_key
    ]
    missing_current = [
        {"device": row.get("name"), **item}
        for row in evidence_rows
        for item in (row.get("missingSourceDays") or [])
        if item.get("day") == today_key
    ]
    provisional_completed = [
        {"device": row.get("name"), **item}
        for row in evidence_rows
        for item in (row.get("provisionalSourceDays") or [])
        if item.get("day") < today_key
    ]
    hardware_warning_flags = hardware.get("reviewFlags") or []
    check("hardware-completed-day-coverage",
          ("error" if not hardware.get("mathReconciles") else
           "warning" if missing_completed or provisional_completed or
           any(row.get("reasons") for row in evidence_rows) else "pass"),
          "All completed device earning days have supported source records"
          if not missing_completed and not provisional_completed else
          "Some completed device earning days still lack verified evidence",
          missingCompletedDays=missing_completed,
          provisionalCompletedDays=provisional_completed,
          missingCurrentDay=missing_current,
          checkpointAuditFlags=[
              flag for flag in hardware_warning_flags
              if flag.startswith("checkpoint-baseline-")
          ],
          currentDayExcludedFromCompletedDayCertification=True)
    check("hardware-credit", "error" if not hardware.get("mathReconciles") else
          ("warning" if not hardware.get("complete") else "pass"),
          "Hardware credits reconcile to unique dated provider rewards, "
          "with shared credits disclosed and checkpoints excluded from revenue"
          if hardware.get("mathReconciles") else
          "Device income attribution does not reconcile",
          uniqueProviderUsd=hardware.get("observedSelectedSourceRevenueUsd"),
          sumDeviceCreditsUsd=hardware.get("sumObservedDeviceCreditsUsd"),
          repeatedDeviceCreditsUsd=hardware.get("repeatedDeviceCreditsUsd"),
          unverifiedDeviceCreditsUsd=hardware.get("unverifiedDeviceCreditsUsd"),
          missingSourceDays=hardware.get("sourceDayMissingCount"),
          complete=hardware.get("complete"), reviewFlags=hardware.get("reviewFlags"),
          missingCompletedDays=missing_completed,
          missingCurrentDay=missing_current,
          provisionalCompletedDays=provisional_completed,
          deviceEvidence=[{
              "name": row.get("name"), "startDay": row.get("startDay"),
              "missingSourceDays": row.get("missingSourceDays") or [],
              "provisionalSourceDays": row.get("provisionalSourceDays") or [],
              "checkpointBaselineUnderstatesPriorRewards":
                  bool(row.get("checkpointBaselineUnderstatesPriorRewards")),
              "completed": bool(row.get("complete")),
          } for row in hardware.get("devices", [])])
    salad_coverage = salad_device_day_coverage(
        devices, daily_records, trackers, today_key)
    if salad_coverage["devices"]:
        incomplete = [
            item for item in salad_coverage["devices"]
            if item["status"] not in ("covered", "future-start")
        ]
        check("salad-device-dated-coverage",
              "warning" if incomplete else "pass",
              "Salad hardware earning-period coverage distinguishes "
              "completed confirmed days, unverified historical receipts "
              "and the current incomplete Pacific day",
              covered=salad_coverage["allCompletedDaysCovered"],
              devices=salad_coverage["devices"],
              missingCompletedDays=sum(len(d["missingDays"])
                                       for d in salad_coverage["devices"]),
              provisionalCompletedDays=sum(len(d["provisionalDays"])
                                           for d in salad_coverage["devices"]))
    dashboard = build_backend_earnings_dashboard(
        month, today_key, daily_records, trackers)
    check("dated-earnings", "warning" if not dashboard.get("fullyVerified")
          else "pass",
          "Daily earnings are separately sourced from dated provider evidence, "
          "not monthly booked income or wallet holdings",
          dailyMonthUsd=dashboard["monthTotalUsd"],
          dailyProviders=dashboard["monthlySources"],
          fullyVerified=dashboard.get("fullyVerified"),
          reviewDays=len(dashboard.get("reviewDays") or []),
          reviewEvidence=[{
              "day": row.get("date"),
              "provisionalProviders": row.get("sources") or [],
              "sourceCorrections": row.get("corrections") or {},
          } for row in (dashboard.get("reviewDays") or [])[:31]])
    # Raw browser-era daily receipts and booked provider month snapshots are
    # distinct accounting bases. Expose their source-by-source difference
    # after resolving Kryptex with confirmed dated tracker evidence. Never
    # overwrite either source to manufacture parity.
    booked_for_month = snapshots.get(month)
    if isinstance(booked_for_month, dict):
        reconciliation = compare_monthly_snapshot(dashboard, booked_for_month)
        if reconciliation is None:
            check("provider-month-reconciliation", "warning",
                  "A complete booked provider breakdown is unavailable")
        elif reconciliation.get("status") == "invalid-snapshot":
            check("provider-month-reconciliation", "error",
                  "Booked income contains invalid or duplicate provider amounts",
                  reconciliation=reconciliation)
        else:
            status = "pass" if reconciliation["status"] == "matched" else "warning"
            check("provider-month-reconciliation", status,
                  "Dated provider evidence and booked monthly sources have "
                  "matching totals" if status == "pass" else
                  "Provider daily observations differ from booked monthly "
                  "income or contain provisional legacy receipts; "
                  "no earnings were rebooked",
                  reconciliation=reconciliation)
    # The user tracks earnings to eight decimal places. A generic $0.02
    # financial tolerance is useful for materiality but must not hide small
    # source attribution gaps. Report even sub-cent mismatches without
    # treating an in-progress, unobserved day as fraudulent or booked income.
    precision = []
    month_booked = obj(snapshots.get(month))
    if isinstance(month_booked.get("platforms"), list):
        posted = {
            str(row.get("platform")): amount(row.get("amount"))
            for row in month_booked["platforms"] if isinstance(row, dict)
        }
        dated = obj(dashboard.get("monthlySources"))
        for source in sorted(set(posted) | set(dated)):
            booked_amount = posted.get(source) or Decimal("0")
            dated_amount = amount(dated.get(source)) or Decimal("0")
            difference = dated_amount - booked_amount
            if abs(difference) >= Decimal("0.00000001"):
                precision.append({
                    "provider": source,
                    "bookedUsd": float(booked_amount),
                    "datedUsd": float(dated_amount),
                    "differenceUsd": float(difference.quantize(
                        Decimal("0.00000001"))),
                })
        if precision:
            check("provider-precision-gaps",
                  "warning" if any(abs(amount(row["differenceUsd"]) or 0) >
                                   Decimal("0.02") for row in precision) else "info",
                  "Eight-decimal provider differences remain visible "
                  "even when below a two-cent accounting materiality threshold",
                  differences=precision)
    statuses = [c["status"] for c in checks]
    outcome = ("error" if "error" in statuses else
               "warning" if "warning" in statuses else "pass")
    return {
        "sourceOfCalculation": "backend-cross-page-integrity-v1",
        "month": month, "asOfDay": today_key,
        "status": outcome,
        "summary": {status: statuses.count(status)
                    for status in ("pass", "warning", "error", "info")},
        "bookedProviderLifetimeUsd": float(booked_total),
        "checks": checks,
        "readOnly": True, "financialLedgerMutated": False,
    }
