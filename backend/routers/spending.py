"""Spending accounts and transactions."""

from datetime import datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import SpendingAccount, SpendingTransaction, User
from ..schemas import spending_account_to_dict, spending_transaction_to_dict

router = APIRouter(prefix="/api/spending", tags=["spending"])


def _parse_linked_at(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


@router.get("/accounts")
async def list_accounts(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(SpendingAccount).where(SpendingAccount.user_id == user.id)).all()
    return [spending_account_to_dict(row) for row in rows]


@router.post("/accounts")
async def upsert_account(payload: dict[str, Any], user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    row = SpendingAccount(
        id=str(payload.get("id") or uuid4()),
        user_id=user.id,
        name=payload.get("name") or "Account",
        type=payload.get("type"),
        current_balance=payload.get("currentBalance"),
        provider_account_id=payload.get("providerAccountId"),
        linked_at=_parse_linked_at(payload.get("linkedAt")),
    )
    db.merge(row)
    db.commit()
    return spending_account_to_dict(db.get(SpendingAccount, row.id))


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    row = db.get(SpendingAccount, account_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Account not found.")
    db.delete(row)
    db.commit()
    return {"id": account_id}


@router.get("/transactions")
async def list_transactions(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(
        select(SpendingTransaction)
        .where(SpendingTransaction.user_id == user.id)
        .order_by(SpendingTransaction.date.desc())
    ).all()
    return [spending_transaction_to_dict(row) for row in rows]


def _transaction_row(payload: dict[str, Any], user_id: int) -> SpendingTransaction:
    return SpendingTransaction(
        id=str(payload.get("id") or uuid4()),
        user_id=user_id,
        merchant=payload.get("merchant") or "Unknown merchant",
        amount=float(payload.get("amount") or 0),
        date=str(payload.get("date") or "")[:10],
        category=payload.get("category") or "Other",
        account_id=payload.get("accountId"),
        pending=bool(payload.get("pending", False)),
        source=payload.get("source") or "manual",
    )


@router.post("/transactions")
async def upsert_transaction(payload: dict[str, Any], user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    row = _transaction_row(payload, user.id)
    db.merge(row)
    db.commit()
    return spending_transaction_to_dict(db.get(SpendingTransaction, row.id))


@router.post("/transactions/bulk")
async def upsert_many(payload: list[dict[str, Any]], user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    for item in payload:
        db.merge(_transaction_row(item, user.id))
    db.commit()
    return {"count": len(payload)}


@router.patch("/transactions/{transaction_id}")
async def patch_transaction(
    transaction_id: str, payload: dict[str, Any], user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    row = db.get(SpendingTransaction, transaction_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Transaction not found.")

    if "category" in payload:
        row.category = payload["category"] or "Other"
    if "merchant" in payload:
        row.merchant = payload["merchant"]
    if "amount" in payload:
        row.amount = float(payload["amount"] or 0)
    if "date" in payload:
        row.date = str(payload["date"])[:10]
    if "accountId" in payload:
        row.account_id = payload["accountId"]
    db.commit()
    return spending_transaction_to_dict(row)


@router.delete("/transactions/{transaction_id}")
async def delete_transaction(transaction_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    row = db.get(SpendingTransaction, transaction_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    db.delete(row)
    db.commit()
    return {"id": transaction_id}


@router.get("/budget")
async def get_budget(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    from ..models import Setting

    row = db.scalar(select(Setting).where(Setting.user_id == user.id, Setting.key == "spending_budget"))
    return {"budget": (row.value or {}).get("amount", 0) if row else 0}


@router.put("/budget")
async def set_budget(payload: dict[str, Any], user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    from ..models import Setting

    amount = max(float(payload.get("budget") or 0), 0)
    row = db.scalar(select(Setting).where(Setting.user_id == user.id, Setting.key == "spending_budget"))
    if row:
        row.value = {"amount": amount}
    else:
        db.add(Setting(user_id=user.id, key="spending_budget", value={"amount": amount}))
    db.commit()
    return {"budget": amount}
