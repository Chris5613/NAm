"""One-time, reversible recovery of Kryptex daily mining rewards.

The user supplied Kryptex's dated BTC reward chart for 2026-11-01..06.
Each tooltip states the reward for that calendar day (not the USD account
balance). USD is valued at that day's BTC/USD UTC close from Yahoo Finance's
BTC-USD historical daily series. The precise BTC reward is retained alongside
the approximate USD valuation so future BTC prices never revalue income.

This migration never derives mining rewards from changes in USD holdings.
It runs at most once for the confirmed account and stores a full pre-edit
tracker backup in settings before changing anything.
"""
from copy import deepcopy
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone

from sqlalchemy import select

from .db import SessionLocal
from .models import Setting, User

_TARGET_USER_ID = 1
_TRACKER = "project_income_kryptex_tracker_v1"
_BACKUP = "kryptex_recovery_backup_2026_11_01_06_v1"
_AUDIT = "kryptex_recovery_verified_2026_11_01_06_v1"
# Exact BTC rewards transcribed from the six dated Kryptex screenshots.
# Prices are BTC-USD USD daily closes on the respective UTC date (Yahoo Finance).
_VERIFIED_REWARDS = {
    "2026-11-01": (452, "78248.45"),
    "2026-11-02": (1232, "76677.30"),
    "2026-11-03": (1890, "77345.05"),
    "2026-11-04": (3471, "80405.29"),
    "2026-11-05": (5098, "75942.13"),
    "2026-11-06": (5490, "75746.93"),
}
_CENTI_MICRO = Decimal("0.00000001")


def _setting(db, key):
    return db.scalar(
        select(Setting).where(
            Setting.user_id == _TARGET_USER_ID, Setting.key == key
        )
    )


def _quantize(value):
    return Decimal(str(value)).quantize(_CENTI_MICRO, rounding=ROUND_HALF_UP)


def build_verified_kryptex_recovery(tracker):
    """Return the corrected tracker and an auditable record (no I/O)."""
    next_tracker = deepcopy(tracker)
    daily = dict(next_tracker.get("kryptexMiningDaily") or {})
    confirmed = dict(next_tracker.get("kryptexConfirmedDays") or {})
    before_total = sum(
        (_quantize(amount) for day, amount in daily.items() if confirmed.get(day)),
        Decimal("0"),
    )
    audit_rows = {}
    for day, (sats, close_usd) in _VERIFIED_REWARDS.items():
        exact_btc = Decimal(sats) / Decimal(100_000_000)
        usd_at_close = (exact_btc * Decimal(close_usd)).quantize(
            _CENTI_MICRO, rounding=ROUND_HALF_UP
        )
        existing = _quantize(daily.get(day) or 0) if confirmed.get(day) else Decimal("0")
        accepted = max(existing, usd_at_close)
        daily[day] = float(accepted)
        confirmed[day] = True
        audit_rows[day] = {
            "minedSats": sats,
            "minedBtc": format(exact_btc, ".8f"),
            "btcUsdDailyUtcClose": close_usd,
            "usdAtHistoricalClose": float(usd_at_close),
            "previousConfirmedUsd": float(existing),
            "restoredUsd": float(accepted - existing),
            "acceptedUsd": float(accepted),
        }

    after_total = sum(
        (_quantize(amount) for day, amount in daily.items() if confirmed.get(day)),
        Decimal("0"),
    )
    delta = after_total - before_total
    months = dict(next_tracker.get("monthlyEarnings") or {})
    november = sum(
        (_quantize(amount) for day, amount in daily.items()
         if str(day).startswith("2026-11-") and confirmed.get(day)),
        Decimal("0"),
    )
    months["2026-11"] = float(november)
    next_tracker["kryptexMiningDaily"] = daily
    next_tracker["kryptexConfirmedDays"] = confirmed
    next_tracker["monthlyEarnings"] = months
    if next_tracker.get("lifetimeEarnedUsd") is not None:
        next_tracker["lifetimeEarnedUsd"] = float(
            _quantize(next_tracker["lifetimeEarnedUsd"]) + delta
        )
    audit = {
        "period": "2026-11-01/2026-11-06",
        "source": "user supplied six dated Kryptex BTC reward chart screenshots",
        "usdValuation": "BTC-USD historical daily UTC close, Yahoo Finance",
        "pricingDisclaimer": "Historical closing USD estimate, not a live BTC mark-to-market",
        "days": audit_rows,
        "totalAddedUsd": float(delta),
        "novemberConfirmedUsd": float(november),
    }
    return next_tracker, audit


def recover_verified_kryptex_november_rewards():
    """Idempotent, account-specific backfill with backup and provenance.

    Do not run on other accounts or fresh installs. Lock the user row to
    serialize against the Kryptex machine ingestion endpoint.
    """
    with SessionLocal() as db:
        user = db.scalar(
            select(User).where(User.id == _TARGET_USER_ID).with_for_update()
        )
        if user is None or _setting(db, _AUDIT) is not None:
            return False
        existing = _setting(db, _TRACKER)
        if not existing or not isinstance(existing.value, dict):
            return False
        original = deepcopy(existing.value)
        daily = original.get("kryptexMiningDaily")
        if not isinstance(daily, dict) or not any(
            str(day).startswith("2026-11-07") for day in daily
        ):
            # Avoid applying a user-specific recovery to an unrelated dataset.
            return False
        corrected, audit = build_verified_kryptex_recovery(original)
        backup = _setting(db, _BACKUP)
        if backup is None:
            db.add(Setting(user_id=_TARGET_USER_ID, key=_BACKUP, value=original))
        # Preserve any backup already present, including from an interrupted run.
        existing.value = corrected
        audit["appliedAt"] = datetime.now(timezone.utc).isoformat()
        db.add(Setting(user_id=_TARGET_USER_ID, key=_AUDIT, value=audit))
        db.commit()
        return True
