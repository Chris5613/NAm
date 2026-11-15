"""Read-only, backend-computed Bitcoin valuation and source-integrity checks.

Wallet quantities are *observations*, not mined income. One backend quote
is applied to unique registered BTC wallets. An incomplete observation
returns unknown, never a fabricated zero, and wallet addresses are not
exposed by the API response.
"""
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from math import isfinite


def nonnegative_decimal(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return result if result.is_finite() and result >= 0 else None


def wallet_evidence(wallets, cache, now=None):
    now = now or datetime.now(timezone.utc)
    data = cache if isinstance(cache, dict) else {}
    registered = []
    seen = set()
    for wallet in wallets:
        if str(getattr(wallet, "chain", "") or "").strip().lower() != "bitcoin":
            continue
        address = str(getattr(wallet, "address", "") or "").strip().lower()
        if not address or address in seen:
            continue
        seen.add(address)
        registered.append(wallet)

    total = Decimal("0")
    missing = 0
    stale = 0
    prices = []
    source_dates = []
    for wallet in registered:
        raw = data.get(str(wallet.id))
        raw = raw if isinstance(raw, dict) else {}
        try:
            stamp = datetime.fromtimestamp(float(raw.get("savedAt")) / 1000,
                                          tz=timezone.utc)
            valid_time = -timedelta(minutes=5) <= (now - stamp) <= timedelta(days=30)
        except (ValueError, TypeError, OSError, OverflowError):
            stamp = None
            valid_time = False
        snapshot = raw.get("data") if isinstance(raw.get("data"), dict) else {}
        tokens = snapshot.get("tokens") if isinstance(snapshot.get("tokens"), list) else []
        btc = [t for t in tokens if isinstance(t, dict) and
               str(t.get("symbol") or "").strip().upper() == "BTC"]
        quantity = nonnegative_decimal(btc[0].get("amount")) if len(btc) == 1 else None
        # A known empty wallet must be explicitly reported as a confirmed 0,
        # not merely have an absent token record.
        explicitly_empty = not tokens and snapshot.get("total_usd") == 0 and valid_time
        if quantity is None and explicitly_empty:
            quantity = Decimal("0")
        if quantity is None or not valid_time:
            missing += 1
            continue
        total += quantity
        source_dates.append(stamp)
        if now - stamp > timedelta(hours=2):
            stale += 1
        if btc:
            price = nonnegative_decimal(btc[0].get("price"))
            if price is not None and price > 0:
                prices.append(price)

    observed_prices = sorted(set(prices))
    fallback_price = observed_prices[0] if len(observed_prices) == 1 and (
        len(prices) == len(registered) - missing
    ) else None
    return {
        "walletCount": len(registered),
        "observedWalletCount": len(registered) - missing,
        "missingWalletCount": missing,
        "staleWalletCount": stale,
        "btcAmount": float(total) if not missing else None,
        "knownBtcAmount": float(total),
        "walletEvidenceAt": min(source_dates).isoformat() if source_dates else None,
        "legacyQuoteDisagreement": len(observed_prices) > 1,
        "fallbackPriceUsd": float(fallback_price) if fallback_price is not None else None,
    }


def combine_crypto_valuation(wallet_data, project_balance, quote_price=None,
                             quote_source=None, quote_at=None, user_id=None,
                             now=None):
    now = now or datetime.now(timezone.utc)
    observed = wallet_data or {}
    p = nonnegative_decimal(project_balance)
    market = nonnegative_decimal(quote_price)
    fallback = nonnegative_decimal(observed.get("fallbackPriceUsd"))
    quote = market if market is not None and market > 0 else fallback
    source = quote_source if market is not None and market > 0 else (
        "wallet-observation-fallback" if fallback is not None and fallback > 0
        else "unavailable"
    )
    quantity = nonnegative_decimal(observed.get("btcAmount"))
    bitcoin_usd = round(float(quantity * quote), 8) if quantity is not None and quote is not None else None
    total = round(float(p) + bitcoin_usd, 8) if p is not None and bitcoin_usd is not None else None
    return {
        "version": 1,
        "userId": user_id,
        "sourceOfCalculation": "backend-bitcoin-wallet-valuation",
        "projectTotalUsd": float(p) if p is not None else None,
        "bitcoin": {
            "amountBtc": float(quantity) if quantity is not None else None,
            "knownBtcAmount": observed.get("knownBtcAmount"),
            "priceUsd": float(quote) if quote is not None else None,
            "valueUsd": bitcoin_usd,
            "quoteSource": source,
            "quoteAt": quote_at or observed.get("walletEvidenceAt"),
            "walletEvidenceAt": observed.get("walletEvidenceAt"),
            "walletCount": observed.get("walletCount", 0),
            "missingWalletCount": observed.get("missingWalletCount", 0),
            "staleWalletCount": observed.get("staleWalletCount", 0),
        },
        "cryptoTotalUsd": total,
        "complete": total is not None,
        "calculatedAt": now.isoformat(),
    }
