"""Read-only cumulative Financials ledger projection.

The backend owns historical income accrual, equipment depreciation, approved
movements and trial-balance computation. Never posts, changes or unlocks data.
"""
import re
from .financial_core import (
    cents, number, normalize_lines, phone_asset_rows, equipment_schedule,
    auto_income_journal, project_automatic_expenses, trial_balance,
)
from .financial_balance_rows import financial_balance_rows, with_journal_equipment

CUTOFF = "2026-09"
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def sequence(value):
    return value if isinstance(value, list) else []


def mapping(value):
    return value if isinstance(value, dict) else {}


def month_of(entry):
    return str(entry.get("date") or "")[:7] if isinstance(entry, dict) else ""


def allowed_legacy(entry, phones):
    if not isinstance(entry, dict):
        return False
    month = month_of(entry)
    if month >= CUTOFF:
        return True
    if month != "2026-05":
        return False
    ids = {str(phone.get("journalId") or "unetwork-phone:" + str(phone.get("id")))
           for phone in sequence(phones) if isinstance(phone, dict) and
           str(phone.get("businessDate") or "")[:7] == "2026-05"}
    return str(entry.get("id")) in ids and (
        entry.get("source") == "unetwork-business-phone" or
        str(entry.get("id") or "").startswith("unetwork-phone:"))


def posted(entry):
    return {**entry, "lines": normalize_lines(entry)}


def resolve_account(value):
    key = re.sub(r"[\s_-]", "", str(value or "").strip().lower())
    known = {
        "cash": "cash", "bank": "cash", "checking": "cash", "savings": "cash",
        "btc": "crypto", "bitcoin": "crypto", "btcwallet": "crypto",
        "cryptowallet": "crypto", "lulo": "luloCash",
        "lulosavings": "luloCash", "loopscale": "defi", "defi": "defi",
        "brokerage": "brokerage", "stock": "brokerage",
        "kryptex": "platform:kryptex", "kryptexwallet": "platform:kryptex",
        "rollercoin": "platform:rollercoin",
        "rollercoinwallet": "platform:rollercoin", "salad": "platform:salad",
        "unetwork": "platform:unetwork", "unitynetwork": "platform:unetwork",
        "platform": "platform",
    }
    ids = {
        "cash", "crypto", "luloCash", "defi", "brokerage", "platform",
        "platform:kryptex", "platform:rollercoin", "platform:salad",
        "platform:unetwork",
    }
    return known.get(key) or (value if value in ids else None)


def movement_entries(movements, month, posted_ids, manual):
    result = []
    for move in movements:
        if not isinstance(move, dict) or str(move.get("date") or "")[:7] != month:
            continue
        if move.get("id") in posted_ids or not DATE.fullmatch(str(move.get("date") or "")):
            continue
        source = resolve_account(move.get("from"))
        target = resolve_account(move.get("to"))
        amount = cents(move.get("amount"))
        is_fee = move.get("type") in ("fee", "transaction_fee", "network_fee")
        if not source or amount <= 0 or (not is_fee and (not target or target == source)):
            continue
        lines = ([{"account": "fees", "debit": amount, "credit": 0},
                  {"account": source, "debit": 0, "credit": amount}]
                 if is_fee else
                 [{"account": target, "debit": amount, "credit": 0},
                  {"account": source, "debit": 0, "credit": amount}])
        if any(str(entry.get("date") or "") == move.get("date") and
               abs(number(entry.get("amount")) - lines[0]["debit"]) < .005 and
               entry.get("debitAccount") == lines[0]["account"] and
               entry.get("creditAccount") == lines[1]["account"]
               for entry in manual):
            continue
        provider = move.get("provider") or "Transfer"
        result.append({
            "id": "auto-movement:" + str(move.get("id")),
            "date": move["date"], "automatic": True,
            "origin": "confirmed-movement",
            "description": ("Transaction fee — " + str(provider) if is_fee else
                            "Transfer " + str(move.get("provider") or "") +
                            " · " + source + " → " + str(target)),
            "lines": lines,
        })
        if not is_fee and number(move.get("feeUsd")) > 0:
            fee = cents(move["feeUsd"])
            result.append({
                "id": "auto-fee:" + str(move.get("id")),
                "date": move["date"], "automatic": True,
                "origin": "confirmed-movement",
                "description": "Transfer fee — " + str(provider),
                "lines": [{"account": "fees", "debit": fee, "credit": 0},
                          {"account": source, "debit": 0, "credit": fee}],
            })
    return result


def opening_phone_depreciation(phones):
    may = [p for p in sequence(phones) if isinstance(p, dict) and
           str(p.get("businessDate") or "").startswith("2026-05")]
    rows = phone_asset_rows(may, "2026-08")
    amount = cents(sum(number(row.get("historicalCost")) -
                       number(row.get("end")) for row in rows))
    if amount <= 0:
        return None
    return {
        "id": "opening-iphone-depreciation:2026-09",
        "date": "2026-09-01",
        "description": "Opening equity adjustment — May–August iPhone depreciation",
        "automatic": True, "openingAdjustment": True,
        "lines": [{"account": "equity", "debit": amount, "credit": 0},
                  {"account": "accDep", "debit": 0, "credit": amount}],
    }


# The browser supplies only the current displayed journal projection and chart
# of accounts. All prior-month financial source data is read from server settings.
HISTORICAL_SOURCE_KEYS = {
    "journal": "financials_journal_v1",
    "closedMonths": "financials_month_closes_v1",
    "records": "monthly_business_changes_v1",
    "hardwareDevices": "hardware_payback_devices_v1",
    "phones": "financials_unetwork_business_phones_v1",
    "confirmedMovements": "financials_confirmed_movements_v1",
}


def persisted_historical_trial_inputs(request, settings, income_months,
                                      current_month, today_key):
    """Create a read-only historical projection from authenticated source state.

    Browser-supplied previous-month journals, balances, snapshots and income
    are deliberately ignored. Existing current-period entries are an unposted
    UI preview; they are never saved or treated as historical evidence.
    """
    supplied = mapping(request)
    stored = mapping(settings)
    return {
        "month": supplied.get("month"),
        "currentMonth": current_month,
        "todayKey": today_key,
        "currentEntries": sequence(supplied.get("currentEntries")),
        "accounts": sequence(supplied.get("accounts")),
        "incomeMonths": sequence(income_months),
        **{field: stored.get(key) for field, key in HISTORICAL_SOURCE_KEYS.items()},
    }


def historical_trial_balance(data):
    month = data.get("month")
    if not isinstance(month, str) or not MONTH.fullmatch(month):
        raise ValueError("Invalid reporting month")
    journal, phones, devices = (
        sequence(data.get("journal")), sequence(data.get("phones")),
        sequence(data.get("hardwareDevices")))
    records, closed = mapping(data.get("records")), mapping(data.get("closedMonths"))
    movements = data.get("confirmedMovements")
    movements = list(movements.values()) if isinstance(movements, dict) else sequence(movements)
    incomes = {row.get("monthKey"): row for row in sequence(data.get("incomeMonths"))
               if isinstance(row, dict) and MONTH.fullmatch(str(row.get("monthKey") or ""))}
    current_entries = sequence(data.get("currentEntries"))
    start_dates = [
        str(p.get("startMonth")) for p in phones if isinstance(p, dict) and
        MONTH.fullmatch(str(p.get("startMonth") or ""))
    ] + [month_of(entry) for entry in journal
         if MONTH.fullmatch(month_of(entry))] + [CUTOFF]
    start = min(start_dates)
    total_months = (int(month[:4]) - int(start[:4])) * 12 + int(month[5:]) - int(start[5:])
    if total_months < 0 or total_months > 239:
        raise ValueError("Historical ledger exceeds supported month range")
    all_entries = []
    for offset in range(total_months + 1):
        n = int(start[:4]) * 12 + int(start[5:]) - 1 + offset
        key = f"{n // 12:04d}-{n % 12 + 1:02d}"
        if key == month:
            all_entries.extend(current_entries)
            continue
        period = [entry for entry in journal if month_of(entry) == key and
                  isinstance(entry, dict)]
        if key < CUTOFF:
            all_entries.extend(posted(entry) for entry in period
                               if allowed_legacy(entry, phones))
            continue
        frozen = mapping(closed.get(key))
        if isinstance(frozen.get("entries"), list):
            all_entries.extend(frozen["entries"])
            continue
        all_entries.extend(posted(entry) for entry in period)
        projected = auto_income_journal(
            key, incomes.get(key), period,
            data.get("currentMonth") or month, data.get("todayKey"),
        )
        all_entries.extend(sequence(projected.get("entries")))
        fixed = financial_balance_rows(key, records, {}, devices,
                                       data.get("currentMonth") or month)
        if not mapping(records.get(key)).get("locked"):
            fixed += phone_asset_rows(phones, key)
        fixed = with_journal_equipment(
            fixed, journal, key, bool(mapping(records.get(key)).get("locked")))
        automatic = project_automatic_expenses(key, fixed, period, 0)
        all_entries.extend(sequence(automatic.get("entries")))
        posted_ids = {entry.get("movementSourceId") for entry in period
                      if isinstance(entry, dict) and entry.get("movementSourceId")}
        all_entries.extend(movement_entries(movements, key, posted_ids, period))
    opening = opening_phone_depreciation(phones) if month >= CUTOFF else None
    if opening and not any(isinstance(row, dict) and row.get("id") == opening["id"]
                           for row in all_entries):
        all_entries.append(opening)
    if len(all_entries) > 20000:
        raise ValueError("Historical ledger too large")
    result = trial_balance(data.get("accounts"), all_entries)
    return {**result, "month": month, "includedEntries": len(all_entries)}
