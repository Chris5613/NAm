"""Read-only, server-reviewed hardware edit projection.

A device's dated earningsStartDay is authoritative for payback. Legacy
checkpoints remain historical evidence, never independent business revenue.
Never rebaseline unaffected equipment while editing a different device.
"""
from copy import deepcopy
from datetime import date, datetime
from .hardware_credit_audit import sources_for
from .hardware_payback_lifetime import decimal_or_none

MAX_DEVICES = 100


class HardwareEditConflict(ValueError):
    """The proposed edit is inconsistent with stored source evidence."""


def preview_hardware_edit(saved, expected, proposed, today_key, timestamp):
    """Return validated devices, without writing settings or financial entries."""
    if not isinstance(saved, list):
        saved = []
    if not isinstance(expected, list) or not isinstance(proposed, list):
        raise ValueError("Hardware devices must be arrays")
    if len(saved) > MAX_DEVICES or len(proposed) > MAX_DEVICES:
        raise ValueError("Too many hardware devices")
    if saved != expected:
        raise HardwareEditConflict(
            "Saved hardware changed; reload before editing to avoid overwriting checkpoints"
        )
    try:
        today = date.fromisoformat(today_key)
        if today.isoformat() != today_key:
            raise ValueError()
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError("Invalid checkpoint timestamp") from exc
    current = {}
    for row in saved:
        if not isinstance(row, dict) or not row.get("id"):
            raise ValueError("Invalid saved hardware")
        identity = str(row["id"])
        if identity in current:
            raise ValueError("Duplicate saved hardware ID")
        current[identity] = row
    new = []
    seen = set()
    for raw in proposed:
        if not isinstance(raw, dict) or not raw.get("id"):
            raise ValueError("Invalid device")
        device = deepcopy(raw)
        identity = str(device["id"])
        if len(identity) > 128 or identity in seen:
            raise ValueError("Invalid or duplicate device ID")
        seen.add(identity)
        original = current.get(identity)
        if original is not None and device == original:
            new.append(deepcopy(original))
            continue
        selected = sources_for(device)
        if not selected:
            raise ValueError("Choose at least one income source")
        beginning = str(device.get("earningsStartDay") or "")
        try:
            start = date.fromisoformat(beginning)
            acquired = date.fromisoformat(str(device.get("startMonth") or "") + "-01")
        except (TypeError, ValueError) as exc:
            raise ValueError("A valid earnings start date and purchase month are required") from exc
        if start > today or start < acquired:
            raise ValueError("Earnings start must be after the purchase month and not in the future")
        cost = decimal_or_none(device.get("cost"))
        power = decimal_or_none(device.get("power", 0))
        if cost is None or cost <= 0 or power is None:
            raise ValueError("Valid positive purchase cost and nonnegative power are required")
        if original is not None:
            if sources_for(original) != selected:
                raise HardwareEditConflict(
                    "Changing income sources needs dated source-segment attribution; "
                    "existing verified earnings and checkpoints were not changed"
                )
            # An existing checkpoint is immutable during ordinary edits.
            # Explicit earningsStartDay changes affect the backend projection
            # but must not rewrite a historical checkpoint.
            device["checkpoint"] = deepcopy(original.get("checkpoint"))
        else:
            # The new machine has no past checkpoint credits. The backend
            # dated-earnings ledger determines all observed recovery.
            device["checkpoint"] = {
                "time": timestamp, "month": today_key[:7],
                "baseline": 0, "carried": 0,
                "allocationMode": "backend-start-day-v1",
                **({"ledger": "kryptex-confirmed-v2"} if "kryptex" in selected else {}),
            }
        names = {"kryptex": "Kryptex", "salad": "Salad",
                 "rollercoin": "RollerCoin", "unetwork": "Unetwork",
                 "loopscale": "Loopscale", "lulo": "Lulo"}
        device["sources"] = [names.get(source, source) for source in selected]
        device["source"] = device["sources"][0]
        new.append(device)
    return {
        "sourceOfCalculation": "backend-hardware-checkpoint-preview-v1",
        "complete": True, "readOnly": True,
        "checkpointWrites": False, "financialLedgerMutated": False,
        "asOfDay": today_key, "devices": new,
    }
