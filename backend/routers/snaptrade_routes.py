"""SnapTrade brokerage authorization and investment holdings sync."""

import os
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Asset, SnaptradeConnection, User, utcnow
from .simplefin_routes import get_cipher

router = APIRouter(prefix="/api/snaptrade", tags=["snaptrade"])


def get_client():
    client_id = os.getenv("SNAPTRADE_CLIENT_ID")
    consumer_key = os.getenv("SNAPTRADE_CONSUMER_KEY") or os.getenv("SNAPTRADE_API_KEY")
    if not client_id or not consumer_key:
        raise HTTPException(status_code=503, detail="SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY must be set on the backend.")
    try:
        from snaptrade_client import SnapTrade
        return SnapTrade(consumer_key=consumer_key, client_id=client_id)
    except ImportError as error:
        raise HTTPException(status_code=503, detail="SnapTrade SDK is not installed on the backend.") from error


def body(response):
    return getattr(response, "body", response)


def require_connection(user: User, db: Session) -> SnaptradeConnection:
    connection = db.scalar(select(SnaptradeConnection).where(SnaptradeConnection.user_id == user.id))
    if not connection:
        raise HTTPException(status_code=404, detail="Connect SnapTrade before syncing.")
    return connection


def decrypt_user_secret(connection: SnaptradeConnection) -> str:
    try:
        return get_cipher().decrypt(connection.user_secret.encode()).decode()
    except Exception as error:
        raise HTTPException(status_code=409, detail="Stored SnapTrade credentials could not be read. Reconnect Fidelity.") from error


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
    client = get_client()
    connection = db.scalar(select(SnaptradeConnection).where(SnaptradeConnection.user_id == user.id))
    if not connection:
        response = body(client.authentication.register_snap_trade_user(user_id=str(user.id)))
        snaptrade_user_id = response.get("userId") or response.get("user_id")
        user_secret = response.get("userSecret") or response.get("user_secret")
        if not snaptrade_user_id or not user_secret:
            raise HTTPException(status_code=502, detail="SnapTrade did not return user credentials.")
        connection = SnaptradeConnection(
            id=str(uuid4()),
            user_id=user.id,
            snaptrade_user_id=str(snaptrade_user_id),
            user_secret=get_cipher().encrypt(str(user_secret).encode()).decode(),
            brokerage="Fidelity",
        )
        db.add(connection)
        db.commit()

    response = body(client.authentication.login_snap_trade_user(
        user_id=connection.snaptrade_user_id,
        user_secret=decrypt_user_secret(connection),
    ))
    redirect_uri = response.get("redirectURI") or response.get("redirect_uri") or response.get("redirectUrl")
    if not redirect_uri:
        raise HTTPException(status_code=502, detail="SnapTrade did not return an authorization URL.")
    return {"redirect_uri": redirect_uri}


@router.post("/sync")
async def sync(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    client = get_client()
    connection = require_connection(user, db)
    accounts_response = body(client.account_information.list_user_accounts(
        user_id=connection.snaptrade_user_id,
        user_secret=connection.user_secret,
    ))
    accounts = accounts_response if isinstance(accounts_response, list) else accounts_response.get("accounts", accounts_response.get("data", []))
    synced = 0
    for account in accounts or []:
        account_id = str(account.get("id") or account.get("accountId") or "")
        if not account_id:
            continue
        holdings_response = body(client.account_information.get_user_holdings(
            user_id=connection.snaptrade_user_id,
            user_secret=decrypt_user_secret(connection),
            account_id=account_id,
        ))
        holdings = holdings_response if isinstance(holdings_response, list) else holdings_response.get("holdings", holdings_response.get("data", []))
        for holding in holdings or []:
            symbol = holding.get("symbol", {}) if isinstance(holding.get("symbol"), dict) else {}
            ticker = str(holding.get("ticker") or symbol.get("symbol") or symbol.get("ticker") or "").upper()
            quantity = float(holding.get("units") or holding.get("quantity") or holding.get("unitsOwned") or 0)
            price = float(holding.get("price") or holding.get("lastPrice") or holding.get("currentPrice") or 0)
            if not ticker or quantity == 0:
                continue
            asset_id = f"snaptrade-asset-{account_id}-{ticker}"
            asset = db.get(Asset, asset_id) or Asset(id=asset_id, user_id=user.id, data={})
            asset.name = symbol.get("description") or symbol.get("name") or ticker
            asset.category = "stocks"
            asset.symbol = ticker
            asset.quantity = quantity
            asset.current_price = price
            asset.manual_value = None
            asset.data = {**(asset.data or {}), "provider": "snaptrade", "provider_account_id": account_id, "synced_at": utcnow().isoformat()}
            db.merge(asset)
            synced += 1
    connection.last_synced_at = utcnow()
    db.commit()
    return {"synced": synced, "last_synced_at": connection.last_synced_at.isoformat()}