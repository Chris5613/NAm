"""Side-effect-free port of Lulo interest transaction reconciliation.

Matches applyLuloYieldSnapshot's cash-flow and implausible-interest guards.
The migration stores these as comparison previews: it NEVER changes a user's
live Project row or ProjectTransaction without historical parity verification.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from .yield_earnings_ledger import as_float, pacific_day, parse_time

MIN_CASH_FLOW_USD = 10


def elapsed_days(from_time: Any, to: datetime) -> float:
    before = parse_time(from_time)
    if before is None or to <= before:
        return 0
    return (to - before).total_seconds() / 86400


def expected_yield(balance: float, apy: float, days: float) -> float:
    return max(0, balance) * (max(0, apy) / 100) * (max(0, days) / 365)


def interest_limit(balance: float, apy: float, days: float) -> float:
    return max(2, expected_yield(balance, apy, days) * 8 + 0.25)


def sanitize_transactions(rows: Any, balance: float, apy: float,
                          now: datetime) -> tuple[list[dict], float]:
    """Remove only proven impossible Lulo interest artifacts.

    Other user transactions, withdrawals, and manual adjustments are
    preserved exactly, including their original metadata and ordering.
    """
    transactions = []
    ignored = 0.0
    for raw in rows if isinstance(rows, list) else []:
        if not isinstance(raw, dict) or raw.get("source") != "lulo_yield":
            transactions.append(deepcopy(raw))
            continue
        amount = as_float(raw.get("amount"))
        if amount <= 0:
            transactions.append(deepcopy(raw))
            continue
        interest_from = as_float(raw.get("interest_from_usd"), None)
        interest_to = as_float(raw.get("interest_to_usd"), None)
        delta = interest_to - interest_from if interest_from is not None and interest_to is not None else 0
        days = elapsed_days(
            raw.get("sync_from"),
            parse_time(raw.get("sync_to") or raw.get("updated_at") or raw.get("created_at")) or now,
        )
        if days <= 0:
            transactions.append(deepcopy(raw))
            continue
        max_delta = interest_limit(balance, apy, days)
        matches = delta > 0 and abs(delta - amount) <= max(.05, amount * .05)
        if amount > max_delta and matches:
            ignored += amount
            continue
        transactions.append(deepcopy(raw))
    return transactions, round(ignored, 8)


def reconcile_lulo_project(project: dict, snapshot: dict,
                           now: datetime | None = None) -> dict:
    """Propose project accounting updates, without persisting anything."""
    if project.get("yield_tracking") != "lulo_lending":
        return deepcopy(project)
    raw_total = as_float(snapshot.get("totalBalanceUsd"), None)
    if raw_total is None or raw_total < 0:
        return deepcopy(project)
    incoming_time = parse_time(snapshot.get("syncedAt"))
    if incoming_time is None:
        return deepcopy(project)
    # Server polls may be older than the last successful browser update.
    prior_synced = parse_time(project.get("lulo_last_synced_at"))
    if prior_synced and incoming_time <= prior_synced:
        return deepcopy(project)
    now = incoming_time if now is None else now
    now_iso = now.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    day = pacific_day(now)
    apy = as_float(snapshot.get("weightedApy")) or as_float(project.get("lulo_weighted_apy"))
    balance = max(0.0, raw_total)
    old_balance = as_float(
        project.get("lulo_last_balance_usd", project.get("lulo_total_balance_usd")), None
    )
    has_balance = old_balance is not None and old_balance >= 0
    transactions, sanitized_artifacts = sanitize_transactions(
        project.get("transactions"),
        max(balance, old_balance if has_balance else 0),
        apy, now,
    )
    raw_interest = as_float(snapshot.get("totalInterestEarnedUsd"), None)
    valid_interest = raw_interest is not None and raw_interest >= 0
    old_offset = as_float(project.get("lulo_interest_offset_usd"))
    interest_offset = old_offset + sanitized_artifacts
    prior_raw = as_float(project.get("lulo_last_raw_interest_usd"), None)
    has_prior_raw = prior_raw is not None and prior_raw >= 0
    old_normalized = as_float(project.get("lulo_last_interest_usd"), None)
    if has_prior_raw:
        before_normalized = max(0, prior_raw - old_offset)
    elif old_normalized is not None:
        before_normalized = max(0, old_normalized - sanitized_artifacts)
    else:
        before_normalized = 0
    detected_artifact = 0.0

    if valid_interest and has_prior_raw:
        delta_raw = raw_interest - prior_raw
        delta_balance = balance - old_balance if has_balance else 0
        days = max(elapsed_days(project.get("lulo_last_synced_at"), now), 1 / 1440)
        reference = (old_balance + balance) / 2 if has_balance else balance
        expected = expected_yield(reference, apy, days)
        normal_limit = interest_limit(reference, apy, days)
        threshold = max(MIN_CASH_FLOW_USD, max(reference, 0) * .0025)
        withdrawal = delta_balance < -threshold
        deposit = delta_balance > threshold
        if withdrawal and delta_raw > normal_limit:
            plausible = max(0, expected * 1.5)
            detected_artifact = max(0, delta_raw - plausible)
            interest_offset += detected_artifact
        if deposit and delta_raw < -normal_limit:
            interest_offset += delta_raw
            detected_artifact += abs(delta_raw)

    current_normalized = (
        max(0, raw_interest - interest_offset) if valid_interest
        else before_normalized
    )
    if valid_interest:
        days = max(elapsed_days(project.get("lulo_last_synced_at"), now), 1 / 1440)
        reference = max(balance, old_balance if has_balance else 0)
        limit = interest_limit(reference, apy, days)
        delta = current_normalized - before_normalized
        if delta > limit * 2:
            interest_offset += delta
            detected_artifact += delta
            current_normalized = before_normalized

    initial_earned = (
        as_float(project.get("lulo_initial_earned"), None)
        if project.get("lulo_initial_earned") is not None
        else None
    )
    if initial_earned is None:
        initial_earned = before_normalized

    interest_delta = round(max(0, current_normalized - before_normalized), 6)
    if interest_delta > 0:
        existing_index = next((
            index for index, transaction in enumerate(transactions)
            if isinstance(transaction, dict) and
            transaction.get("source") == "lulo_yield" and
            transaction.get("source_date") == day
        ), None)
        if existing_index is not None:
            prior = transactions[existing_index]
            transactions[existing_index] = {
                **prior,
                "amount": round(as_float(prior.get("amount")) + interest_delta, 6),
                "interest_to_usd": current_normalized,
                "raw_interest_to_usd": raw_interest if valid_interest else None,
                "sync_to": now_iso,
            }
        else:
            transactions.append({
                "type": "earning", "amount": interest_delta,
                "category": "Lulo Lending", "notes": f"Lulo interest ({day})",
                "date": day, "source": "lulo_yield", "source_date": day,
                "interest_from_usd": before_normalized,
                "interest_to_usd": current_normalized,
                "raw_interest_to_usd": raw_interest if valid_interest else None,
                "sync_from": project.get("lulo_last_synced_at"), "sync_to": now_iso,
            })

    tracked = initial_earned + sum(
        as_float(row.get("amount"))
        for row in transactions
        if isinstance(row, dict) and row.get("source") == "lulo_yield"
    )
    configured_invested = as_float(project.get("invested"))
    invested = (
        configured_invested if project.get("lulo_balance_model") == "multi_token_v2" and
        configured_invested > 0
        else max(0, balance - current_normalized)
    )
    ignored_this_sync = sanitized_artifacts + detected_artifact
    def snap_number(name: str) -> float:
        return as_float(snapshot.get(name))

    return {
        **deepcopy(project),
        "invested": invested, "lulo_balance_model": "multi_token_v2",
        "transactions": transactions, "lulo_initial_earned": initial_earned,
        "earned": tracked,
        "lulo_total_balance_usd": balance, "lulo_last_balance_usd": balance,
        "lulo_regular_balance_usd": snap_number("regularBalanceUsd"),
        "lulo_protected_balance_usd": snap_number("protectedBalanceUsd"),
        "lulo_usdc_balance_usd": snap_number("usdcBalanceUsd"),
        "lulo_usds_balance_usd": snap_number("usdsBalanceUsd"),
        "lulo_usds_apy": snap_number("usdsApy"),
        "lulo_regular_apy": snap_number("regularApy"),
        "lulo_protected_apy": snap_number("protectedApy"),
        "lulo_weighted_apy": apy,
        "lulo_daily_performance": deepcopy(snapshot.get("dailyPerformance") or []),
        "lulo_five_day_average_usd": snap_number("fiveDayAverageUsd"),
        "lulo_lifetime_interest_usd": current_normalized,
        "lulo_last_interest_usd": current_normalized,
        "lulo_last_raw_interest_usd": raw_interest if valid_interest
        else as_float(project.get("lulo_last_raw_interest_usd")),
        "lulo_interest_offset_usd": round(interest_offset, 8),
        "lulo_ignored_interest_artifact_usd": round(
            as_float(project.get("lulo_ignored_interest_artifact_usd")) + ignored_this_sync, 8
        ),
        "lulo_last_cash_flow_at": now_iso if ignored_this_sync > .000001
        else project.get("lulo_last_cash_flow_at"),
        "lulo_last_synced_at": now_iso,
    }
