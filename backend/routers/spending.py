"""Spending accounts and transactions."""

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..input_validation import iso_day, money_decimal
from ..db import get_db
from ..models import SpendingAccount, SpendingTransaction, User
from ..schemas import spending_account_to_dict, spending_transaction_to_dict

router = APIRouter(prefix="/api/spending", tags=["spending"])


class SpendingAccountInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str | None = None
    name: str | None = None
    type: str | None = None
    currentBalance: Decimal | None = None
    providerAccountId: str | None = None
    linkedAt: datetime | None = None

    @field_validator("currentBalance", mode="before")
    @classmethod
    def validate_current_balance(cls, value):
        if value is None:
            return None
        try:
            return money_decimal(value, "currentBalance")
        except HTTPException as error:
            raise ValueError(str(error.detail)) from error


class SpendingTransactionInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str | None = None
    merchant: str | None = None
    amount: Decimal = Decimal("0")
    date: str
    category: str | None = None
    accountId: str | None = None
    pending: bool = False
    source: str | None = None

    @field_validator("amount", mode="before")
    @classmethod
    def validate_amount(cls, value):
        try:
            return money_decimal(value, "amount")
        except HTTPException as error:
            raise ValueError(str(error.detail)) from error

    @field_validator("date", mode="before")
    @classmethod
    def validate_date(cls, value):
        try:
            return iso_day(value)
        except HTTPException as error:
            raise ValueError(str(error.detail)) from error


class SpendingTransactionPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    category: str | None = None
    merchant: str | None = None
    amount: Decimal | None = None
    date: str | None = None
    accountId: str | None = None
    hidden: bool | None = None

    @field_validator("amount", mode="before")
    @classmethod
    def validate_amount(cls, value):
        if value is None:
            return None
        try:
            return money_decimal(value, "amount")
        except HTTPException as error:
            raise ValueError(str(error.detail)) from error

    @field_validator("date", mode="before")
    @classmethod
    def validate_date(cls, value):
        if value is None:
            return None
        try:
            return iso_day(value)
        except HTTPException as error:
            raise ValueError(str(error.detail)) from error


class SpendingBudgetInput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    budget: Decimal = Decimal("0")

    @field_validator("budget", mode="before")
    @classmethod
    def validate_budget(cls, value):
        try:
            return money_decimal(value, "budget")
        except HTTPException as error:
            raise ValueError(str(error.detail)) from error


@router.get("/accounts")
async def list_accounts(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(SpendingAccount).where(SpendingAccount.user_id == user.id)).all()
    return [spending_account_to_dict(row) for row in rows]


@router.post("/accounts")
async def upsert_account(payload: SpendingAccountInput, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    if payload.id:
        existing = db.get(SpendingAccount, payload.id)
        if existing is not None and existing.user_id != user.id:
            raise HTTPException(status_code=409, detail="Account ID is already in use.")
    row = SpendingAccount(
        id=str(payload.id or uuid4()),
        user_id=user.id,
        name=payload.name or "Account",
        type=payload.type,
        current_balance=payload.currentBalance,
        provider_account_id=payload.providerAccountId,
        linked_at=payload.linkedAt,
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
        .where(SpendingTransaction.user_id == user.id, SpendingTransaction.hidden.is_(False))
        .order_by(SpendingTransaction.date.desc())
    ).all()
    return [spending_transaction_to_dict(row) for row in rows]

@router.get("/transactions/hidden")
async def list_hidden_transactions(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = db.scalars(
        select(SpendingTransaction)
        .where(
            SpendingTransaction.user_id == user.id,
            SpendingTransaction.hidden.is_(True),
        )
        .order_by(SpendingTransaction.date.desc())
    ).all()

    return [
        spending_transaction_to_dict(row)
        for row in rows
    ]


def _transaction_row(payload: SpendingTransactionInput, user_id: int) -> SpendingTransaction:
    return SpendingTransaction(
        id=str(payload.id or uuid4()),
        user_id=user_id,
        merchant=payload.merchant or "Unknown merchant",
        amount=payload.amount,
        date=payload.date,
        category=payload.category or "Other",
        account_id=payload.accountId,
        pending=payload.pending,
        source=payload.source or "manual",
    )


@router.post("/transactions")
async def upsert_transaction(payload: SpendingTransactionInput, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    if payload.id:
        existing = db.get(SpendingTransaction, payload.id)
        if existing is not None and existing.user_id != user.id:
            raise HTTPException(status_code=409, detail="Transaction ID is already in use.")
    row = _transaction_row(payload, user.id)
    db.merge(row)
    db.commit()
    return spending_transaction_to_dict(db.get(SpendingTransaction, row.id))


@router.post("/transactions/bulk")
async def upsert_many(payload: list[SpendingTransactionInput], user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    for item in payload:
        if item.id:
            existing = db.get(SpendingTransaction, item.id)
            if existing is not None and existing.user_id != user.id:
                raise HTTPException(status_code=409, detail="Transaction ID is already in use.")
        db.merge(_transaction_row(item, user.id))
    db.commit()
    return {"count": len(payload)}


@router.patch("/transactions/{transaction_id}")
async def patch_transaction(
    transaction_id: str, payload: SpendingTransactionPatch, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    row = db.get(SpendingTransaction, transaction_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Transaction not found.")

    supplied = payload.model_fields_set
    if "category" in supplied:
        row.category = payload.category or "Other"
    if "merchant" in supplied:
        row.merchant = payload.merchant or "Unknown merchant"
    if "amount" in supplied:
        if payload.amount is None:
            raise HTTPException(status_code=422, detail="amount must be a finite number.")
        row.amount = payload.amount
    if "date" in supplied:
        if payload.date is None:
            raise HTTPException(status_code=422, detail="date must be a valid YYYY-MM-DD date.")
        row.date = payload.date
    if "accountId" in supplied:
        row.account_id = payload.accountId
    if "hidden" in supplied:
        row.hidden = bool(payload.hidden)
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
async def set_budget(payload: SpendingBudgetInput, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    from ..models import Setting

    amount = max(payload.budget, Decimal("0"))
    row = db.scalar(select(Setting).where(Setting.user_id == user.id, Setting.key == "spending_budget"))
    if row:
        row.value = {"amount": float(amount)}
    else:
        db.add(Setting(user_id=user.id, key="spending_budget", value={"amount": float(amount)}))
    db.commit()
    return {"budget": float(amount)}
