"""Backend entrypoint: auth, database-backed resources, and third-party proxies."""

import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).with_name(".env"))

from .db import init_db  # noqa: E402  (imported after load_dotenv so DATABASE_URL is set)
from .scheduler import scheduler_status, start_scheduler, stop_scheduler  # noqa: E402
from .routers import auth_routes, market, migration, resources, simplefin_routes, spending  # noqa: E402

app = FastAPI(title="Net Worth Tracker - Backend", version="1.0.0")

# Credentialed cookie auth cannot use a wildcard origin.
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(auth_routes.router)
app.include_router(resources.router)
app.include_router(spending.router)
app.include_router(market.router)
app.include_router(migration.router)
app.include_router(simplefin_routes.router)


@app.on_event("startup")
async def on_startup() -> None:
    init_db()
    start_scheduler()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    stop_scheduler()


@app.get("/api/scheduler/status")
async def scheduler_health() -> dict:
    return scheduler_status()


@app.get("/api/")
async def root() -> dict[str, str]:
    return {"status": "ok"}


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
