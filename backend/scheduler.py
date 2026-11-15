"""Server-owned scheduled jobs, with one Postgres advisory-lock leader."""

import asyncio
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import logging
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .db import SessionLocal, engine
from .models import Asset, NetWorthSnapshot, Project, Setting, User, utcnow
from .project_freshness import is_project_stale
from .networth_reconciliation import legacy_nightly_components
from .yield_source_sync import poll_all_users, SNAPSHOTS_KEY, merge_server_project_balances
from .provider_monthly_income import monthly_provider_income
from .monthly_snapshot_guard import guard_monthly_snapshots
from .monthly_changes_seal import seal_completed_business_months
from .legacy_income_reconciliation import confirmed_november_sources

_scheduler_task: asyncio.Task | None = None
_leader = False
SCHEDULER_LOCK_ID = 0x4E414D5F53434844
_last_daily_key: str | None = None
_last_daily_attempt: datetime | None = None
_last_project_day: str | None = None
_last_catchup_check: str | None = None
_last_yield_poll: datetime | None = None
_last_month_reconcile: datetime | None = None
YIELD_SYNC_INTERVAL = timedelta(minutes=5)
MONTH_RECONCILE_INTERVAL = timedelta(minutes=5)
PACIFIC = ZoneInfo("America/Los_Angeles")
log = logging.getLogger(__name__)
PROJECT_FEED_KEY = "yield_project_latest_balance_feed_v1"
PROJECT_SNAPSHOT_PREFIX = "yield_project_balance_backup_"


def setting_value(db: Session, user_id: int, key: str) -> Any:
    row = db.scalar(select(Setting).where(Setting.user_id == user_id, Setting.key == key))
    return row.value if row else None


def set_setting(db: Session, user_id: int, key: str, value: Any) -> None:
    row = db.scalar(select(Setting).where(Setting.user_id == user_id, Setting.key == key))
    if row:
        row.value = value
    else:
        db.add(Setting(user_id=user_id, key=key, value=value))


def nightly_net_worth_components(db: Session, user_id: int) -> dict:
    """Explicitly label the *legacy* nightly source without changing ledger data.

    This is not equal to Home's Financials-derived business balance sheet.
    Preserve the old numeric basis until cash/equipment/debt reconciliation
    can safely migrate both Home and the daily snapshot together.
    """
    assets = db.scalars(select(Asset).where(Asset.user_id == user_id)).all()
    project = setting_value(db, user_id, "project_income_portfolio_summary_v1")
    crypto = setting_value(db, user_id, "networth_crypto_cache")
    return legacy_nightly_components(assets, project, crypto)


def calculate_net_worth(db: Session, user_id: int) -> float:
    """Backward-compatible legacy scheduler subtotal; NOT certified Home NW."""
    return nightly_net_worth_components(db, user_id)["totalUsd"]


def take_daily_snapshots() -> int:
    now = utcnow()
    local_now = now.astimezone(PACIFIC)
    day = local_now.date().isoformat()
    created = 0
    with SessionLocal() as db:
        users = db.scalars(select(User)).all()
        for user in users:
            exists = db.scalar(
                select(NetWorthSnapshot.id).where(
                    NetWorthSnapshot.user_id == user.id,
                    NetWorthSnapshot.timestamp.like(f"{day}%"),
                )
            )
            if exists:
                continue
            components = nightly_net_worth_components(db, user.id)
            db.add(
                NetWorthSnapshot(
                    user_id=user.id,
                    # Store the Pacific-local ISO timestamp so its date prefix
                    # matches the Dashboard's calendar day.
                    timestamp=local_now.isoformat(),
                    value=components["totalUsd"],
                    source="server-scheduler",
                    data={
                        "scheduler": "daily-net-worth",
                        "pacificDate": day,
                        "formula": components["formula"],
                        "personal": components["personal"],
                        "personalSubtotalUsd": components["personalSubtotalUsd"],
                        "projectBalanceUsd": components["projectBalanceUsd"],
                        "bitcoinLegacyUsd": components["bitcoinLegacyUsd"],
                        "cryptoSubtotalUsd": components["cryptoSubtotalUsd"],
                        "businessBalanceSheetIncluded": False,
                        "bankCashDeduplicated": False,
                        "comparableToHomeFinancials": False,
                        "sourceProvenance": components["componentSources"],
                    },
                )
            )
            set_setting(db, user.id, "scheduler_status", {"last_daily_snapshot_at": now.isoformat(), "status": "ok"})
            created += 1
        db.commit()
    return created



def take_project_balance_snapshots(day: str, scheduled_at: datetime | None = None) -> int:
    """Durable per-user 11:58 PM Pacific snapshot from last received readings.

    Server-owned persistence works with closed browsers, but balances may be
    stale if their external integrations depend on browser extensions.
    """
    now = scheduled_at or utcnow()
    made = 0
    with SessionLocal() as db:
        users = db.scalars(select(User)).all()
        for user in users:
            key = f"{PROJECT_SNAPSHOT_PREFIX}{day}"
            if setting_value(db, user.id, key) is not None:
                continue
            feed = setting_value(db, user.id, PROJECT_FEED_KEY)
            if not isinstance(feed, dict):
                feed = {}
            projects = feed.get("projects") if isinstance(feed.get("projects"), list) else []
            # Polling in the backend remains active after the browser closes.
            # Update the SNAPSHOT COPY with verified-fresher Lulo/Loopscale
            # readings without changing financial projects or earnings.
            lulo_wallets = {}
            for account in db.scalars(select(Project).where(Project.user_id == user.id)).all():
                details = account.data or {}
                wallet = details.get("lulo_wallet_address")
                if details.get("yield_tracking") == "lulo_lending" and wallet:
                    lulo_wallets[f"lulo-project-{account.id}"] = str(wallet)
            projects = merge_server_project_balances(
                projects, setting_value(db, user.id, SNAPSHOTS_KEY) or {},
                lulo_wallets, now,
            )
            received_at = feed.get("receivedAt")
            try:
                last = datetime.fromisoformat(str(received_at).replace("Z", "+00:00"))
                feed_age_seconds = max(0, (now - last).total_seconds())
            except (ValueError, TypeError):
                feed_age_seconds = None
            saved_projects = []
            for project in projects:
                if not isinstance(project, dict) or not project.get("id"):
                    continue
                item = dict(project)
                raw_time = item.get("sourceLastSyncedAt")
                try:
                    source_time = datetime.fromisoformat(str(raw_time).replace("Z", "+00:00"))
                    age = max(0, (now - source_time).total_seconds())
                except (ValueError, TypeError):
                    age = None
                item["sourceAgeSeconds"] = round(age) if age is not None else None
                item["stale"] = is_project_stale(item, now)
                saved_projects.append(item)
            snapshot = {
                "date": day,
                "scheduledLocalTime": "23:58",
                "timezone": "America/Los_Angeles",
                "capturedAt": now.isoformat(),
                "feedReceivedAt": received_at,
                "feedAgeSeconds": round(feed_age_seconds) if feed_age_seconds is not None else None,
                "projects": saved_projects,
                "source": "server-scheduler",
                "incomplete": not saved_projects or feed_age_seconds is None or feed_age_seconds > 20 * 60,
            }
            set_setting(db, user.id, key, snapshot)
            # Alerts are stored separately; no UI labels added.
            if snapshot["incomplete"] or any(p["stale"] for p in saved_projects):
                set_setting(db, user.id, "yield_project_sync_alerts_v1", {
                    "lastCheckedAt": now.isoformat(),
                    "staleProjects": [p["id"] for p in saved_projects if p["stale"]],
                    "backupIncomplete": snapshot["incomplete"],
                })
            made += 1
        db.commit()
    return made

# The server's provider trackers may advance while every browser is closed.
# The browser PATCH guard protects writes but cannot repair an already-stale
# snapshot by itself. Reconcile the OPEN month using durable extension facts
# and narrowly fingerprinted, owner-confirmed Lulo/Loopscale receipts.
# Never alter historical locked periods or underlying source ledgers.
MONTHLY_TRACKER_KEYS = {
    "kryptex": "project_income_kryptex_tracker_v1",
    "salad": "project_income_salad_tracker_v1",
    "rollercoin": "project_income_rollercoin_tracker_v2",
    "unetwork": "project_income_unetwork_tracker_v1",
}


def reconcile_open_monthly_snapshots() -> int:
    """Repair incomplete live provider rows from durable tracker facts.

    This procedure never edits dated earnings receipts, historical locked
    snapshots, journal transactions or source provider trackers. It uses the
    same account row lock as the guarded browser PATCH to serialize updates.
    """
    month = datetime.now(timezone.utc).astimezone(PACIFIC).strftime("%Y-%m")
    updated = 0
    with SessionLocal() as db:
        user_ids = db.scalars(select(User.id)).all()
        for user_id in user_ids:
            # Prevent stale frontend snapshot writes racing a server repair.
            db.scalar(select(User).where(User.id == user_id).with_for_update())
            snapshot = db.scalar(select(Setting).where(
                Setting.user_id == user_id,
                Setting.key == "yield_monthly_snapshots_v1",
            ))
            saved = snapshot.value if snapshot is not None else None
            if not isinstance(saved, dict) or not isinstance(saved.get(month), dict):
                db.rollback()
                continue
            if saved[month].get("locked"):
                db.rollback()
                continue
            provider_rows = db.scalars(select(Setting).where(
                Setting.user_id == user_id,
                Setting.key.in_(tuple(MONTHLY_TRACKER_KEYS.values())),
            )).all()
            by_key = {row.key: row.value for row in provider_rows}
            trackers = {
                name: by_key.get(key) or {}
                for name, key in MONTHLY_TRACKER_KEYS.items()
            }
            authoritative = monthly_provider_income(trackers, month)
            if not any(row.get("monthKey") == month for row in authoritative):
                db.rollback()
                continue
            day_prefix = "yield_server_daily_income_"
            dated_rows = db.scalars(select(Setting).where(
                Setting.user_id == user_id,
                Setting.key >= day_prefix + month + "-01",
                Setting.key <= day_prefix + month + "-31",
            )).all()
            dated = {
                item.key.removeprefix(day_prefix): item.value
                for item in dated_rows if item.key.startswith(day_prefix)
            }
            local_day = datetime.now(timezone.utc).astimezone(
                PACIFIC).date().isoformat()
            confirmed_legacy = confirmed_november_sources(
                dated, month, local_day)
            corrected = guard_monthly_snapshots(
                saved, saved, authoritative, month,
                confirmed_legacy=confirmed_legacy)
            if corrected != saved:
                snapshot.value = corrected
                db.commit()
                updated += 1
            else:
                db.rollback()
    return updated


def seal_monthly_business_periods() -> int:
    """Server-side month rollover with no inferred asset changes.

    Only historically saved balance rows are locked. Revenue comes from the
    provider snapshot for that same month if the snapshot is explicitly
    locked. Missing source income is left unknown, not forced to zero.
    """
    month = datetime.now(timezone.utc).astimezone(PACIFIC).strftime("%Y-%m")
    updated = 0
    with SessionLocal() as db:
        user_ids = db.scalars(select(User.id)).all()
        for user_id in user_ids:
            db.scalar(select(User).where(User.id == user_id).with_for_update())
            entry = db.scalar(select(Setting).where(
                Setting.user_id == user_id,
                Setting.key == "monthly_business_changes_v1",
            ))
            if entry is None or not isinstance(entry.value, dict):
                db.rollback()
                continue
            snapshot = db.scalar(select(Setting).where(
                Setting.user_id == user_id,
                Setting.key == "yield_monthly_snapshots_v1",
            ))
            revised = seal_completed_business_months(
                entry.value, snapshot.value if snapshot else None, month
            )
            if revised != entry.value:
                entry.value = revised
                db.commit()
                updated += 1
            else:
                db.rollback()
    return updated


def scheduler_status() -> dict[str, Any]:
    return {"status": "leader" if _leader else "standby", "last_daily_key": _last_daily_key,
            "last_project_day": _last_project_day,
            "last_yield_poll_at": _last_yield_poll.isoformat() if _last_yield_poll else None}


def daily_snapshot_due(now: datetime, day: str) -> bool:
    if _last_daily_key == day:
        return False
    return _last_daily_attempt is None or now - _last_daily_attempt >= timedelta(minutes=5)


def run_daily_snapshot_attempt(now: datetime, day: str) -> bool:
    """Run one daily snapshot attempt; failed attempts remain retryable."""
    global _last_daily_key, _last_daily_attempt
    if not daily_snapshot_due(now, day):
        return False

    _last_daily_attempt = now
    try:
        take_daily_snapshots()
    except Exception:
        log.exception("Daily net-worth snapshot failed; will retry")
        return False

    _last_daily_key = day
    return True


async def scheduler_loop() -> None:
    global _last_daily_key, _last_daily_attempt, _last_project_day, _last_catchup_check, _last_yield_poll, _last_month_reconcile, _leader
    connection = None
    try:
        while True:
            if engine.dialect.name == "postgresql":
                try:
                    if connection is None:
                        candidate = engine.connect()
                        acquired = candidate.scalar(text("SELECT pg_try_advisory_lock(:lock_id)"), {"lock_id": SCHEDULER_LOCK_ID})
                        candidate.rollback()
                        if acquired:
                            connection = candidate
                        else:
                            candidate.close()
                    else:
                        connection.execute(text("SELECT 1"))
                        connection.rollback()
                except Exception:
                    log.exception("Scheduler leader connection failed; retrying")
                    if connection is not None:
                        connection.invalidate()
                        connection.close()
                    connection = None
                _leader = connection is not None
                if not _leader:
                    await asyncio.sleep(30)
                    continue
            else:
                _leader = True
            now = datetime.now(timezone.utc)
            local_now = now.astimezone(PACIFIC)
            day = local_now.date().isoformat()
            # Daily net-worth accounting uses the same Pacific calendar day
            # as the Dashboard.
            if daily_snapshot_due(now, day):
                await asyncio.to_thread(run_daily_snapshot_attempt, now, day)
            project_day = local_now.date().isoformat()
            # Catch up a missed night on restart/wakeup. Keep the actual
            # capture timestamp; do not pretend a stale feed was live at 23:58.
            if _last_catchup_check != project_day:
                try:
                    prior_day = (local_now.date() - timedelta(days=1)).isoformat()
                    await asyncio.to_thread(take_project_balance_snapshots, prior_day, now)
                    _last_catchup_check = project_day
                except Exception:
                    log.exception("Prior-night project backup catch-up failed")
            if (local_now.hour, local_now.minute) >= (23, 58) and _last_project_day != project_day:
                try:
                    await asyncio.to_thread(take_project_balance_snapshots, project_day, now)
                    _last_project_day = project_day
                except Exception:
                    log.exception("Project balance backup failed; will retry next tick")
            # API-backed sources do not require Chrome or an open dashboard.
            # Do not touch financial ledgers here: save read-only observations
            # for later reconciliation by the existing accounting engine.
            if _last_yield_poll is None or now - _last_yield_poll >= YIELD_SYNC_INTERVAL:
                _last_yield_poll = now
                try:
                    await asyncio.to_thread(poll_all_users)
                except Exception:
                    log.exception("Lulo / Loopscale source polling failed")
            # Repair snapshots even with no browser connected. This only
            # corrects four authoritative provider rows and is idempotent.
            if (_last_month_reconcile is None or
                    now - _last_month_reconcile >= MONTH_RECONCILE_INTERVAL):
                _last_month_reconcile = now
                try:
                    await asyncio.to_thread(reconcile_open_monthly_snapshots)
                except Exception:
                    log.exception("Open-month provider reconciliation failed; will retry")
                try:
                    await asyncio.to_thread(seal_monthly_business_periods)
                except Exception:
                    log.exception("Historical monthly business sealing failed; will retry")
            await asyncio.sleep(30)
    finally:
        _leader = False
        if connection is not None:
            try:
                connection.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": SCHEDULER_LOCK_ID})
                connection.rollback()
            finally:
                connection.close()


def start_scheduler() -> asyncio.Task:
    global _scheduler_task
    if _scheduler_task is None or _scheduler_task.done():
        _scheduler_task = asyncio.create_task(scheduler_loop())
    return _scheduler_task


def stop_scheduler() -> None:
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
    _scheduler_task = None
