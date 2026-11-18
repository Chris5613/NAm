"""Canonical provider balance observations used by project-tracking.

The browser can trigger a refresh but may not substitute a calculated
balance for four extension providers. The provider tracker stored in
PostgreSQL owns balance, quantity, source timestamp and price attribution.
"""
from math import isfinite

PROVIDER_TRACKERS = {
    "kryptex-project": "project_income_kryptex_tracker_v1",
    "salad-project": "project_income_salad_tracker_v1",
    "bixberry-project": "project_income_bixberry_tracker_v1",
    "unetwork-project": "project_income_unetwork_tracker_v1",
    "rollercoin-project": "project_income_rollercoin_tracker_v2",
}


def nonnegative(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        amount = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return amount if isfinite(amount) and amount >= 0 else None


def from_tracker(item, trackers):
    """Return a validated provider reading, or None if tracker unavailable.

    Do not turn absent tracker evidence into a fake zero. An existing source
    row remains available via the caller's earlier accepted feed.
    """
    project_id = str(item.get("id") or "")
    if project_id not in PROVIDER_TRACKERS:
        return item  # Lulo/Loopscale and non-extension project adapters.

    tracker = trackers.get(project_id)
    if not isinstance(tracker, dict):
        return None

    if project_id == "rollercoin-project":
        balance_trx = nonnegative(tracker.get("currentTrxBalance"))
        price = nonnegative(tracker.get("lastTrxPrice"))
        synced_at = tracker.get("balanceSyncedAt") or tracker.get("lastSyncedAt")
        if balance_trx is None or price is None or price <= 0 or not synced_at:
            return None
        derived = {
            "balanceUsd": round(balance_trx * price, 8),
            "balanceTrx": balance_trx,
            "trxUsdPrice": price,
            "sourceLastSyncedAt": synced_at,
        }
    else:
        balance = nonnegative(tracker.get("currentBalance"))
        synced_at = tracker.get("lastSyncedAt")
        if balance is None or not synced_at:
            return None
        derived = {"balanceUsd": balance, "sourceLastSyncedAt": synced_at}

    return {
        **item,
        **derived,
        "requiresLiveSync": True,
        "balanceSource": "backend-provider-tracker",
    }
