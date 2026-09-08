"""Server-owned scheduled jobs.

The worker is deliberately process-local for now; run one backend process per
Postgres database, or move this loop to a dedicated worker when scaling out.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import Asset, NetWorthSnapshot, Project, Setting, User, utcnow

_scheduler_task: asyncio.Task | None = None
_last_daily_key: str | None = None


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


def scheduler_status() -> dict[str, Any]:
    return {"status": "running", "last_daily_key": _last_daily_key}


async def scheduler_loop() -> None:
    global _last_daily_key
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
        await asyncio.sleep(60)


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
