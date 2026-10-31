"""Strict input validation for persisted spending amounts and dates."""
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any
from fastapi import HTTPException

def finite_money(value: Any, field: str = "amount") -> float:
    if isinstance(value, bool) or isinstance(value, (dict, list)):
        raise HTTPException(422, f"{field} must be a finite number.")
    try:
        amount = Decimal(str(0 if value is None or value == "" else value))
        if not amount.is_finite() or amount.copy_abs() > Decimal("1000000000000000"):
            raise ValueError("non-finite or out of range")
        return float(amount)
    except (InvalidOperation, ValueError, OverflowError, TypeError) as error:
        raise HTTPException(422, f"{field} must be a finite number.") from error

def iso_day(value: Any) -> str:
    if not isinstance(value, str) or len(value) < 10:
        raise HTTPException(422, "date must be a valid YYYY-MM-DD date.")
    prefix = value[:10]
    try:
        if date.fromisoformat(prefix).isoformat() != prefix or (len(value) > 10 and value[10] not in ("T", " ")):
            raise ValueError("invalid date")
    except ValueError as error:
        raise HTTPException(422, "date must be a valid YYYY-MM-DD date.") from error
    return prefix
