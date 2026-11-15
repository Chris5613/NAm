"""Protect closed financial months and archive completed monthly snapshots.

This is a metadata-only projection. It never estimates opening or ending
balances from provider earnings, today's exchange rates, or other months.
"""
from copy import deepcopy
from math import isfinite
import re

MONTH = re.compile(r"\A[0-9]{4}-(0[1-9]|1[0-2])\Z")


def financial_amount(raw):
    if raw is None or isinstance(raw, bool):
        return None
    try:
        amount = float(raw)
        return amount if isfinite(amount) else None
    except (TypeError, ValueError, OverflowError):
        return None


def seal_completed_business_months(records, snapshots, current_month):
    """Lock completed months with saved rows, leaving balances unchanged.

    Historical income is only copied from an explicitly locked monthly
    provider snapshot. Unknown income stays null, not a fabricated zero.
    """
    old = records if isinstance(records, dict) else {}
    saved = deepcopy(old)
    historical = snapshots if isinstance(snapshots, dict) else {}
    if not isinstance(current_month, str) or not MONTH.fullmatch(current_month):
        return saved
    for month, entry in old.items():
        if (not isinstance(month, str) or not MONTH.fullmatch(month) or
                month >= current_month or not isinstance(entry, dict) or
                not isinstance(entry.get("items"), list) or
                len(entry["items"]) == 0):
            continue
        if entry.get("locked") and "revenueSnapshot" in entry:
            continue
        new = dict(entry)
        new["locked"] = True
        # Never recalculate an already explicitly saved historical amount.
        if "revenueSnapshot" not in new:
            snapshot = historical.get(month)
            amount = (financial_amount(snapshot.get("total"))
                      if isinstance(snapshot, dict) and snapshot.get("locked")
                      else None)
            new["revenueSnapshot"] = amount
        saved[month] = new
    return saved


def preserve_locked_business_months(current, proposed, current_month):
    """Reject stale frontend writes that delete/edit a sealed prior month.

    Explicit future corrective accounting must go through a separately
    authorized reopen/adjustment workflow, not a generic settings PATCH.
    """
    if not isinstance(proposed, dict):
        raise ValueError("Monthly financial records must be an object.")
    if not MONTH.fullmatch(str(current_month or "")):
        raise ValueError("Invalid financial reporting month.")
    old = current if isinstance(current, dict) else {}
    for month, entry in old.items():
        if (not isinstance(month, str) or not MONTH.fullmatch(month) or
                month >= current_month or not isinstance(entry, dict) or
                not entry.get("locked")):
            continue
        if month not in proposed or proposed[month] != entry:
            raise ValueError("Cannot edit or remove a locked historical month.")
    return deepcopy(proposed)
