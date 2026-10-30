"""Server-owned scheduled jobs.

The worker is deliberately process-local for now; run one backend process per
Postgres database, or move this loop to a dedicated worker when scaling out.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import Asset, NetWorthSnapshot, Project, Setting, User, utcnow
from .yield_source_sync import poll_all_users, SNAPSHOTS_KEY, merge_server_project_balances

_scheduler_task: asyncio.Task | None = None
_last_daily_key: str | None = None
_last_project_day: str | None = None
_last_catchup_check: str | None = None
_last_yield_poll: datetime | None = None
YIELD_SYNC_INTERVAL = timedelta(minutes=5)
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


def calculate_net_worth(db: Session, user_id: int) -> float:
    assets = db.scalars(select(Asset).where(Asset.user_id == user_id)).all()
    projects = db.scalars(select(Project).where(Project.user_id == user_id, Project.inactive.is_(False))).all()
    asset_total = 0.0
    for asset in assets:
        if asset.manual_value is not None:
            asset_total += float(asset.manual_value)
        elif asset.quantity is not None and asset.current_price is not None:
            asset_total += float(asset.quantity) * float(asset.current_price)
    return asset_total + sum(float(project.invested or 0) for project in projects)


def take_daily_snapshots() -> int:
    now = utcnow()
    day = now.date().isoformat()
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
            db.add(
                NetWorthSnapshot(
                    user_id=user.id,
                    timestamp=now.isoformat(),
                    value=calculate_net_worth(db, user.id),
                    source="server-scheduler",
                    data={"scheduler": "daily-net-worth"},
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
                item["stale"] = age is None or age > 20 * 60
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

def scheduler_status() -> dict[str, Any]:
    return {"status": "running", "last_daily_key": _last_daily_key,
            "last_project_day": _last_project_day,
            "last_yield_poll_at": _last_yield_poll.isoformat() if _last_yield_poll else None}


async def scheduler_loop() -> None:
    global _last_daily_key, _last_project_day, _last_catchup_check, _last_yield_poll
    while True:
        now = datetime.now(timezone.utc)
        day = now.date().isoformat()
        # Daily job runs after midnight UTC, independently of browser tabs.
        if _last_daily_key != day:
            try:
                await asyncio.to_thread(take_daily_snapshots)
                _last_daily_key = day
            except Exception:
                _last_daily_key = day
        local_now = now.astimezone(PACIFIC)
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
        await asyncio.sleep(30)


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
