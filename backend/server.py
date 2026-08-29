"""Small local API for services the browser cannot access directly."""

import json
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Net Worth Tracker - Stub Backend", version="0.0.0")

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
        "message": "App is fully client-side. This stub backend is intentionally empty.",
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
