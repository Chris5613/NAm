"""Bounded, non-financial evidence of backend/frontend migration parity.

This diagnostics store never contains balances, provider tokens, journal lines
or assets. Successful renders are not proof of correct accounting; parity is
only a comparison between two independently computed results.
"""
from copy import deepcopy
from datetime import datetime, timezone
import re

AREAS = frozenset({
    "income-history", "balance-rows", "financial-statement",
    "automatic-expenses", "automatic-income", "phone-assets",
    "project-break-even", "home-net-worth",
})
STATUSES = frozenset({"matched", "mismatched"})
SOURCES = frozenset({"backend-persisted", "backend-projection"})
MONTH_RE = re.compile(r"\A\d{4}-(0[1-9]|1[0-2])\Z")


def record_parity_observation(current, area, month, status, source,
                              fingerprint, timestamp=None):
    if area not in AREAS or status not in STATUSES or source not in SOURCES:
        raise ValueError("Invalid accounting parity category.")
    if not isinstance(month, str) or not MONTH_RE.fullmatch(month):
        raise ValueError("Invalid accounting parity period.")
    if (not isinstance(fingerprint, str) or not
            re.fullmatch(r"[0-9a-f]{8}", fingerprint)):
        raise ValueError("Invalid parity revision token.")
    old = current if isinstance(current, dict) else {}
    records = deepcopy(old.get("lastByArea")) if isinstance(
        old.get("lastByArea"), dict) else {}
    key = area + ":" + month + ":" + source
    previous = records.get(key)
    if isinstance(previous, dict) and (
        previous.get("fingerprint") == fingerprint and
        previous.get("status") == status
    ):
        return deepcopy(old)
    stamp = timestamp or datetime.now(timezone.utc).isoformat()
    records[key] = {
        "area": area, "month": month, "status": status,
        "source": source, "fingerprint": fingerprint,
        "checkedAt": stamp,
    }
    # Bounded per account; leave only latest checks for up to 96 areas/months.
    if len(records) > 96:
        ordering = sorted(records, key=lambda k: records[k].get("checkedAt", ""))
        for stale in ordering[:len(records) - 96]:
            records.pop(stale, None)
    return {"lastByArea": records, "updatedAt": stamp}


def parity_summary(current):
    records = current.get("lastByArea") if isinstance(current, dict) else None
    rows = list(records.values()) if isinstance(records, dict) else []
    return {
        "checks": sorted(rows, key=lambda r: (r.get("area", ""),
                                               r.get("month", ""),
                                               r.get("source", ""))),
        "summary": {
            "matched": sum(r.get("status") == "matched" for r in rows),
            "mismatched": sum(r.get("status") == "mismatched" for r in rows),
        },
        "updatedAt": current.get("updatedAt") if isinstance(current, dict) else None,
        "note": "Parity verifies a migration comparison; it does not validate underlying provider evidence.",
    }
