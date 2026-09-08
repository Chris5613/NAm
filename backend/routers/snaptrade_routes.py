"""SnapTrade brokerage authorization and investment holdings sync."""

import os
from uuid import uuid4
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Asset, SnaptradeConnection, User, utcnow

router = APIRouter(prefix="/api/snaptrade", tags=["snaptrade"])


def get_client():
    client_id = os.getenv("SNAPTRADE_CLIENT_ID")
    consumer_key = os.getenv("SNAPTRADE_CONSUMER_KEY") or os.getenv("SNAPTRADE_API_KEY")
    if not client_id or not consumer_key:
        raise HTTPException(status_code=503, detail="SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY must be set on the backend.")
    try:
        from snaptrade_client import SnapTrade, SnapTradeAuth
        # Personal keys auto-provision their single user at signup; no registerUser/user_id/user_secret needed.
        auth = SnapTradeAuth.personal_api_key(consumer_key=consumer_key, client_id=client_id)
        return SnapTrade(auth=auth)
    except ImportError as error:
        raise HTTPException(status_code=503, detail="SnapTrade SDK is not installed on the backend.") from error


def body(response: Any) -> Any:
    value = getattr(response, "body", response)
    if isinstance(value, (dict, list)):
        return value
    for method_name in ("to_dict", "model_dump"):
        method = getattr(value, method_name, None)
        if callable(method):
            return method()
    return value


def response_list(value: Any, *keys: str) -> list[dict[str, Any]]:
    value = body(value)
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in keys:
            candidate = value.get(key)
            if isinstance(candidate, list):
                return candidate
        data = value.get("data")
        return data if isinstance(data, list) else []
    return []


def api_error_detail(error: Exception) -> str:
    """Extract the JSON error body from a SnapTrade ApiException (str(error) buries it after huge headers)."""
    raw_body = getattr(error, "body", None)
    if raw_body:
        try:
            parsed = raw_body if isinstance(raw_body, dict) else __import__("json").loads(raw_body)
            message = parsed.get("detail") or parsed.get("message") or parsed.get("error")
            if message:
                return str(message)[:240]
        except Exception:
            pass
        return str(raw_body)[:240]
    return str(error)[:240]


def require_connection(user: User, db: Session) -> SnaptradeConnection:
    connection = db.scalar(select(SnaptradeConnection).where(SnaptradeConnection.user_id == user.id))
    if not connection:
        raise HTTPException(status_code=404, detail="Connect SnapTrade before syncing.")
    return connection


@router.get("/status")
async def status(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    connection = db.scalar(select(SnaptradeConnection).where(SnaptradeConnection.user_id == user.id))
    return {
        "configured": bool(os.getenv("SNAPTRADE_CLIENT_ID") and (os.getenv("SNAPTRADE_CONSUMER_KEY") or os.getenv("SNAPTRADE_API_KEY"))),
        "connected": connection is not None,
        "last_synced_at": connection.last_synced_at.isoformat() if connection and connection.last_synced_at else None,
    }


@router.post("/connect")
async def connect(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    try:
        client = get_client()
        connection = db.scalar(select(SnaptradeConnection).where(SnaptradeConnection.user_id == user.id))
        if not connection:
            connection = SnaptradeConnection(
                id=str(uuid4()),
                user_id=user.id,
                snaptrade_user_id="",
                user_secret="",
                brokerage="Fidelity",
            )
            db.add(connection)
            db.commit()

        response = body(client.authentication.login_snap_trade_user(
            custom_redirect=os.getenv("SNAPTRADE_REDIRECT_URI") or None,
        ))
        redirect_uri = response.get("redirectURI") or response.get("redirect_uri") or response.get("redirectUrl")
        if not redirect_uri:
            raise HTTPException(status_code=502, detail="SnapTrade did not return an authorization URL.")
        return {"redirect_uri": redirect_uri}
    except HTTPException:
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"SnapTrade connection failed: {api_error_detail(error)}") from error


@router.post("/sync")
async def sync(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    client = get_client()
    connection = require_connection(user, db)
    try:
        accounts_response = body(client.account_information.list_user_accounts())
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"SnapTrade sync failed: {api_error_detail(error)}") from error
    accounts = response_list(accounts_response, "accounts")
    synced = 0
    for account in accounts or []:
        account_id = str(account.get("id") or account.get("accountId") or "")
        if not account_id:
            continue
        balance = account.get("balance") or {}
        total = balance.get("total") or {}
        amount = total.get("amount")
        if amount is None:
            continue
        name = account.get("name") or account.get("institution_name") or "SnapTrade account"
        asset_id = f"snaptrade-asset-{account_id}"
        asset = db.get(Asset, asset_id) or Asset(id=asset_id, user_id=user.id, data={})
        asset.name = f"{account.get('institution_name') or 'SnapTrade'} - {name}"
        asset.category = "stocks"
        asset.symbol = None
        asset.quantity = 1
        asset.current_price = float(amount)
        asset.manual_value = None
        asset.data = {**(asset.data or {}), "provider": "snaptrade", "provider_account_id": account_id, "synced_at": utcnow().isoformat()}
        db.merge(asset)
        synced += 1
    connection.last_synced_at = utcnow()
    db.commit()
    return {"synced": synced, "last_synced_at": connection.last_synced_at.isoformat()}