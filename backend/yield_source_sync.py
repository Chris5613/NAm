"""Server-side read-only Lulo and Loopscale source polling.

This module never posts earnings or mutates project transactions. It captures
validated snapshots in durable settings for use while the NAm tab is closed.
Only pre-registered base58 Solana public addresses are polled, and upstream
hosts/paths are hard-coded (no user-provided HTTP URLs).
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from math import isfinite
import json
import logging
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from sqlalchemy import select

from .db import SessionLocal
from .models import Setting, User
from .models import Project, ProjectTransaction
from .schemas import project_transaction_to_dict
from .yield_earnings_state import (
    reconcile_backend_ledgers, LULO_SERVER_LEDGER_KEY, LOOPSCALE_SERVER_LEDGER_KEY,
    LULO_LEGACY_LEDGER_KEY, LOOPSCALE_LEGACY_LEDGER_KEY,
)
from .lulo_transaction_reconciliation import reconcile_lulo_project
from .yield_earnings_ledger import parse_time

LULO_TRANSACTION_PREVIEW_KEY = "yield_backend_lulo_transaction_previews_v1"
LULO_CUTOVER_BACKUP_PREFIX = "yield_lulo_cutover_backup_v1_"
LOOPSCALE_CUTOVER_BACKUP_KEY = "yield_loopscale_cutover_backup_v1"
from .provider_stats import numeric

log = logging.getLogger(__name__)

REGISTRATION_KEY = "yield_backend_source_wallets_v1"
SNAPSHOTS_KEY = "yield_backend_source_snapshots_v1"
HISTORY_KEY = "yield_backend_source_observations_v1"
BASE58 = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
USDS_MINT = "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA"
ONYC_MINT = "5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5"
USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
MAX_LULO_WALLETS = 8
MAX_OBSERVATIONS = 288


def utc_iso(now: datetime | None = None) -> str:
    return (now or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def valid_wallet(wallet: Any) -> bool:
    return isinstance(wallet, str) and bool(BASE58.fullmatch(wallet))


def registered_wallets(lulo: Any, loopscale: Any) -> dict:
    if not isinstance(lulo, list) or len(lulo) > MAX_LULO_WALLETS:
        raise ValueError("Lulo wallet list must contain at most 8 entries.")
    if any(not valid_wallet(value) for value in lulo):
        raise ValueError("Lulo wallet address is invalid.")
    addresses = sorted(set(lulo))
    if loopscale is not None and not valid_wallet(loopscale):
        raise ValueError("Loopscale wallet address is invalid.")
    return {"lulo": addresses, "loopscale": loopscale}


def read_json(url: str, headers: dict[str, str], payload: dict | None = None) -> Any:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url, data=data, method="POST" if data is not None else "GET",
        headers={"Accept": "application/json", "User-Agent": "NAm/1.0",
                 **({"Content-Type": "application/json"} if data is not None else {}),
                 **headers},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise ValueError("Upstream data exceeded snapshot limit.")
            return json.loads(raw)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as exc:
        raise RuntimeError("Provider request failed.") from exc


def finite_first(*values: Any) -> float:
    for raw in values:
        if raw is None or isinstance(raw, bool):
            continue
        try:
            result = float(raw)
            if isfinite(result):
                return result
        except (ValueError, TypeError, OverflowError):
            pass
    return 0.0


def stamp_ms(raw: Any) -> int | None:
    try:
        value = float(raw)
        if isfinite(value) and value > 0:
            return round(value if value >= 1e11 else value * 1000)
    except (ValueError, TypeError, OverflowError):
        pass
    if isinstance(raw, str):
        try:
            text = raw.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(text)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return round(parsed.timestamp() * 1000)
        except ValueError:
            return None
    return None


def normalize_lulo(wallet: str, api: dict[str, Any],
                   now: datetime | None = None) -> dict:
    """Port of the browser's Lulo balance and dated yield normalization."""
    now = now or datetime.now(timezone.utc)
    account = api.get("account") or {}
    custom = api.get("custom") or {}
    if not account and not custom:
        raise ValueError("Lulo did not return account data.")
    pools = api.get("pools") or {}
    regular = finite_first(*(account.get(k) for k in
                           ("lusdUsdBalance", "regularUsdBalance", "regularBalanceUsd")))
    protected = finite_first(*(account.get(k) for k in
                             ("pusdUsdBalance", "protectedUsdBalance", "protectedBalanceUsd")))
    tokens = custom.get("tokenBalances") if isinstance(custom.get("tokenBalances"), list) else []
    usds = next((token for token in tokens if isinstance(token, dict) and token.get("mint") == USDS_MINT), {})
    usds_balance = finite_first(*(usds.get(k) for k in
                                  ("usdValue", "valueUsd", "value", "balanceUsd")))
    custom_balance = finite_first(*(custom.get(k) for k in
                                  ("totalValue", "totalUsdValue", "usdValue")), usds_balance)
    v1_total = finite_first(*(account.get(k) for k in
                              ("totalUsdValue", "totalValue", "usdValue")))
    total = max(0, v1_total) + max(0, custom_balance)
    if v1_total <= 0:
        total = max(0, regular) + max(0, protected) + max(0, custom_balance)
    if not (total > 0):
        raise ValueError("Lulo returned no usable account balance.")
    regular_apy = finite_first((pools.get("regular") or {}).get("apy")) * 100
    protected_apy = finite_first((pools.get("protected") or {}).get("apy")) * 100
    usds_apy = finite_first(custom.get("realtimeAPY"), custom.get("apy"))
    weighted_apy = ((regular * regular_apy + protected * protected_apy +
                     custom_balance * usds_apy) / total) if total > 0 else 0
    custom_interest = finite_first(*(custom.get(k) for k in
                                     ("interestEarned", "totalInterestEarned", "totalInterest")))
    account_interest = finite_first(*(account.get(k) for k in
                                      ("totalInterestEarned", "interestEarned", "totalInterest", "earnedInterest")))
    regular_interest = finite_first(account.get("regularInterestEarned"), account.get("regularInterest"))
    protected_interest = finite_first(account.get("protectedInterestEarned"), account.get("protectedInterest"))

    days: dict[str, dict] = {}

    def add_daily(stamp: Any, amount: Any) -> None:
        ts = stamp_ms(stamp)
        val = numeric(amount)
        if ts is None or val <= 0:
            return
        try:
            day = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).date().isoformat()
        except (ValueError, OSError, OverflowError):
            return
        if day not in days:
            days[day] = {"date": day, "amount": 0.0, "timestamp": ts}
        days[day]["amount"] += val

    for row in api.get("v0Performance") or []:
        if not isinstance(row, dict):
            continue
        changes = row.get("balanceChanges") or {}
        earnings = sum(numeric(token.get("balance_change"))
                       for token in changes.values() if isinstance(token, dict))
        add_daily(row.get("fromTimestamp"), earnings)
    for row in api.get("v1Performance") or []:
        if not isinstance(row, dict):
            continue
        value = numeric(row.get("regularInterestEarned")) + numeric(row.get("protectedInterestEarned"))
        add_daily(row.get("date") or row.get("createdAt"), value)

    performance = [row for row in days.values() if row["amount"] > 0]
    utc_midnight = now.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    completed = sorted((row for row in performance
                        if row["timestamp"] < round(utc_midnight.timestamp() * 1000)),
                       key=lambda row: row["timestamp"], reverse=True)[:5]
    average = sum(row["amount"] for row in completed) / len(completed) if completed else 0.0
    return {
        "walletAddress": wallet, "totalBalanceUsd": total,
        "regularBalanceUsd": regular, "protectedBalanceUsd": protected,
        "usdcBalanceUsd": regular, "usdsBalanceUsd": usds_balance,
        "usdsApy": usds_apy, "customBalanceUsd": custom_balance,
        "customInterestEarnedUsd": custom_interest,
        "totalInterestEarnedUsd": account_interest + custom_interest,
        "regularInterestEarnedUsd": regular_interest,
        "protectedInterestEarnedUsd": protected_interest,
        "regularApy": regular_apy, "protectedApy": protected_apy,
        "weightedApy": weighted_apy, "dailyPerformance": performance,
        "fiveDayAverageUsd": average,
        "blockTime": finite_first(account.get("blockTime"), custom.get("blockTime")) or None,
        "source": "lulo_api", "syncedAt": utc_iso(now),
    }


def fetch_lulo(wallet: str, now: datetime | None = None) -> dict:
    if not valid_wallet(wallet):
        raise ValueError("Invalid Lulo wallet.")
    api_key = os.getenv("LULO_API_KEY")
    if not api_key:
        raise RuntimeError("Lulo API key is not configured.")
    now = now or datetime.now(timezone.utc)
    end = round(now.timestamp() * 1000)
    routes = {
        "account": ("v1/account.getAccount", {}),
        "pools": ("v1/pool.getPools", {}),
        "custom": ("v0/account.getAccount", {}),
        "v0Performance": ("v0/account.performance.getPerformance", {
            "timeframe": "30D", "timezone": "UTC", "groupBy": "day",
        }),
        "v1Performance": ("v1/account.performance.getPerformance", {
            "startDate": str(end - 30 * 86400000), "endDate": str(end), "groupBy": "day",
        }),
    }
    results: dict[str, Any] = {}
    with ThreadPoolExecutor(max_workers=5) as pool:
        requests = {}
        for name, (route, params) in routes.items():
            query = urllib.parse.urlencode({"owner": wallet, **params, "_": str(end)})
            url = f"https://api.lulo.fi/{route}?{query}"
            requests[pool.submit(read_json, url, {"x-api-key": api_key})] = name
        for future in as_completed(requests):
            key = requests[future]
            try:
                results[key] = future.result()
            except (RuntimeError, ValueError):
                results[key] = None
                log.warning("Lulo %s source unavailable; retaining other readings", key)
    return normalize_lulo(wallet, results, now)


def normalize_loopscale(wallet: str, payload: dict, now: datetime | None = None) -> dict:
    """Match the browser's ONyc loan selection, P/L and net-yield formulas."""
    now = now or datetime.now(timezone.utc)
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    if not items:
        raise ValueError("Loopscale returned no loans.")
    def matching(item: dict) -> bool:
        loan = item.get("loan") or {}
        ledgers = item.get("ledgers") or []
        collateral = item.get("collateral") or []
        return (
            loan.get("borrower") == wallet and loan.get("closed") is not True and
            numeric(item.get("loanType")) == 2 and
            any(numeric(l.get("isLoop")) == 1 for l in ledgers if isinstance(l, dict)) and
            any(l.get("principalMint") == USDC_MINT for l in ledgers if isinstance(l, dict)) and
            any(c.get("assetMint") == ONYC_MINT or c.get("assetIdentifier") == ONYC_MINT
                for c in collateral if isinstance(c, dict))
        )
    item = next((v for v in items if isinstance(v, dict) and matching(v)), None)
    if item is None:
        item = next((v for v in items if isinstance(v, dict) and
                     (v.get("loan") or {}).get("borrower") == wallet and
                     (v.get("loan") or {}).get("closed") is not True), None)
    if item is None:
        raise ValueError("Loopscale ONyc loan unavailable.")
    loan = item.get("loan") or {}
    collateral = [c for c in item.get("collateral") or [] if isinstance(c, dict)]
    onyc = next((c for c in collateral
                 if c.get("assetMint") == ONYC_MINT or c.get("assetIdentifier") == ONYC_MINT),
                collateral[0] if collateral else {})
    supplied = numeric(onyc.get("amount")) / (10 ** 9)
    collateral_usd = numeric(item.get("collateralUsd"))
    principal = numeric(item.get("principalUsd"))
    interest = numeric(item.get("interestAccruedUsd"))
    price = collateral_usd / supplied if supplied > 0 else 0
    position = max(0.0, collateral_usd - principal - interest)
    pnl = item.get("pnl")
    pnl_value = pnl.get("usdPnl") if isinstance(pnl, dict) else None
    pnl_number = finite_first(pnl_value, item.get("pnlUsd"))
    ledgers = [l for l in item.get("ledgers") or [] if isinstance(l, dict)]
    ledger = next((l for l in ledgers if numeric(l.get("isLoop")) == 1),
                  ledgers[0] if ledgers else {})
    borrowed_apy_fraction = numeric(ledger.get("apy")) / 1_000_000
    aggregate = payload.get("aggregate")
    if isinstance(aggregate, dict):
        daily = (numeric(aggregate.get("dailyCollateralYieldUsd")) -
                 numeric(aggregate.get("dailyInterestUsd")) -
                 numeric(aggregate.get("dailyPrincipalYieldUsd")))
    else:
        daily = ((collateral_usd * numeric(item.get("collateralYieldPct")) -
                  principal * borrowed_apy_fraction) / 365)
    net_apy = (daily * 365 / position * 100) if position > 0 else 0
    start_ms = stamp_ms(loan.get("startTime"))
    start_at = datetime.fromtimestamp(start_ms / 1000, timezone.utc).isoformat().replace("+00:00", "Z") if start_ms else None
    return {
        "walletAddress": wallet, "loanAddress": str(loan.get("address") or ""),
        "loanId": loan.get("id"), "asset": "ONyc", "strategy": "ONyc Loop",
        "quantity": position / price if price > 0 else 0, "priceUsd": price,
        "positionValueUsd": position, "pnlUsd": pnl_number, "netApy": net_apy,
        "startTime": start_at, "collateralUsd": collateral_usd,
        "principalUsd": principal, "interestAccruedUsd": interest,
        "pendingYieldUsd": numeric(item.get("pendingYieldUsd")),
        "dailyNetYieldUsd": daily, "suppliedApy": numeric(item.get("collateralYieldPct")) * 100,
        "borrowedApy": borrowed_apy_fraction * 100, "suppliedOnyc": supplied,
        "borrowedUsdc": principal, "health": None,
        "source": "loopscale", "syncedAt": utc_iso(now),
        "snapshotTs": payload.get("snapshotTs"),
    }


def fetch_loopscale(wallet: str, now: datetime | None = None) -> dict:
    if not valid_wallet(wallet):
        raise ValueError("Invalid Loopscale wallet.")
    payload = read_json(
        "https://tars.loopscale.com/v1/markets/loans/info",
        {},
        {"borrowers": [wallet], "includePnl": True, "page": 0, "pageSize": 25},
    )
    if not isinstance(payload, dict):
        raise ValueError("Unexpected Loopscale response.")
    return normalize_loopscale(wallet, payload, now)


def _read(db, user_id: int, key: str) -> dict:
    setting = db.scalar(select(Setting).where(Setting.user_id == user_id, Setting.key == key))
    return setting.value if setting and isinstance(setting.value, dict) else {}


def _write(db, user_id: int, key: str, value: dict) -> None:
    row = db.scalar(select(Setting).where(Setting.user_id == user_id, Setting.key == key))
    if row:
        row.value = value
    else:
        db.add(Setting(user_id=user_id, key=key, value=value))


def merge_server_project_balances(
    projects: list[dict], backend_snapshots: dict,
    lulo_wallet_by_project_id: dict[str, str], now: datetime,
) -> list[dict]:
    """Overlay *fresher* server provider readings onto a backup copy only.

    Never mutate saved app projects or account ledgers. Browser-extension
    projects remain as reported with their original source timestamps.
    """
    normalized = []
    all_lulo = backend_snapshots.get("lulo") or {}
    loop = backend_snapshots.get("loopscale")
    for item in projects:
        if not isinstance(item, dict):
            continue
        project = dict(item)
        key = str(project.get("id") or "")
        candidate = None
        balance_key = ""
        wallet = lulo_wallet_by_project_id.get(key)
        if wallet and isinstance(all_lulo, dict):
            candidate = all_lulo.get(wallet)
            balance_key = "totalBalanceUsd"
        elif key == "loopscale-project":
            candidate = loop
            balance_key = "positionValueUsd"
        if isinstance(candidate, dict):
            synced_at = candidate.get("syncedAt")
            try:
                synced = datetime.fromisoformat(str(synced_at).replace("Z", "+00:00"))
                if synced.tzinfo is None:
                    synced = synced.replace(tzinfo=timezone.utc)
                age_seconds = (now - synced).total_seconds()
                previous = project.get("sourceLastSyncedAt")
                try:
                    previous_at = datetime.fromisoformat(str(previous).replace("Z", "+00:00")) if previous else None
                except ValueError:
                    previous_at = None
                if previous_at and previous_at.tzinfo is None:
                    previous_at = previous_at.replace(tzinfo=timezone.utc)
                fresh = 0 <= age_seconds <= 20 * 60 and (
                    previous_at is None or synced > previous_at
                )
                value = candidate.get(balance_key)
                value = float(value) if value is not None else float("nan")
                if fresh and isfinite(value) and value > 0:
                    project["balanceUsd"] = value
                    project["sourceLastSyncedAt"] = utc_iso(synced)
                    project["balanceSource"] = "backend-provider-poll"
                    # The browser's per-asset quantities were not re-fetched
                    # together with this newer total. Never mix their stale
                    # quantities with a fresh server valuation in recovery.
                    if project.get("assetBalances"):
                        project["assetBalances"] = []
                        project["assetBalancesStale"] = True
            except (TypeError, ValueError, OverflowError):
                pass
        normalized.append(project)
    return normalized


def poll_sources_for_user(user_id: int) -> int:
    """Persist source observations without touching assets or earnings ledgers."""
    with SessionLocal() as db:
        registration = _read(db, user_id, REGISTRATION_KEY)
        previous = _read(db, user_id, SNAPSHOTS_KEY)
    lulo = registration.get("lulo") or []
    loop_wallet = registration.get("loopscale")
    if not lulo and not loop_wallet:
        return 0
    now = datetime.now(timezone.utc)
    updated = {**previous, "checkedAt": utc_iso(now),
               "lulo": {**(previous.get("lulo") or {})}}
    checked = 0
    errors = {}
    history_entries = []
    for wallet in lulo:
        try:
            snapshot = fetch_lulo(wallet, now)
            updated["lulo"][wallet] = snapshot
            history_entries.append({"provider": "lulo", "wallet": wallet,
                                    "capturedAt": snapshot["syncedAt"],
                                    "balanceUsd": snapshot["totalBalanceUsd"],
                                    "cumulativeInterestUsd": snapshot["totalInterestEarnedUsd"]})
            checked += 1
        except Exception as exc:
            errors["lulo:" + wallet] = type(exc).__name__
            log.warning("Lulo scheduled sync failed (%s)", type(exc).__name__)
    if loop_wallet:
        try:
            snap = fetch_loopscale(loop_wallet, now)
            updated["loopscale"] = snap
            history_entries.append({"provider": "loopscale", "wallet": loop_wallet,
                                    "capturedAt": snap["syncedAt"],
                                    "balanceUsd": snap["positionValueUsd"],
                                    "cumulativePnlUsd": snap["pnlUsd"]})
            checked += 1
        except Exception as exc:
            errors["loopscale"] = type(exc).__name__
            log.warning("Loopscale scheduled sync failed (%s)", type(exc).__name__)
    updated["errors"] = errors
    updated["successfulAt"] = utc_iso(now) if checked else previous.get("successfulAt")
    with SessionLocal() as db:
        # An outdated in-flight response must not overwrite a newer snapshot
        # recorded after registration or another worker run.
        existing = _read(db, user_id, SNAPSHOTS_KEY)
        if existing.get("checkedAt", "") > updated["checkedAt"]:
            return 0
        history = _read(db, user_id, HISTORY_KEY)
        items = history.get("items") if isinstance(history.get("items"), list) else []
        items = (items + history_entries)[-MAX_OBSERVATIONS:]
        _write(db, user_id, HISTORY_KEY, {"items": items, "updatedAt": utc_iso(now)})
        _write(db, user_id, SNAPSHOTS_KEY, updated)
        # Advance server-owned *shadow* earnings ledgers from the newest
        # provider observations. Seed from the existing legacy settings,
        # preserving all prior manual corrections and monthly baselines.
        # Do NOT mutate project.transactions or the legacy history keys.
        saved_lulo = _read(db, user_id, LULO_SERVER_LEDGER_KEY)
        saved_loopscale = _read(db, user_id, LOOPSCALE_SERVER_LEDGER_KEY)
        # Immutable first-pass cutover backups. Unlike balance snapshots,
        # these include the ORIGINAL embedded transactions and corrections.
        original_loop_history = _read(db, user_id, LOOPSCALE_LEGACY_LEDGER_KEY)
        if original_loop_history and not _read(db, user_id, LOOPSCALE_CUTOVER_BACKUP_KEY):
            _write(db, user_id, LOOPSCALE_CUTOVER_BACKUP_KEY, {
                "capturedAt": utc_iso(now),
                "history": original_loop_history,
                "cutoverWritesEnabled": False,
            })
        projects = []
        for row in db.scalars(select(Project).where(Project.user_id == user_id)).all():
            project = dict(row.data or {})
            project["id"] = row.id
            project["invested"] = float(row.invested or 0)
            project["earned"] = float(row.earned or 0)
            if project.get("yield_tracking") == "lulo_lending":
                backup_key = LULO_CUTOVER_BACKUP_PREFIX + str(row.id)
                if not _read(db, user_id, backup_key):
                    # Keep BOTH legacy embedded transactions and any
                    # separate relational rows, if this account uses them.
                    typed_rows = db.scalars(select(ProjectTransaction).where(
                        ProjectTransaction.user_id == user_id,
                        ProjectTransaction.project_id == row.id,
                    )).all()
                    _write(db, user_id, backup_key, {
                        "capturedAt": utc_iso(now),
                        "project": project,
                        "projectTransactions": [
                            project_transaction_to_dict(tx) for tx in typed_rows
                        ],
                        "cutoverWritesEnabled": False,
                    })
            projects.append(project)
        result = reconcile_backend_ledgers(
            saved_lulo, saved_loopscale,
            _read(db, user_id, LULO_LEGACY_LEDGER_KEY),
            _read(db, user_id, LOOPSCALE_LEGACY_LEDGER_KEY),
            projects, updated,
        )
        if result["lulo"] != saved_lulo:
            _write(db, user_id, LULO_SERVER_LEDGER_KEY, result["lulo"])
        if result["loopscale"] != saved_loopscale:
            _write(db, user_id, LOOPSCALE_SERVER_LEDGER_KEY, result["loopscale"])

        # Independently replay the existing Lulo transaction guards. The
        # preview is deliberately *not* written back to financial Project
        # records until verified against the live browser reconciliation.
        old_previews = _read(db, user_id, LULO_TRANSACTION_PREVIEW_KEY)
        next_previews = dict(old_previews)
        lulo_snapshots = updated.get("lulo") or {}
        for project in projects:
            if project.get("yield_tracking") != "lulo_lending":
                continue
            project_id = str(project.get("id") or "")
            wallet = project.get("lulo_wallet_address")
            snapshot = lulo_snapshots.get(wallet) if isinstance(lulo_snapshots, dict) else None
            if not project_id or not isinstance(snapshot, dict) or snapshot.get("walletAddress") != wallet:
                continue
            shadow = old_previews.get(project_id)
            from_legacy = parse_time(project.get("lulo_last_synced_at"))
            from_shadow = parse_time(shadow.get("lulo_last_synced_at")) if isinstance(shadow, dict) else None
            baseline = shadow if (
                isinstance(shadow, dict) and
                shadow.get("lulo_wallet_address") == wallet and from_shadow and
                (from_legacy is None or from_shadow >= from_legacy)
            ) else project
            proposal = reconcile_lulo_project(baseline, snapshot)
            if proposal != baseline:
                next_previews[project_id] = proposal
        if next_previews != old_previews:
            _write(db, user_id, LULO_TRANSACTION_PREVIEW_KEY, next_previews)
        db.commit()
    return checked


def poll_all_users() -> dict:
    with SessionLocal() as db:
        ids = [user.id for user in db.scalars(select(User)).all()]
    succeeded = 0
    for uid in ids:
        try:
            succeeded += poll_sources_for_user(uid)
        except Exception:
            log.exception("Yield source scheduler error")
    return {"observations": succeeded, "usersChecked": len(ids)}
