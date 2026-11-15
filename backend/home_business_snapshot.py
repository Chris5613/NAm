"""Source-owned, read-only Home business Balance Sheet projection.

Never turns earned income into an asset twice, never adds a wallet balance to
revenue, and never writes an inferred bank opening or financial transaction.
"""
import re
from .financial_core import (
    cents, number, maybe_number, normalize_lines, activity,
    phone_asset_rows, build_statement_rows, sum_business_rows,
)
from .financial_balance_rows import financial_balance_rows, with_journal_equipment
from .financial_historical_ledger import movement_entries


def obj(value):
    return value if isinstance(value, dict) else {}


def arr(value):
    return value if isinstance(value, list) else []


def current_live_assets(settings, bitcoin_usd):
    feed = obj(settings.get("yield_project_latest_balance_feed_v1"))
    latest = {}
    for row in arr(feed.get("projects")):
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or "").strip().lower()
        amount = maybe_number(row.get("balanceUsd"))
        if name in ("kryptex", "salad", "unetwork", "rollercoin", "loopscale",
                    "lulo") and amount is not None:
            latest[name] = amount
    quick = obj(settings.get("yield_project_quick_cache_v1"))
    loop = maybe_number(obj(quick.get("loopscaleSnapshot")).get("positionValueUsd"))
    if loop is not None:
        latest["loopscale"] = loop
    for name, key in (
        ("salad", "project_income_salad_tracker_v1"),
        ("unetwork", "project_income_unetwork_tracker_v1"),
        ("kryptex", "project_income_kryptex_tracker_v1"),
    ):
        tracker = obj(settings.get(key))
        current = maybe_number(tracker.get("currentBalance"))
        if current is not None and (tracker.get("initialized") or
                                    tracker.get("lastSyncedAt")):
            latest[name] = current
    roller = obj(settings.get("project_income_rollercoin_tracker_v2"))
    trx = maybe_number(roller.get("currentTrxBalance"))
    quote = maybe_number(roller.get("lastTrxPrice"))
    if trx is not None and quote is not None and quote > 0 and roller.get("lastSyncedAt"):
        latest["rollercoin"] = trx * quote
    # A confirmed Lulo withdrawal changed the *Financials reporting asset*
    # to zero. Keep the historical project ledger and performance unchanged.
    # The general project feed can still contain a pre-withdrawal holding.
    latest["lulo"] = 0
    if bitcoin_usd is not None:
        latest["btc"] = bitcoin_usd
    return latest


def cash_opening(month, openings, journal, movements):
    values = obj(openings)
    direct = maybe_number(values.get(month))
    if direct is not None:
        return direct
    months = sorted(key for key in values
                    if re.fullmatch(r"\d{4}-\d{2}", str(key)) and
                    key < month and maybe_number(values[key]) is not None)
    if not months:
        return None
    start = months[-1]
    opening = maybe_number(values[start])
    manual = [entry for entry in arr(journal) if isinstance(entry, dict)]
    for entry in manual:
        date = str(entry.get("date") or "")[:7]
        if start <= date < month:
            opening += activity([entry], "cash")
    for movement in movements:
        if not isinstance(movement, dict):
            continue
        date = str(movement.get("date") or "")[:7]
        if not start <= date < month:
            continue
        is_fee = movement.get("type") in ("fee", "transaction_fee", "network_fee")
        amount = number(movement.get("amount"))
        duplicate = any(
            row.get("date") == movement.get("date") and
            abs(number(row.get("amount")) - amount) < .005 and
            row.get("creditAccount") == movement.get("from") and
            row.get("debitAccount") == (
                "fees" if is_fee else movement.get("to"))
            for row in manual)
        if duplicate:
            continue
        if movement.get("from") == "cash":
            opening -= amount
        if not is_fee and movement.get("to") == "cash":
            opening += amount
        if not is_fee and movement.get("from") == "cash":
            opening -= number(movement.get("feeUsd"))
    return cents(opening)


def payable_opening(month, journal):
    return cents(sum(
        -activity([entry], "payable") for entry in arr(journal)
        if isinstance(entry, dict) and str(entry.get("date") or "")[:7] < month
    ))


def home_business_snapshot(settings, month, bitcoin_usd=None):
    records = obj(settings.get("monthly_business_changes_v1"))
    journal = arr(settings.get("financials_journal_v1"))
    hardware = arr(settings.get("hardware_payback_devices_v1"))
    phones = arr(settings.get("financials_unetwork_business_phones_v1"))
    closed = obj(settings.get("financials_month_closes_v1"))
    saved = obj(closed.get(month))
    live = current_live_assets(settings, bitcoin_usd)
    if isinstance(saved.get("rows"), list):
        business = sum_business_rows(saved["rows"])
        return {"sourceOfCalculation": "backend-home-business",
                "month": month, "business": business, "live": live,
                "source": "locked-month-rows", "complete": True}
    base = financial_balance_rows(month, records, live, hardware, month)
    if not obj(records.get(month)).get("locked"):
        base += phone_asset_rows(phones, month)
    base = with_journal_equipment(
        base, journal, month, bool(obj(records.get(month)).get("locked")))
    manual = [entry for entry in journal if isinstance(entry, dict) and
              str(entry.get("date") or "").startswith(month)]
    approved = settings.get("financials_confirmed_movements_v1")
    moves = list(approved.values()) if isinstance(approved, dict) else arr(approved)
    posted_ids = {entry.get("movementSourceId") for entry in manual
                  if entry.get("movementSourceId")}
    projected = movement_entries(moves, month, posted_ids, manual)
    estimates = obj(obj(settings.get("financials_power_estimates_v1")).get(month))
    saved_expense = maybe_number(obj(records.get(month)).get("expenses"))
    actual_power = any(activity([entry], "electric") > 0 for entry in manual)
    # Free power for mining from November 2026 onward is the user's booked
    # accounting policy. Earlier months use the saved nominal estimate only.
    power = 0 if (month >= "2026-11" or actual_power or
                  (saved_expense is not None and saved_expense > 0)) else (
                  maybe_number(estimates.get("cost")) or 0)
    power_entries = []
    if power > 0:
        power_entries.append({
            "id": "auto-power-estimate:" + month, "date": month + "-28",
            "automatic": True,
            "lines": [
                {"account": "electric", "debit": cents(power), "credit": 0},
                {"account": "payable", "debit": 0, "credit": cents(power)},
            ],
        })
    statement = build_statement_rows(
        base, [{**entry, "lines": normalize_lines(entry)} for entry in manual] +
        projected + power_entries,
        cash_opening(month, settings.get("financials_bank_openings_v1"),
                     journal, moves), payable_opening(month, journal))
    business = sum_business_rows(statement)
    # Unknown balances remain unknown: never replace missing wallet evidence
    # with a manufactured zero.
    return {
        "sourceOfCalculation": "backend-home-business",
        "month": month, "business": business, "live": live,
        "source": "saved-financial-ledger-and-provider-observations",
        "complete": (not business["incomplete"] and
                     not business["liabilitiesIncomplete"]),
        "bitcoinIncluded": bitcoin_usd is not None,
    }
