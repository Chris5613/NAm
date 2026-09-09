"""Generic CRUD for record collections, plus the key/value settings store."""

from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import NetWorthSnapshot, Setting, User
from ..schemas import RESOURCES, dict_to_columns, row_to_dict, snapshot_to_dict

router = APIRouter(prefix="/api", tags=["data"])


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
    row = db.scalar(select(Setting).where(Setting.user_id == user.id, Setting.key == key))
    if row:
        row.value = payload.get("value")
    else:
        db.add(Setting(user_id=user.id, key=key, value=payload.get("value")))
    db.commit()
    return {"key": key, "value": payload.get("value")}


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
