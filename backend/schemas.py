"""Translation between API payloads and ORM rows.

Legacy domains keep unrecognized attributes in a JSONB `data` column so nothing is
dropped when records with varying shapes come over from localStorage.
"""

from typing import Any

from .models import Asset, Bet, NetWorthSnapshot, Phone, Project, ProjectTransaction, Wallet

KNOWN_CARD_MATCHES = (
    ("chase sapphire preferred", "Chase Sapphire Preferred"),
    ("chase sapphire reserve", "Chase Sapphire Reserve"),
    ("chase freedom unlimited", "Chase Freedom Unlimited"),
    ("chase freedom flex", "Chase Freedom Flex"),
    ("chase slate edge", "Chase Slate Edge"),
    ("capital one venture", "Capital One Venture"),
    ("american express gold", "American Express Gold"),
    ("amex gold", "American Express Gold"),
    ("american express platinum", "American Express Platinum"),
    ("amex platinum", "American Express Platinum"),
    ("discover it", "Discover it"),
    ("citi double cash", "Citi Double Cash"),
    ("citi custom cash", "Citi Custom Cash"),
)


def classify_spending_account(name: Any, account_type: Any) -> dict[str, Any]:
    text = f"{account_type or ''} {name or ''}".lower()
    for pattern, matched_name in KNOWN_CARD_MATCHES:
        if pattern in text:
            return {"category": "debts", "matchedName": matched_name, "confidence": "high"}
    markers = ("credit", "card", "visa", "mastercard", "amex", "discover", "sapphire", "freedom", "slate")
    if any(marker in text for marker in markers):
        return {"category": "debts", "matchedName": None, "confidence": "possible"}
    return {"category": "cash", "matchedName": None, "confidence": "none"}

# resource name -> (model, typed column names)
RESOURCES: dict[str, tuple[Any, list[str]]] = {
    "assets": (Asset, ["name", "category", "symbol", "quantity", "current_price", "manual_value"]),
    "phones": (Phone, ["model", "market_value", "market_value_source"]),
    "wallets": (Wallet, ["label", "chain", "address"]),
    "projects": (Project, ["name", "invested", "earned", "category", "inactive"]),
    "bets": (Bet, ["amount", "date", "result"]),
}

NUMERIC_FIELDS = {"quantity", "current_price", "manual_value", "market_value", "invested", "earned", "amount", "value"}
BOOLEAN_FIELDS = {"inactive"}


def _coerce(field: str, value: Any) -> Any:
    if value is None:
        return None
    if field in NUMERIC_FIELDS:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    if field in BOOLEAN_FIELDS:
        return bool(value)
    return value


def row_to_dict(row: Any, typed_fields: list[str]) -> dict[str, Any]:
    payload = dict(row.data or {})
    payload["id"] = row.id
    for field in typed_fields:
        payload[field] = getattr(row, field)
    return payload


def dict_to_columns(payload: dict[str, Any], typed_fields: list[str]) -> tuple[dict[str, Any], dict[str, Any]]:
    columns = {field: _coerce(field, payload.get(field)) for field in typed_fields if field in payload}
    reserved = set(typed_fields) | {"id", "user_id", "created_at", "updated_at"}
    extra = {key: value for key, value in payload.items() if key not in reserved}
    return columns, extra


def project_transaction_to_dict(row: ProjectTransaction) -> dict[str, Any]:
    payload = dict(row.data or {})
    payload.update(
        {
            "id": row.id,
            "project_id": row.project_id,
            "type": row.type,
            "amount": row.amount,
            "date": row.occurred_at,
            "note": row.note,
        }
    )
    return payload


def spending_account_to_dict(row: Any) -> dict[str, Any]:
    payload = {
        "id": row.id,
        "name": row.name,
        "type": row.type,
        "currentBalance": row.current_balance,
        "providerAccountId": row.provider_account_id,
        "linkedAt": row.linked_at.isoformat() if row.linked_at else None,
    }
    payload["classification"] = classify_spending_account(row.name, row.type)
    return payload


def spending_transaction_to_dict(row: Any) -> dict[str, Any]:
    return {
        "id": row.id,
        "merchant": row.merchant,
        "amount": row.amount,
        "date": row.date,
        "category": row.category,
        "accountId": row.account_id,
        "pending": row.pending,
        "hidden": row.hidden,
        "source": row.source,
    }


def snapshot_to_dict(row: NetWorthSnapshot) -> dict[str, Any]:
    payload = dict(row.data or {})
    payload.update({"timestamp": row.timestamp, "value": row.value, "source": row.source})
    return payload
