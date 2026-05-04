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
from datetime import datetime, timezone
import httpx
from pymongo import UpdateOne

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
JUPITER_API_KEY = os.environ.get("JUPITER_API_KEY", "")

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
    
    # Include investment projects net value (earned so far = current value of those investments)
    for project in projects:
        categories["investments"] += (project.get("earned", 0))
    
    total = categories["stocks"] + categories["crypto"] + categories["cash"] + categories["crypto_projects"] + categories["investments"] - categories["debts"]
    
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
    
    total = categories["stocks"] + categories["crypto"] + categories["cash"] + categories["crypto_projects"] + categories["investments"] - categories["debts"]
    
    snapshot = NetWorthSnapshot(
        total_net_worth=total,
        stocks_value=categories["stocks"],
        crypto_value=categories["crypto"],
        cash_value=categories["cash"],
        crypto_projects_value=categories["crypto_projects"] + categories["investments"],
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
    try:
        async with httpx.AsyncClient(timeout=10) as client_http:
            response = await client_http.get(
                ALPHA_VANTAGE_BASE,
                params={
                    "function": "GLOBAL_QUOTE",
                    "symbol": symbol,
                    "apikey": ALPHA_VANTAGE_KEY
                }
            )
            if response.status_code == 200:
                data = response.json()
                # Handle rate limit / info messages
                if "Information" in data:
                    raise HTTPException(status_code=429, detail="Alpha Vantage rate limit reached (25 requests/day on free tier). Try again later.")
                if "Note" in data:
                    raise HTTPException(status_code=429, detail="Alpha Vantage API call frequency limit. Wait 15 seconds.")
                quote = data.get("Global Quote", {})
                if quote:
                    return {
                        "symbol": quote.get("01. symbol", symbol),
                        "price": float(quote.get("05. price", 0)),
                        "change": float(quote.get("09. change", 0)),
                        "change_percent": quote.get("10. change percent", "0%")
                    }
            raise HTTPException(status_code=404, detail="Stock not found")
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Alpha Vantage API timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/prices/stock/search/{query}")
async def search_stock(query: str):
    try:
        async with httpx.AsyncClient(timeout=10) as client_http:
            response = await client_http.get(
                ALPHA_VANTAGE_BASE,
                params={
                    "function": "SYMBOL_SEARCH",
                    "keywords": query,
                    "apikey": ALPHA_VANTAGE_KEY
                }
            )
            if response.status_code == 200:
                data = response.json()
                matches = data.get("bestMatches", [])[:10]
                return [{"symbol": m["1. symbol"], "name": m["2. name"]} for m in matches]
            return []
    except Exception:
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
    
    # Stock prices - batch updates after fetching
    stock_operations = []
    for asset in stock_assets[:3]:  # Limit to 3 to stay within free tier
        try:
            async with httpx.AsyncClient(timeout=10) as client_http:
                response = await client_http.get(
                    ALPHA_VANTAGE_BASE,
                    params={
                        "function": "GLOBAL_QUOTE",
                        "symbol": asset["symbol"],
                        "apikey": ALPHA_VANTAGE_KEY
                    }
                )
                if response.status_code == 200:
                    data = response.json()
                    # Skip if rate limited
                    if "Information" in data or "Note" in data:
                        logger.warning(f"Alpha Vantage rate limit hit for {asset.get('symbol')}")
                        break
                    quote = data.get("Global Quote", {})
                    if quote:
                        new_price = float(quote.get("05. price", 0))
                        if new_price > 0:
                            stock_operations.append(UpdateOne(
                                {"id": asset["id"]},
                                {"$set": {"current_price": new_price, "updated_at": datetime.now(timezone.utc).isoformat()}}
                            ))
        except Exception as e:
            logger.warning(f"Failed to refresh stock price for {asset.get('symbol')}: {e}")
    
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

    if wallet["chain"] == "bitcoin":
        return await _fetch_btc_balance(wallet["address"])
    elif wallet["chain"] == "solana":
        return await _fetch_solana_balances(wallet["address"])
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported chain: {wallet['chain']}")

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

            # Fetch token metadata from Jupiter
            token_list = {}
            try:
                jup_resp = await client_http.get("https://token.jup.ag/strict", timeout=10)
                if jup_resp.status_code == 200:
                    for t in jup_resp.json():
                        token_list[t["address"]] = {
                            "symbol": t.get("symbol", "???"),
                            "name": t.get("name", "Unknown"),
                            "icon_url": t.get("logoURI", ""),
                            "decimals": t.get("decimals", 0)
                        }
            except Exception:
                pass

            # Get SOL price
            price_resp = await client_http.get(
                f"{COINGECKO_BASE}/simple/price",
                params={"ids": "solana", "vs_currencies": "usd"}
            )
            sol_price = 0
            if price_resp.status_code == 200:
                sol_price = price_resp.json().get("solana", {}).get("usd", 0)

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

            # Get prices for known SPL tokens via CoinGecko
            known_tokens = []
            unknown_tokens = []
            for spl in spl_tokens:
                meta = token_list.get(spl["mint"])
                if meta:
                    known_tokens.append({**spl, **meta})
                else:
                    unknown_tokens.append(spl)

            # Batch price fetch for known tokens by symbol
            if known_tokens:
                # Try to get prices from CoinGecko by symbol mapping
                symbols_to_fetch = list(set(t["symbol"].lower() for t in known_tokens))
                # Use CoinGecko search for top tokens
                coin_ids_map = {
                    "usdc": "usd-coin", "usdt": "tether", "bonk": "bonk",
                    "jup": "jupiter-exchange-solana", "ray": "raydium",
                    "wif": "dogwifcoin", "jto": "jito-governance-token",
                    "pyth": "pyth-network", "wen": "wen-4", "w": "wormhole",
                    "tnsr": "tensor", "render": "render-token", "orca": "orca",
                    "msol": "marinade-staked-sol", "bsol": "blazestake-staked-sol",
                    "jitosol": "jito-staked-sol", "hnt": "helium", "rndr": "render-token",
                    "jupsol": "jupiter-staked-sol", "jlp": "jupiter-perpetuals-liquidity-provider-token",
                    "nos": "nosana", "kmno": "kamino", "drift": "drift-protocol",
                    "me": "magic-eden", "tensor": "tensor", "popcat": "popcat",
                    "wen": "wen-4", "trump": "official-trump",
                }
                # DeFi categorization by mint address
                defi_mints = {
                    "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v": {"category": "defi", "protocol": "Jupiter", "type": "Staking"},
                    "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4": {"category": "defi", "protocol": "Jupiter", "type": "Vault"},
                    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": {"category": "staking", "protocol": "Marinade", "type": "Staking"},
                    "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1": {"category": "staking", "protocol": "BlazeStake", "type": "Staking"},
                    "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": {"category": "staking", "protocol": "Jito", "type": "Staking"},
                    "7Q2afV64in6N6SeZsAAB81TJzwpeLmhBBNhwEr6XxJA": {"category": "staking", "protocol": "Sanctum (INF)", "type": "Staking"},
                }
                ids_to_fetch = []
                symbols_needing_lookup = []
                for sym in symbols_to_fetch:
                    if sym in coin_ids_map:
                        ids_to_fetch.append(coin_ids_map[sym])
                    else:
                        symbols_needing_lookup.append(sym)

                # Dynamic lookup: try CoinGecko search for unknown tokens
                for sym in symbols_needing_lookup:
                    try:
                        search_resp = await client_http.get(
                            f"{COINGECKO_BASE}/search",
                            params={"query": sym}
                        )
                        if search_resp.status_code == 200:
                            coins = search_resp.json().get("coins", [])
                            # Find best match - prefer exact symbol match
                            for coin in coins:
                                if coin.get("symbol", "").lower() == sym:
                                    coin_ids_map[sym] = coin["id"]
                                    ids_to_fetch.append(coin["id"])
                                    break
                    except Exception:
                        pass

                prices = {}
                if ids_to_fetch:
                    try:
                        pr = await client_http.get(
                            f"{COINGECKO_BASE}/simple/price",
                            params={"ids": ",".join(set(ids_to_fetch)), "vs_currencies": "usd"}
                        )
                        if pr.status_code == 200:
                            prices = pr.json()
                    except Exception:
                        pass

                for t in known_tokens:
                    sym_lower = t["symbol"].lower()
                    coin_id = coin_ids_map.get(sym_lower)
                    price = prices.get(coin_id, {}).get("usd", 0) if coin_id else 0
                    usd_val = t["amount"] * price
                    # Categorize by mint address first, then by symbol
                    mint_info = defi_mints.get(t["mint"])
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
                        "symbol": t["symbol"],
                        "name": t["name"],
                        "amount": t["amount"],
                        "price": price,
                        "usd_value": usd_val,
                        "icon_url": t.get("icon_url", ""),
                        "category": category,
                        "protocol": protocol,
                        "defi_type": defi_type
                    })
                    total_usd += usd_val

            # Try to identify unknown tokens via CoinGecko contract lookup
            for t in unknown_tokens:
                mint = t["mint"]
                try:
                    # CoinGecko supports Solana contract address lookup
                    cg_resp = await client_http.get(
                        f"{COINGECKO_BASE}/coins/solana/contract/{mint}"
                    )
                    if cg_resp.status_code == 200:
                        cg_data = cg_resp.json()
                        symbol = cg_data.get("symbol", "").upper()
                        name = cg_data.get("name", "Unknown")
                        price = cg_data.get("market_data", {}).get("current_price", {}).get("usd", 0)
                        icon = cg_data.get("image", {}).get("small", "")
                        usd_val = t["amount"] * price
                        if symbol:
                            tokens.append({
                                "symbol": symbol,
                                "name": name,
                                "amount": t["amount"],
                                "price": price,
                                "usd_value": usd_val,
                                "icon_url": icon,
                                "category": "wallet",
                                "protocol": None,
                                "defi_type": None
                            })
                            total_usd += usd_val
                except Exception:
                    pass

        # Sort by USD value descending
        tokens.sort(key=lambda x: x["usd_value"], reverse=True)
        return {"tokens": tokens, "total_usd": total_usd}
    except Exception as e:
        logger.warning(f"Solana balance fetch error: {e}")
        return {"tokens": [], "total_usd": 0, "error": str(e)}


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
