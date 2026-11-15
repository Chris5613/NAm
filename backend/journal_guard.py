"""Validate accounting writes at the server's durable settings boundary.

Existing legacy entries are not retroactively edited. New/changed entries
must be balanced, dated and manual; a closed month cannot be silently
reopened through a stale browser save.
"""
from datetime import date
from decimal import Decimal, InvalidOperation
from collections import Counter


ALLOWED_ACCOUNTS = frozenset((
    "cash", "luloCash", "brokerage", "crypto", "platform",
    "platform:kryptex", "platform:rollercoin", "platform:salad",
    "platform:unetwork", "defi", "equipment", "accDep", "payable",
    "equity", "revenue", "dividendRevenue", "gainDisposal", "electric",
    "expense", "depreciation", "fees",
))


def valid_account(raw):
    if not isinstance(raw, str) or not raw or len(raw) > 160:
        return False
    if raw in ALLOWED_ACCOUNTS:
        return True
    # Registered equipment subaccounts use the exact prefix created by
    # Financials. Reject arbitrary unknown accounts that could hide credits.
    return (raw.startswith("equipment:") and 10 < len(raw) <= 160 and
            all(ch.isalnum() or ch in ":-_." for ch in raw[10:]))


def money(raw):
    if raw is None or isinstance(raw, bool):
        raise ValueError("Invalid journal amount.")
    try:
        value = Decimal(str(raw))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("Invalid journal amount.") from None
    if not value.is_finite() or value < 0 or value > Decimal("1000000000000"):
        raise ValueError("Invalid journal amount.")
    if value != value.quantize(Decimal(".01")):
        raise ValueError("Journal values must use cents.")
    return value


def check_entry(entry):
    if not isinstance(entry, dict):
        raise ValueError("Journal entry must be an object.")
    ident = entry.get("id")
    if not isinstance(ident, str) or not ident or len(ident) > 180:
        raise ValueError("Journal entry must have a valid unique ID.")
    day = entry.get("date")
    try:
        if not isinstance(day, str) or date.fromisoformat(day).isoformat() != day:
            raise ValueError()
    except (TypeError, ValueError):
        raise ValueError("Journal entry must have a valid calendar date.") from None
    if entry.get("automatic"):
        raise ValueError("Generated accruals cannot be posted through the manual journal.")
    lines = entry.get("lines")
    if isinstance(lines, list):
        if len(lines) < 2 or len(lines) > 100:
            raise ValueError("A journal entry needs at least two lines.")
        total_debit = total_credit = Decimal(0)
        for line in lines:
            if not isinstance(line, dict):
                raise ValueError("Invalid journal line.")
            account = line.get("account")
            if not valid_account(account):
                raise ValueError("Unknown journal account.")
            debit = money(line.get("debit", 0))
            credit = money(line.get("credit", 0))
            if (debit > 0) == (credit > 0):
                raise ValueError("Each line must contain one debit or credit.")
            total_debit += debit
            total_credit += credit
        if total_debit == 0 or total_debit != total_credit:
            raise ValueError("Journal debits and credits must match.")
        return
    debit = entry.get("debitAccount")
    credit = entry.get("creditAccount")
    if not valid_account(debit) or not valid_account(credit) or debit == credit:
        raise ValueError("Invalid legacy journal accounts.")
    if money(entry.get("amount")) <= 0:
        raise ValueError("Journal entry must have a positive amount.")


def guard_journal_write(current, proposed, closes, business_months=None):
    """Return unchanged candidate after validating only changed manual entries."""
    if not isinstance(proposed, list) or len(proposed) > 20000:
        raise ValueError("Manual journal must be a bounded list.")
    saved = current if isinstance(current, list) else []
    history = {entry.get("id"): entry for entry in saved if isinstance(entry, dict)}
    ids = Counter(str(entry.get("id")) for entry in proposed if isinstance(entry, dict))
    historical_duplicates = Counter(str(entry.get("id")) for entry in saved
                                    if isinstance(entry, dict))
    for key, count in ids.items():
        if count > 1 and count > historical_duplicates.get(key, 0):
            raise ValueError("Duplicate journal entry ID.")
    locked = closes if isinstance(closes, dict) else {}
    business = business_months if isinstance(business_months, dict) else {}

    def protected(month):
        return (isinstance(locked.get(month), dict) or
                bool((business.get(month) or {}).get("locked")))
    for entry in proposed:
        if not isinstance(entry, dict):
            raise ValueError("Invalid journal record.")
        ident = entry.get("id")
        if ident in history and history[ident] == entry:
            continue
        check_entry(entry)
        previous = history.get(ident)
        if (protected(entry["date"][:7]) or
                (isinstance(previous, dict) and
                 protected(str(previous.get("date") or "")[:7]))):
            raise ValueError("Cannot modify a closed accounting month.")
    # Deleting a previously posted entry in a closed month also counts as
    # editing the locked month, even if that row is absent from the payload.
    proposed_ids = {entry.get("id") for entry in proposed}
    for entry in saved:
        if not isinstance(entry, dict):
            continue
        if (entry.get("id") not in proposed_ids and
                protected(str(entry.get("date") or "")[:7])):
            raise ValueError("Cannot remove an entry from a closed month.")
    return proposed
