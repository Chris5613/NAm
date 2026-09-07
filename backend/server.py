"""Backend endpoints for the Net Worth Tracker."""

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from cryptography.fernet import Fernet, InvalidToken
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Net Worth Tracker - Backend", version="0.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PLAID_ENVIRONMENTS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}

BACKEND_DIR = Path(__file__).parent
ITEMS_FILE = BACKEND_DIR / ".plaid_items.json"
KEY_FILE = BACKEND_DIR / ".plaid_key"
_cipher: Fernet | None = None


def get_cipher() -> Fernet:
    """Encryption key comes from PLAID_ENCRYPTION_KEY; a local key file is the dev fallback."""
    global _cipher
    if _cipher is not None:
        return _cipher

    key = os.getenv("PLAID_ENCRYPTION_KEY")
    if not key:
        if KEY_FILE.exists():
            key = KEY_FILE.read_text().strip()
        else:
            key = Fernet.generate_key().decode()
            KEY_FILE.write_text(key)
            KEY_FILE.chmod(0o600)
    _cipher = Fernet(key.encode())
    return _cipher


def load_items() -> dict[str, dict[str, Any]]:
    if not ITEMS_FILE.exists():
        return {}
    try:
        return json.loads(ITEMS_FILE.read_text())
    except json.JSONDecodeError:
        return {}


def save_items(items: dict[str, dict[str, Any]]) -> None:
    ITEMS_FILE.write_text(json.dumps(items, indent=2))
    ITEMS_FILE.chmod(0o600)


def read_access_token(item: dict[str, Any]) -> str:
    try:
        return get_cipher().decrypt(item["access_token"].encode()).decode()
    except (InvalidToken, KeyError) as error:
        raise HTTPException(
            status_code=409,
            detail="Stored bank credentials could not be read. Link the account again.",
        ) from error


class LinkTokenRequest(BaseModel):
    client_user_id: str


class PublicTokenRequest(BaseModel):
    public_token: str


class SyncTransactionsRequest(BaseModel):
    item_id: str


def plaid_config() -> tuple[str, str, str]:
    client_id = os.getenv("PLAID_CLIENT_ID")
    secret = os.getenv("PLAID_SECRET")
    environment = os.getenv("PLAID_ENV", "sandbox").lower()
    base_url = PLAID_ENVIRONMENTS.get(environment)
    if not client_id or not secret or not base_url:
        raise HTTPException(
            status_code=503,
            detail="Plaid is not configured. Set PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV on the backend.",
        )
    return client_id, secret, base_url


def plaid_post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    client_id, secret, base_url = plaid_config()
    body = json.dumps({"client_id": client_id, "secret": secret, **payload}).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        response_body = error.read().decode("utf-8")
        try:
            message = json.loads(response_body).get("error_message", response_body)
        except json.JSONDecodeError:
            message = response_body
        raise HTTPException(status_code=error.code, detail=message) from error
    except urllib.error.URLError as error:
        raise HTTPException(status_code=502, detail="Could not reach Plaid.") from error


@app.get("/api/")
async def root() -> dict[str, str]:
    return {
        "status": "ok",
        "message": "Backend proxy services are running.",
    }


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def read_kryptex(path: str):
    try:
        with urlopen(f"http://127.0.0.1:8107/{path}", timeout=3) as response:
            return json.load(response)
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=503,
            detail="Kryptex is not running or its local service is unavailable.",
        ) from error


@app.get("/api/kryptex/status")
async def kryptex_status() -> dict:
    return {
        "balance": read_kryptex("balance"),
        "devices": read_kryptex("devices"),
        "currency_rates": read_kryptex("currency-rates"),
    }


@app.get("/api/jupiter/fluid-pnl")
async def jupiter_fluid_pnl(vault_id: int, position_id: int) -> dict:
    url = (
        "https://api.solana.fluid.io/v2/main/borrowing/"
        f"vaults/{vault_id}/nfts/{position_id}/pnl"
    )

    request = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/151.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
            "Referer": "https://jup.ag/",
        },
    )

    try:
        with urlopen(request, timeout=10) as response:
            return json.load(response)

    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")

        raise HTTPException(
            status_code=error.code,
            detail=f"Fluid API returned HTTP {error.code}: {body[:500]}",
        ) from error

    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=503,
            detail=f"Fluid P&L service unavailable: {error}",
        ) from error


@app.post("/api/plaid/link-token")
async def create_link_token(request: LinkTokenRequest) -> dict[str, str]:
    response = plaid_post(
        "/link/token/create",
        {
            "client_name": "Net Worth Tracker",
            "language": "en",
            "country_codes": ["US"],
            "products": ["transactions"],
            "user": {"client_user_id": request.client_user_id},
        },
    )
    return {"link_token": response["link_token"]}


@app.post("/api/plaid/exchange-public-token")
async def exchange_public_token(request: PublicTokenRequest) -> dict[str, Any]:
    exchange = plaid_post("/item/public_token/exchange", {"public_token": request.public_token})
    item_id = str(uuid4())
    linked_at = datetime.now(timezone.utc).isoformat()

    items = load_items()
    items[item_id] = {
        "access_token": get_cipher().encrypt(exchange["access_token"].encode()).decode(),
        "plaid_item_id": exchange["item_id"],
        "cursor": "",
        "linked_at": linked_at,
    }
    save_items(items)

    accounts_response = plaid_post("/accounts/get", {"access_token": exchange["access_token"]})
    accounts = [
        {
            "id": account["account_id"],
            "name": account.get("name", "Plaid account"),
            "type": account.get("subtype") or account.get("type", "Account").replace("_", " ").title(),
            "currentBalance": account.get("balances", {}).get("current"),
            "plaidItemId": item_id,
            "linkedAt": linked_at,
        }
        for account in accounts_response.get("accounts", [])
    ]
    return {"item_id": item_id, "accounts": accounts}


@app.post("/api/plaid/sync-transactions")
async def sync_transactions(request: SyncTransactionsRequest) -> dict[str, Any]:
    items = load_items()
    item = items.get(request.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="The linked Plaid account is no longer available. Link it again.")

    access_token = read_access_token(item)
    cursor = item["cursor"]
    added_transactions: list[dict[str, Any]] = []
    while True:
        response = plaid_post("/transactions/sync", {"access_token": access_token, "cursor": cursor})
        added_transactions.extend(response.get("added", []))
        cursor = response.get("next_cursor", cursor)
        if not response.get("has_more"):
            break

    item["cursor"] = cursor
    item["last_synced_at"] = datetime.now(timezone.utc).isoformat()
    save_items(items)
    transactions = [
        {
            "id": transaction["transaction_id"],
            "merchant": transaction.get("merchant_name") or transaction.get("name") or "Unknown merchant",
            "amount": transaction.get("amount", 0),
            "date": transaction.get("date"),
            "accountId": transaction.get("account_id"),
            "category": (transaction.get("personal_finance_category") or {}).get("primary") or "Other",
            "pending": transaction.get("pending", False),
            "source": "plaid",
        }
        for transaction in added_transactions
        if transaction.get("amount", 0) > 0 and transaction.get("date")
    ]
    return {"transactions": transactions, "synced_at": datetime.now(timezone.utc).isoformat()}
