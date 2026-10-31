"""Generic CRUD for record collections, plus the key/value settings store."""

from typing import Any
import hashlib
from math import isfinite
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import NetWorthSnapshot, Setting, User, Project
from ..project_writes import plan_project_changes, ProjectConflict
from ..server_owned_settings import is_server_owned_setting
from ..schemas import RESOURCES, dict_to_columns, row_to_dict, snapshot_to_dict

router = APIRouter(prefix="/api", tags=["data"])


def lock_setting_key(db: Session, user_id: int, key: str) -> None:
    """Serialize creation and CAS for one setting without blocking other keys."""
    if db.get_bind().dialect.name == "postgresql":
        digest = hashlib.sha256(f"nam-setting:{user_id}:{key}".encode()).hexdigest()
        db.execute(text("SELECT pg_advisory_xact_lock(:lock_id)"),
                   {"lock_id": int(digest[:15], 16)})
    else:
        # SQLite test databases do not support PostgreSQL advisory locks.
        db.scalar(select(User).where(User.id == user_id).with_for_update())


def _resource(name: str):
    if name not in RESOURCES:
        raise HTTPException(status_code=404, detail=f"Unknown resource '{name}'.")
    return RESOURCES[name]


def _exact_identity(name: str, item: dict[str, Any]) -> str:
    if name == "assets":
        return f"{str(item.get('category') or '').strip()}::{str(item.get('name') or '').strip()}::{str(item.get('symbol') or '').strip()}"
    if name == "wallets":
        return f"{str(item.get('chain') or '').strip()}::{str(item.get('address') or item.get('label') or '').strip()}"
    if name == "projects":
        return f"{str(item.get('category') or '').strip()}::{str(item.get('name') or '').strip()}"
    if name == "phones":
        return str(item.get("model") or "").strip()
    if name == "bets":
        return "::".join(
            [
                str(item.get("date") or "").strip(),
                str(item.get("title") or "").strip(),
                str(item.get("matchup") or "").strip(),
                str(item.get("awayTeam") or "").strip(),
                str(item.get("homeTeam") or "").strip(),
                str(item.get("gamePk") or "").strip(),
                str(item.get("odds") or "").strip(),
                str(item.get("stake") or item.get("amount") or "").strip(),
            ]
        )
    return str(item.get("id") or "").strip()


@router.get("/resources/{name}")
async def list_records(name: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    model, fields = _resource(name)
    rows = db.scalars(select(model).where(model.user_id == user.id)).all()
    return [row_to_dict(row, fields) for row in rows]


@router.post("/resources/{name}")
async def create_record(name: str, payload: dict[str, Any], user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    model, fields = _resource(name)
    if name in {"projects", "assets", "wallets", "phones", "bets"}:
        raise HTTPException(409, "Refresh NAm to use conflict-safe record saves.")
    columns, extra = dict_to_columns(payload, fields)

    identity = _exact_identity(name, payload)
    if identity:
        existing = db.scalars(select(model).where(model.user_id == user.id)).all()
        if any(_exact_identity(name, row_to_dict(row, fields)) == identity for row in existing):
            return row_to_dict(next(row for row in existing if _exact_identity(name, row_to_dict(row, fields)) == identity), fields)

    row = model(id=str(payload.get("id") or uuid4()), user_id=user.id, data=extra, **columns)
    db.merge(row)
    db.commit()
    stored = db.get(model, row.id)
    return row_to_dict(stored, fields)


@router.put("/resources/{name}/{record_id}")
async def update_record(
    name: str, record_id: str, payload: dict[str, Any], user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    model, fields = _resource(name)
    if name in {"projects", "assets", "wallets", "phones", "bets"}:
        raise HTTPException(409, "Refresh NAm to use conflict-safe record saves.")
    row = db.get(model, record_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Record not found.")

    columns, extra = dict_to_columns(payload, fields)
    for field, value in columns.items():
        setattr(row, field, value)
    row.data = {**(row.data or {}), **extra}
    db.commit()
    return row_to_dict(row, fields)


@router.delete("/resources/{name}/{record_id}")
async def delete_record(name: str, record_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    model, _ = _resource(name)
    if name in {"projects", "assets", "wallets", "phones", "bets"}:
        raise HTTPException(409, "Refresh NAm to use conflict-safe record saves.")
    row = db.get(model, record_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Record not found.")
    db.delete(row)
    db.commit()
    return {"id": record_id}


@router.put("/resources/{name}")
async def replace_collection(
    name: str, payload: list[dict[str, Any]], user: User = Depends(current_user), db: Session = Depends(get_db)
) -> list[dict]:
    """Replaces the whole collection; mirrors how the old localStorage arrays were written."""
    model, fields = _resource(name)
    if name in {"projects", "assets", "wallets", "phones", "bets"}:
        raise HTTPException(409, "Refresh NAm to use conflict-safe record saves.")
    db.execute(delete(model).where(model.user_id == user.id))
    rows = []
    seen = set()
    for item in payload:
        if not isinstance(item, dict):
            continue
        identity = _exact_identity(name, item)
        if identity and identity in seen:
            continue
        seen.add(identity)
        columns, extra = dict_to_columns(item, fields)
        row = model(id=str(item.get("id") or uuid4()), user_id=user.id, data=extra, **columns)
        db.add(row)
        rows.append(row)
    db.commit()
    return [row_to_dict(row, fields) for row in rows]


@router.patch("/project-records")
async def patch_projects(payload: dict[str, Any], user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    changes = payload.get("changes")
    if not isinstance(changes, list) or not all(isinstance(item, dict) for item in changes):
        raise HTTPException(422, "Expected a project changes array.")
    defaults = {"name": None, "category": None, "invested": 0, "earned": 0, "inactive": False}
    normalized = []
    for item in changes:
        after = item.get("after")
        if isinstance(after, dict):
            columns, extra = dict_to_columns({**defaults, **after}, RESOURCES["projects"][1])
            if any(columns[field] is None or not isfinite(columns[field]) for field in ("invested", "earned")):
                raise HTTPException(422, "Project balances must be finite numbers.")
            after = {**extra, **columns, "id": after.get("id")}
        normalized.append({**item, "after": after})
    changes = normalized
    # Serializes creation as well as updates/deletes across tabs and workers.
    # Future authoritative writers must acquire this same lock.
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    fields = RESOURCES["projects"][1]
    rows = db.scalars(select(Project).where(Project.user_id == user.id).execution_options(populate_existing=True)).all()
    by_id = {row.id: row for row in rows}
    try:
        planned = plan_project_changes({row.id: row_to_dict(row, fields) for row in rows}, changes)
    except ProjectConflict:
        raise HTTPException(409, "Project changed in another session. Reload before saving; no changes were applied.")
    except ValueError as error:
        raise HTTPException(422, str(error))
    # IDs are globally unique; never merge onto another user's row.
    for project_id, after in planned.items():
        if after is not None and project_id not in by_id and db.get(Project, project_id) is not None:
            raise HTTPException(409, "Project ID unavailable.")
    for project_id, after in planned.items():
        row = by_id.get(project_id)
        if after is None:
            if row is not None:
                db.delete(row)
        else:
            columns, extra = dict_to_columns(after, fields)
            if row is None:
                row = Project(id=project_id, user_id=user.id)
                db.add(row)
            for field, value in columns.items():
                setattr(row, field, value)
            row.data = extra
    db.commit()
    rows = db.scalars(select(Project).where(Project.user_id == user.id)).all()
    return [row_to_dict(row, fields) for row in rows]


@router.patch("/resource-records/{name}")
async def patch_resource_records(name: str, payload: dict[str, Any],
                                 user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    if name not in {"assets", "wallets", "phones", "bets"}:
        raise HTTPException(404, "Unknown guarded collection.")
    model, fields = _resource(name)
    changes = payload.get("changes")
    if not isinstance(changes, list) or not all(isinstance(item, dict) for item in changes):
        raise HTTPException(422, "Expected a changes array.")
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    rows = db.scalars(select(model).where(model.user_id == user.id).execution_options(populate_existing=True)).all()
    by_id = {row.id: row for row in rows}
    try:
        planned = plan_project_changes({row.id: row_to_dict(row, fields) for row in rows}, changes)
    except ProjectConflict:
        raise HTTPException(409, "Record changed in another session. No changes were applied.")
    except ValueError as error:
        raise HTTPException(422, str(error))
    for record_id, after in planned.items():
        if after is not None and record_id not in by_id and db.get(model, record_id) is not None:
            raise HTTPException(409, "Record ID unavailable.")
    for record_id, after in planned.items():
        row = by_id.get(record_id)
        if after is None:
            if row is not None:
                db.delete(row)
            continue
        columns, extra = dict_to_columns(after, fields)
        if row is None:
            row = model(id=record_id, user_id=user.id, data=extra, **columns)
            db.add(row)
        else:
            for field, value in columns.items():
                setattr(row, field, value)
            row.data = extra
    db.commit()
    return [row_to_dict(row, fields) for row in db.scalars(select(model).where(model.user_id == user.id)).all()]


@router.get("/settings")
async def all_settings(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(Setting).where(Setting.user_id == user.id)).all()
    return {row.key: row.value for row in rows}


@router.get("/settings/{key}")
async def get_setting(key: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    row = db.scalar(select(Setting).where(Setting.user_id == user.id, Setting.key == key))
    return {"key": key, "value": row.value if row else None}


@router.put("/settings/{key}")
async def put_setting(key: str, payload: dict[str, Any], user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    # Phase 7: generic settings writes must not impersonate server-owned
    # source observations, parity evidence, or immutable backups.
    if is_server_owned_setting(key):
        raise HTTPException(status_code=403, detail="Server-owned accounting settings are read-only.")
    raise HTTPException(409, "Refresh NAm to use guarded settings saves.")


@router.patch("/settings/{key}")
async def patch_setting(key: str, payload: dict[str, Any], user: User = Depends(current_user),
                        db: Session = Depends(get_db)) -> dict:
    if is_server_owned_setting(key):
        raise HTTPException(403, "Server-owned accounting settings are read-only.")
    if not all(field in payload for field in ("before", "after")):
        raise HTTPException(422, "Expected before and after values.")
    lock_setting_key(db, user.id, key)
    row = db.scalar(select(Setting).where(Setting.user_id == user.id, Setting.key == key))
    current = row.value if row else None
    if current != payload["before"] and current != payload["after"]:
        raise HTTPException(409, "Setting changed in another session. No changes were applied.")
    if current != payload["after"]:
        if row:
            row.value = payload["after"]
        else:
            db.add(Setting(user_id=user.id, key=key, value=payload["after"]))
        db.commit()
    return {"key": key, "value": payload["after"]}


@router.get("/net-worth/history")
async def net_worth_history(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(
        select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == user.id).order_by(NetWorthSnapshot.timestamp)
    ).all()
    return [snapshot_to_dict(row) for row in rows]


@router.post("/net-worth/history")
async def add_snapshot(payload: dict[str, Any], user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    reserved = {"timestamp", "value", "source"}
    snapshot = NetWorthSnapshot(
        user_id=user.id,
        timestamp=str(payload.get("timestamp")),
        value=float(payload.get("value") or 0),
        source=payload.get("source"),
        data={key: value for key, value in payload.items() if key not in reserved},
    )
    db.add(snapshot)
    db.commit()
    return snapshot_to_dict(snapshot)
