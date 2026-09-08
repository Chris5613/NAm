"""Proxies third-party market data so API keys stay on the server.

Each provider is an explicit allowlist entry with a fixed host, so this is not an
open proxy. Responses are cached briefly to stay within upstream rate limits.
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from ..auth import current_user
from ..models import User

router = APIRouter(prefix="/api/market", tags=["market"])

CACHE_TTL_SECONDS = 45
_cache: dict[str, tuple[float, Any]] = {}


def _provider_config() -> dict[str, dict[str, Any]]:
    """Built per call so .env changes apply without restarting."""
    return {
        "coingecko": {"base": "https://api.coingecko.com/api/v3"},
        "finnhub": {
            "base": "https://finnhub.io/api/v1",
            "query": {"token": os.getenv("FINNHUB_API_KEY", "")},
        },
        "coinstats": {
            "base": "https://openapiv1.coinstats.app",
            "headers": {"X-API-KEY": os.getenv("COINSTATS_KEY", "")},
        },
        "jupiter": {
            "base": "https://lite-api.jup.ag",
            "headers": {"x-api-key": os.getenv("JUPITER_API_KEY", "")} if os.getenv("JUPITER_API_KEY") else {},
        },
        "bitcoin": {"base": "https://blockchain.info"},
        "nosana": {"base": "https://dashboard.k8s.prd.nos.ci/api"},
        "mlb": {"base": "https://statsapi.mlb.com/api/v1"},
        "lulo": {"base": "https://api.lulo.fi"},
        "solana": {"base": os.getenv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")},
        "ebay": {
            "base": f"https://{os.getenv('RAPIDAPI_EBAY_HOST', '')}",
            "headers": {
                "X-RapidAPI-Key": os.getenv("RAPIDAPI_KEY", ""),
                "X-RapidAPI-Host": os.getenv("RAPIDAPI_EBAY_HOST", ""),
            },
        },
    }


def _fetch(url: str, headers: dict[str, str], body: bytes | None = None) -> Any:
    request = urllib.request.Request(
        url,
        data=body,
        method="POST" if body else "GET",
        headers={"Accept": "application/json", "User-Agent": "NetWorthTracker/1.0", **headers},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:200]
        raise HTTPException(status_code=error.code, detail=f"Upstream error: {detail}") from error
    except urllib.error.URLError as error:
        raise HTTPException(status_code=502, detail="Could not reach the upstream service.") from error
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=502, detail="Upstream returned a non-JSON response.") from error


@router.api_route("/{provider}/{path:path}", methods=["GET", "POST"])
async def proxy(provider: str, path: str, request: Request, user: User = Depends(current_user)) -> Any:
    providers = _provider_config()
    config = providers.get(provider)
    if not config:
        raise HTTPException(status_code=404, detail=f"Unknown provider '{provider}'.")
    if ".." in path:
        raise HTTPException(status_code=400, detail="Invalid path.")
    if not config["base"] or config["base"].endswith("//"):
        raise HTTPException(status_code=503, detail=f"{provider} is not configured on the backend.")

    params = dict(request.query_params)
    params.update(config.get("query", {}))
    # The portfolio id is server config, not something the browser should need to know.
    if provider == "coinstats" and path.startswith("portfolio/defi") and not params.get("portfolioId"):
        params["portfolioId"] = os.getenv("COINSTATS_PORTFOLIO_ID", "")
    query = urllib.parse.urlencode({k: v for k, v in params.items() if v != ""})
    upstream_path = "" if provider == "solana" and path == "rpc" else f"/{path.lstrip('/')}"
    url = f"{config['base']}{upstream_path}" + (f"?{query}" if query else "")

    cache_key = f"{provider}:{url}"
    cached = _cache.get(cache_key)
    if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    body = await request.body() if request.method == "POST" else None
    data = _fetch(url, config.get("headers", {}), body)
    _cache[cache_key] = (time.time(), data)
    return data


@router.post("/solana/rpc")
async def solana_rpc(payload: dict[str, Any], user: User = Depends(current_user)) -> Any:
    """Solana's JSON-RPC needs POST, and only read methods are allowed through."""
    allowed = {"getBalance", "getTokenAccountsByOwner", "getProgramAccounts", "getAccountInfo"}
    if payload.get("method") not in allowed:
        raise HTTPException(status_code=400, detail="That RPC method is not allowed.")

    endpoint = os.getenv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
    return _fetch(endpoint, {"Content-Type": "application/json"}, json.dumps(payload).encode("utf-8"))
