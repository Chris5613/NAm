from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
from pymongo import UpdateOne
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# External API config
COINGECKO_BASE = "https://api.coingecko.com/api/v3"
ALPHA_VANTAGE_BASE = "https://www.alphavantage.co/query"
ALPHA_VANTAGE_KEY = os.environ.get("ALPHA_VANTAGE_KEY", "demo")
FINNHUB_BASE = "https://finnhub.io/api/v1"
FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY", "")
JUPITER_API_KEY = os.environ.get("JUPITER_API_KEY", "")
COINSTATS_API_KEY = os.environ.get("COINSTATS_API_KEY", "")

# --- Models ---

class Asset(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str  # stocks, crypto, cash, crypto_projects, debts
    symbol: Optional[str] = None
    icon_url: Optional[str] = None
    quantity: float = 0
    current_price: float = 0
    manual_value: Optional[float] = None
    cost_basis: float = 0
    notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AssetCreate(BaseModel):
    name: str
    category: str
    symbol: Optional[str] = None
    icon_url: Optional[str] = None
    quantity: float = 0
    current_price: float = 0
    manual_value: Optional[float] = None
    cost_basis: float = 0
    notes: Optional[str] = None

class AssetUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    symbol: Optional[str] = None
    icon_url: Optional[str] = None
    quantity: Optional[float] = None
    current_price: Optional[float] = None
    manual_value: Optional[float] = None
    cost_basis: Optional[float] = None
    notes: Optional[str] = None

class NetWorthSnapshot(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    total_net_worth: float
    stocks_value: float = 0
    crypto_value: float = 0
    cash_value: float = 0
    crypto_projects_value: float = 0
    debts_value: float = 0
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# --- Asset CRUD ---

@api_router.get("/")
async def root():
    return {"message": "Net Worth Tracker API"}

@api_router.get("/assets", response_model=List[Asset])
async def get_assets():
    assets = await db.assets.find({}, {"_id": 0}).to_list(1000)
    return assets

@api_router.post("/assets", response_model=Asset)
async def create_asset(input_data: AssetCreate):
    asset = Asset(**input_data.model_dump())
    doc = asset.model_dump()
    await db.assets.insert_one(doc)
    return asset

@api_router.put("/assets/{asset_id}", response_model=Asset)
async def update_asset(asset_id: str, input_data: AssetUpdate):
    existing = await db.assets.find_one({"id": asset_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    update_data = {k: v for k, v in input_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.assets.update_one({"id": asset_id}, {"$set": update_data})
    updated = await db.assets.find_one({"id": asset_id}, {"_id": 0})
    return updated

@api_router.delete("/assets/{asset_id}")
async def delete_asset(asset_id: str):
    result = await db.assets.delete_one({"id": asset_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"message": "Asset deleted"}


# --- Net Worth ---

async def _get_cached_crypto_total():
    """Read the crypto total cached from the Crypto tab (wallets + DeFi + custom tokens)."""
    doc = await db.crypto_cache.find_one({"_id": "singleton"})
    if not doc:
        return None
    return doc.get("total")


@api_router.get("/crypto/cache")
async def get_crypto_cache():
    doc = await db.crypto_cache.find_one({"_id": "singleton"})
    if not doc:
        return {"total": 0, "chains": [], "tokens": [], "updated_at": None}
    return {
        "total": doc.get("total", 0),
        "chains": doc.get("chains", []),
        "tokens": doc.get("tokens", []),
        "updated_at": doc.get("updated_at"),
    }


@api_router.post("/crypto/cache")
async def set_crypto_cache(data: dict):
    try:
        total = float(data.get("total", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid total value")
    chains = data.get("chains") or []
    tokens = data.get("tokens") or []
    if not isinstance(chains, list) or not isinstance(tokens, list):
        raise HTTPException(status_code=400, detail="chains and tokens must be arrays")
    updated_at = datetime.now(timezone.utc).isoformat()
    await db.crypto_cache.update_one(
        {"_id": "singleton"},
        {"$set": {
            "total": total,
            "chains": chains,
            "tokens": tokens,
            "updated_at": updated_at,
        }},
        upsert=True
    )
    return {"total": total, "chains": chains, "tokens": tokens, "updated_at": updated_at}


@api_router.get("/net-worth")
async def get_net_worth():
    assets = await db.assets.find({}, {"_id": 0}).to_list(1000)
    projects = await db.projects.find({}, {"_id": 0}).to_list(100)
    
    categories = {
        "stocks": 0,
        "crypto": 0,
        "cash": 0,
        "crypto_projects": 0,
        "debts": 0,
        "investments": 0
    }
    
    for asset in assets:
        manual = asset.get("manual_value")
        value = manual if manual is not None else (asset.get("quantity", 0) * asset.get("current_price", 0))
        cat = asset.get("category", "cash")
        if cat in categories:
            categories[cat] += value
    
    # Track investment projects' earnings separately (NOT included in net worth total)
    for project in projects:
        categories["investments"] += (project.get("earned", 0))
    
    # Override crypto with the live Crypto tab total (wallets + DeFi + custom tokens)
    cached_crypto = await _get_cached_crypto_total()
    if cached_crypto is not None:
        categories["crypto"] = cached_crypto
    
    # crypto_projects category is deprecated and no longer contributes to net worth
    # Projects/investments are tracked separately and do NOT contribute to net worth
    total = categories["stocks"] + categories["crypto"] + categories["cash"] - categories["debts"]
    
    return {
        "total_net_worth": total,
        "breakdown": categories,
        "asset_count": len(assets),
        "project_count": len(projects)
    }

@api_router.post("/net-worth/snapshot")
async def save_snapshot():
    assets = await db.assets.find({}, {"_id": 0}).to_list(1000)
    projects = await db.projects.find({}, {"_id": 0}).to_list(100)
    
    categories = {
        "stocks": 0,
        "crypto": 0,
        "cash": 0,
        "crypto_projects": 0,
        "debts": 0,
        "investments": 0
    }
    
    for asset in assets:
        manual = asset.get("manual_value")
        value = manual if manual is not None else (asset.get("quantity", 0) * asset.get("current_price", 0))
        cat = asset.get("category", "cash")
        if cat in categories:
            categories[cat] += value
    
    for project in projects:
        categories["investments"] += (project.get("earned", 0))
    
    # Override crypto with the live Crypto tab total (wallets + DeFi + custom tokens)
    cached_crypto = await _get_cached_crypto_total()
    if cached_crypto is not None:
        categories["crypto"] = cached_crypto
    
    # crypto_projects and investments do NOT contribute to net worth
    total = categories["stocks"] + categories["crypto"] + categories["cash"] - categories["debts"]
    
    snapshot = NetWorthSnapshot(
        total_net_worth=total,
        stocks_value=categories["stocks"],
        crypto_value=categories["crypto"],
        cash_value=categories["cash"],
        crypto_projects_value=categories["crypto_projects"],
        debts_value=categories["debts"]
    )
    
    doc = snapshot.model_dump()
    await db.net_worth_history.insert_one(doc)
    return snapshot

@api_router.get("/net-worth/history")
async def get_net_worth_history():
    history = await db.net_worth_history.find({}, {"_id": 0}).sort("timestamp", 1).to_list(365)
    return history


# --- Price APIs ---

@api_router.get("/prices/crypto/{coin_id}")
async def get_crypto_price(coin_id: str):
    try:
        async with httpx.AsyncClient(timeout=10) as client_http:
            response = await client_http.get(
                f"{COINGECKO_BASE}/simple/price",
                params={
                    "ids": coin_id,
                    "vs_currencies": "usd",
                    "include_24hr_change": "true",
                    "include_market_cap": "true"
                }
            )
            if response.status_code == 200:
                data = response.json()
                if coin_id in data:
                    return {
                        "coin_id": coin_id,
                        "price_usd": data[coin_id].get("usd", 0),
                        "change_24h": data[coin_id].get("usd_24h_change", 0),
                        "market_cap": data[coin_id].get("usd_market_cap", 0)
                    }
            raise HTTPException(status_code=404, detail="Coin not found")
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="CoinGecko API timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/prices/crypto/search/{query}")
async def search_crypto(query: str):
    try:
        async with httpx.AsyncClient(timeout=10) as client_http:
            response = await client_http.get(
                f"{COINGECKO_BASE}/search",
                params={"query": query}
            )
            if response.status_code == 200:
                data = response.json()
                coins = data.get("coins", [])[:10]
                return [{"id": c["id"], "name": c["name"], "symbol": c["symbol"], "icon_url": c.get("large") or c.get("thumb", "")} for c in coins]
            return []
    except Exception:
        return []

@api_router.get("/prices/crypto/info/{coin_id}")
async def get_crypto_info(coin_id: str):
    """Get coin info including icon URL from CoinGecko"""
    try:
        async with httpx.AsyncClient(timeout=10) as client_http:
            response = await client_http.get(
                f"{COINGECKO_BASE}/coins/{coin_id}",
                params={"localization": "false", "tickers": "false", "market_data": "false", "community_data": "false", "developer_data": "false"}
            )
            if response.status_code == 200:
                data = response.json()
                return {
                    "id": data.get("id"),
                    "name": data.get("name"),
                    "symbol": data.get("symbol", "").upper(),
                    "icon_url": data.get("image", {}).get("small", "")
                }
            return None
    except Exception:
        return None

@api_router.get("/prices/stock/{symbol}")
async def get_stock_price(symbol: str):
    """Get real-time stock quote from Finnhub."""
    symbol = symbol.upper().strip()
    try:
        async with httpx.AsyncClient(timeout=10) as client_http:
            response = await client_http.get(
                f"{FINNHUB_BASE}/quote",
                params={"symbol": symbol, "token": FINNHUB_KEY}
            )
            if response.status_code == 200:
                data = response.json()
                price = float(data.get("c", 0) or 0)
                prev_close = float(data.get("pc", 0) or 0)
                if price <= 0:
                    raise HTTPException(status_code=404, detail=f"No quote found for {symbol}")
                change = price - prev_close
                change_percent = ((change / prev_close) * 100) if prev_close > 0 else 0
                return {
                    "symbol": symbol,
                    "price": price,
                    "change": change,
                    "change_percent": f"{change_percent:.2f}%",
                    "high": float(data.get("h", 0) or 0),
                    "low": float(data.get("l", 0) or 0),
                    "open": float(data.get("o", 0) or 0),
                    "prev_close": prev_close,
                }
            if response.status_code == 429:
                raise HTTPException(status_code=429, detail="Finnhub rate limit reached (60/min). Try again shortly.")
            raise HTTPException(status_code=response.status_code, detail=f"Finnhub error: {response.text[:200]}")
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Finnhub API timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/prices/stock/search/{query}")
async def search_stock(query: str):
    """Search stock tickers via Finnhub."""
    try:
        async with httpx.AsyncClient(timeout=10) as client_http:
            response = await client_http.get(
                f"{FINNHUB_BASE}/search",
                params={"q": query, "token": FINNHUB_KEY}
            )
            if response.status_code == 200:
                data = response.json()
                results = data.get("result", [])[:15]
                # Prefer common stocks (no dots/colons meaning US tickers)
                return [
                    {
                        "symbol": r.get("symbol", ""),
                        "name": r.get("description", ""),
                        "type": r.get("type", ""),
                    }
                    for r in results
                    if r.get("symbol") and "." not in r.get("symbol", "")
                ][:10]
            return []
    except Exception as e:
        logger.warning(f"Stock search failed: {e}")
        return []

# --- Bulk price update ---

@api_router.post("/prices/refresh")
async def refresh_all_prices():
    assets = await db.assets.find({}, {"_id": 0}).to_list(1000)
    updated_count = 0
    
    crypto_assets = [a for a in assets if a.get("category") == "crypto" and a.get("symbol")]
    stock_assets = [a for a in assets if a.get("category") == "stocks" and a.get("symbol")]
    
    # Batch crypto prices
    if crypto_assets:
        coin_ids = ",".join([a["symbol"].lower() for a in crypto_assets])
        try:
            async with httpx.AsyncClient(timeout=15) as client_http:
                response = await client_http.get(
                    f"{COINGECKO_BASE}/simple/price",
                    params={"ids": coin_ids, "vs_currencies": "usd"}
                )
                if response.status_code == 200:
                    prices = response.json()
                    operations = []
                    for asset in crypto_assets:
                        coin_id = asset["symbol"].lower()
                        if coin_id in prices:
                            new_price = prices[coin_id].get("usd", 0)
                            operations.append(UpdateOne(
                                {"id": asset["id"]},
                                {"$set": {"current_price": new_price, "updated_at": datetime.now(timezone.utc).isoformat()}}
                            ))
                    if operations:
                        await db.assets.bulk_write(operations)
                        updated_count += len(operations)
        except Exception as e:
            logger.warning(f"Failed to refresh crypto prices: {e}")
    
    # Stock prices via Finnhub (60 req/min free tier — no practical limit for typical portfolios)
    stock_operations = []
    async with httpx.AsyncClient(timeout=10) as client_http:
        async def fetch_one_stock(asset):
            try:
                resp = await client_http.get(
                    f"{FINNHUB_BASE}/quote",
                    params={"symbol": asset["symbol"].upper(), "token": FINNHUB_KEY}
                )
                if resp.status_code == 200:
                    d = resp.json()
                    price = float(d.get("c", 0) or 0)
                    if price > 0:
                        return UpdateOne(
                            {"id": asset["id"]},
                            {"$set": {"current_price": price, "updated_at": datetime.now(timezone.utc).isoformat()}}
                        )
            except Exception as e:
                logger.warning(f"Failed to refresh stock price for {asset.get('symbol')}: {e}")
            return None

        # Fetch up to 30 stock prices concurrently (well within 60/min)
        results = await asyncio.gather(*[fetch_one_stock(a) for a in stock_assets[:30]], return_exceptions=True)
        for r in results:
            if isinstance(r, UpdateOne):
                stock_operations.append(r)
    
    if stock_operations:
        await db.assets.bulk_write(stock_operations)
        updated_count += len(stock_operations)
    
    return {"updated_count": updated_count, "total_assets": len(assets)}


# --- Investment Projects ---

class ProjectCategory(BaseModel):
    name: str
    earned: float = 0

class Project(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    icon_url: Optional[str] = None
    invested: float = 0
    earned: float = 0
    per_day: float = 0
    per_week: float = 0
    per_month: float = 0
    per_year: float = 0
    categories: List[ProjectCategory] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ProjectCreate(BaseModel):
    name: str
    icon_url: Optional[str] = None
    invested: float = 0
    earned: float = 0
    per_day: float = 0
    per_week: float = 0
    per_month: float = 0
    per_year: float = 0
    categories: List[ProjectCategory] = []

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    icon_url: Optional[str] = None
    invested: Optional[float] = None
    earned: Optional[float] = None
    per_day: Optional[float] = None
    per_week: Optional[float] = None
    per_month: Optional[float] = None
    per_year: Optional[float] = None
    categories: Optional[List[ProjectCategory]] = None

@api_router.get("/projects")
async def get_projects():
    projects = await db.projects.find({}, {"_id": 0}).to_list(100)
    return projects

@api_router.post("/projects", response_model=Project)
async def create_project(input_data: ProjectCreate):
    project = Project(**input_data.model_dump())
    doc = project.model_dump()
    await db.projects.insert_one(doc)
    return project

@api_router.put("/projects/{project_id}", response_model=Project)
async def update_project(project_id: str, input_data: ProjectUpdate):
    existing = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    update_data = {k: v for k, v in input_data.model_dump().items() if v is not None}
    if "categories" in update_data:
        update_data["categories"] = [c.model_dump() if hasattr(c, 'model_dump') else c for c in update_data["categories"]]
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.projects.update_one({"id": project_id}, {"$set": update_data})
    updated = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return updated

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    result = await db.projects.delete_one({"id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    # Also delete associated transactions
    await db.transactions.delete_many({"project_id": project_id})
    return {"message": "Project deleted"}


# --- Transactions ---

class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    type: str  # "earning" or "investment"
    amount: float
    category: Optional[str] = None  # which sub-category this belongs to
    notes: Optional[str] = None
    date: str = Field(default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class TransactionCreate(BaseModel):
    type: str  # "earning" or "investment"
    amount: float
    category: Optional[str] = None
    notes: Optional[str] = None
    date: Optional[str] = None

@api_router.get("/projects/{project_id}/transactions")
async def get_project_transactions(project_id: str):
    txns = await db.transactions.find({"project_id": project_id}, {"_id": 0}).sort("date", -1).to_list(500)
    return txns

@api_router.post("/projects/{project_id}/transactions", response_model=Transaction)
async def add_transaction(project_id: str, input_data: TransactionCreate):
    # Verify project exists
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    txn = Transaction(
        project_id=project_id,
        type=input_data.type,
        amount=input_data.amount,
        category=input_data.category,
        notes=input_data.notes,
        date=input_data.date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    )
    await db.transactions.insert_one(txn.model_dump())

    # Update project totals
    if input_data.type == "earning":
        await db.projects.update_one(
            {"id": project_id},
            {"$inc": {"earned": input_data.amount}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        # Also update category if specified
        if input_data.category:
            # Check if category exists, update or add
            cat_exists = await db.projects.find_one({"id": project_id, "categories.name": input_data.category})
            if cat_exists:
                await db.projects.update_one(
                    {"id": project_id, "categories.name": input_data.category},
                    {"$inc": {"categories.$.earned": input_data.amount}}
                )
            else:
                await db.projects.update_one(
                    {"id": project_id},
                    {"$push": {"categories": {"name": input_data.category, "earned": input_data.amount}}}
                )
    elif input_data.type == "investment":
        await db.projects.update_one(
            {"id": project_id},
            {"$inc": {"invested": input_data.amount}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
        )

    return txn

@api_router.delete("/transactions/{txn_id}")
async def delete_transaction(txn_id: str):
    txn = await db.transactions.find_one({"id": txn_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Reverse the transaction from project totals
    if txn["type"] == "earning":
        await db.projects.update_one(
            {"id": txn["project_id"]},
            {"$inc": {"earned": -txn["amount"]}}
        )
        if txn.get("category"):
            await db.projects.update_one(
                {"id": txn["project_id"], "categories.name": txn["category"]},
                {"$inc": {"categories.$.earned": -txn["amount"]}}
            )
    elif txn["type"] == "investment":
        await db.projects.update_one(
            {"id": txn["project_id"]},
            {"$inc": {"invested": -txn["amount"]}}
        )

    await db.transactions.delete_one({"id": txn_id})
    return {"message": "Transaction deleted and project updated"}


# --- Wallets (Crypto Portfolio) ---

class Wallet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    address: str
    chain: str  # "solana", "bitcoin"
    label: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class WalletCreate(BaseModel):
    address: str
    chain: str
    label: Optional[str] = None

@api_router.get("/wallets")
async def get_wallets():
    wallets = await db.wallets.find({}, {"_id": 0}).to_list(50)
    return wallets

@api_router.post("/wallets", response_model=Wallet)
async def add_wallet(input_data: WalletCreate):
    wallet = Wallet(**input_data.model_dump())
    await db.wallets.insert_one(wallet.model_dump())
    return wallet

@api_router.delete("/wallets/{wallet_id}")
async def delete_wallet(wallet_id: str):
    result = await db.wallets.delete_one({"id": wallet_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return {"message": "Wallet deleted"}

@api_router.get("/wallets/{wallet_id}/balances")
async def get_wallet_balances(wallet_id: str):
    wallet = await db.wallets.find_one({"id": wallet_id}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    
    chain = wallet["chain"]
    address = wallet["address"]
    
    # CoinStats connectionId mapping
    coinstats_chain_map = {
        "solana": "solana",
        "bitcoin": "bitcoin",
        "ethereum": "ethereum",
        "bsc": "binance-smart-chain",
        "polygon": "polygon",
        "avalanche": "avalanche",
        "arbitrum": "arbitrum",
        "optimism": "optimism",
        "base": "base",
        "tron": "tron",
        "fantom": "fantom",
    }
    
    connection_id = coinstats_chain_map.get(chain, chain)
    return await _fetch_coinstats_balance(address, connection_id)

async def _fetch_coinstats_balance(address: str, chain: str = "solana"):
    """Primary balance fetcher using CoinStats API"""
    try:
        async with httpx.AsyncClient(timeout=15) as client_http:
            resp = await client_http.get(
                "https://openapiv1.coinstats.app/wallet/balance",
                params={"address": address, "connectionId": chain},
                headers={"X-API-KEY": COINSTATS_API_KEY}
            )
            if resp.status_code == 200:
                data = resp.json()
                tokens = []
                total = 0
                for item in data:
                    amount = item.get("amount", 0) or 0
                    price = item.get("price", 0) or 0
                    value = amount * price
                    tokens.append({
                        "symbol": item.get("symbol", "?").upper(),
                        "name": item.get("name", ""),
                        "amount": amount,
                        "price": price,
                        "usd_value": value,
                        "icon_url": item.get("icon", ""),
                        "category": "wallet",
                        "protocol": None,
                        "defi_type": None,
                    })
                    total += value
                tokens.sort(key=lambda x: x["usd_value"], reverse=True)
                return {"tokens": tokens, "total_usd": total}
            else:
                logger.warning(f"CoinStats returned {resp.status_code} for {address[:10]}")
                return {"tokens": [], "total_usd": 0, "error": f"CoinStats returned {resp.status_code}"}
    except Exception as e:
        logger.warning(f"CoinStats balance error: {e}")
        return {"tokens": [], "total_usd": 0, "error": str(e)}

@api_router.get("/wallets/solana/defi/{address}")
async def get_solana_defi_positions(address: str):
    """Fetch DeFi positions from Jupiter Portfolio API"""
    try:
        headers = {}
        if JUPITER_API_KEY:
            headers["x-api-key"] = JUPITER_API_KEY
        async with httpx.AsyncClient(timeout=45) as client_http:
            resp = await client_http.get(
                f"https://api.jup.ag/portfolio/v1/positions/{address}",
                headers=headers
            )
            if resp.status_code == 200:
                data = resp.json()
                elements = data.get("elements", [])
                token_info = data.get("tokenInfo", {}).get("solana", {})
                positions = []
                
                for el in elements:
                    label = el.get("label", "")
                    platform = el.get("platformId", "")
                    name = el.get("name", platform)
                    el_type = el.get("type", "")
                    el_value = el.get("value", 0) or 0
                    net_apy = el.get("netApy", 0) or 0
                    el_data = el.get("data", {})
                    
                    pos_tokens = []
                    pos_total = 0
                    
                    # Handle "multiple" type (wallet, native-stake)
                    if el_type == "multiple":
                        assets = el_data.get("assets", [])
                        for asset in assets:
                            asset_data = asset.get("data", {})
                            value = asset.get("value", 0) or 0
                            addr = asset_data.get("address", "")
                            ti = token_info.get(addr, {})
                            pos_tokens.append({
                                "address": addr,
                                "amount": asset_data.get("amount", 0) or 0,
                                "price": asset_data.get("price", 0) or 0,
                                "value": value,
                                "symbol": ti.get("symbol", asset_data.get("symbol", "")),
                                "name": ti.get("name", asset_data.get("name", "")),
                                "image_uri": ti.get("logoURI", ""),
                            })
                            pos_total += value
                    
                    # Handle "liquidity" type (vaults, lending, LP)
                    elif el_type == "liquidity":
                        liquidities = el_data.get("liquidities", [])
                        for liq in liquidities:
                            assets = liq.get("assets", [])
                            yields = liq.get("yields", [])
                            liq_apy = yields[0].get("apy", 0) if yields else 0
                            for asset in assets:
                                asset_data = asset.get("data", {})
                                value = asset.get("value", 0) or 0
                                addr = asset_data.get("address", "")
                                ti = token_info.get(addr, {})
                                pos_tokens.append({
                                    "address": addr,
                                    "amount": asset_data.get("amount", 0) or 0,
                                    "price": asset_data.get("price", 0) or 0,
                                    "value": value,
                                    "symbol": ti.get("symbol", asset_data.get("symbol", "")),
                                    "name": ti.get("name", asset_data.get("name", "")),
                                    "image_uri": ti.get("logoURI", ""),
                                    "apy": net_apy or liq_apy,
                                })
                                pos_total += value
                    
                    # Fallback: use element-level value
                    if pos_total == 0 and el_value > 0:
                        pos_total = el_value
                    
                    if pos_total > 0.01:
                        positions.append({
                            "label": label,
                            "platform": name,
                            "platform_id": platform,
                            "total_value": pos_total,
                            "tokens": pos_tokens,
                            "apy": net_apy,
                        })
                
                # Sort by value
                positions.sort(key=lambda x: x["total_value"], reverse=True)
                return {"positions": positions, "total_usd": sum(p["total_value"] for p in positions)}
            else:
                logger.warning(f"Jupiter API returned {resp.status_code}: {resp.text[:200]}")
            return {"positions": [], "total_usd": 0}
    except Exception as e:
        logger.warning(f"Jupiter portfolio fetch error: {e}")
        return {"positions": [], "total_usd": 0, "error": str(e)}

@api_router.post("/wallets/bulk")
async def add_wallets_bulk(wallets_data: List[WalletCreate]):
    """Add multiple wallets at once"""
    created = []
    for w in wallets_data:
        wallet = Wallet(**w.model_dump())
        await db.wallets.insert_one(wallet.model_dump())
        created.append(wallet)
    return created


# --- Token Preferences (hide/show, custom logos) ---

class TokenPrefUpdate(BaseModel):
    hidden: Optional[bool] = None
    custom_icon_url: Optional[str] = None

@api_router.get("/token-prefs")
async def get_token_prefs():
    prefs = await db.token_prefs.find({}, {"_id": 0}).to_list(200)
    return prefs

@api_router.put("/token-prefs/{symbol}")
async def update_token_pref(symbol: str, input_data: TokenPrefUpdate):
    update = {}
    if input_data.hidden is not None:
        update["hidden"] = input_data.hidden
    if input_data.custom_icon_url is not None:
        update["custom_icon_url"] = input_data.custom_icon_url
    if not update:
        return {"symbol": symbol}
    await db.token_prefs.update_one(
        {"symbol": symbol},
        {"$set": update, "$setOnInsert": {"symbol": symbol}},
        upsert=True
    )
    pref = await db.token_prefs.find_one({"symbol": symbol}, {"_id": 0})
    return pref


# --- Custom Tokens ---

class CustomToken(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    symbol: str
    name: str
    amount: float = 0
    price: float = 0
    icon_url: Optional[str] = None
    chain: str = "custom"

class CustomTokenCreate(BaseModel):
    symbol: str
    name: str
    amount: float = 0
    price: float = 0
    icon_url: Optional[str] = None
    chain: str = "custom"

@api_router.get("/custom-tokens")
async def get_custom_tokens():
    tokens = await db.custom_tokens.find({}, {"_id": 0}).to_list(100)
    return tokens

@api_router.post("/custom-tokens", response_model=CustomToken)
async def add_custom_token(input_data: CustomTokenCreate):
    token = CustomToken(**input_data.model_dump())
    await db.custom_tokens.insert_one(token.model_dump())
    return token

@api_router.put("/custom-tokens/{token_id}")
async def update_custom_token(token_id: str, input_data: CustomTokenCreate):
    # Get old token data before update
    old_token = await db.custom_tokens.find_one({"id": token_id}, {"_id": 0})
    
    await db.custom_tokens.update_one({"id": token_id}, {"$set": input_data.model_dump()})
    updated = await db.custom_tokens.find_one({"id": token_id}, {"_id": 0})
    
    # Auto-track earnings for configured tokens
    if old_token and updated:
        await _check_token_earning_tracking(old_token, updated)
    
    return updated

async def _check_token_earning_tracking(old_token, new_token):
    """Check if a custom token update should trigger an earning transaction"""
    # Token tracking configs: symbol -> {project_name, category}
    tracking_configs = await db.token_tracking.find({}, {"_id": 0}).to_list(50)
    tracking_map = {t["symbol"].upper(): t for t in tracking_configs}
    
    symbol = new_token.get("symbol", "").upper()
    if symbol not in tracking_map:
        return
    
    config = tracking_map[symbol]
    old_amount = old_token.get("amount", 0)
    new_amount = new_token.get("amount", 0)
    price = new_token.get("price", 0)
    
    if new_amount > old_amount:
        diff = new_amount - old_amount
        earning_usd = diff * price
        
        project = await db.projects.find_one({"name": {"$regex": config["project_name"], "$options": "i"}}, {"_id": 0})
        if project:
            txn = {
                "id": str(uuid.uuid4()),
                "project_id": project["id"],
                "type": "earning",
                "amount": earning_usd,
                "category": config.get("category", f"{symbol} Earnings"),
                "notes": f"Auto: +{diff:.4f} {symbol} @ ${price:.4f}",
                "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.transactions.insert_one(txn)
            await db.projects.update_one(
                {"id": project["id"]},
                {"$inc": {"earned": earning_usd}}
            )
            # Update category
            cat_name = config.get("category", f"{symbol} Earnings")
            cat_exists = await db.projects.find_one({"id": project["id"], "categories.name": cat_name})
            if cat_exists:
                await db.projects.update_one(
                    {"id": project["id"], "categories.name": cat_name},
                    {"$inc": {"categories.$.earned": earning_usd}}
                )
            else:
                await db.projects.update_one(
                    {"id": project["id"]},
                    {"$push": {"categories": {"name": cat_name, "earned": earning_usd}}}
                )
            logger.info(f"Token tracking: +{diff:.4f} {symbol} (${earning_usd:.2f}) added to {config['project_name']} / {cat_name}")

@api_router.delete("/custom-tokens/{token_id}")
async def delete_custom_token(token_id: str):
    await db.custom_tokens.delete_one({"id": token_id})
    return {"message": "Deleted"}

@api_router.get("/token-price/{symbol}")
async def get_token_price_by_symbol(symbol: str):
    """Auto-fetch token price from CoinGecko by symbol"""
    try:
        async with httpx.AsyncClient(timeout=10) as client_http:
            # Search for the coin
            search_resp = await client_http.get(
                f"{COINGECKO_BASE}/search",
                params={"query": symbol}
            )
            if search_resp.status_code != 200:
                return {"price": 0, "name": "", "icon_url": ""}
            
            coins = search_resp.json().get("coins", [])
            # Find exact symbol match
            match = None
            for c in coins:
                if c.get("symbol", "").lower() == symbol.lower():
                    match = c
                    break
            if not match and coins:
                match = coins[0]
            
            if not match:
                return {"price": 0, "name": "", "icon_url": ""}
            
            # Get price
            price_resp = await client_http.get(
                f"{COINGECKO_BASE}/simple/price",
                params={"ids": match["id"], "vs_currencies": "usd"}
            )
            price = 0
            if price_resp.status_code == 200:
                price = price_resp.json().get(match["id"], {}).get("usd", 0)
            
            return {
                "price": price,
                "name": match.get("name", ""),
                "coin_id": match.get("id", ""),
                "icon_url": match.get("large", match.get("thumb", "")),
            }
    except Exception:
        return {"price": 0, "name": "", "icon_url": ""}

@api_router.get("/wallets/coinstats/{address}")
async def get_coinstats_balance(address: str, chain: str = "solana"):
    """Fetch wallet balance from CoinStats API"""
    try:
        async with httpx.AsyncClient(timeout=15) as client_http:
            resp = await client_http.get(
                f"https://openapiv1.coinstats.app/wallet/balance",
                params={"address": address, "connectionId": chain},
                headers={"X-API-KEY": COINSTATS_API_KEY}
            )
            if resp.status_code == 200:
                data = resp.json()
                tokens = []
                total = 0
                for item in data:
                    amount = item.get("amount", 0) or 0
                    price = item.get("price", 0) or 0
                    value = amount * price
                    tokens.append({
                        "symbol": item.get("symbol", "?"),
                        "name": item.get("name", ""),
                        "amount": amount,
                        "price": price,
                        "usd_value": value,
                        "icon_url": item.get("icon", ""),
                        "category": "wallet",
                        "protocol": None,
                    })
                    total += value
                tokens.sort(key=lambda x: x["usd_value"], reverse=True)
                return {"tokens": tokens, "total_usd": total}
            return {"tokens": [], "total_usd": 0, "error": f"CoinStats returned {resp.status_code}"}
    except Exception as e:
        return {"tokens": [], "total_usd": 0, "error": str(e)}


# --- NOS Deposit Auto-Tracking ---

@api_router.get("/nos-tracking/status")
async def get_nos_tracking_status():
    status = await db.nos_tracking.find_one({"key": "status"}, {"_id": 0})
    return status or {"key": "status", "last_balance": 0, "last_checked": None, "total_added": 0}

@api_router.post("/nos-tracking/configure")
async def configure_nos_tracking(wallet_address: str, project_name: str = "Nosana"):
    """Configure NOS tracking: which wallet to watch and which project to credit"""
    await db.nos_tracking.update_one(
        {"key": "config"},
        {"$set": {"wallet_address": wallet_address, "project_name": project_name}},
        upsert=True
    )
    return {"message": "NOS tracking configured", "wallet_address": wallet_address, "project_name": project_name}

async def _fetch_btc_balance(address: str):
    try:
        async with httpx.AsyncClient(timeout=15) as client_http:
            # Get BTC balance
            resp = await client_http.get(f"https://blockchain.info/balance?active={address}")
            if resp.status_code != 200:
                return {"tokens": [], "total_usd": 0, "error": "Failed to fetch BTC balance"}
            data = resp.json()
            balance_satoshi = data.get(address, {}).get("final_balance", 0)
            balance_btc = balance_satoshi / 100_000_000

            # Get BTC price from CoinGecko
            price_resp = await client_http.get(
                f"{COINGECKO_BASE}/simple/price",
                params={"ids": "bitcoin", "vs_currencies": "usd"}
            )
            btc_price = 0
            if price_resp.status_code == 200:
                btc_price = price_resp.json().get("bitcoin", {}).get("usd", 0)

            usd_value = balance_btc * btc_price
            tokens = []
            if balance_btc > 0:
                tokens.append({
                    "symbol": "BTC",
                    "name": "Bitcoin",
                    "amount": balance_btc,
                    "price": btc_price,
                    "usd_value": usd_value,
                    "icon_url": "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
                    "category": "wallet",
                    "protocol": None
                })
            return {"tokens": tokens, "total_usd": usd_value}
    except Exception as e:
        logger.warning(f"BTC balance fetch error: {e}")
        return {"tokens": [], "total_usd": 0, "error": str(e)}

async def _fetch_solana_balances(address: str):
    try:
        tokens = []
        total_usd = 0
        async with httpx.AsyncClient(timeout=20) as client_http:
            # Get SOL balance
            sol_resp = await client_http.post(
                "https://api.mainnet-beta.solana.com",
                json={"jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": [address]}
            )
            sol_balance = 0
            if sol_resp.status_code == 200:
                sol_data = sol_resp.json()
                sol_balance = sol_data.get("result", {}).get("value", 0) / 1_000_000_000

            # Get SPL token accounts
            token_resp = await client_http.post(
                "https://api.mainnet-beta.solana.com",
                json={
                    "jsonrpc": "2.0", "id": 2,
                    "method": "getTokenAccountsByOwner",
                    "params": [
                        address,
                        {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
                        {"encoding": "jsonParsed"}
                    ]
                }
            )

            spl_tokens = []
            if token_resp.status_code == 200:
                token_data = token_resp.json()
                accounts = token_data.get("result", {}).get("value", [])
                for acc in accounts:
                    parsed = acc.get("account", {}).get("data", {}).get("parsed", {}).get("info", {})
                    token_amount = parsed.get("tokenAmount", {})
                    ui_amount = token_amount.get("uiAmount", 0)
                    if ui_amount and ui_amount > 0:
                        mint = parsed.get("mint", "")
                        spl_tokens.append({"mint": mint, "amount": ui_amount})

            # Also scan Token-2022 program (for JLP, etc.)
            token2022_resp = await client_http.post(
                "https://api.mainnet-beta.solana.com",
                json={
                    "jsonrpc": "2.0", "id": 3,
                    "method": "getTokenAccountsByOwner",
                    "params": [
                        address,
                        {"programId": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"},
                        {"encoding": "jsonParsed"}
                    ]
                }
            )
            if token2022_resp.status_code == 200:
                t2022_data = token2022_resp.json()
                t2022_accounts = t2022_data.get("result", {}).get("value", [])
                for acc in t2022_accounts:
                    parsed = acc.get("account", {}).get("data", {}).get("parsed", {}).get("info", {})
                    token_amount = parsed.get("tokenAmount", {})
                    ui_amount = token_amount.get("uiAmount", 0)
                    if ui_amount and ui_amount > 0:
                        mint = parsed.get("mint", "")
                        spl_tokens.append({"mint": mint, "amount": ui_amount})

            # Token metadata from hardcoded known mints (Jupiter strict list DNS fails in this env)
            token_list = {}
            known_mints = {
                "nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7": {"symbol": "NOS", "name": "Nosana", "icon_url": "https://coin-images.coingecko.com/coins/images/22553/small/nosana.png", "decimals": 6},
                "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {"symbol": "USDC", "name": "USD Coin", "icon_url": "https://coin-images.coingecko.com/coins/images/6319/small/usdc.png", "decimals": 6},
                "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": {"symbol": "USDT", "name": "Tether", "icon_url": "https://coin-images.coingecko.com/coins/images/325/small/Tether.png", "decimals": 6},
                "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": {"symbol": "BONK", "name": "Bonk", "icon_url": "https://coin-images.coingecko.com/coins/images/28600/small/bonk.png", "decimals": 5},
                "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": {"symbol": "JUP", "name": "Jupiter", "icon_url": "https://coin-images.coingecko.com/coins/images/34188/small/jup.png", "decimals": 6},
                "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": {"symbol": "WIF", "name": "dogwifhat", "icon_url": "https://coin-images.coingecko.com/coins/images/33566/small/wif.png", "decimals": 6},
                "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL": {"symbol": "JTO", "name": "Jito", "icon_url": "https://coin-images.coingecko.com/coins/images/33228/small/jto.png", "decimals": 9},
                "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3": {"symbol": "PYTH", "name": "Pyth Network", "icon_url": "https://coin-images.coingecko.com/coins/images/31924/small/pyth.png", "decimals": 6},
                "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": {"symbol": "RAY", "name": "Raydium", "icon_url": "https://coin-images.coingecko.com/coins/images/13928/small/raydium.png", "decimals": 6},
                "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE": {"symbol": "ORCA", "name": "Orca", "icon_url": "https://coin-images.coingecko.com/coins/images/17547/small/Orca_Logo.png", "decimals": 6},
                "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": {"symbol": "mSOL", "name": "Marinade SOL", "icon_url": "https://coin-images.coingecko.com/coins/images/17752/small/msol.png", "decimals": 9},
                "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": {"symbol": "jitoSOL", "name": "Jito Staked SOL", "icon_url": "https://coin-images.coingecko.com/coins/images/33800/small/jitosol.png", "decimals": 9},
                "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1": {"symbol": "bSOL", "name": "BlazeStake SOL", "icon_url": "https://coin-images.coingecko.com/coins/images/26636/small/blazestake.png", "decimals": 9},
                "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v": {"symbol": "JupSOL", "name": "Jupiter Staked SOL", "icon_url": "https://coin-images.coingecko.com/coins/images/36432/small/jupsol.png", "decimals": 9},
                "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4": {"symbol": "JLP", "name": "Jupiter Perps LP", "icon_url": "https://coin-images.coingecko.com/coins/images/34700/small/jlp.png", "decimals": 6},
                "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof": {"symbol": "RNDR", "name": "Render", "icon_url": "https://coin-images.coingecko.com/coins/images/11636/small/rndr.png", "decimals": 8},
                "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS": {"symbol": "KMNO", "name": "Kamino", "icon_url": "", "decimals": 6},
                "DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7": {"symbol": "DRIFT", "name": "Drift", "icon_url": "", "decimals": 6},
                "9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D": {"symbol": "GOMINING", "name": "GoMining", "icon_url": "https://coin-images.coingecko.com/coins/images/32625/small/gomining.png", "decimals": 8},
                "TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6": {"symbol": "TNSR", "name": "Tensor", "icon_url": "", "decimals": 9},
                "MEFNBXixkEbait3xn9x0tMkNKMWCzLVH3AdRQmab4aG": {"symbol": "ME", "name": "Magic Eden", "icon_url": "", "decimals": 6},
                "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN": {"symbol": "TRUMP", "name": "Official Trump", "icon_url": "", "decimals": 6},
                "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": {"symbol": "SOCN", "name": "Socean Staked SOL", "icon_url": "", "decimals": 9},
            }
            # Use known_mints directly as token_list
            token_list = known_mints

            # Get SOL price + all SPL token prices via Jupiter Price API (no rate limits with API key)
            sol_mint = "So11111111111111111111111111111111111111112"
            all_mints_to_price = [sol_mint]
            for spl in spl_tokens:
                all_mints_to_price.append(spl["mint"])
            
            # DeFi categorization by mint address
            defi_mints = {
                "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v": {"category": "defi", "protocol": "Jupiter", "type": "Staking"},
                "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4": {"category": "defi", "protocol": "Jupiter", "type": "Vault"},
                "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": {"category": "staking", "protocol": "Marinade", "type": "Staking"},
                "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1": {"category": "staking", "protocol": "BlazeStake", "type": "Staking"},
                "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": {"category": "staking", "protocol": "Jito", "type": "Staking"},
            }
            
            jup_prices = {}
            try:
                jup_price_headers = {}
                if JUPITER_API_KEY:
                    jup_price_headers["x-api-key"] = JUPITER_API_KEY
                logger.info(f"Fetching Jupiter prices for {len(all_mints_to_price)} mints")
                price_resp = await client_http.get(
                    "https://api.jup.ag/price/v3",
                    params={"ids": ",".join(all_mints_to_price)},
                    headers=jup_price_headers,
                    timeout=15
                )
                if price_resp.status_code == 200:
                    jup_prices = price_resp.json()
                    logger.info(f"Jupiter prices returned {len(jup_prices)} tokens")
                else:
                    logger.warning(f"Jupiter price API returned {price_resp.status_code}")
            except Exception as e:
                logger.warning(f"Jupiter price API error: {e}")
            
            sol_price = jup_prices.get(sol_mint, {}).get("usdPrice", 0)

            # Add SOL
            if sol_balance > 0:
                sol_usd = sol_balance * sol_price
                tokens.append({
                    "symbol": "SOL",
                    "name": "Solana",
                    "amount": sol_balance,
                    "price": sol_price,
                    "usd_value": sol_usd,
                    "icon_url": "https://assets.coingecko.com/coins/images/4128/small/solana.png",
                    "category": "wallet",
                    "protocol": None
                })
                total_usd += sol_usd

            # Process SPL tokens using Jupiter prices + metadata
            for spl in spl_tokens:
                mint = spl["mint"]
                meta = token_list.get(mint)
                if not meta:
                    continue  # Skip tokens we can't identify
                
                price_data = jup_prices.get(mint, {})
                price = price_data.get("usdPrice", 0)
                usd_val = spl["amount"] * price
                
                # Categorize
                sym_lower = meta["symbol"].lower()
                mint_info = defi_mints.get(mint)
                if mint_info:
                    category = mint_info["category"]
                    protocol = mint_info["protocol"]
                    defi_type = mint_info.get("type", "")
                elif sym_lower in ("msol", "jitosol", "bsol", "stsol", "scnsol", "jupsol"):
                    category = "staking"
                    protocol_map = {"msol": "Marinade", "jitosol": "Jito", "bsol": "BlazeStake", "stsol": "Lido", "scnsol": "Socean", "jupsol": "Jupiter"}
                    protocol = protocol_map.get(sym_lower, "Staking")
                    defi_type = "Staking"
                elif sym_lower == "jlp":
                    category = "defi"
                    protocol = "Jupiter"
                    defi_type = "Vault"
                else:
                    category = "wallet"
                    protocol = None
                    defi_type = None
                
                tokens.append({
                    "symbol": meta["symbol"],
                    "name": meta["name"],
                    "amount": spl["amount"],
                    "price": price,
                    "usd_value": usd_val,
                    "icon_url": meta.get("icon_url", ""),
                    "category": category,
                    "protocol": protocol,
                    "defi_type": defi_type
                })
                total_usd += usd_val

        # Sort by USD value descending
        tokens.sort(key=lambda x: x["usd_value"], reverse=True)
        logger.info(f"Solana wallet {address[:10]}...: {len(tokens)} tokens, total=${total_usd:.2f}")
        return {"tokens": tokens, "total_usd": total_usd}
    except Exception as e:
        logger.warning(f"Solana balance fetch error: {e}")
        return {"tokens": [], "total_usd": 0, "error": str(e)}



# ===========================================================================
# Phone List feature
# ===========================================================================

RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "")
RAPIDAPI_EBAY_HOST = os.environ.get("RAPIDAPI_EBAY_HOST", "ebay-average-selling-price.p.rapidapi.com")
PHONE_PRICE_CACHE_TTL_HOURS = 24


class PhoneCreate(BaseModel):
    device_id: Optional[str] = None
    os: Optional[str] = ""
    model: str
    unity_id: Optional[str] = ""
    carrier: Optional[str] = ""
    tags: List[str] = Field(default_factory=list)
    market_value: Optional[float] = None
    notes: Optional[str] = ""


class PhoneUpdate(BaseModel):
    device_id: Optional[str] = None
    os: Optional[str] = None
    model: Optional[str] = None
    unity_id: Optional[str] = None
    carrier: Optional[str] = None
    tags: Optional[List[str]] = None
    market_value: Optional[float] = None
    market_value_source: Optional[str] = None
    notes: Optional[str] = None


class Phone(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    device_id: str = ""
    os: str = ""
    model: str = ""
    unity_id: str = ""
    carrier: str = ""
    tags: List[str] = Field(default_factory=list)
    market_value: float = 0.0
    market_value_source: str = "manual"
    market_value_updated_at: Optional[str] = None
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def _normalize_model(model: str) -> str:
    return (model or "").strip().lower()


async def _fetch_ebay_avg_price(model: str) -> Optional[dict]:
    if not RAPIDAPI_KEY or not model:
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as client_http:
            resp = await client_http.post(
                f"https://{RAPIDAPI_EBAY_HOST}/findCompletedItems",
                headers={
                    "x-rapidapi-key": RAPIDAPI_KEY,
                    "x-rapidapi-host": RAPIDAPI_EBAY_HOST,
                    "content-type": "application/json",
                },
                json={
                    "keywords": model,
                    "max_search_results": "60",
                    "remove_outliers": "true",
                    "site_id": "0",
                },
            )
            if resp.status_code != 200:
                logger.warning(f"eBay price API non-200 for '{model}': {resp.status_code} {resp.text[:200]}")
                return None
            data = resp.json()
            if not data.get("success"):
                return None
            return {
                "average_price": float(data.get("average_price") or 0),
                "median_price": float(data.get("median_price") or 0),
                "min_price": float(data.get("min_price") or 0),
                "max_price": float(data.get("max_price") or 0),
                "results": int(data.get("results") or 0),
                "total_results": int(data.get("total_results") or 0),
            }
    except Exception as e:
        logger.warning(f"eBay price fetch failed for '{model}': {e}")
        return None


async def _get_cached_or_fetch_price(model: str, force_refresh: bool = False) -> Optional[dict]:
    key = _normalize_model(model)
    if not key:
        return None
    if not force_refresh:
        cached = await db.phone_price_cache.find_one({"_id": key})
        if cached:
            try:
                fetched_at = datetime.fromisoformat(cached.get("fetched_at"))
                if fetched_at.tzinfo is None:
                    fetched_at = fetched_at.replace(tzinfo=timezone.utc)
                age_hours = (datetime.now(timezone.utc) - fetched_at).total_seconds() / 3600
                if age_hours < PHONE_PRICE_CACHE_TTL_HOURS:
                    return {k: v for k, v in cached.items() if k != "_id"}
            except Exception:
                pass
    fresh = await _fetch_ebay_avg_price(model)
    if fresh is None:
        return None
    fresh["fetched_at"] = datetime.now(timezone.utc).isoformat()
    fresh["model"] = model
    await db.phone_price_cache.update_one({"_id": key}, {"$set": fresh}, upsert=True)
    return fresh


@api_router.get("/phones/tags")
async def list_phone_tags():
    phones = await db.phones.find({}, {"_id": 0, "tags": 1}).to_list(1000)
    seen = {}
    for p in phones:
        for t in p.get("tags", []):
            if not t:
                continue
            key = t.strip().lower()
            if key not in seen:
                seen[key] = t.strip()
    return sorted(seen.values(), key=lambda s: s.lower())


@api_router.get("/phones")
async def list_phones():
    phones = await db.phones.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    total_value = sum(p.get("market_value", 0) for p in phones)
    return {"phones": phones, "total_value": total_value, "count": len(phones)}


@api_router.post("/phones", response_model=Phone)
async def create_phone(input_data: PhoneCreate):
    phone = Phone(
        device_id=(input_data.device_id or "").strip(),
        os=(input_data.os or "").strip(),
        model=(input_data.model or "").strip(),
        unity_id=(input_data.unity_id or "").strip(),
        carrier=(input_data.carrier or "").strip(),
        tags=[t.strip() for t in (input_data.tags or []) if t and t.strip()],
        market_value=float(input_data.market_value or 0),
        market_value_source="manual",
        notes=(input_data.notes or "").strip(),
    )
    if (input_data.market_value is None or input_data.market_value == 0) and phone.model:
        try:
            ebay = await _get_cached_or_fetch_price(phone.model)
            if ebay and ebay.get("average_price", 0) > 0:
                phone.market_value = ebay["average_price"]
                phone.market_value_source = "ebay"
                phone.market_value_updated_at = datetime.now(timezone.utc).isoformat()
        except Exception as e:
            logger.warning(f"Auto-price fetch failed: {e}")
    await db.phones.insert_one(phone.model_dump())
    return phone


@api_router.put("/phones/{phone_id}", response_model=Phone)
async def update_phone(phone_id: str, input_data: PhoneUpdate):
    existing = await db.phones.find_one({"id": phone_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Phone not found")
    update_dict = {k: v for k, v in input_data.model_dump(exclude_unset=True).items() if v is not None}
    if "tags" in update_dict and update_dict["tags"] is not None:
        update_dict["tags"] = [t.strip() for t in update_dict["tags"] if t and t.strip()]
    if "market_value" in update_dict:
        update_dict["market_value_source"] = update_dict.get("market_value_source", "manual")
        update_dict["market_value_updated_at"] = datetime.now(timezone.utc).isoformat()
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.phones.update_one({"id": phone_id}, {"$set": update_dict})
    merged = {**existing, **update_dict}
    return Phone(**{k: merged.get(k, "") for k in Phone.model_fields.keys()})


@api_router.delete("/phones/{phone_id}")
async def delete_phone(phone_id: str):
    result = await db.phones.delete_one({"id": phone_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Phone not found")
    return {"deleted": True}


@api_router.post("/phones/{phone_id}/refresh-price")
async def refresh_phone_price(phone_id: str):
    phone = await db.phones.find_one({"id": phone_id}, {"_id": 0})
    if not phone:
        raise HTTPException(status_code=404, detail="Phone not found")
    if not phone.get("model"):
        raise HTTPException(status_code=400, detail="Phone has no model set")
    ebay = await _get_cached_or_fetch_price(phone["model"], force_refresh=True)
    if not ebay or ebay.get("average_price", 0) <= 0:
        raise HTTPException(status_code=502, detail="Could not fetch price from eBay")
    update = {
        "market_value": ebay["average_price"],
        "market_value_source": "ebay",
        "market_value_updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.phones.update_one({"id": phone_id}, {"$set": update})
    return {"phone_id": phone_id, "ebay": ebay, **update}


@api_router.post("/phones/refresh-all-prices")
async def refresh_all_phone_prices():
    phones = await db.phones.find({}, {"_id": 0}).to_list(1000)
    updated, failed, skipped = 0, 0, 0
    for p in phones:
        if p.get("market_value_source") == "manual" and p.get("market_value", 0) > 0:
            skipped += 1
            continue
        if not p.get("model"):
            skipped += 1
            continue
        try:
            ebay = await _get_cached_or_fetch_price(p["model"])
            if ebay and ebay.get("average_price", 0) > 0:
                await db.phones.update_one(
                    {"id": p["id"]},
                    {"$set": {
                        "market_value": ebay["average_price"],
                        "market_value_source": "ebay",
                        "market_value_updated_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }}
                )
                updated += 1
            else:
                failed += 1
        except Exception as e:
            logger.warning(f"Refresh price for {p.get('model')}: {e}")
            failed += 1
    return {"updated": updated, "failed": failed, "skipped": skipped, "total": len(phones)}




# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# --- Daily Midnight PST Snapshot Scheduler ---

async def daily_snapshot_task():
    """Runs a net worth snapshot every day at midnight PST (UTC-8)"""
    while True:
        try:
            # Calculate time until next midnight PST
            now_utc = datetime.now(timezone.utc)
            pst_offset = timedelta(hours=-8)
            now_pst = now_utc + pst_offset
            # Next midnight PST
            next_midnight_pst = now_pst.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
            # Convert back to UTC
            next_midnight_utc = next_midnight_pst - pst_offset
            wait_seconds = (next_midnight_utc - now_utc).total_seconds()
            
            logger.info(f"Next snapshot scheduled in {wait_seconds/3600:.1f} hours (midnight PST)")
            await asyncio.sleep(wait_seconds)
            
            # Take snapshot
            assets = await db.assets.find({}, {"_id": 0}).to_list(1000)
            projects = await db.projects.find({}, {"_id": 0}).to_list(100)
            
            categories = {"stocks": 0, "crypto": 0, "cash": 0, "crypto_projects": 0, "debts": 0, "investments": 0}
            for asset in assets:
                manual = asset.get("manual_value")
                value = manual if manual is not None else (asset.get("quantity", 0) * asset.get("current_price", 0))
                cat = asset.get("category", "cash")
                if cat in categories:
                    categories[cat] += value
            for project in projects:
                categories["investments"] += project.get("earned", 0)
            
            # Override crypto with the live Crypto tab total (wallets + DeFi + custom tokens)
            cached_crypto = await _get_cached_crypto_total()
            if cached_crypto is not None:
                categories["crypto"] = cached_crypto
            
            # crypto_projects and investments do NOT contribute to net worth
            total = categories["stocks"] + categories["crypto"] + categories["cash"] - categories["debts"]
            
            snapshot = {
                "id": str(uuid.uuid4()),
                "total_net_worth": total,
                "stocks_value": categories["stocks"],
                "crypto_value": categories["crypto"],
                "cash_value": categories["cash"],
                "crypto_projects_value": categories["crypto_projects"],
                "debts_value": categories["debts"],
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            await db.net_worth_history.insert_one(snapshot)
            logger.info(f"Daily snapshot saved: ${total:,.2f}")
        except Exception as e:
            logger.error(f"Daily snapshot error: {e}")
            await asyncio.sleep(3600)  # Retry in 1 hour on error

@app.on_event("startup")
async def start_scheduler():
    asyncio.create_task(daily_snapshot_task())
    asyncio.create_task(nos_tracking_task())

async def nos_tracking_task():
    """Runs daily at 23:45 UTC - fetches Nosana earnings for the day and adds as transaction"""
    await asyncio.sleep(10)  # Wait for app to be ready
    while True:
        try:
            config = await db.nos_tracking.find_one({"key": "config"}, {"_id": 0})
            if not config:
                await asyncio.sleep(3600)
                continue
            
            wallet_address = config.get("wallet_address")
            project_name = config.get("project_name", "Nosana")
            
            if not wallet_address:
                await asyncio.sleep(3600)
                continue
            
            # Calculate time until 23:45 UTC
            now_utc = datetime.now(timezone.utc)
            target_today = now_utc.replace(hour=23, minute=45, second=0, microsecond=0)
            if now_utc >= target_today:
                # Already past 23:45 today, wait until tomorrow
                target = target_today + timedelta(days=1)
            else:
                target = target_today
            
            wait_seconds = (target - now_utc).total_seconds()
            logger.info(f"NOS tracking: next check in {wait_seconds/3600:.1f} hours (23:45 UTC)")
            await asyncio.sleep(wait_seconds)
            
            # Fetch today's earnings from Nosana API
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            start_date = f"{today}T00:00:00.000Z"
            end_date = f"{today}T23:59:59.000Z"
            
            earning_usd = 0
            try:
                async with httpx.AsyncClient(timeout=15) as client_http:
                    resp = await client_http.get(
                        "https://dashboard.k8s.prd.nos.ci/api/stats/earning-history",
                        params={
                            "address": wallet_address,
                            "start_date": start_date,
                            "end_date": end_date,
                        }
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        results = data.get("results", [])
                        # Sum up daily breakdown for today
                        for result in results:
                            daily = result.get("daily_breakdown", {})
                            if today in daily:
                                for market, amount in daily[today].items():
                                    earning_usd += amount
                        logger.info(f"NOS tracking: today's earnings = ${earning_usd:.4f}")
                    else:
                        logger.warning(f"Nosana API returned {resp.status_code}")
                        continue
            except Exception as e:
                logger.warning(f"NOS tracking - Nosana API error: {e}")
                continue
            
            if earning_usd > 0.001:
                # Check if we already added for today (prevent duplicates on restart)
                existing = await db.transactions.find_one({
                    "category": "NOS Daily Earnings",
                    "date": today,
                    "notes": {"$regex": wallet_address[:10]}
                }, {"_id": 0})
                
                if existing:
                    logger.info(f"NOS tracking: already recorded for {today}, skipping")
                    continue
                
                # Find the Nosana project
                project = await db.projects.find_one({"name": {"$regex": project_name, "$options": "i"}}, {"_id": 0})
                if project:
                    txn = {
                        "id": str(uuid.uuid4()),
                        "project_id": project["id"],
                        "type": "earning",
                        "amount": earning_usd,
                        "category": "NOS Daily Earnings",
                        "notes": f"Auto: {wallet_address[:10]}... earned ${earning_usd:.4f} on {today}",
                        "date": today,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.transactions.insert_one(txn)
                    await db.projects.update_one(
                        {"id": project["id"]},
                        {"$inc": {"earned": earning_usd}}
                    )
                    # Also update the category if it exists
                    cat_exists = await db.projects.find_one({"id": project["id"], "categories.name": "NOS Daily Earnings"})
                    if cat_exists:
                        await db.projects.update_one(
                            {"id": project["id"], "categories.name": "NOS Daily Earnings"},
                            {"$inc": {"categories.$.earned": earning_usd}}
                        )
                    else:
                        await db.projects.update_one(
                            {"id": project["id"]},
                            {"$push": {"categories": {"name": "NOS Daily Earnings", "earned": earning_usd}}}
                        )
                    
                    # Update tracking status
                    status = await db.nos_tracking.find_one({"key": "status"}, {"_id": 0})
                    total_added = (status.get("total_added", 0) if status else 0) + earning_usd
                    await db.nos_tracking.update_one(
                        {"key": "status"},
                        {"$set": {"last_checked": datetime.now(timezone.utc).isoformat(), "last_earning": earning_usd, "total_added": total_added}},
                        upsert=True
                    )
                    logger.info(f"NOS tracking: +${earning_usd:.4f} added to {project_name} for {today}")
                else:
                    logger.warning(f"NOS tracking: project '{project_name}' not found")
            else:
                logger.info(f"NOS tracking: no earnings for {today}")
                await db.nos_tracking.update_one(
                    {"key": "status"},
                    {"$set": {"last_checked": datetime.now(timezone.utc).isoformat(), "last_earning": 0}},
                    upsert=True
                )
        except Exception as e:
            logger.error(f"NOS tracking error: {e}")
            await asyncio.sleep(3600)  # Retry in 1 hour on error
