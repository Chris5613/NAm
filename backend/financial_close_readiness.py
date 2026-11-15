"""Read-only evidence checklist for legacy Financials month closures.

Monthly Changes and booked provider income can be locked without a separate
certified Financials balance sheet. Never synthesize an empty close, guessed
cash opening, or final net worth to make the warning disappear.
"""
import re
from .home_business_snapshot import obj, arr
from .financial_core import maybe_number

MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def financial_close_readiness(settings, month, current_month):
    if (not isinstance(month, str) or not MONTH.fullmatch(month)
            or month > current_month):
        raise ValueError("Invalid historical financial month")
    saved = obj(settings)
    source = obj(obj(saved.get("yield_monthly_snapshots_v1")).get(month))
    business = obj(obj(saved.get("monthly_business_changes_v1")).get(month))
    financial = obj(obj(saved.get("financials_month_closes_v1")).get(month))
    bank = obj(saved.get("financials_bank_openings_v1"))
    journal = [row for row in arr(saved.get("financials_journal_v1"))
               if isinstance(row, dict) and str(row.get("date") or "")[:7] == month]
    rows = arr(business.get("items"))
    estimates = [str(row.get("name") or "") for row in rows
                 if isinstance(row, dict) and row.get("estimated")]
    unknown = [str(row.get("name") or "") for row in rows
               if isinstance(row, dict) and maybe_number(row.get("end")) is None]
    closed = isinstance(financial.get("rows"), list)
    blockers = []
    if not source.get("locked"):
        blockers.append("Booked provider income is not locked")
    if not business.get("locked"):
        blockers.append("Monthly Changes business period is not locked")
    if not rows:
        blockers.append("Historical business asset rows are missing")
    if estimates:
        blockers.append("Historical asset rows contain unverified estimates")
    if unknown:
        blockers.append("Historical asset rows have unknown ending values")
    if maybe_number(bank.get(month)) is None:
        blockers.append("Verified beginning bank cash is missing for this month")
    if not closed:
        blockers.append("No separately posted Financials closing statement exists")
    return {
        "sourceOfCalculation": "backend-financial-close-readiness-v1",
        "month": month,
        "status": ("recorded-financial-close" if closed
                   else "protected-uncertified" if business.get("locked")
                   else "open-not-certified"),
        "certifiedClosePresent": closed,
        "protectedByBusinessLock": bool(business.get("locked")),
        "providerIncomeLocked": bool(source.get("locked")),
        "postedManualJournalEntries": len(journal),
        "estimatedAssetRows": estimates,
        "unknownAssetRows": unknown,
        "missingEvidence": blockers,
        "readyForNewCertifiedClose": not blockers,
        "readOnly": True,
        "financialLedgerMutated": False,
    }
