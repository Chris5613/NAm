"""Nonposting current-month General Ledger assembly.

The browser may send a current draft of the manual journal so an unsaved
editor view remains responsive. All *calculations* of income accruals,
confirmed movements, depreciation and opening iPhone adjustments are
performed once on the server. Closed-month snapshots are passed from the
authenticated persisted settings, not invented from wallet balances.
"""
import re
from .financial_core import auto_income_journal, project_automatic_expenses
from .financial_historical_ledger import (
    CUTOFF, allowed_legacy, posted, sequence, mapping, month_of,
    movement_entries, opening_phone_depreciation,
)

MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def current_financial_ledger(data):
    month = data.get("month")
    if not isinstance(month, str) or not MONTH.fullmatch(month):
        raise ValueError("Invalid reporting month")
    current_month = data.get("currentMonth") or month
    today_key = data.get("todayKey")
    journal = sequence(data.get("journalPreview"))
    phones = sequence(data.get("phones"))
    closed = mapping(data.get("closedMonths"))
    snapshot = mapping(closed.get(month))
    saved_manual = snapshot.get("manualEntries")
    manual = (saved_manual if isinstance(saved_manual, list)
              else [entry for entry in journal if month_of(entry) == month])
    if len(journal) > 10000 or len(manual) > 10000:
        raise ValueError("Journal too large")
    manual = [entry for entry in manual if isinstance(entry, dict)
              and month_of(entry) == month]
    income = auto_income_journal(
        month, data.get("incomeMonth"), manual, current_month, today_key)
    expenses = {"entries": []}
    if month < CUTOFF:
        frozen = snapshot.get("entries")
        source = frozen if isinstance(frozen, list) else manual
        entries = [posted(e) for e in source if allowed_legacy(e, phones)
                   and month_of(e) == month]
        return {
            "sourceOfCalculation": "backend-current-financial-ledger-v1",
            "month": month, "entries": entries,
            "manualEntryCount": len(manual), "generatedEntryCount": 0,
            "frozen": isinstance(frozen, list),
            "financialLedgerMutated": False,
            "income": income, "automaticExpenses": expenses,
        }
    frozen = snapshot.get("entries")
    if isinstance(frozen, list):
        entries = list(frozen)
    else:
        rows = data.get("baseRows")
        if not isinstance(rows, list):
            raise ValueError("Backend asset rows required")
        manual_entries = [posted(entry) for entry in manual]
        movements = data.get("confirmedMovements")
        movements = (list(movements.values()) if isinstance(movements, dict)
                     else sequence(movements))
        posted_ids = {str(entry.get("movementSourceId")) for entry in manual
                      if entry.get("movementSourceId")}
        approved_movements = movement_entries(
            movements, month, posted_ids, manual)
        expenses = project_automatic_expenses(
            month, rows, manual, data.get("autoPower", 0))
        entries = (manual_entries + sequence(income.get("entries")) +
                   approved_movements + sequence(expenses.get("entries")))
    if month == CUTOFF:
        opening = opening_phone_depreciation(phones)
        if opening and not any(isinstance(row, dict) and
                               row.get("id") == opening["id"] for row in entries):
            entries.append(opening)
    entries = sorted(entries, key=lambda row: str(row.get("date") or ""))
    if len(entries) > 20000:
        raise ValueError("Current ledger exceeds supported entry limit")
    return {
        "sourceOfCalculation": "backend-current-financial-ledger-v1",
        "month": month, "entries": entries,
        "manualEntryCount": len(manual),
        "generatedEntryCount": max(0, len(entries) - len(manual)),
        "frozen": isinstance(frozen, list),
        "financialLedgerMutated": False,
        "income": income, "automaticExpenses": expenses,
    }
