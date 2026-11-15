"""Explicit user attestation for one historical provider receipt.

User approved on 2026-11-15 that Salad's November 13, 2026 recorded
$0.02737941 earned amount is correct. This is *user confirmation*, not
independent Salad API verification. Only the preexisting immutable daily
server receipt may be promoted, and only at the exact approved amount.

Do not use this metadata as a revenue source, alter historical provider
snapshots or reinterpret another day. In particular, it has no relationship
to inactive Lulo accounting.
"""
from decimal import Decimal, InvalidOperation

ATTESTATIONS = {
    ("2026-11-13", "Salad"): {
        "approvedUsd": Decimal("0.02737941"),
        "approvedOn": "2026-11-15",
        "evidence": "user-attested-recorded-daily-receipt",
    },
}


def user_confirmed_provider_day(day, provider, existing):
    item = ATTESTATIONS.get((day, provider))
    if item is None or existing is None or isinstance(existing, bool):
        return None
    try:
        value = Decimal(str(existing))
    except (InvalidOperation, TypeError, ValueError):
        return None
    if not value.is_finite() or value != item["approvedUsd"]:
        return None
    return {
        "amountUsd": float(value),
        "provenance": item["evidence"],
        "approvedOn": item["approvedOn"],
    }
