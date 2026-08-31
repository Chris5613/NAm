"""Small local API for services the browser cannot access directly."""

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Net Worth Tracker - Backend", version="0.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
