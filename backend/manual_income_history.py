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
        configured = {}
    if not isinstance(configured, dict) or configured.get("userId") != user_id:
        configured = {}
    monthly = configured.get("monthly")
    annual = _amounts(configured.get("annual2025"))

    # Owner-confirmed on 2026-11-23: Salad's lifetime balance $93.588 less
    # its current balance $65.098 is $28.49. Owner explicitly attributed
    # this historical difference to 2025. This is a USER-ATTESTED annual
    # amount, not independently dated provider income; never fabricate a
    # 2025 month, change Salad's real wallet, or add it to 2026 bookings.
    # Keep it user-scoped and configurable without overwriting any existing
    # private manual-income settings. Audits should note the provenance,
    # not repeatedly ask for the same confirmation. Flag new contradictions.
    try:
        salad_confirmation = json.loads(
            os.getenv("NAM_CONFIRMED_SALAD_2025_JSON", ""))
    except (TypeError, ValueError):
        salad_confirmation = {}
    if (isinstance(salad_confirmation, dict) and
            salad_confirmation.get("userId") == user_id and
            "Salad" not in annual):
        confirmed = _amounts({"Salad": salad_confirmation.get("amount")})
        annual.update(confirmed)

    return {
        "monthly": {
            month: _amounts(sources)
            for month, sources in (monthly.items() if isinstance(monthly, dict) else [])
            if isinstance(month, str) and re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month)
        },
        "annual2025": annual,
    }
