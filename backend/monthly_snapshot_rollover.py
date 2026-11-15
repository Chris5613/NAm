"""Close completed provider-income month snapshots without repricing history."""
from copy import deepcopy
import re


def lock_finished_months(snapshots, current_month, timestamp):
    """Lock only genuinely recorded past months, preserving every amount.

    No missing provider, transaction, daily receipt or payout is invented.
    An open month remains open. Previously locked months are left untouched.
    """
    existing = snapshots if isinstance(snapshots, dict) else {}
    normalized = deepcopy(existing)
    if not isinstance(current_month, str) or not re.fullmatch(
        r"\d{4}-(0[1-9]|1[0-2])", current_month,
    ):
        return normalized
    for month, entry in existing.items():
        if (not isinstance(month, str) or not re.fullmatch(
                r"\d{4}-(0[1-9]|1[0-2])", month) or
                month >= current_month or not isinstance(entry, dict) or
                entry.get("locked")):
            continue
        if not isinstance(entry.get("platforms"), list):
            continue
        normalized[month] = {
            **entry,
            "locked": True,
            "lockedAt": entry.get("lockedAt") or timestamp,
        }
    return normalized
