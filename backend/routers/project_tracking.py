"""Authenticated project balance ingestion, validation and recovery candidates.

Readings are reference data, not independently verified rewards. Currency-price
moves and transfers must never be silently recorded as mining earnings.
"""
from datetime import datetime, timezone
import re
from math import isfinite
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Setting, User, Wallet
from ..project_accounting import portfolio_summary, daily_income_summary, monotonic_daily_sources
from ..earnings_dashboard import (
    build_backend_earnings_dashboard, compare_monthly_snapshot,
    TRACKERS as DASHBOARD_TRACKERS,
)
from ..hardware_credit_audit import hardware_credit_audit
from ..hardware_payback_lifetime import build_lifetime_hardware_payback
from ..project_freshness import is_project_stale
from ..project_feed_sources import PROVIDER_TRACKERS, from_tracker
from ..crypto_dashboard_snapshot import crypto_dashboard_snapshot
from ..bitcoin_valuation import wallet_evidence, combine_crypto_valuation
from ..provider_stats import current_keys, provider_stats
from ..provider_monthly_income import monthly_provider_income
from ..financial_core import evaluate_statement, calculate_net_worth, auto_income_journal
from ..monthly_snapshot_guard import guard_monthly_snapshots
from ..legacy_income_reconciliation import confirmed_november_sources
from ..lifetime_income import lifetime_earned_from_snapshots
from ..integration_audit import audit_integration_settings
from ..kryptex_earnings_audit import reconcile_kryptex_rewards, audit_kryptex_days

router = APIRouter(prefix="/api/project-tracking", tags=["project tracking"])
LATEST_KEY = "yield_project_latest_balance_feed_v1"
ALERT_KEY = "yield_project_sync_alerts_v1"
BACKUP_PREFIX = "yield_project_balance_backup_"
KRYPTEX_MACHINES_KEY = "yield_kryptex_machine_snapshots_v1"
KRYPTEX_TRACKER_KEY = "project_income_kryptex_tracker_v1"
KRYPTEX_MACHINE_STALE_SECONDS = 5 * 60
KRYPTEX_MACHINE_RETENTION_SECONDS = 24 * 60 * 60


def setting(db: Session, uid: int, key: str) -> Any:
    row = db.scalar(select(Setting).where(Setting.user_id == uid, Setting.key == key))
    return row.value if row else None


def save_setting(db: Session, uid: int, key: str, value: Any) -> None:
    row = db.scalar(select(Setting).where(Setting.user_id == uid, Setting.key == key))
    if row is None:
        db.add(Setting(user_id=uid, key=key, value=value))
    else:
        row.value = value


def timestamp(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    except (TypeError, ValueError):
        return None


def number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if isfinite(result) else None
    except (ValueError, TypeError):
        return None


def validate_item(item: dict, old: dict | None, now: datetime) -> dict | None:
    project_id = str(item.get("id") or "")[:128]
    if not project_id:
        return None
    prior = old or {}
    synced_at = timestamp(item.get("sourceLastSyncedAt"))
    prior_synced_at = timestamp(prior.get("sourceLastSyncedAt"))
    balance = number(item.get("balanceUsd"))
    # Reject a missing, future-dated, or regressed source reading, but keep
    # existing last good data. Zero is legitimate only with a fresh reading.
    if balance is None or balance < 0 or (
        synced_at and synced_at > now
    ) or (prior_synced_at and (synced_at is None or synced_at < prior_synced_at)):
        return prior or None
    if balance == 0 and synced_at is None and number(prior.get("balanceUsd")) not in (None, 0):
        return prior
    # Identical source timestamps carry no new provider observation. Ignore
    # changed amounts from stale tabs, while still accepting deliberate
    # inactive/active metadata edits and repricing verified RollerCoin TRX.
    if prior_synced_at and synced_at == prior_synced_at:
        prior_balance = number(prior.get("balanceUsd"))
        if prior_balance is not None and abs(balance - prior_balance) > 0.00000001:
            prev_trx = number(prior.get("balanceTrx"))
            next_trx = number(item.get("balanceTrx"))
            next_price = number(item.get("trxUsdPrice"))
            price_only = (
                project_id == "rollercoin-project" and
                prev_trx is not None and next_trx is not None and
                abs(prev_trx - next_trx) < 0.00000001 and
                next_price is not None and next_price > 0
            )
            balance = round(next_trx * next_price, 8) if price_only else prior_balance
    normalized = {
        "id": project_id,
        "name": str(item.get("name") or project_id)[:128],
        "balanceUsd": balance,
        "inactive": bool(item.get("inactive", False)),
        "sourceLastSyncedAt": synced_at.isoformat() if synced_at else None,
        "observedAt": now.isoformat(),
        "requiresLiveSync": bool(item.get("requiresLiveSync", False)),
        "stale": False,  # Recompute after normalizing inactive/source metadata.
    }
    for attr in ("balanceTrx", "trxUsdPrice", "lifetimeEarnedUsd"):
        val = number(item.get(attr))
        if val is not None and val >= 0:
            normalized[attr] = val
    assets = item.get("assetBalances")
    if isinstance(assets, list):
        normalized["assetBalances"] = [
            {
                "symbol": str(a.get("symbol") or "")[:32],
                "amount": number(a.get("amount")),
                "balanceUsd": number(a.get("balanceUsd")),
            }
            for a in assets[:100] if isinstance(a, dict)
        ]
    normalized["stale"] = is_project_stale(normalized, now)
    normalized["balanceSource"] = str(item.get("balanceSource") or "validated-project-observation")[:64]
    return normalized


def _kryptex_miners(raw: Any) -> list[dict]:
    if not isinstance(raw, list):
        return []
    cleaned = []
    numeric_fields = (
        "hashrate", "profitability_usd_day", "accepted_shares", "rejected_shares",
        "temperature_c", "power_w", "fan_percent",
    )
    text_fields = ("device", "device_type", "miner", "coin", "algorithm", "state")
    for item in raw[:128]:
        if not isinstance(item, dict):
            continue
        row: dict[str, Any] = {}
        for field in text_fields:
            if item.get(field) is not None:
                row[field] = str(item.get(field))[:160]
        for field in numeric_fields:
            value = number(item.get(field))
            if value is not None:
                row[field] = value
        cleaned.append(row)
    return cleaned


def _kryptex_machine_record(payload: dict, now: datetime) -> tuple[str, dict, dict]:
    machine = payload.get("machine") if isinstance(payload.get("machine"), dict) else {}
    machine_id = str(machine.get("id") or "legacy").strip()[:128]
    if not machine_id:
        raise HTTPException(status_code=422, detail="Kryptex machine ID is required.")
    status = payload.get("status")
    if not isinstance(status, dict):
        raise HTTPException(status_code=422, detail="Kryptex status is required.")

    profitability = number(status.get("profitability_usd_day"))
    balance = number(status.get("balance_usd"))
    withdrawable = number(status.get("withdrawable_usd"))
    if profitability is None or profitability < 0:
        raise HTTPException(status_code=422, detail="Invalid Kryptex profitability.")
    if balance is not None and balance < 0:
        raise HTTPException(status_code=422, detail="Invalid Kryptex balance.")
    if withdrawable is not None and withdrawable < 0:
        raise HTTPException(status_code=422, detail="Invalid Kryptex withdrawable balance.")

    received = now.isoformat()
    record = {
        "id": machine_id,
        "name": str(machine.get("name") or "Kryptex PC")[:128],
        "serverReceivedAt": received,
        # Keep the client timestamp for diagnostics only. It never determines
        # freshness, so clock skew between mining PCs cannot evict a machine.
        "clientObservedAt": str(payload.get("synced_at") or "")[:64] or None,
        "profitabilityUsdDay": profitability,
        "miners": _kryptex_miners(status.get("miners")),
    }
    account_status = {
        "balanceUsd": balance,
        "withdrawableUsd": withdrawable,
        "serverReceivedAt": received,
    }
    return machine_id, record, account_status


def _kryptex_aggregate(saved: Any, now: datetime) -> dict:
    root = saved if isinstance(saved, dict) else {}
    machines = root.get("machines") if isinstance(root.get("machines"), dict) else {}
    active = []
    for machine_id, raw in machines.items():
        if not isinstance(raw, dict):
            continue
        seen = timestamp(raw.get("serverReceivedAt"))
        if seen is None:
            continue
        age = (now - seen).total_seconds()
        if 0 <= age <= KRYPTEX_MACHINE_STALE_SECONDS:
            active.append({**raw, "id": str(machine_id)})

    active.sort(key=lambda row: str(row.get("id") or ""))
    miners = []
    for machine in active:
        for miner in machine.get("miners") or []:
            if isinstance(miner, dict):
                miners.append({
                    **miner,
                    "machine_id": machine.get("id"),
                    "machine_name": machine.get("name") or "Kryptex PC",
                })

    latest = root.get("latestAccountStatus")
    latest = latest if isinstance(latest, dict) else {}
    profitability = sum(max(0.0, number(row.get("profitabilityUsdDay")) or 0.0) for row in active)
    return {
        "status": {
            "balance_usd": max(0.0, number(latest.get("balanceUsd")) or 0.0),
            "withdrawable_usd": max(0.0, number(latest.get("withdrawableUsd")) or 0.0),
            "profitability_usd_day": round(profitability, 8),
            "miners": miners,
        },
        "machine_count": len(active),
        "machines": [
            {
                "id": row.get("id"),
                "name": row.get("name"),
                "last_seen_at": row.get("serverReceivedAt"),
                "profitability_usd_day": max(0.0, number(row.get("profitabilityUsdDay")) or 0.0),
            }
            for row in active
        ],
        "received_at": latest.get("serverReceivedAt"),
    }


@router.post("/kryptex/machine")
async def receive_kryptex_machine(
    payload: dict, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Atomically upsert one mining PC and return the server-wide aggregate."""
    now = datetime.now(timezone.utc)
    machine_id, record, account_status = _kryptex_machine_record(payload, now)

    # Multiple PCs can report at the same time. Serialize the read/merge/write
    # so one machine can never overwrite the other machine's snapshot.
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    saved = setting(db, user.id, KRYPTEX_MACHINES_KEY)
    saved = saved if isinstance(saved, dict) else {}
    existing = saved.get("machines") if isinstance(saved.get("machines"), dict) else {}
    machines = dict(existing)
    machines[machine_id] = record

    # Bound durable telemetry while keeping a useful offline history.
    retained = {}
    for key, value in machines.items():
        if not isinstance(value, dict):
            continue
        seen = timestamp(value.get("serverReceivedAt"))
        if seen is not None and 0 <= (now - seen).total_seconds() <= KRYPTEX_MACHINE_RETENTION_SECONDS:
            retained[str(key)] = value
    if len(retained) > 32:
        retained = dict(sorted(
            retained.items(),
            key=lambda item: str(item[1].get("serverReceivedAt") or ""),
            reverse=True,
        )[:32])

    next_saved = {
        "machines": retained,
        "latestAccountStatus": account_status,
        "updatedAt": now.isoformat(),
    }
    save_setting(db, user.id, KRYPTEX_MACHINES_KEY, next_saved)
    aggregate = _kryptex_aggregate(next_saved, now)

    # Preserve dated earnings/account history, but make live machine telemetry
    # server-owned so every browser receives exactly the same combined rate.
    tracker = setting(db, user.id, KRYPTEX_TRACKER_KEY)
    tracker = dict(tracker) if isinstance(tracker, dict) else {}

    # The account earnings chart is account-wide, not machine-specific. Merge
    # it here under the same lock so PC 1 and PC 2 cannot race tracker history.
    earnings = payload.get("earnings") if isinstance(payload.get("earnings"), dict) else {}
    # Dated satoshi observations are retained even when BTC conversion is
    # missing. Only positive confirmed daily USD rewards count as income.
    # Existing records never decrease when BTC/USD falls.
    # The extension's rolling hourly chart can later supply only a partial
    # reading for a historical day. Preserve the six independently verified
    # full-day satoshi rewards from the prior audited recovery.
    recovery = setting(db, user.id, "kryptex_recovery_verified_2026_11_01_06_v1")
    if isinstance(recovery, dict) and isinstance(recovery.get("days"), dict):
        sats_history = dict(tracker.get("kryptexMiningSatsDaily") or {})
        for day, row in recovery["days"].items():
            sats = number(row.get("minedSats")) if isinstance(row, dict) else None
            if sats is not None and sats >= 0:
                sats_history[day] = max(
                    sats, number(sats_history.get(day)) or 0
                )
        tracker["kryptexMiningSatsDaily"] = sats_history
    reward_reconciliation = reconcile_kryptex_rewards(tracker, earnings, now)

    tracker.update({
        "initialized": True,
        "currentBalance": aggregate["status"]["balance_usd"],
        "lastBalance": aggregate["status"]["balance_usd"],
        "withdrawableUsd": aggregate["status"]["withdrawable_usd"],
        "profitabilityUsdDay": aggregate["status"]["profitability_usd_day"],
        "miners": aggregate["status"]["miners"],
        "activeMachineCount": aggregate["machine_count"],
        "reachable": aggregate["machine_count"] > 0,
        "lastSyncedAt": now.isoformat(),
        **reward_reconciliation,
    })
    save_setting(db, user.id, KRYPTEX_TRACKER_KEY, tracker)
    db.commit()
    return {**aggregate, "tracker": tracker}


@router.get("/integration-audit")
async def project_integration_audit(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Authenticated, read-only snapshot of cross-page/provider invariants."""
    keys = (
        "project_income_kryptex_tracker_v1",
        "project_income_salad_tracker_v1",
        "project_income_rollercoin_tracker_v2",
        "project_income_unetwork_tracker_v1",
        "yield_monthly_snapshots_v1",
        "yield_backend_source_wallets_v1",
        "yield_backend_source_snapshots_v1",
        "financials_journal_v1",
        "hardware_payback_devices_v1",
        "yield_project_latest_balance_feed_v1",
        "project_income_portfolio_summary_v1",
        "networth_crypto_cache",
        "passive_income_monthly_chart_total_v1",
        "kryptex_recovery_verified_2026_11_01_06_v1",
    )
    rows = db.scalars(
        select(Setting).where(Setting.user_id == user.id, Setting.key.in_(keys))
    ).all()
    return audit_integration_settings({row.key: row.value for row in rows})


@router.get("/kryptex/earnings-audit")
async def kryptex_earnings_audit(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Read-only last-30-day health check for dated Kryptex mining rewards."""
    now = datetime.now(timezone.utc).astimezone(ZoneInfo("America/Los_Angeles")).date()
    from datetime import timedelta
    saved = setting(db, user.id, KRYPTEX_TRACKER_KEY)
    tracker = saved if isinstance(saved, dict) else {}
    rows = audit_kryptex_days(tracker, (now - timedelta(days=29)).isoformat(), now.isoformat())
    review_days = [row["date"] for row in rows if row["status"] == "needs-review"]
    return {
        "checkedThrough": now.isoformat(),
        "days": rows,
        "needsReview": review_days,
        "confirmedDays": sum(row["confirmed"] for row in rows),
        "lastChartSyncAt": tracker.get("kryptexLastChartSyncAt"),
    }


@router.get("/kryptex/aggregate")
async def read_kryptex_aggregate(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    aggregate = _kryptex_aggregate(
        setting(db, user.id, KRYPTEX_MACHINES_KEY), datetime.now(timezone.utc)
    )
    tracker = setting(db, user.id, KRYPTEX_TRACKER_KEY)
    return {**aggregate, "tracker": tracker if isinstance(tracker, dict) else {}}


@router.put("/latest")
async def receive_latest(payload: dict, user: User = Depends(current_user),
                         db: Session = Depends(get_db)) -> dict:
    now = datetime.now(timezone.utc)
    # Serialize concurrent browser tabs. Read the freshest persisted feed
    # under an account lock before merging independent source readings.
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    old = setting(db, user.id, LATEST_KEY)
    old = old if isinstance(old, dict) else {}
    previous = {str(p.get("id")): p for p in old.get("projects", [])
                if isinstance(p, dict) and p.get("id")}
    incoming = payload.get("projects")
    if not isinstance(incoming, list):
        return {"status": "ignored", "reason": "invalid projects"}
    projects = dict(previous)
    # Each extension provider has one persisted backend source. A stale tab
    # cannot override its balance by sending a locally calculated aggregate.
    trackers = {
        project_id: setting(db, user.id, tracker_key)
        for project_id, tracker_key in PROVIDER_TRACKERS.items()
    }
    for item in incoming[:100]:
        if not isinstance(item, dict):
            continue
        source_item = from_tracker(item, trackers)
        if source_item is None:
            continue
        current = validate_item(source_item, projects.get(str(item.get("id"))), now)
        if current:
            projects[current["id"]] = current
    # Re-evaluate all preserved rows, even when their next source reading has
    # not arrived. An inactive project must never appear in stale alerts.
    for project in projects.values():
        project["stale"] = is_project_stale(project, now)
    stored = {"receivedAt": now.isoformat(), "projects": list(projects.values())}
    save_setting(db, user.id, LATEST_KEY, stored)
    stale = [p["id"] for p in projects.values() if p.get("stale")]
    save_setting(db, user.id, ALERT_KEY, {
        "lastCheckedAt": now.isoformat(), "staleProjects": stale,
        "lastGoodFeedAt": now.isoformat(),
    })
    computed = portfolio_summary(list(projects.values()))
    if computed["complete"]:
        # One authoritative writer of the saved Project Income summary; no
        # browser page can replace the provider sum with a local estimate.
        value = {
            "portfolioBalance": computed["totalUsd"],
            "activePortfolioBalance": computed["activeTotalUsd"],
            "activePositions": sum(1 for p in projects.values() if not p.get("inactive")),
            "projectCount": computed["projectCount"],
            "source": "backend-project-feed",
            "updatedAt": now.isoformat(),
        }
        save_setting(db, user.id, "project_income_portfolio_summary_v1", value)
    db.commit()
    return {"status": "ok", "staleProjects": stale,
            "portfolio": computed,
            "receivedAt": now.isoformat()}


@router.put("/daily-earnings")
async def store_daily_earnings(
    payload: dict, user: User = Depends(current_user),
    db: Session = Depends(get_db)
) -> dict:
    """Persist authenticated cumulative per-source daily earnings as audit history."""
    now = datetime.now(timezone.utc)
    day = str(payload.get("date") or "")
    pacific_day = now.astimezone(ZoneInfo("America/Los_Angeles")).date().isoformat()
    if day != pacific_day or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        raise HTTPException(status_code=422, detail="Can only update the current Pacific day.")
    sources = payload.get("sources")
    if not isinstance(sources, dict) or len(sources) > 100:
        raise HTTPException(status_code=422, detail="Invalid project sources.")
    incoming = daily_income_summary(sources)
    if not incoming["complete"]:
        raise HTTPException(status_code=422, detail="Invalid daily project amount.")
    key = f"yield_server_daily_income_{day}"
    existing = setting(db, user.id, key)
    existing = existing if isinstance(existing, dict) else {}

    history = existing.get("observations")
    history = history if isinstance(history, list) else []
    raw_history = existing.get("rawObservations")
    raw_history = raw_history if isinstance(raw_history, list) else []

    # Preserve the provider-derived observation exactly as received after
    # validation. This is accounting/audit truth and may move down or negative.
    raw_observation = {
        "observedAt": now.isoformat(),
        "totalUsd": incoming["totalUsd"],
        "sources": incoming["sources"],
    }
    if (not raw_history or
        abs(float(raw_history[-1].get("totalUsd") or 0) - incoming["totalUsd"]) > 0.000001 or
        raw_history[-1].get("sources") != incoming["sources"]):
        raw_history.append(raw_observation)
        raw_history = raw_history[-300:]

    # Recover the highest accepted per-source values from every display
    # observation already recorded today. This is a presentation/accrual rule,
    # not a rewrite of the raw provider observations above.
    historical_highs: dict[str, float] = {}
    for observation in history:
        if isinstance(observation, dict):
            historical_highs = monotonic_daily_sources(
                historical_highs, observation.get("sources")
            )

    # Today's visible earnings counter may increase or stay flat, never fall.
    monotonic_sources = monotonic_daily_sources(
        historical_highs, existing.get("sources")
    )
    monotonic_sources = monotonic_daily_sources(
        monotonic_sources, incoming["sources"]
    )
    calculated = daily_income_summary(monotonic_sources)
    if (not history or
        abs(float(history[-1].get("totalUsd") or 0) - calculated["totalUsd"]) > 0.000001 or
        history[-1].get("sources") != calculated["sources"]):
        history.append({
            "observedAt": now.isoformat(),
            "totalUsd": calculated["totalUsd"],
            "sources": calculated["sources"],
        })
        history = history[-300:]

    record = {
        "date": day,
        "firstRecordedAt": existing.get("firstRecordedAt") or now.isoformat(),
        "lastRecordedAt": now.isoformat(),
        # Display/high-water fields kept for backward-compatible UI reads.
        "totalUsd": calculated["totalUsd"],
        "sources": calculated["sources"],
        "observations": history,
        # Raw provider-derived fields retain corrections and negative changes.
        "rawTotalUsd": incoming["totalUsd"],
        "rawSources": incoming["sources"],
        "rawObservations": raw_history,
    }
    save_setting(db, user.id, key, record)
    db.commit()
    return {
        "date": day,
        **calculated,
        "rawTotalUsd": incoming["totalUsd"],
        "rawSources": incoming["sources"],
        "receivedAt": now.isoformat(),
    }


@router.get("/daily-earnings/{day}")
async def read_daily_earnings(
    day: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        raise HTTPException(status_code=422, detail="Invalid date.")
    return setting(db, user.id, f"yield_server_daily_income_{day}") or {
        "date": day,
        "sources": {},
        "observations": [],
        "rawSources": {},
        "rawObservations": [],
    }


@router.get("/monthly-daily-earnings/{month}")
async def read_monthly_daily_earnings(
    month: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Return the recorded daily earnings ledger for one YYYY-MM month."""
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        raise HTTPException(status_code=422, detail="Invalid month.")

    prefix = f"yield_server_daily_income_{month}-"
    rows = db.scalars(select(Setting).where(
        Setting.user_id == user.id,
        Setting.key.like(f"{prefix}%")
    )).all()

    days = []
    total = 0.0
    for row in rows:
        value = row.value if isinstance(row.value, dict) else {}
        day = str(value.get("date") or row.key.removeprefix("yield_server_daily_income_"))
        amount = number(value.get("totalUsd"))
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day) or amount is None:
            continue
        days.append({
            "date": day,
            "totalUsd": amount,
            "sources": value.get("sources") if isinstance(value.get("sources"), dict) else {},
            "lastRecordedAt": value.get("lastRecordedAt"),
        })
        total += amount

    days.sort(key=lambda item: item["date"])
    return {
        "month": month,
        "totalUsd": round(total, 8),
        "days": days,
        "calculatedAt": datetime.now(timezone.utc).isoformat(),
    }



@router.get("/earnings-dashboard/{month}")
async def earnings_dashboard(
    month: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """One backend-owned view for all daily/weekly/monthly earnings surfaces.

    Historic display receipts are provisional until independently reconciled
    to dated provider trackers. They are not changed or overwritten here.
    """
    import calendar
    from datetime import date, timedelta
    if not re.fullmatch(r"\d{4}-\d{2}", month):
        raise HTTPException(status_code=422, detail="Invalid month.")
    try:
        year, month_number = map(int, month.split("-"))
        calendar.monthrange(year, month_number)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid month.") from exc
    today = datetime.now(timezone.utc).astimezone(ZoneInfo("America/Los_Angeles")).date()
    # Include neighboring dates for the current Pacific week's edge.
    start = date(year, month_number, 1) - timedelta(days=7)
    end = date(year, month_number, calendar.monthrange(year, month_number)[1]) + timedelta(days=7)
    prefix = "yield_server_daily_income_"
    keys = db.scalars(select(Setting).where(
        Setting.user_id == user.id,
        Setting.key >= prefix + start.isoformat(),
        Setting.key <= prefix + end.isoformat(),
    )).all()
    daily = {
        row.key.removeprefix(prefix): row.value
        for row in keys
        if row.key.startswith(prefix) and isinstance(row.value, dict)
    }
    trackers = {name: setting(db, user.id, key) or {}
                for name, key in DASHBOARD_TRACKERS.items()}
    dashboard = build_backend_earnings_dashboard(
        month, today.isoformat(), daily, trackers)
    monthly_snapshots = setting(db, user.id, "yield_monthly_snapshots_v1")
    if isinstance(monthly_snapshots, dict):
        # The browser may have saved a partially hydrated current-month
        # snapshot before extensions caught up. Project the authoritative
        # provider totals for display without mutating any saved history.
        today_month = today.strftime("%Y-%m")
        canonical = monthly_provider_income(
            {key.lower(): value for key, value in trackers.items()},
            today_month)
        confirmed_legacy = confirmed_november_sources(
            daily, month, today.isoformat()) if month == today_month else {}
        normalized = guard_monthly_snapshots(
            monthly_snapshots, monthly_snapshots, canonical, today_month,
            confirmed_legacy=confirmed_legacy)
        comparison = compare_monthly_snapshot(
            dashboard, normalized.get(month))
        if comparison is not None:
            comparison["snapshotNeedsReconciliation"] = (
                normalized.get(month) != monthly_snapshots.get(month))
            dashboard["monthAccountingComparison"] = comparison
        # The same normalized current-month booking used by Monthly Income
        # also feeds Lifetime Earned. Older months are read once as booked,
        # not reconstructed from daily receipts or project balances.
        dashboard["lifetimeEarned"] = lifetime_earned_from_snapshots(
            normalized, today.strftime("%Y-%m"))
    return dashboard


@router.get("/hardware-credit-audit/{month}")
async def hardware_payback_source_audit(
    month: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Read-only distinction between per-GPU credits and provider revenue.

    Reuse exactly the backend earnings projection used by Crypto Dashboard,
    rather than accepting local checkpoints or browser source totals.
    """
    month_income = await earnings_dashboard(month, user, db)
    devices = setting(db, user.id, "hardware_payback_devices_v1")
    return hardware_credit_audit(month, devices, month_income)


@router.get("/hardware-payback-lifetime")
async def hardware_payback_lifetime(
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Reconcile cumulative per-device credits to dated backend provider evidence.

    Legacy per-device checkpoint baselines can be stale after Kryptex
    recovery; the explicit earningsStartDay always wins over the checkpoint.
    This read-only preview does not rewrite user-selected payback recovery.
    """
    today = datetime.now(timezone.utc).astimezone(
        ZoneInfo("America/Los_Angeles")).date()
    devices = setting(db, user.id, "hardware_payback_devices_v1")
    if not isinstance(devices, list):
        response.headers["Cache-Control"] = "private, no-store"
        return build_lifetime_hardware_payback(devices, {}, {}, today.isoformat())
    starts = []
    from datetime import date
    for item in devices:
        if not isinstance(item, dict):
            continue
        try:
            val = date.fromisoformat(str(item.get("earningsStartDay") or ""))
            if val <= today and (today-val).days <= 1096:
                starts.append(val)
        except (TypeError, ValueError):
            continue
    earliest = min(starts) if starts else today
    prefix = "yield_server_daily_income_"
    low = prefix + earliest.isoformat()
    high = prefix + today.isoformat()
    daily_rows = db.scalars(select(Setting).where(
        Setting.user_id == user.id, Setting.key >= low, Setting.key <= high
    )).all()
    daily = {row.key.removeprefix(prefix): row.value
             for row in daily_rows if isinstance(row.value, dict)}
    trackers = {name: setting(db, user.id, key) or {}
                for name, key in DASHBOARD_TRACKERS.items()}
    response.headers["Cache-Control"] = "private, no-store"
    return build_lifetime_hardware_payback(devices, daily, trackers, today.isoformat())


@router.post("/financial-core/evaluate")
async def evaluate_financial_core(
    payload: dict, user: User = Depends(current_user),
) -> dict:
    """Read-only arithmetic on candidate statement lines.

    This endpoint computes, never posts, income, financial statements,
    cash movements or equipment values. Only saved/locked source records
    can authorize financial writes through their existing routes.
    """
    if len(str(payload)) > 1_000_000:
        raise HTTPException(status_code=413, detail="Financial input too large")
    try:
        return evaluate_statement(payload)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/financial-core/auto-journal")
async def project_automatic_income_journal(
    payload: dict, user: User = Depends(current_user),
) -> dict:
    """Compute non-posting accruals on the server; never touch the journal."""
    if len(str(payload)) > 300_000:
        raise HTTPException(status_code=413, detail="Income history input too large")
    month = payload.get("month")
    current_month = payload.get("currentMonth") or current_keys()[1]
    if not isinstance(month, str) or not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise HTTPException(status_code=422, detail="Invalid accounting month")
    result = auto_income_journal(
        month, payload.get("incomeMonth"), payload.get("manualJournal"),
        current_month, payload.get("todayKey"),
    )
    return {"sourceOfCalculation": "backend-financial-core",
            "month": month, **result}


@router.post("/financial-core/net-worth")
async def evaluate_net_worth(
    payload: dict, user: User = Depends(current_user),
) -> dict:
    """Non-mutating parity calculation while Home migrates to backend."""
    if len(str(payload)) > 200_000:
        raise HTTPException(status_code=413, detail="Net worth input too large")
    result = calculate_net_worth(
        payload.get("assets"), payload.get("business"), payload.get("cryptoTotal")
    )
    return {"sourceOfCalculation": "backend-financial-core", **result}


@router.get("/provider-stats")
async def calculate_provider_stats(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Compute current provider earnings and projections from persisted trackers.

    This reads PostgreSQL's durable per-provider tracker settings, not a
    client-supplied total or a browser-timed calculation. The UI may fall back
    to its locally newer reading until the backend has saved the latest sync.
    """
    today, month = current_keys()
    keys = {
        "salad": "project_income_salad_tracker_v1",
        "unetwork": "project_income_unetwork_tracker_v1",
        "kryptex": "project_income_kryptex_tracker_v1",
        "rollercoin": "project_income_rollercoin_tracker_v2",
    }
    trackers = {}
    for source, key in keys.items():
        raw = setting(db, user.id, key)
        trackers[source] = raw if isinstance(raw, dict) else {}
    calculated = provider_stats(trackers, today, month)
    return {
        "todayKey": today,
        "monthKey": month,
        "calculatedAt": datetime.now(timezone.utc).isoformat(),
        "stats": calculated,
    }


@router.get("/provider-monthly-income")
async def calculate_provider_monthly_income(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Monthly earned USD calculated from persisted provider observations.

    Returns extension-derived platform income only. Lulo/Loopscale results
    are not inferred from current wallet balances or APY estimates.
    """
    _, current_month = current_keys()
    keys = {
        "salad": "project_income_salad_tracker_v1",
        "unetwork": "project_income_unetwork_tracker_v1",
        "kryptex": "project_income_kryptex_tracker_v1",
        "rollercoin": "project_income_rollercoin_tracker_v2",
    }
    trackers = {
        name: setting(db, user.id, key) or {} for name, key in keys.items()
    }
    return {
        "currentMonth": current_month,
        "months": monthly_provider_income(trackers, current_month),
        "calculatedAt": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/bitcoin-valuation")
async def bitcoin_valuation(
    response: Response,
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Read-only BTC quantity and single-quote valuation from server records.

    Wallet data is previously observed, not a promise of live on-chain
    ownership. Price changes affect USD holdings, NEVER mining income.
    """
    from .market import cached_get
    now = datetime.now(timezone.utc)
    wallets = db.scalars(select(Wallet).where(Wallet.user_id == user.id)).all()
    evidence = wallet_evidence(
        wallets, setting(db, user.id, "crypto_wallet_balance_cache"), now
    )
    feed = setting(db, user.id, LATEST_KEY) or {}
    project_rows = feed.get("projects") if isinstance(feed, dict) else None
    projects = portfolio_summary(project_rows) if isinstance(project_rows, list) else {}
    project_balance = projects.get("totalUsd") if (
        isinstance(feed, dict) and feed.get("receivedAt") and projects.get("complete")
    ) else None
    quote = None
    quote_source = None
    quote_at = None
    if evidence["btcAmount"] is not None and evidence["walletCount"] > 0:
        try:
            price = await cached_get(
                "coingecko:btc:usd",
                "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
                {},
            )
            price = price.get("bitcoin", {}).get("usd") if isinstance(price, dict) else None
            if price is not None and float(price) > 0:
                quote = price
                quote_source = "coingecko-backend"
                quote_at = datetime.now(timezone.utc).isoformat()
        except (HTTPException, TypeError, ValueError, OverflowError):
            # Preserve a clearly marked previous wallet quote if the upstream
            # fails. Unknown price must never be coerced into $0.
            pass
    response.headers["Cache-Control"] = "private, no-store"
    return combine_crypto_valuation(
        evidence, project_balance, quote, quote_source, quote_at, user.id, now
    )


@router.get("/crypto-dashboard")
async def crypto_dashboard(
    response: Response, user: User = Depends(current_user),
    db: Session = Depends(get_db)
) -> dict:
    """Small authenticated source snapshot for the Crypto Dashboard cache.

    Explicitly disable shared/proxy HTTP caches. The frontend manages a short
    user-scoped session cache for *display only*, and revalidates in the back.
    """
    response.headers["Cache-Control"] = "private, no-store"
    return crypto_dashboard_snapshot(user.id, setting(db, user.id, LATEST_KEY))


@router.get("/portfolio")
async def portfolio_totals(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    feed = setting(db, user.id, LATEST_KEY) or {}
    projects = feed.get("projects") if isinstance(feed, dict) else []
    return {**portfolio_summary(projects if isinstance(projects, list) else []),
            "receivedAt": feed.get("receivedAt") if isinstance(feed, dict) else None}


@router.get("/status")
async def tracking_status(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    latest = setting(db, user.id, LATEST_KEY) or {}
    alerts = setting(db, user.id, ALERT_KEY) or {}
    now = datetime.now(timezone.utc)
    received = timestamp(latest.get("receivedAt"))
    age = (now - received).total_seconds() if received else None
    projects = latest.get("projects") if isinstance(latest.get("projects"), list) else []
    stale = [p.get("id") for p in projects if is_project_stale(p, now)]
    return {"feedAgeSeconds": round(age) if age is not None else None,
            "staleProjects": stale, "alerts": alerts}


@router.get("/recovery")
async def recovery_candidates(user: User = Depends(current_user),
                              db: Session = Depends(get_db)) -> dict:
    """Compare latest quantities with the most recent persisted nightly backup.
    Returns candidates for safe review, never auto-books transfers as earnings.
    """
    rows = db.scalars(select(Setting).where(
        Setting.user_id == user.id,
        Setting.key.like(f"{BACKUP_PREFIX}%")
    ).order_by(Setting.key.desc())).all()
    latest = setting(db, user.id, LATEST_KEY) or {}
    current = {p["id"]: p for p in latest.get("projects", [])
               if isinstance(p, dict) and p.get("id")}
    for row in rows:
        snapshot = row.value or {}
        before = snapshot.get("projects", [])
        if not isinstance(before, list) or not before:
            continue
        candidates = []
        captured = timestamp(snapshot.get("capturedAt"))
        # A catch-up backup taken after midnight is useful evidence but is
        # not a true 11:58 PM starting balance for the next day's earnings.
        local_capture = captured.astimezone(ZoneInfo("America/Los_Angeles")) if captured else None
        timely_night_backup = bool(
            local_capture and local_capture.date().isoformat() == snapshot.get("date")
            and local_capture.hour == 23 and local_capture.minute >= 58
            and snapshot.get("incomplete") is False
        )
        for earlier in before:
            now = current.get(earlier.get("id"))
            if not now:
                continue
            old_trx = number(earlier.get("balanceTrx"))
            new_trx = number(now.get("balanceTrx"))
            price = number(now.get("trxUsdPrice"))
            if old_trx is not None and new_trx is not None and price and price > 0:
                delta = new_trx - old_trx
                old_price = number(earlier.get("trxUsdPrice"))
                # This separation is accounting-only: market P/L on existing
                # holdings must not be mixed with the new token quantity.
                market_pnl = old_trx * (price - old_price) if old_price and old_price > 0 else None
                reference_time = timestamp(earlier.get("sourceLastSyncedAt"))
                recent_reference = reference_time and (
                    datetime.now(timezone.utc) - reference_time
                ).total_seconds() < 36 * 3600
                # RollerCoin's user-reported baseline: 1.403988 TRX/day.
                # Guard against large external transfers or false scraping.
                max_possible = 1.403988 * 1.5
                eligible = bool(
                    timely_night_backup and earlier.get("stale") is False and recent_reference and
                    not now.get("stale") and 0 <= delta <= max_possible
                )
                candidates.append({
                    "id": now["id"], "quantityDeltaTrx": round(delta, 8),
                    "usdAtCurrentPrice": round(delta * price, 8),
                    "marketPnlOnPriorTrxUsd": round(market_pnl, 8) if market_pnl is not None else None,
                    "eligibleForGuardedRecovery": eligible if now["id"] == "rollercoin-project" else False,
                    "status": "unverified-wallet-change",
                })
            else:
                old_amounts = {a.get("symbol"): number(a.get("amount"))
                               for a in earlier.get("assetBalances", [])
                               if isinstance(a, dict) and a.get("symbol")}
                new_amounts = {a.get("symbol"): number(a.get("amount"))
                               for a in now.get("assetBalances", [])
                               if isinstance(a, dict) and a.get("symbol")}
                deltas = {symbol: round(value - old_amounts[symbol], 8)
                          for symbol, value in new_amounts.items()
                          if value is not None and old_amounts.get(symbol) is not None}
                if deltas:
                    old_assets = {a.get("symbol"): a for a in earlier.get("assetBalances", [])
                                  if isinstance(a, dict) and a.get("symbol")}
                    new_assets = {a.get("symbol"): a for a in now.get("assetBalances", [])
                                  if isinstance(a, dict) and a.get("symbol")}
                    earned_at_market = 0.0
                    market_pnl = 0.0
                    priced_symbols = 0
                    for symbol, delta in deltas.items():
                        old_qty = old_amounts.get(symbol)
                        new_qty = new_amounts.get(symbol)
                        old_usd = number(old_assets[symbol].get("balanceUsd"))
                        new_usd = number(new_assets[symbol].get("balanceUsd"))
                        if not old_qty or not new_qty or old_usd is None or new_usd is None:
                            continue
                        old_price, new_price = old_usd / old_qty, new_usd / new_qty
                        earned_at_market += delta * new_price
                        market_pnl += old_qty * (new_price - old_price)
                        priced_symbols += 1
                    candidates.append({
                        "id": now["id"], "assetQuantityDeltas": deltas,
                        "quantityChangeUsd": round(earned_at_market, 8) if priced_symbols else None,
                        "marketPnlOnPriorHoldingsUsd": round(market_pnl, 8) if priced_symbols else None,
                        "status": "unverified-asset-change",
                    })
        return {"referenceDate": snapshot.get("date"),
                "referenceCapturedAt": snapshot.get("capturedAt"),
                "candidates": candidates}
    return {"referenceDate": None, "candidates": []}
