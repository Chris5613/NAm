"""One-time user-attested November 2026 legacy earnings reconciliation.

The historical daily receipts were expressly confirmed as correct by their
account owner. Only an account with BOTH exact provider fingerprints over the
November 1–14 baseline may use those receipts as the authoritative monthly
booking basis. This narrow migration neither invents new days nor overwrites
source-specific P/L observations, transfers, or confirmed extension mining.
Future November days are added from the same immutable dated-receipt series.

Other accounts/months cannot be silently changed by this confirmation.
"""
from datetime import date, timedelta
from math import isfinite

APPROVED_MONTH = "2026-11"
CUTOFF = "2026-11-14"
SOURCE_FINGERPRINTS = {"Lulo": 4.623146, "Loopscale": 15.208745}
PROVIDERS = frozenset(SOURCE_FINGERPRINTS)


def confirmed_november_sources(records: dict, month: str, today: str) -> dict:
    """Return monthly amounts only when this exact owner-approved history exists.

    The initial fingerprint is rounded to cents for resilience to harmless
    source rounding; all resulting amounts are recomputed from real dated rows.
    """
    if month != APPROVED_MONTH or today < CUTOFF or not isinstance(records, dict):
        return {}
    fingerprint = {name: 0.0 for name in PROVIDERS}
    totals = {name: 0.0 for name in PROVIDERS}
    day = date(2026, 11, 1)
    through = date.fromisoformat(CUTOFF)
    while day <= through:
        key = day.isoformat()
        row = records.get(key)
        if not isinstance(row, dict) or not isinstance(row.get("sources"), dict):
            return {}
        for name in PROVIDERS:
            amount = row["sources"].get(name, 0)
            if isinstance(amount, bool) or not isinstance(amount, (float, int)):
                return {}
            if not isfinite(amount) or amount < 0:
                return {}
            fingerprint[name] += amount
        day += timedelta(days=1)
    if any(abs(fingerprint[name] - expected) > 0.02
           for name, expected in SOURCE_FINGERPRINTS.items()):
        return {}

    for key, row in records.items():
        if not (isinstance(key, str) and len(key) == 10 and
                key.startswith(APPROVED_MONTH + "-") and key <= today):
            continue
        if not isinstance(row, dict) or not isinstance(row.get("sources"), dict):
            continue
        for name in PROVIDERS:
            amount = row["sources"].get(name, 0)
            if isinstance(amount, bool) or not isinstance(amount, (float, int)):
                return {}
            if not isfinite(amount) or amount < 0:
                return {}
            totals[name] += amount
    return {name: round(value, 6) for name, value in totals.items()}
