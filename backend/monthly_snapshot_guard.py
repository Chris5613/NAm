"""Keep open-month extension-provider snapshots aligned with server ledgers.

A browser's current-month Project Income view can be temporarily incomplete
while its extensions hydrate. That partial view must never erase already
recorded provider income in the shared monthly accounting snapshot.

The four extension trackers remain authoritative. Lulo and Loopscale can
additionally be booked from a narrowly scoped, explicitly user-attested dated
receipt ledger. Locked historical months are never rewritten.
"""
from copy import deepcopy
from math import isfinite

EXTENSION_PROVIDERS = frozenset({"Kryptex", "Salad", "RollerCoin", "Unetwork", "Bixberry"})


def _number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (ValueError, TypeError, OverflowError):
        return None
    return result if isfinite(result) else None


def _platforms(raw):
    result = {}
    if not isinstance(raw, dict):
        return result
    entries = raw.get("platforms")
    if not isinstance(entries, list):
        return result
    for item in entries:
        if not isinstance(item, dict):
            continue
        name = item.get("platform")
        amount = _number(item.get("amount"))
        if isinstance(name, str) and name and amount is not None:
            result[name] = {**item, "amount": round(amount, 6)}
    return result


def guard_monthly_snapshots(current, proposed, canonical_months, month, confirmed_legacy=None):
    """Merge a guarded browser PATCH with the backend's current provider facts.

    This is NOT a 'take the largest total' rule. Each available authoritative
    provider amount replaces a stale client amount, even when the real source
    value falls. No new dated earnings are invented.
    """
    old = deepcopy(current) if isinstance(current, dict) else {}
    if not isinstance(proposed, dict):
        return old
    saved = {**old, **deepcopy(proposed)}
    for key, record in old.items():
        if isinstance(record, dict) and record.get("locked") and key <= month:
            saved[key] = deepcopy(record)
    if isinstance(old.get(month), dict) and old[month].get("locked"):
        return saved

    authoritative = {}
    if isinstance(canonical_months, list):
        for row in canonical_months:
            if not isinstance(row, dict) or row.get("monthKey") != month:
                continue
            authoritative = {name: item for name, item in _platforms(row).items()
                             if name in EXTENSION_PROVIDERS}
            break
    # An account-owner confirmation is provided by the backend after checking
    # the actual dated-source fingerprint. Never accept browser-supplied totals.
    accepted = {}
    for name, amount in (confirmed_legacy or {}).items():
        parsed = _number(amount)
        if name in {"Lulo", "Loopscale"} and parsed is not None and parsed >= 0:
            accepted[name] = {"platform": name, "amount": round(parsed, 6),
                              "basis": "user-confirmed-dated-receipts"}
    authoritative.update(accepted)

    previous = old.get(month)
    candidate = saved.get(month)
    if not isinstance(candidate, dict):
        candidate = {}
    if not authoritative and not isinstance(previous, dict):
        return saved

    # Use the freshest browser values for non-extension projects (their signed
    # P/L may fall). For extension providers without backend evidence, retain
    # the older recorded amount instead of accepting a partial tab refresh.
    combined = _platforms(previous)
    combined.update(_platforms(candidate))
    for name in EXTENSION_PROVIDERS:
        if name in authoritative:
            combined[name] = authoritative[name]
        elif name in _platforms(previous):
            combined[name] = _platforms(previous)[name]
    for name, confirmed in accepted.items():
        combined[name] = confirmed
    rows = sorted(combined.values(), key=lambda item: (-item["amount"], item["platform"]))
    saved[month] = {
        **(previous if isinstance(previous, dict) else {}),
        **candidate,
        "monthKey": month,
        "platforms": rows,
        "total": round(sum(item["amount"] for item in rows), 6),
        "locked": False,
        "lockedAt": None,
    }
    return saved
