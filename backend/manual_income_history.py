"""Account-scoped historical income supplied through private service configuration."""

import json
import math
import os
import re


def _amounts(value: object) -> dict[str, float]:
    if not isinstance(value, dict):
        return {}
    amounts = {}
    for source, raw in value.items():
        if not isinstance(source, str) or not source.strip() or len(source) > 80:
            continue
        try:
            amount = float(raw)
        except (TypeError, ValueError):
            continue
        if math.isfinite(amount) and amount > 0:
            amounts[source.strip()] = amount
    return amounts


def manual_income_for_user(user_id: int) -> dict:
    empty = {"monthly": {}, "annual2025": {}}
    try:
        configured = json.loads(os.getenv("NAM_MANUAL_INCOME_HISTORY", ""))
    except (TypeError, ValueError):
        return empty
    if not isinstance(configured, dict) or configured.get("userId") != user_id:
        return empty
    monthly = configured.get("monthly")
    return {
        "monthly": {
            month: _amounts(sources)
            for month, sources in (monthly.items() if isinstance(monthly, dict) else [])
            if isinstance(month, str) and re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month)
        },
        "annual2025": _amounts(configured.get("annual2025")),
    }
