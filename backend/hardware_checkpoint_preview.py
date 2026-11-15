"""Read-only, server-reviewed hardware edit projection.

A device's dated earningsStartDay is authoritative for payback. Legacy
checkpoints remain historical evidence, never independent business revenue.
Never rebaseline unaffected equipment while editing a different device.
"""
from copy import deepcopy
from datetime import date, datetime
from .hardware_credit_audit import sources_for
from .hardware_payback_lifetime import decimal_or_none
from .hardware_source_segments import switch_source_segments, checked_segments, InvalidSourceSegments

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
        source_changed = original is not None and (
            set(sources_for(original)) != set(selected))
        # Cosmetic/cost edits preserve the original earning dates even if a
        # legacy device predates the explicit-start policy. Only a requested
        # change to earning dates must pass the new strict date validation.
        same_dates = original is not None and (
            device.get("earningsStartDay") == original.get("earningsStartDay") and
            device.get("startMonth") == original.get("startMonth"))
        if original is not None and original.get("sourceSegments") is not None and not same_dates:
            raise HardwareEditConflict(
                "Dated source assignments have already been recorded; changing "
                "the original earnings start requires a separate history review")
        if source_changed and not same_dates:
            raise HardwareEditConflict(
                "Change the earnings start date separately before switching providers")
        if not same_dates:
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
            # Preserve legacy credit evidence verbatim. Dated source
            # assignments are independently reconstructed by the backend.
            device["checkpoint"] = deepcopy(original.get("checkpoint"))
            try:
                if source_changed:
                    device["sourceSegments"] = switch_source_segments(
                        original, selected, today_key)
                    device["sourceSwitchRecordedAt"] = timestamp
                elif original.get("sourceSegments") is not None:
                    checked_segments(original)
                    device["sourceSegments"] = deepcopy(original["sourceSegments"])
                    device["sourceSwitchRecordedAt"] = original.get("sourceSwitchRecordedAt")
                else:
                    device.pop("sourceSegments", None)
                    device.pop("sourceSwitchRecordedAt", None)
            except InvalidSourceSegments as exc:
                raise HardwareEditConflict(
                    "Source-switch history requires review: " + str(exc)) from exc
        else:
            device.pop("sourceSegments", None)
            device.pop("sourceSwitchRecordedAt", None)
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
