"""Conflict-safe merge of read-only Lulo/Loopscale poll observations.

Used only while the caller holds the same PostgreSQL per-user row lock as
project PATCH and registered-wallet updates. No project/transaction write occurs.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from math import isfinite
from typing import Any


def _parsed_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if timestamp.tzinfo is None:
            return None
        return timestamp.astimezone(timezone.utc)
    except (OverflowError, TypeError, ValueError):
        return None


def _finite_amount(value: Any, *, allow_zero: bool, allow_negative: bool = False) -> bool:
    """Fail closed on malformed provider money; negative P&L is legitimate."""
    if value is None or isinstance(value, bool):
        return False
    try:
        amount = float(value)
    except (TypeError, ValueError, OverflowError):
        return False
    return isfinite(amount) and (allow_negative or (amount >= 0 if allow_zero else amount > 0))


def _is_valid_new_reading(candidate: Any, old: Any, checked_at: datetime, wallet: str | None = None) -> bool:
    if not isinstance(candidate, dict):
        return False
    if wallet is not None and candidate.get("walletAddress") != wallet:
        return False
    observed = _parsed_time(candidate.get("syncedAt"))
    if observed is None or observed > checked_at + timedelta(minutes=3):
        return False
    older = _parsed_time(old.get("syncedAt")) if isinstance(old, dict) else None
    return older is None or observed > older


def _invalid_provider_reading(candidate: Any, checked_at: datetime, wallet: str, *, provider: str) -> bool:
    """Report corrupt readings; ordinary same/older source timestamps are replays."""
    if not isinstance(candidate, dict) or candidate.get("walletAddress") != wallet:
        return True
    observed = _parsed_time(candidate.get("syncedAt"))
    if observed is None or observed > checked_at + timedelta(minutes=3):
        return True
    if provider == "lulo":
        return not (
            _finite_amount(candidate.get("totalBalanceUsd"), allow_zero=False)
            and _finite_amount(candidate.get("totalInterestEarnedUsd"), allow_zero=True, allow_negative=True)
        )
    return not (
        _finite_amount(candidate.get("positionValueUsd"), allow_zero=True)
        and _finite_amount(candidate.get("pnlUsd"), allow_zero=True, allow_negative=True)
    )


def merge_poll_observations(
    existing: Any, *, checked_at: str, lulo: dict,
    loopscale: dict | None, loopscale_wallet: str | None, errors: dict,
) -> tuple[dict, dict]:
    """Merge each provider's newer snapshot, without regressing other data.

    An earlier poll may finish after a later, failed poll. Its valid successful
    source readings may still advance that provider, but must not overwrite
    the later poll's checkedAt/error reporting. Exact observation replays are
    not admitted to history again. Input mappings are never mutated.
    """
    check_time = _parsed_time(checked_at)
    if check_time is None:
        raise ValueError("Poll checkedAt must be a timezone-aware ISO timestamp")
    if not isinstance(lulo, dict) or not isinstance(errors, dict):
        raise ValueError("Poll results must be mappings")

    saved = deepcopy(existing) if isinstance(existing, dict) else {}
    old_check = _parsed_time(saved.get("checkedAt"))
    effective_errors = deepcopy(errors)

    lulo_current = saved.get("lulo")
    updated_lulo = deepcopy(lulo_current) if isinstance(lulo_current, dict) else {}
    accepted_lulo = []
    for wallet, candidate in lulo.items():
        if not isinstance(wallet, str):
            continue
        if (_is_valid_new_reading(candidate, updated_lulo.get(wallet), check_time, wallet)
                and _finite_amount(candidate.get("totalBalanceUsd"), allow_zero=False)
                and _finite_amount(candidate.get("totalInterestEarnedUsd"),
                                   allow_zero=True, allow_negative=True)):
            updated_lulo[wallet] = deepcopy(candidate)
            accepted_lulo.append(wallet)
        elif _invalid_provider_reading(candidate, check_time, wallet, provider="lulo"):
            effective_errors.setdefault("lulo:" + wallet, "InvalidSnapshot")
    saved["lulo"] = updated_lulo

    previous_loop = saved.get("loopscale")
    loop_accepted = (
        _is_valid_new_reading(loopscale, previous_loop, check_time, loopscale_wallet)
        and _finite_amount(loopscale.get("positionValueUsd"), allow_zero=True)
        and _finite_amount(loopscale.get("pnlUsd"), allow_zero=True, allow_negative=True)
        if loopscale and loopscale_wallet else False
    )
    if loop_accepted:
        saved["loopscale"] = deepcopy(loopscale)
    elif loopscale is not None and loopscale_wallet and _invalid_provider_reading(
        loopscale, check_time, loopscale_wallet, provider="loopscale"
    ):
        effective_errors.setdefault("loopscale", "InvalidSnapshot")

    if old_check is None or check_time > old_check:
        saved["checkedAt"] = checked_at
        saved["errors"] = effective_errors

    if accepted_lulo or loop_accepted:
        previous_success = _parsed_time(saved.get("successfulAt"))
        if previous_success is None or check_time > previous_success:
            saved["successfulAt"] = checked_at

    return saved, {"lulo": accepted_lulo, "loopscale": loop_accepted}


def same_wallet_registration(initial: Any, current: Any) -> bool:
    """Only commit provider reads for the exact wallet registration revision.

    The revision catches change-and-change-back even when timestamps tie.
    Legacy registrations with no revision remain comparable until edited.
    """
    if not isinstance(initial, dict) or not isinstance(current, dict):
        return False
    return (
        initial.get("lulo", []) == current.get("lulo", [])
        and initial.get("loopscale") == current.get("loopscale")
        and initial.get("revision") == current.get("revision")
        and initial.get("updatedAt") == current.get("updatedAt")
    )


def filter_registered_source_snapshots(existing: Any, wallets: dict) -> dict:
    """Remove obsolete *live cache* readings after a wallet registration change.

    This never removes historical observations, immutable cutover backups, or
    backend shadow accounting ledgers. Health timestamps/errors are reset so
    an old provider success cannot masquerade as a post-registration poll.
    Called under the same per-user database lock as scheduled workers.
    """
    prior = deepcopy(existing) if isinstance(existing, dict) else {}
    permitted = set(wallets.get("lulo") or [])
    lulo = prior.get("lulo")
    new_lulo = {
        wallet: deepcopy(snapshot)
        for wallet, snapshot in (lulo.items() if isinstance(lulo, dict) else [])
        if wallet in permitted and isinstance(snapshot, dict) and
        snapshot.get("walletAddress") == wallet
    }
    new_loop_wallet = wallets.get("loopscale")
    loop = prior.get("loopscale")
    new_loop = (deepcopy(loop) if new_loop_wallet and isinstance(loop, dict)
                and loop.get("walletAddress") == new_loop_wallet else None)
    return {
        **prior, "lulo": new_lulo, "loopscale": new_loop,
        "checkedAt": None, "successfulAt": None, "errors": {},
    }
