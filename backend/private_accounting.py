"""Private, deployment-specific accounting baselines.

Values live in NAM_PRIVATE_ACCOUNTING_PROFILE_JSON on the backend so personal
wallets, balances, and historical net-worth data are not committed to the
public repository or embedded in the frontend bundle.
"""
import json
import os
from math import isfinite
from typing import Any

PRIVATE_ACCOUNTING_KEY = "private_accounting_profile_v1"


def _finite(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
        return parsed if isfinite(parsed) else default
    except (TypeError, ValueError, OverflowError):
        return default


def private_accounting_profile() -> dict[str, Any]:
    raw = os.getenv("NAM_PRIVATE_ACCOUNTING_PROFILE_JSON", "")
    try:
        parsed = json.loads(raw) if raw else {}
    except (json.JSONDecodeError, TypeError):
        parsed = {}
    if not isinstance(parsed, dict):
        parsed = {}

    history = parsed.get("netWorthHistory")
    if not isinstance(history, list):
        history = []

    return {
        "kryptexOpeningBalanceUsd": max(0.0, _finite(parsed.get("kryptexOpeningBalanceUsd"))),
        "rollercoinHistoricalTrx": max(0.0, _finite(parsed.get("rollercoinHistoricalTrx"))),
        "rollercoinSeptemberBaselineTrx": max(0.0, _finite(parsed.get("rollercoinSeptemberBaselineTrx"))),
        "luloSeptemberOpeningEarnedUsd": max(0.0, _finite(parsed.get("luloSeptemberOpeningEarnedUsd"))),
        "loopscaleWallet": str(parsed.get("loopscaleWallet") or "").strip() or None,
        "netWorthHistory": [
            {"date": str(row.get("date") or ""), "value": _finite(row.get("value"))}
            for row in history[:240]
            if isinstance(row, dict) and row.get("date")
        ],
    }
