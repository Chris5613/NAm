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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

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

# --- Models ---

class Asset(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str  # stocks, crypto, cash, crypto_projects, debts
    symbol: Optional[str] = None
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
    quantity: float = 0
    current_price: float = 0
    manual_value: Optional[float] = None
    cost_basis: float = 0
    notes: Optional[str] = None

class AssetUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    symbol: Optional[str] = None
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
    
    categories = {
        "stocks": 0,
        "crypto": 0,
        "cash": 0,
        "crypto_projects": 0,
        "debts": 0
    }
    
    for asset in assets:
        manual = asset.get("manual_value")
        value = manual if manual is not None else (asset.get("quantity", 0) * asset.get("current_price", 0))
        cat = asset.get("category", "cash")
        if cat in categories:
            categories[cat] += value
    
    total = categories["stocks"] + categories["crypto"] + categories["cash"] + categories["crypto_projects"] - categories["debts"]
    
    return {
        "total_net_worth": total,
        "breakdown": categories,
        "asset_count": len(assets)
    }

@api_router.post("/net-worth/snapshot")
async def save_snapshot():
    assets = await db.assets.find({}, {"_id": 0}).to_list(1000)
    
    categories = {
        "stocks": 0,
        "crypto": 0,
        "cash": 0,
        "crypto_projects": 0,
        "debts": 0
    }
    
    for asset in assets:
        manual = asset.get("manual_value")
        value = manual if manual is not None else (asset.get("quantity", 0) * asset.get("current_price", 0))
        cat = asset.get("category", "cash")
        if cat in categories:
            categories[cat] += value
    
    total = categories["stocks"] + categories["crypto"] + categories["cash"] + categories["crypto_projects"] - categories["debts"]
    
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
                return [{"id": c["id"], "name": c["name"], "symbol": c["symbol"]} for c in coins]
            return []
    except Exception:
        return []

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
                quote = data.get("Global Quote", {})
                if quote:
                    return {
                        "symbol": quote.get("01. symbol", symbol),
                        "price": float(quote.get("05. price", 0)),
                        "change": float(quote.get("09. change", 0)),
                        "change_percent": quote.get("10. change percent", "0%")
                    }
            raise HTTPException(status_code=404, detail="Stock not found")
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
                    for asset in crypto_assets:
                        coin_id = asset["symbol"].lower()
                        if coin_id in prices:
                            new_price = prices[coin_id].get("usd", 0)
                            await db.assets.update_one(
                                {"id": asset["id"]},
                                {"$set": {"current_price": new_price, "updated_at": datetime.now(timezone.utc).isoformat()}}
                            )
                            updated_count += 1
        except Exception as e:
            logger.warning(f"Failed to refresh crypto prices: {e}")
    
    # Stock prices one by one (Alpha Vantage rate limit)
    for asset in stock_assets[:5]:  # Limit to 5 to avoid rate limits
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
                    quote = data.get("Global Quote", {})
                    if quote:
                        new_price = float(quote.get("05. price", 0))
                        if new_price > 0:
                            await db.assets.update_one(
                                {"id": asset["id"]},
                                {"$set": {"current_price": new_price, "updated_at": datetime.now(timezone.utc).isoformat()}}
                            )
                            updated_count += 1
        except Exception as e:
            logger.warning(f"Failed to refresh stock price for {asset.get('symbol')}: {e}")
    
    return {"updated_count": updated_count, "total_assets": len(assets)}


# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
