"""SimpleFIN Bridge access URL storage and read-only sync."""

import base64
import binascii
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from urllib.parse import unquote, urlencode, urlsplit, urlunsplit
from typing import Any
from uuid import uuid4

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Asset, SimplefinConnection, SpendingAccount, SpendingTransaction, User, utcnow
from ..schemas import spending_account_to_dict, spending_transaction_to_dict

router = APIRouter(prefix="/api/simplefin", tags=["simplefin"])
_cipher: Fernet | None = None


def get_cipher() -> Fernet:
    global _cipher
    if _cipher is None:
        key = os.getenv("APP_ENCRYPTION_KEY")
        if not key:
            raise HTTPException(status_code=503, detail="APP_ENCRYPTION_KEY is not set on the backend.")
        _cipher = Fernet(key.encode())
    return _cipher


def normalize_access_url(access_url: str) -> tuple[str, str | None]:
    """Remove credentials from the URL and return an explicit Basic Auth value."""
    parts = urlsplit(access_url.strip())
    if parts.scheme != "https" or not parts.hostname:
        raise HTTPException(status_code=400, detail="SimpleFIN returned an invalid HTTPS access URL.")

    credentials = None
    if "@" in parts.netloc:
        userinfo, host = parts.netloc.rsplit("@", 1)
        username, separator, password = userinfo.partition(":")
        if separator:
            credentials = base64.b64encode(
                f"{unquote(username)}:{unquote(password)}".encode("utf-8")
            ).decode("ascii")
    else:
        host = parts.netloc

    path = parts.path.rstrip("/") or "/accounts"
    query = parts.query or urlencode({"version": "2"})
    return urlunsplit(("https", host, path, query, "")), credentials


KNOWN_CARDS = (
    ("chase sapphire preferred", "Chase", "Sapphire Preferred"),
    ("chase sapphire reserve", "Chase", "Sapphire Reserve"),
    ("chase freedom unlimited", "Chase", "Freedom Unlimited"),
    ("chase freedom flex", "Chase", "Freedom Flex"),
    ("chase slate edge", "Chase", "Slate Edge"),
    ("capital one venture", "Capital One", "Venture"),
    ("capital one savor", "Capital One", "Savor"),
    ("american express gold", "American Express", "Gold"),
    ("amex gold", "American Express", "Gold"),
    ("american express platinum", "American Express", "Platinum"),
    ("amex platinum", "American Express", "Platinum"),
    ("discover it", "Discover", "it"),
    ("citi double cash", "Citi", "Double Cash"),
    ("citi custom cash", "Citi", "Custom Cash"),
)


def classify_account(account_type: Any, account_name: Any) -> dict[str, Any]:
    text = f"{account_type or ''} {account_name or ''}".lower()
    for pattern, issuer, product in KNOWN_CARDS:
        if pattern in text:
            return {"category": "debts", "matched_name": f"{issuer} {product}", "confidence": "high"}
    card_markers = (
        "credit", "card", "visa", "mastercard", "amex", "american express",
        "discover", "sapphire", "freedom", "slate", "quicksilver", "capital one",
    )
    if any(marker in text for marker in card_markers):
        return {"category": "debts", "matched_name": None, "confidence": "possible"}
    return {"category": "cash", "matched_name": None, "confidence": "none"}


def looks_like_credit_card(account_type: Any, account_name: Any) -> bool:
    return classify_account(account_type, account_name)["category"] == "debts"


def normalize_transaction_date(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)) or str(value).isdigit():
        return datetime.fromtimestamp(float(value), tz=timezone.utc).date().isoformat()
    return str(value)[:10]


def simplefin_transaction_key(account_id: str, merchant: str, date_value: str, amount: float) -> tuple[str, str, float, str]:
    return (
        str(account_id),
        str(date_value),
        round(float(amount or 0), 2),
        str(merchant or "SimpleFIN transaction").strip().lower(),
    )


TRANSACTION_CATEGORY_RULES = (
    ("Income", ("payroll", "paycheck", "salary", "direct deposit", "deposit", "adp ", "gusto")),
    ("Transfers", ("transfer", " zelle", "venmo", "cash app", "ach ")),
    ("Payments", ("payment", "autopay", "pay bill", "credit card payment")),
    ("Fees", ("fee", "service charge", "overdraft", "atm fee")),
    ("Taxes", ("irs", "tax", "dmv", "property tax")),
    ("Insurance", ("insurance", "geico", "state farm", "progressive", "allstate")),
    ("Housing", ("rent", "mortgage", "property management", "hoa", "airbnb")),
    ("Utilities", ("electric", "utility", "water bill", "sewer", "gas bill", "internet", "comcast", "verizon", "at&t")),
    ("Groceries", ("grocery", "groceries", "safeway", "kroger", "whole foods", "trader joe", "costco", "walmart", "target")),
    ("Dining", ("restaurant", "doordash", "grubhub", "ubereats", "mcdonald", "subway", "starbucks", "taco", "pizza")),
    ("Gas & Fuel", ("shell", "chevron", "exxon", "mobil", "fuel", "gas station", "76 ")),
    ("Transportation", ("uber", "lyft", "parking", "transit", "metro", "train", "toll", "airline")),
    ("Travel", ("hotel", "resort", "flight", "southwest", "delta", "united airlines", "american airlines", "car rental")),
    ("Subscriptions", ("subscription", "netflix", "spotify", "hulu", "disney", "youtube premium", "apple.com/bill")),
    ("Entertainment", ("cinema", "movie", "theater", "concert", "steam", "playstation", "xbox", "ticketmaster")),
    ("Health", ("pharmacy", "cvs", "walgreens", "doctor", "hospital", "medical", "dental", "vision")),
    ("Personal Care", ("salon", "barber", "spa", "haircut")),
    ("Pets", ("pet", "veterinary", "vetco", "chewy")),
    ("Education", ("school", "tuition", "university", "college", "course", "udemy")),
    ("Shopping", ("amazon", "ebay", "etsy", "shop", "store", "clothing", "best buy", "home depot", "lowe")),
)


def classify_transaction(transaction: dict[str, Any]) -> str:
    text = " ".join(str(transaction.get(key) or "") for key in ("payee", "description", "memo", "name")).lower()
    for category, keywords in TRANSACTION_CATEGORY_RULES:
        if any(keyword in text for keyword in keywords):
            return category
    return "Other"


def fetch_simplefin(access_url: str) -> dict[str, Any]:
    if not access_url.startswith("https://"):
        raise HTTPException(status_code=400, detail="SimpleFIN access URL must use HTTPS.")
    request_url, credentials = normalize_access_url(access_url)
    headers = {"Accept": "application/json"}
    if credentials:
        headers["Authorization"] = f"Basic {credentials}"
    request = urllib.request.Request(request_url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
            if not isinstance(payload, dict):
                raise HTTPException(status_code=502, detail="SimpleFIN returned an invalid response.")
            return payload
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:300]
        raise HTTPException(status_code=error.code, detail=f"SimpleFIN rejected the access URL: {detail}") from error
    except urllib.error.URLError as error:
        raise HTTPException(status_code=502, detail="Could not reach SimpleFIN.") from error
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=502, detail="SimpleFIN returned invalid JSON.") from error


class ConnectionRequest(BaseModel):
    access_url: str
    label: str | None = None


class SetupTokenRequest(BaseModel):
    setup_token: str
    label: str | None = None


class SyncRequest(BaseModel):
    connection_id: str | None = None


class BrowserSyncRequest(BaseModel):
    connection_id: str
    payload: dict[str, Any]


@router.post("/connections")
async def add_connection(
    request: ConnectionRequest, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    connection_id = str(uuid4())
    connection = SimplefinConnection(
        id=connection_id,
        user_id=user.id,
        access_url=get_cipher().encrypt(request.access_url.strip().encode()).decode(),
        label=request.label or "SimpleFIN",
    )
    db.add(connection)
    db.commit()
    return {"id": connection_id, "label": connection.label}


def save_simplefin_payload(payload: dict[str, Any], connection: SimplefinConnection, user: User, db: Session) -> dict:
    saved: list[SpendingTransaction] = []
    account_count = 0
    received_transaction_count = 0
    accounts = payload.get("accounts") or payload.get("account") or []
    if isinstance(accounts, dict):
        accounts = [accounts]
    top_level_transactions = payload.get("transactions") or payload.get("transaction") or []
    if isinstance(top_level_transactions, dict):
        top_level_transactions = [top_level_transactions]
    for account in accounts:
        account_count += 1
        account_id = str(account.get("id") or uuid4())
        account_type = str(account.get("type") or account.get("subtype") or "").lower()
        account_name = account.get("name") or connection.label or "SimpleFIN account"
        balance = account.get("available-balance", account.get("balance", account.get("current-balance")))
        is_debt = looks_like_credit_card(account_type, account_name)
        account_row = SpendingAccount(
            id=f"simplefin-{account_id}",
            user_id=user.id,
            name=account_name,
            type=account.get("type") or account.get("subtype"),
            current_balance=balance,
            provider_account_id=f"simplefin-{account_id}",
            linked_at=connection.created_at,
        )
        db.merge(account_row)
        asset_id = f"simplefin-asset-{account_id}"
        asset = db.get(Asset, asset_id)
        if not asset:
            asset = Asset(id=asset_id, user_id=user.id, data={})
        asset.name = account_name
        asset.category = "debts" if is_debt else "cash"
        asset.quantity = 1
        asset.current_price = 0
        asset.manual_value = abs(float(balance or 0))
        asset.data = {
            **(asset.data or {}),
            "provider_account_id": f"simplefin-{account_id}",
            "provider": "simplefin",
            "synced_at": utcnow().isoformat(),
        }
        db.merge(asset)
        transactions = account.get("transactions") or account.get("transaction") or []
        if isinstance(transactions, dict):
            transactions = [transactions]
        if not transactions:
            account_keys = {str(value) for value in (
                account.get("id"), account.get("account-id"), account.get("account_id")
            ) if value is not None}
            transactions = [transaction for transaction in top_level_transactions if not account_keys or str(
                transaction.get("account-id") or transaction.get("account_id") or transaction.get("accountId") or ""
            ) in account_keys]
        if not transactions and len(accounts) == 1:
            transactions = top_level_transactions
        seen_txns = set()
        received_transaction_count += len(transactions)
        for transaction in transactions:
            transaction_id = transaction.get("id") or transaction.get("id_string") or str(uuid4())
            posted = normalize_transaction_date(
                transaction.get("posted") or transaction.get("date") or transaction.get("transacted")
            )
            if not posted:
                continue
            amount = abs(float(transaction.get("amount") or 0))
            if amount <= 0:
                continue
            merchant = transaction.get("payee") or transaction.get("description") or transaction.get("memo") or "SimpleFIN transaction"
            account_key = f"simplefin-{account_id}"
            tx_key = simplefin_transaction_key(account_key, merchant, str(posted)[:10], amount)
            if tx_key in seen_txns:
                continue
            seen_txns.add(tx_key)

            existing_transaction = db.get(SpendingTransaction, f"simplefin-{transaction_id}")
            if existing_transaction is None:
                existing_transaction = db.scalar(
                    select(SpendingTransaction).where(
                        SpendingTransaction.user_id == user.id,
                        SpendingTransaction.account_id == account_key,
                        SpendingTransaction.source == "simplefin",
                        SpendingTransaction.merchant == merchant,
                        SpendingTransaction.date == str(posted)[:10],
                        SpendingTransaction.amount == amount,
                    )
                )
            if existing_transaction is not None:
                continue

            row = SpendingTransaction(
                id=f"simplefin-{transaction_id}",
                user_id=user.id,
                merchant=merchant,
                amount=amount,
                date=str(posted)[:10],
                category=classify_transaction(transaction),
                account_id=account_key,
                pending=False,
                hidden=False,
                source="simplefin",
            )
            db.merge(row)
            saved.append(row)
    connection.last_synced_at = utcnow()
    db.commit()
    return {
        "accounts": account_count,
        "received_transactions": received_transaction_count,
        "transactions": [spending_transaction_to_dict(row) for row in saved],
        "synced_at": utcnow().isoformat(),
    }


@router.post("/browser-sync")
async def browser_sync(
    request: BrowserSyncRequest, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    connection = db.scalar(select(SimplefinConnection).where(SimplefinConnection.id == request.connection_id, SimplefinConnection.user_id == user.id))
    if not connection:
        raise HTTPException(status_code=404, detail="SimpleFIN connection not found.")
    return save_simplefin_payload(request.payload, connection, user, db)


@router.post("/claim")
async def claim_setup_token(request: SetupTokenRequest) -> dict:
    """Exchange a SimpleFIN setup token for the HTTPS access URL."""
    setup_token = request.setup_token.strip()
    if not setup_token:
        raise HTTPException(status_code=400, detail="SimpleFIN setup token is required.")

    # SimpleFIN setup tokens are base64-encoded claim URLs. The claim request
    # must be an empty POST to that decoded URL and is valid only once.
    try:
        padded_token = setup_token + ("=" * (-len(setup_token) % 4))
        claim_url = base64.urlsafe_b64decode(padded_token.encode("ascii")).decode("utf-8").strip()
    except (UnicodeDecodeError, ValueError, binascii.Error) as error:
        raise HTTPException(status_code=400, detail="That is not a valid SimpleFIN setup token.") from error

    if not claim_url.startswith("https://"):
        raise HTTPException(status_code=400, detail="SimpleFIN setup token did not contain an HTTPS claim URL.")

    claim_request = urllib.request.Request(
        claim_url,
        data=b"",
        headers={
            "Content-Length": "0",
            "Accept": "text/plain, application/json, */*",
            "User-Agent": "NetWorthTracker/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(claim_request, timeout=30) as response:
            raw = response.read().decode("utf-8").strip()
            result = {"access_url": raw}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:300]
        raise HTTPException(status_code=error.code, detail=f"SimpleFIN could not claim that setup token: {detail}") from error
    except urllib.error.URLError as error:
        raise HTTPException(status_code=502, detail="Could not reach SimpleFIN to claim the setup token.") from error

    access_url = result.get("access_url", "").strip()
    if not access_url.startswith("https://"):
        raise HTTPException(status_code=502, detail="SimpleFIN returned no HTTPS access URL.")
    return {"access_url": access_url, "label": request.label or "SimpleFIN"}


def read_access_url(connection: SimplefinConnection) -> str:
    try:
        return get_cipher().decrypt(connection.access_url.encode()).decode()
    except InvalidToken as error:
        raise HTTPException(status_code=409, detail="Stored SimpleFIN credentials could not be read. Add the connection again.") from error


@router.post("/sync")
async def sync_simplefin(
    request: SyncRequest, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    query = select(SimplefinConnection).where(SimplefinConnection.user_id == user.id)
    if request.connection_id:
        query = query.where(SimplefinConnection.id == request.connection_id)
    connections = db.scalars(query).all()
    if not connections:
        raise HTTPException(status_code=404, detail="No SimpleFIN connections found.")

    saved: list[SpendingTransaction] = []
    account_count = 0
    for connection in connections:
        payload = fetch_simplefin(read_access_url(connection))
        for account in payload.get("accounts", []):
            account_count += 1
            account_id = str(account.get("id") or uuid4())
            account_row = SpendingAccount(
                id=f"simplefin-{account_id}",
                user_id=user.id,
                name=account.get("name") or connection.label or "SimpleFIN account",
                type=account.get("type"),
                current_balance=account.get("available-balance", account.get("balance")),
                linked_at=connection.created_at,
            )
            db.merge(account_row)
            seen_txns = set()
            for transaction in account.get("transactions", []):
                transaction_id = transaction.get("id")
                posted = transaction.get("posted")
                if not transaction_id or not posted:
                    continue
                amount = abs(float(transaction.get("amount") or 0))
                if amount <= 0:
                    continue
                merchant = transaction.get("payee") or transaction.get("description") or transaction.get("memo") or "SimpleFIN transaction"
                tx_key = simplefin_transaction_key(f"simplefin-{account_id}", merchant, str(posted)[:10], amount)
                if tx_key in seen_txns:
                    continue
                seen_txns.add(tx_key)
                if db.scalar(
                    select(SpendingTransaction).where(
                        SpendingTransaction.user_id == user.id,
                        SpendingTransaction.account_id == f"simplefin-{account_id}",
                        SpendingTransaction.source == "simplefin",
                        SpendingTransaction.merchant == merchant,
                        SpendingTransaction.date == str(posted)[:10],
                        SpendingTransaction.amount == amount,
                    )
                ) is not None:
                    continue
                row = SpendingTransaction(
                    id=f"simplefin-{transaction_id}",
                    user_id=user.id,
                    merchant=merchant,
                    amount=amount,
                    date=str(posted)[:10],
                    category=classify_transaction(transaction),
                    account_id=f"simplefin-{account_id}",
                    pending=False,
                    source="simplefin",
                )
                db.merge(row)
                saved.append(row)
        connection.last_synced_at = utcnow()
    db.commit()
    return {
        "accounts": account_count,
        "transactions": [spending_transaction_to_dict(row) for row in saved],
        "synced_at": utcnow().isoformat(),
    }


@router.get("/connections")
async def list_connections(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(SimplefinConnection).where(SimplefinConnection.user_id == user.id)).all()
    return [
        {
            "id": row.id,
            "label": row.label,
            "access_url": read_access_url(row),
            "last_synced_at": row.last_synced_at.isoformat() if row.last_synced_at else None,
        }
        for row in rows
    ]
