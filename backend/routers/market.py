"""Proxies third-party market data so API keys stay on the server.

Each provider is an explicit allowlist entry with a fixed host, so this is not an
open proxy. Responses are cached briefly to stay within upstream rate limits.
"""

import asyncio
from datetime import datetime, timezone
from io import BytesIO
import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pypdf import PdfReader
import re

from ..auth import current_user
from ..models import User

router = APIRouter(
    prefix="/api/market",
    tags=["market"],
)

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 45
CACHE_MAX_ENTRIES = 512


def cache_result(key: str, data: Any) -> None:
    now = time.time()
    for old_key, (created, _) in list(_cache.items()):
        if now - created >= CACHE_TTL_SECONDS:
            _cache.pop(old_key, None)
    if key not in _cache and len(_cache) >= CACHE_MAX_ENTRIES:
        _cache.pop(min(_cache, key=lambda entry: _cache[entry][0]))
    _cache[key] = (now, data)

_cache: dict[str, tuple[float, Any]] = {}
_inflight_gets: dict[str, asyncio.Task] = {}
_dividend_cache: dict[str, tuple[float, Any]] = {}
_schedule_cache: dict[int, tuple[float, list[dict[str, str]]]] = {}


async def cached_get(
    cache_key: str,
    url: str,
    headers: dict[str, str],
) -> Any:
    """Cache and coalesce identical GETs inside this backend process."""
    cached = _cache.get(cache_key)
    if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    existing = _inflight_gets.get(cache_key)
    if existing is not None:
        return await existing

    async def run() -> Any:
        try:
            data = await asyncio.to_thread(_fetch, url, headers, None)
            cache_result(cache_key, data)
            return data
        finally:
            _inflight_gets.pop(cache_key, None)

    task = asyncio.create_task(run())
    _inflight_gets[cache_key] = task
    return await task


def _parse_vanguard_schedule(pdf: bytes, year: int) -> list[dict[str, str]]:
    """Read date triples (record, ex, payable) after each ETF ticker."""
    schedule = []
    date_pattern = re.compile(r"\b\d{2}/\d{2}/\d{2}\b")
    for page in PdfReader(BytesIO(pdf)).pages:
        text = page.extract_text()
        for match in re.finditer(r"\b(?:VTI|VOO)\b", text):
            symbol = match.group()
            # Each fund has at most monthly distributions. Stop at the next
            # fund name/ticker; the two funds here have quarterly rows.
            dates = date_pattern.findall(text[match.end():match.end() + 270])
            last_ex_date = None
            for index in range(0, min(len(dates) // 3, 5) * 3, 3):
                try:
                    ex_date = datetime.strptime(dates[index + 1], "%m/%d/%y").date()
                    payable_date = datetime.strptime(dates[index + 2], "%m/%d/%y").date()
                except ValueError:
                    continue
                if last_ex_date is not None and ex_date <= last_ex_date:
                    break
                if ex_date.year == year and ex_date <= payable_date and (payable_date - ex_date).days <= 10:
                    schedule.append({"symbol": symbol, "exDate": ex_date.isoformat(), "payableDate": payable_date.isoformat()})
                    last_ex_date = ex_date
    return schedule


def _fetch_vanguard_schedule(year: int) -> list[dict[str, str]]:
    url = f"https://investor.vanguard.com/content/dam/retail/us/en/pdfs/taxes/DIVDAT_{year}.pdf"
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/pdf"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            pdf = response.read(12 * 1024 * 1024 + 1)
    except (TimeoutError, urllib.error.URLError):
        return []
    if len(pdf) > 12 * 1024 * 1024 or not pdf.startswith(b"%PDF"):
        return []
    try:
        return _parse_vanguard_schedule(pdf, year)
    except Exception:
        logger.exception("Could not parse Vanguard dividend schedule for %s", year)
        return []


@router.get("/dividend-schedule")
async def dividend_schedule(user: User = Depends(current_user)) -> Any:
    """Published Vanguard ETF payment dates, refreshing as new years appear."""
    today = datetime.now(timezone.utc).date()
    year = today.year
    rows = []
    years = ([year - 1] if today.month == 1 else []) + [year, year + 1]
    stale = [item for item in years if item not in _schedule_cache
             or time.time() - _schedule_cache[item][0] >= 24 * 3600]
    fetched = await asyncio.gather(*(asyncio.to_thread(_fetch_vanguard_schedule, item) for item in stale))
    for schedule_year, payments in zip(stale, fetched):
        cached = _schedule_cache.get(schedule_year)
        _schedule_cache[schedule_year] = (time.time(), payments or (cached[1] if cached else []))
    for schedule_year in years:
        rows.extend(_schedule_cache[schedule_year][1])
    return {"payments": sorted({(row["symbol"], row["exDate"]): row for row in rows}.values(),
                               key=lambda row: row["payableDate"]),
            "source": "https://investor.vanguard.com/investor-resources-education/taxes/funds-tax-information"}


@router.get("/dividends/{symbol}")
async def stock_dividends(symbol: str, user: User = Depends(current_user)) -> Any:
    """Confirmed ETF distributions, sourced from Yahoo's dividend event feed."""
    symbol = symbol.upper()
    if symbol not in {"VTI", "VOO"}:
        raise HTTPException(status_code=404, detail="Unknown dividend symbol.")
    key = f"dividends:{symbol}"
    cached = _dividend_cache.get(key)
    if cached and time.time() - cached[0] < 6 * 3600:
        return cached[1]
    now = int(time.time())
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
           f"?period1={now - 2 * 366 * 86400}&period2={now + 86400}"
           "&interval=1mo&events=div")
    data = await asyncio.to_thread(_fetch, url, {})
    chart = (data.get("chart") or {}).get("result") or []
    if not chart:
        raise HTTPException(status_code=502, detail="Dividend history unavailable.")
    events = (chart[0].get("events") or {}).get("dividends") or {}
    payments = sorted((
        {"exDate": datetime.fromtimestamp(int(event["date"]), timezone.utc).date().isoformat(),
         "amountPerShare": float(event["amount"])}
        for event in events.values()
        if float(event.get("amount") or 0) > 0 and event.get("date")
    ), key=lambda entry: entry["exDate"], reverse=True)
    result = {"symbol": symbol, "distributions": payments, "dateType": "ex-dividend"}
    _dividend_cache[key] = (time.time(), result)
    return result


def _provider_config() -> dict[str, dict[str, Any]]:
    """Built per call so .env changes apply without restarting."""
    return {
        "coingecko": {
            "base": "https://api.coingecko.com/api/v3",
        },
        "finnhub": {
            "base": "https://finnhub.io/api/v1",
            "query": {
                "token": os.getenv(
                    "FINNHUB_API_KEY",
                    "",
                ),
            },
        },
        "coinstats": {
            "base": "https://openapiv1.coinstats.app",
            "headers": {
                "X-API-KEY": os.getenv(
                    "COINSTATS_KEY",
                    "",
                ),
            },
        },
        "jupiter": {
            "base": "https://lite-api.jup.ag",
            "headers": {
                "x-api-key": os.getenv(
                    "JUPITER_API_KEY",
                    "",
                ),
            }
            if os.getenv("JUPITER_API_KEY")
            else {},
        },
        "jupiter-portfolio": {
            "base": "https://api.jup.ag",
            "headers": {
                "x-api-key": os.getenv(
                    "JUPITER_API_KEY",
                    "",
                ),
            }
            if os.getenv("JUPITER_API_KEY")
            else {},
        },
        "bitcoin": {
            "base": "https://blockchain.info",
        },
        "nosana": {
            "base": "https://dashboard.k8s.prd.nos.ci/api",
        },
        "mlb": {
            "base": "https://statsapi.mlb.com/api/v1",
        },
        "lulo": {
            "base": "https://api.lulo.fi",
            "headers": {
                "x-api-key": os.environ["LULO_API_KEY"],
            }
            if os.getenv("LULO_API_KEY")
            else {},
        },
        "loopscale": {
            "base": "https://tars.loopscale.com",
        },
        "solana": {
            "base": os.getenv(
                "SOLANA_RPC_URL",
                "https://api.mainnet-beta.solana.com",
            ),
        },
        "ebay": {
            "base": f"https://{os.getenv('RAPIDAPI_EBAY_HOST', '')}",
            "headers": {
                "X-RapidAPI-Key": os.getenv(
                    "RAPIDAPI_KEY",
                    "",
                ),
                "X-RapidAPI-Host": os.getenv(
                    "RAPIDAPI_EBAY_HOST",
                    "",
                ),
            },
        },
    }


def _fetch(
    url: str,
    headers: dict[str, str],
    body: bytes | None = None,
) -> Any:
    request = urllib.request.Request(
        url,
        data=body,
        method="POST" if body else "GET",
        headers={
            "Accept": "application/json",
            "User-Agent": "NetWorthTracker/1.0",
            **headers,
        },
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=20,
        ) as response:
            return json.loads(
                response.read().decode("utf-8")
            )

    except TimeoutError as error:
        raise HTTPException(
            status_code=504,
            detail=(
                "The upstream service took too long to respond. "
                "Please try again."
            ),
        ) from error

    except urllib.error.HTTPError as error:
        detail = (
            error.read()
            .decode(
                "utf-8",
                errors="replace",
            )[:200]
        )

        raise HTTPException(
            status_code=error.code,
            detail=f"Upstream error: {detail}",
        ) from error

    except urllib.error.URLError as error:
        raise HTTPException(
            status_code=502,
            detail="Could not reach the upstream service.",
        ) from error

    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=502,
            detail="Upstream returned a non-JSON response.",
        ) from error


@router.get("/mlb/{path:path}")
async def public_mlb_proxy(
    path: str,
    request: Request,
    user: User = Depends(current_user),
) -> Any:
    """Authenticated read-only proxy for MLB schedule and game data."""
    if ".." in path:
        raise HTTPException(status_code=400, detail="Invalid path.")

    config = _provider_config()["mlb"]
    params = urllib.parse.urlencode(dict(request.query_params))
    url = f'{config["base"]}/{path.lstrip("/")}' + (f"?{params}" if params else "")
    return await cached_get(f"mlb:{url}", url, config.get("headers", {}))


@router.api_route(
    "/{provider}/{path:path}",
    methods=["GET", "POST"],
)
async def proxy(
    provider: str,
    path: str,
    request: Request,
    user: User = Depends(current_user),
) -> Any:
    providers = _provider_config()

    config = providers.get(provider)

    if not config:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown provider '{provider}'.",
        )

    if ".." in path:
        raise HTTPException(
            status_code=400,
            detail="Invalid path.",
        )

    if (
        not config["base"]
        or config["base"].endswith("//")
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                f"{provider} is not configured on the backend."
            ),
        )

    params = dict(request.query_params)

    params.update(
        config.get(
            "query",
            {},
        )
    )

    if (
        provider == "coinstats"
        and path.startswith("portfolio/defi")
        and not params.get("portfolioId")
    ):
        params["portfolioId"] = os.getenv(
            "COINSTATS_PORTFOLIO_ID",
            "",
        )

    query = urllib.parse.urlencode(
        {
            key: value
            for key, value in params.items()
            if value != ""
        }
    )

    upstream_path = (
        ""
        if (
            provider == "solana"
            and path == "rpc"
        )
        else f"/{path.lstrip('/')}"
    )

    url = (
        f"{config['base']}{upstream_path}"
        + (
            f"?{query}"
            if query
            else ""
        )
    )

    cache_key = f"{provider}:{url}"
    cached = _cache.get(cache_key) if request.method == "GET" else None

    if provider == "lulo":
        logger.info(
            "[Lulo Sync] request endpoint=%s api_key_configured=%s cache_hit=%s",
            path,
            bool(os.getenv("LULO_API_KEY")),
            bool(cached and time.time() - cached[0] < CACHE_TTL_SECONDS),
        )

    headers = dict(config.get("headers", {}))
    body = None

    if request.method == "POST":
        body = await request.body()
        if provider in {"solana", "loopscale"}:
            headers["Content-Type"] = "application/json"

    try:
        data = (
            await cached_get(cache_key, url, headers)
            if request.method == "GET"
            else await asyncio.to_thread(_fetch, url, headers, body)
        )
    except HTTPException as error:
        if provider == "lulo":
            logger.warning(
                "[Lulo Sync] failed endpoint=%s status=%s",
                path,
                error.status_code,
            )
        raise
    except Exception:
        if provider == "lulo":
            logger.exception("[Lulo Sync] unexpected failure endpoint=%s", path)
        raise

    if provider == "lulo" and "performance.getPerformance" in path:
        # Aggregate recognized performance fields only. Missing fields remain
        # unknown, rather than being logged as confirmed zero earnings.
        rows_data = data if isinstance(data, list) else (
            data.get("data") if isinstance(data, dict) else None
        )
        rows_data = rows_data if isinstance(rows_data, list) else []
        day_totals = {}
        parsed_rows = 0
        for row in rows_data:
            if not isinstance(row, dict):
                continue
            raw_day = row.get("fromTimestamp") if path.startswith("v0/") else (
                row.get("date") or row.get("createdAt")
            )
            try:
                from datetime import datetime, timezone
                if isinstance(raw_day, (int, float)) or (
                    isinstance(raw_day, str) and raw_day.isdigit()
                ):
                    stamp = float(raw_day)
                    day = datetime.fromtimestamp(
                        stamp / 1000 if stamp > 1e11 else stamp,
                        tz=timezone.utc,
                    ).date().isoformat()
                else:
                    day = datetime.fromisoformat(
                        str(raw_day).replace("Z", "+00:00")
                    ).date().isoformat()
            except (ValueError, TypeError, OverflowError, OSError):
                continue
            amount = None
            if path.startswith("v0/"):
                changes = row.get("balanceChanges")
                if isinstance(changes, dict):
                    values = [
                        item.get("balance_change")
                        for item in changes.values()
                        if isinstance(item, dict)
                    ]
                    try:
                        amount = sum(float(v) for v in values if v is not None)
                    except (ValueError, TypeError):
                        pass
            else:
                values = [
                    row.get("regularInterestEarned"),
                    row.get("protectedInterestEarned"),
                ]
                if any(v is not None for v in values):
                    try:
                        amount = sum(float(v) for v in values if v is not None)
                    except (ValueError, TypeError):
                        pass
            if amount is None:
                continue
            parsed_rows += 1
            day_totals[day] = day_totals.get(day, 0) + amount
        latest_day = max(day_totals) if day_totals else "none"
        logger.info(
            "[Lulo Earnings] source=%s rows=%d parsed=%d latest_day=%s latest_usd=%.6f",
            "USDS" if path.startswith("v0/") else "USDC",
            len(rows_data),
            parsed_rows,
            latest_day,
            day_totals.get(latest_day, 0),
        )

    if provider == "lulo":
        # Log only response shape, not wallet IDs, personal data, or API secrets.
        rows = len(data) if isinstance(data, list) else None
        logger.info(
            "[Lulo Sync] success endpoint=%s response_type=%s rows=%s",
            path,
            type(data).__name__,
            rows if rows is not None else "n/a",
        )

    return data


@router.post("/solana/rpc")
async def solana_rpc(
    payload: dict[str, Any],
    user: User = Depends(current_user),
) -> Any:
    """Solana's JSON-RPC needs POST, and only read methods are allowed through."""
    allowed = {
        "getBalance",
        "getTokenAccountsByOwner",
        "getProgramAccounts",
        "getAccountInfo",
    }

    if (
        payload.get("method")
        not in allowed
    ):
        raise HTTPException(
            status_code=400,
            detail="That RPC method is not allowed.",
        )

    endpoint = os.getenv(
        "SOLANA_RPC_URL",
        "https://api.mainnet-beta.solana.com",
    )

    return await asyncio.to_thread(_fetch,
        endpoint,
        {
            "Content-Type": "application/json",
        },
        json.dumps(payload).encode("utf-8"),
    )
