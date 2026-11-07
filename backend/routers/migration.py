"""Safe one-time import of a browser's localStorage dump into the database."""

import json
from datetime import datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..input_validation import finite_money, iso_day, money_decimal
from ..models import NetWorthSnapshot, Setting, SpendingAccount, SpendingTransaction, User
from ..schemas import RESOURCES, dict_to_columns, row_to_dict
from ..server_owned_settings import is_server_owned_setting

router = APIRouter(prefix="/api/migration", tags=["migration"])

COLLECTION_KEYS = {
    "networth_assets": "assets",
    "networth_phones": "phones",
    "networth_wallets": "wallets",
    "networth_projects": "projects",
    "cloud_manual_bets": "bets",
}

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


def _canonical_record(record: dict[str, Any]) -> str:
    cleaned = {
        key: value for key, value in record.items()
        if key not in {"id", "user_id", "created_at", "updated_at"}
    }
    return json.dumps(cleaned, sort_keys=True, separators=(",", ":"), default=str)


def record_identity(resource: str, record: dict[str, Any]) -> tuple[Any, ...]:
    """Identity for records that do not have a trusted stable ID.

    Prefer provider/resource identifiers when available. Otherwise only exact
    canonical duplicates are collapsed; a shared display name is never enough.
    """
    if resource == "wallets":
        address = str(record.get("address") or "").strip()
        if address:
            return ("wallet", str(record.get("chain") or "").strip().lower(), address)
    if resource == "bets":
        game = str(record.get("gamePk") or "").strip()
        if game:
            return ("bet-game", game, str(record.get("date") or ""), str(record.get("title") or ""))
    return ("exact", _canonical_record(record))


def _skip_tracker() -> tuple[dict[str, int], list[dict[str, Any]]]:
    return {}, []


def _record_skip(
    counts: dict[str, int],
    details: list[dict[str, Any]],
    *,
    resource: str,
    reason: str,
    index: int | None = None,
    record_id: str | None = None,
    key: str | None = None,
) -> None:
    counts[reason] = counts.get(reason, 0) + 1
    if len(details) < 100:
        item: dict[str, Any] = {"resource": resource, "reason": reason}
        if index is not None:
            item["index"] = index
        if record_id:
            item["id"] = record_id
        if key:
            item["key"] = key
        details.append(item)


def _linked_at(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as error:
        raise HTTPException(status_code=422, detail="linkedAt must be a valid ISO timestamp.") from error


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


def _run_import(
    payload: dict[str, Any],
    user: User,
    db: Session,
    *,
    commit: bool,
) -> dict:
    if commit:
        # Coordinate first-time imports with conflict-safe project saves.
        db.scalar(select(User).where(User.id == user.id).with_for_update())

    payload = {key: decode(value) for key, value in payload.items()}
    imported: dict[str, int] = {}
    skip_counts, skip_details = _skip_tracker()

    for storage_key, resource in COLLECTION_KEYS.items():
        records = payload.get(storage_key)
        if not isinstance(records, list):
            continue

        model, fields = RESOURCES[resource]
        existing_ids: set[str] = set()
        existing_identities: set[tuple[Any, ...]] = set()

        for row in db.scalars(select(model).where(model.user_id == user.id)):
            existing_ids.add(str(row.id))
            existing_identities.add(record_identity(resource, row_to_dict(row, fields)))

        count = 0
        for index, record in enumerate(records):
            if not isinstance(record, dict):
                _record_skip(skip_counts, skip_details, resource=resource, reason="invalid_record", index=index)
                continue
            if is_sample(record):
                _record_skip(skip_counts, skip_details, resource=resource, reason="sample", index=index)
                continue

            record_id = str(record.get("id") or "").strip()
            if record_id:
                existing_any = db.get(model, record_id)
                if existing_any is not None and existing_any.user_id != user.id:
                    _record_skip(
                        skip_counts, skip_details, resource=resource, reason="foreign_id",
                        index=index, record_id=record_id,
                    )
                    continue
                if record_id in existing_ids:
                    _record_skip(
                        skip_counts, skip_details, resource=resource, reason="existing_id",
                        index=index, record_id=record_id,
                    )
                    continue
            else:
                identity = record_identity(resource, record)
                if identity in existing_identities:
                    _record_skip(
                        skip_counts, skip_details, resource=resource, reason="duplicate_identity",
                        index=index,
                    )
                    continue

            columns, extra = dict_to_columns(record, fields)
            new_id = record_id or str(uuid4())
            if commit:
                db.add(model(id=new_id, user_id=user.id, data=extra, **columns))
            existing_ids.add(new_id)
            existing_identities.add(record_identity(resource, record))
            count += 1

        imported[resource] = count

    accounts = payload.get("networth_spending_accounts")
    if isinstance(accounts, list):
        existing_ids = {
            str(row.id)
            for row in db.scalars(select(SpendingAccount).where(SpendingAccount.user_id == user.id))
        }
        existing_provider_ids = {
            str(row.provider_account_id)
            for row in db.scalars(select(SpendingAccount).where(SpendingAccount.user_id == user.id))
            if row.provider_account_id
        }
        count = 0
        for index, account in enumerate(accounts):
            if not isinstance(account, dict):
                _record_skip(skip_counts, skip_details, resource="spending_accounts", reason="invalid_record", index=index)
                continue
            if is_sample(account):
                _record_skip(skip_counts, skip_details, resource="spending_accounts", reason="sample", index=index)
                continue

            record_id = str(account.get("id") or "").strip()
            if record_id:
                existing_any = db.get(SpendingAccount, record_id)
                if existing_any is not None and existing_any.user_id != user.id:
                    _record_skip(skip_counts, skip_details, resource="spending_accounts", reason="foreign_id", index=index, record_id=record_id)
                    continue
                if record_id in existing_ids:
                    _record_skip(skip_counts, skip_details, resource="spending_accounts", reason="existing_id", index=index, record_id=record_id)
                    continue

            provider_id = str(account.get("providerAccountId") or "").strip()
            if not record_id and provider_id and provider_id in existing_provider_ids:
                _record_skip(skip_counts, skip_details, resource="spending_accounts", reason="duplicate_identity", index=index)
                continue

            balance = (
                money_decimal(account.get("currentBalance"), "currentBalance")
                if account.get("currentBalance") is not None else None
            )
            new_id = record_id or str(uuid4())
            if commit:
                db.add(SpendingAccount(
                    id=new_id,
                    user_id=user.id,
                    name=account.get("name") or "Account",
                    type=account.get("type"),
                    current_balance=balance,
                    provider_account_id=provider_id or None,
                    linked_at=_linked_at(account.get("linkedAt")),
                ))
            existing_ids.add(new_id)
            if provider_id:
                existing_provider_ids.add(provider_id)
            count += 1
        imported["spending_accounts"] = count

    transactions = payload.get("networth_spending_transactions")
    if isinstance(transactions, list):
        existing_ids = {
            str(row.id)
            for row in db.scalars(select(SpendingTransaction).where(SpendingTransaction.user_id == user.id))
        }
        count = 0
        for index, transaction in enumerate(transactions):
            if not isinstance(transaction, dict) or not transaction.get("date"):
                _record_skip(skip_counts, skip_details, resource="spending_transactions", reason="invalid_record", index=index)
                continue
            if is_sample(transaction):
                _record_skip(skip_counts, skip_details, resource="spending_transactions", reason="sample", index=index)
                continue

            record_id = str(transaction.get("id") or "").strip()
            if record_id:
                existing_any = db.get(SpendingTransaction, record_id)
                if existing_any is not None and existing_any.user_id != user.id:
                    _record_skip(skip_counts, skip_details, resource="spending_transactions", reason="foreign_id", index=index, record_id=record_id)
                    continue
                if record_id in existing_ids:
                    _record_skip(skip_counts, skip_details, resource="spending_transactions", reason="existing_id", index=index, record_id=record_id)
                    continue

            new_id = record_id or str(uuid4())
            if commit:
                db.add(SpendingTransaction(
                    id=new_id,
                    user_id=user.id,
                    merchant=transaction.get("merchant") or "Unknown merchant",
                    amount=money_decimal(transaction.get("amount"), "amount"),
                    date=iso_day(transaction["date"]),
                    category=transaction.get("category") or "Other",
                    account_id=transaction.get("accountId"),
                    pending=bool(transaction.get("pending", False)),
                    source=transaction.get("source") or "manual",
                ))
            else:
                # Preview must apply the same validation even without writes.
                money_decimal(transaction.get("amount"), "amount")
                iso_day(transaction["date"])
            existing_ids.add(new_id)
            count += 1
        imported["spending_transactions"] = count

    history = payload.get("networth_history")
    if isinstance(history, list):
        existing = {
            row.timestamp
            for row in db.scalars(select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == user.id))
        }
        added = 0
        for index, entry in enumerate(history):
            if not isinstance(entry, dict):
                _record_skip(skip_counts, skip_details, resource="net_worth_snapshots", reason="invalid_record", index=index)
                continue
            timestamp = str(entry.get("timestamp") or entry.get("monthKey") or "")
            if not timestamp:
                _record_skip(skip_counts, skip_details, resource="net_worth_snapshots", reason="invalid_record", index=index)
                continue
            if timestamp in existing:
                _record_skip(skip_counts, skip_details, resource="net_worth_snapshots", reason="duplicate_identity", index=index)
                continue
            value = finite_money(entry.get("value"), "value")
            if commit:
                db.add(NetWorthSnapshot(
                    user_id=user.id,
                    timestamp=timestamp,
                    value=value,
                    source=entry.get("source"),
                    data={k: v for k, v in entry.items() if k not in {"timestamp", "value", "source"}},
                ))
            existing.add(timestamp)
            added += 1
        imported["net_worth_snapshots"] = added

    settings_saved = 0
    for key, value in payload.items():
        if key in SKIP_KEYS:
            continue
        if is_server_owned_setting(key):
            _record_skip(skip_counts, skip_details, resource="settings", reason="server_owned", key=key)
            continue
        if commit:
            row = db.scalar(select(Setting).where(Setting.user_id == user.id, Setting.key == key))
            if row:
                row.value = value
            else:
                db.add(Setting(user_id=user.id, key=key, value=value))
        settings_saved += 1
    imported["settings"] = settings_saved

    if commit:
        db.commit()

    return {
        "mode": "import" if commit else "preview",
        "imported": imported,
        "skipped": skip_counts,
        "skip_details": skip_details,
        "skipped_samples": skip_counts.get("sample", 0),
    }


@router.post("/preview")
async def preview_dump(
    payload: dict[str, Any],
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Preview exactly what an import would add without mutating the database."""
    return _run_import(payload, user, db, commit=False)


@router.post("/import")
async def import_dump(
    payload: dict[str, Any],
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Import a localStorage dump. Safe to re-run; never dedupes by name alone."""
    return _run_import(payload, user, db, commit=True)
