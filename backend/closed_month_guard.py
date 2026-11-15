"""Immutable Financials close records except through an explicit reopen action.

An authenticated generic settings PATCH may add a fresh valid close but
cannot silently overwrite/delete a previously closed month. Closing is not
revenue recognition; no monetary values are manufactured here.
"""
from copy import deepcopy
import re

MONTH_RE = re.compile(r"\A\d{4}-(0[1-9]|1[0-2])\Z")


def protect_closed_financial_months(existing, proposed):
    if not isinstance(proposed, dict):
        raise ValueError("Financials month closes must be an object.")
    old = existing if isinstance(existing, dict) else {}
    for month, snapshot in old.items():
        if month not in proposed or snapshot != proposed[month]:
            raise ValueError("Closed financial month requires explicit reopen.")
    for month, snapshot in proposed.items():
        if month in old:
            continue
        if not isinstance(month, str) or not MONTH_RE.fullmatch(month):
            raise ValueError("Invalid closed financial month.")
        if (not isinstance(snapshot, dict) or not
                isinstance(snapshot.get("rows"), list)):
            raise ValueError("A closed period requires stored statement rows.")
    return deepcopy(proposed)


def reopen_closed_financial_month(existing, month):
    if not isinstance(existing, dict) or not MONTH_RE.fullmatch(str(month)):
        raise ValueError("Unknown financial month.")
    if month not in existing:
        raise ValueError("Financial month is not closed.")
    updated = deepcopy(existing)
    updated.pop(month)
    return updated
