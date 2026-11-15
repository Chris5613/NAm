"""Guard legacy browser settings writes against Kryptex reward data loss.

Modern machine ingestion owns account-wide Kryptex readings. Old browser
versions can still send a full tracker via PATCH /api/settings/<key>; those
requests must never erase previously confirmed dated rewards, BTC satoshi
evidence, or live machine telemetry.
"""
from copy import deepcopy
from math import isfinite

from .kryptex_earnings_audit import recognize_mined_satoshi_increment


def _nonnegative(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if isfinite(number) and number >= 0 else None


def _merge_high_water(previous, incoming):
    merged = dict(previous) if isinstance(previous, dict) else {}
    if not isinstance(incoming, dict):
        return merged
    for day, raw in incoming.items():
        if not isinstance(day, str) or len(day) != 10 or day[4:5] != "-" or day[7:8] != "-":
            continue
        value = _nonnegative(raw)
        if value is None:
            continue
        prior = _nonnegative(merged.get(day))
        merged[day] = max(value, prior or 0)
    return merged


def merge_legacy_kryptex_setting(current, proposed):
    """Merge an old-client tracker update; preserve all server-owned evidence.

    Used only for the legacy generic-settings path, never for the canonical
    machine-ingest handler. Does not manufacture extra rewards from BTC balance.
    """
    if not isinstance(proposed, dict):
        return deepcopy(current) if isinstance(current, dict) else proposed
    if not isinstance(current, dict):
        return deepcopy(proposed)

    result = {**deepcopy(current), **deepcopy(proposed)}
    previous_usd = current.get("kryptexMiningDaily") or {}
    previous_confirmed = current.get("kryptexConfirmedDays") or {}
    new_usd = proposed.get("kryptexMiningDaily") or {}
    new_confirmed = proposed.get("kryptexConfirmedDays") or {}

    confirmed = dict(previous_confirmed)
    for day, checked in new_confirmed.items():
        if checked is True:
            confirmed[day] = True

    old_sats = current.get("kryptexMiningSatsDaily") or {}
    merged_sats = _merge_high_water(
        old_sats, proposed.get("kryptexMiningSatsDaily")
    )
    # Backend-owned credited counters mark which observed sats have already
    # contributed to the USD ledger; stale legacy clients cannot reset them.
    credited = dict(current.get("kryptexIncomeCreditedSatsDaily") or {})
    for day, amount in old_sats.items():
        if day not in credited and previous_confirmed.get(day) and (_nonnegative(previous_usd.get(day)) or 0) > 0:
            credited[day] = amount
    daily = dict(previous_usd)
    for day, raw in new_usd.items():
        if not confirmed.get(day):
            continue
        value = _nonnegative(raw)
        if value is None:
            continue
        prior_usd = _nonnegative(daily.get(day)) or 0
        prior_credited = credited.get(day)
        daily[day] = recognize_mined_satoshi_increment(
            prior_usd, prior_credited, merged_sats.get(day), value
        )
        if value > 0 and (_nonnegative(merged_sats.get(day)) or 0) > 0:
            credited[day] = max(
                _nonnegative(prior_credited) or 0,
                _nonnegative(merged_sats[day]) or 0,
            )

    result["kryptexMiningDaily"] = daily
    result["kryptexConfirmedDays"] = confirmed
    result["kryptexMiningSatsDaily"] = merged_sats
    result["kryptexIncomeCreditedSatsDaily"] = credited

    monthly = {
        **(current.get("monthlyEarnings") or {}),
        **(proposed.get("monthlyEarnings") or {}),
    }
    months = {day[:7] for day in daily if confirmed.get(day) and isinstance(day, str)}
    for month in months:
        monthly[month] = round(sum(
            _nonnegative(amount) or 0
            for day, amount in daily.items()
            if isinstance(day, str) and day.startswith(month + "-") and confirmed.get(day)
        ), 8)
    result["monthlyEarnings"] = monthly

    before = sum((_nonnegative(amount) or 0) for day, amount in previous_usd.items()
                 if previous_confirmed.get(day))
    after = sum((_nonnegative(amount) or 0) for day, amount in daily.items()
                if confirmed.get(day))
    base_lifetime = _nonnegative(current.get("lifetimeEarnedUsd")) or 0
    incoming_lifetime = _nonnegative(proposed.get("lifetimeEarnedUsd")) or 0
    result["lifetimeEarnedUsd"] = round(
        max(base_lifetime + max(0, after-before), incoming_lifetime), 8
    )

    result["kryptexPendingEarningsDays"] = sorted(
        day for day, amount in merged_sats.items()
        if isinstance(day, str) and (_nonnegative(amount) or 0) > 0
        and (
            not (confirmed.get(day) and (_nonnegative(daily.get(day)) or 0) > 0)
            or (_nonnegative(amount) or 0) > (_nonnegative(credited.get(day)) or 0) + 0.000001
        )
    )

    previous_chart_sync = str(current.get("kryptexLastChartSyncAt") or "")
    proposed_chart_sync = str(proposed.get("kryptexLastChartSyncAt") or "")
    result["kryptexLastChartSyncAt"] = max(previous_chart_sync, proposed_chart_sync) or None

    # Modern machine telemetry is authoritative when it has ever been
    # ingested. An old extension must not replace aggregate rate/balance
    # with a single PC's raw status.
    if "activeMachineCount" in current:
        for key in (
            "activeMachineCount", "currentBalance", "lastBalance",
            "withdrawableUsd", "profitabilityUsdDay", "miners",
            "reachable", "lastSyncedAt",
        ):
            if key in current:
                result[key] = deepcopy(current[key])

    return result
