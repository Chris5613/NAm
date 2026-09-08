"""One-time import of a browser's localStorage dump into the database."""

import json
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import NetWorthSnapshot, Setting, SpendingAccount, SpendingTransaction, User
from ..schemas import RESOURCES, dict_to_columns

router = APIRouter(prefix="/api/migration", tags=["migration"])

# localStorage key -> resource name in RESOURCES
COLLECTION_KEYS = {
    "networth_assets": "assets",
    "networth_phones": "phones",
    "networth_wallets": "wallets",
    "networth_projects": "projects",
    "cloud_manual_bets": "bets",
}

# Everything else is preserved verbatim in the settings table.
SKIP_KEYS = {
    "networth_spending_accounts",
    "networth_spending_transactions",
    "networth_history",
    *COLLECTION_KEYS,
}


def decode(value: Any) -> Any:
    """Raw localStorage exports hold every value as a JSON-encoded string."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, ValueError):
            return value
    return value


def is_sample(record: Any) -> bool:
    return isinstance(record, dict) and record.get("sample") is True


@router.get("/status")
async def status(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    counts = {
        "assets": db.scalar(select(func.count()).select_from(RESOURCES["assets"][0]).where(RESOURCES["assets"][0].user_id == user.id)),
        "projects": db.scalar(select(func.count()).select_from(RESOURCES["projects"][0]).where(RESOURCES["projects"][0].user_id == user.id)),
        "spending_transactions": db.scalar(
            select(func.count()).select_from(SpendingTransaction).where(SpendingTransaction.user_id == user.id)
        ),
        "settings": db.scalar(select(func.count()).select_from(Setting).where(Setting.user_id == user.id)),
    }
    return {"imported": any(counts.values()), "counts": counts}


@router.post("/import")
async def import_dump(payload: dict[str, Any], user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Accepts `{ "<localStorage key>": <value> }`; values may be raw JSON strings. Safe to re-run."""
    payload = {key: decode(value) for key, value in payload.items()}
    imported: dict[str, int] = {}
    skipped_samples = 0

    for storage_key, resource in COLLECTION_KEYS.items():
        records = payload.get(storage_key)
        if not isinstance(records, list):
            continue
        model, fields = RESOURCES[resource]
        count = 0
        for record in records:
            if not isinstance(record, dict):
                continue
            if is_sample(record):
                skipped_samples += 1
                continue
            columns, extra = dict_to_columns(record, fields)
            db.merge(model(id=str(record.get("id") or uuid4()), user_id=user.id, data=extra, **columns))
            count += 1
        imported[resource] = count

    accounts = payload.get("networth_spending_accounts")
    if isinstance(accounts, list):
        count = 0
        for account in accounts:
            if not isinstance(account, dict):
                continue
            if is_sample(account):
                skipped_samples += 1
                continue
            db.merge(
                SpendingAccount(
                    id=str(account.get("id") or uuid4()),
                    user_id=user.id,
                    name=account.get("name") or "Account",
                    type=account.get("type"),
                    current_balance=account.get("currentBalance"),
                    provider_account_id=account.get("providerAccountId"),
                )
            )
            count += 1
        imported["spending_accounts"] = count

    transactions = payload.get("networth_spending_transactions")
    if isinstance(transactions, list):
        count = 0
        for transaction in transactions:
            if not isinstance(transaction, dict) or not transaction.get("date"):
                continue
            if is_sample(transaction):
                skipped_samples += 1
                continue
            db.merge(
                SpendingTransaction(
                    id=str(transaction.get("id") or uuid4()),
                    user_id=user.id,
                    merchant=transaction.get("merchant") or "Unknown merchant",
                    amount=float(transaction.get("amount") or 0),
                    date=str(transaction["date"])[:10],
                    category=transaction.get("category") or "Other",
                    account_id=transaction.get("accountId"),
                    pending=bool(transaction.get("pending", False)),
                    source=transaction.get("source") or "manual",
                )
            )
            count += 1
        imported["spending_transactions"] = count

    history = payload.get("networth_history")
    if isinstance(history, list):
        existing = {row.timestamp for row in db.scalars(select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == user.id))}
        added = 0
        for entry in history:
            if not isinstance(entry, dict):
                continue
            timestamp = str(entry.get("timestamp") or entry.get("monthKey") or "")
            if not timestamp or timestamp in existing:
                continue
            db.add(
                NetWorthSnapshot(
                    user_id=user.id,
                    timestamp=timestamp,
                    value=float(entry.get("value") or 0),
                    source=entry.get("source"),
                    data={k: v for k, v in entry.items() if k not in {"timestamp", "value", "source"}},
                )
            )
            existing.add(timestamp)
            added += 1
        imported["net_worth_snapshots"] = added

    settings_saved = 0
    for key, value in payload.items():
        if key in SKIP_KEYS:
            continue
        row = db.scalar(select(Setting).where(Setting.user_id == user.id, Setting.key == key))
        if row:
            row.value = value
        else:
            db.add(Setting(user_id=user.id, key=key, value=value))
        settings_saved += 1
    imported["settings"] = settings_saved

    db.commit()
    return {"imported": imported, "skipped_samples": skipped_samples}
