"""NAm Balance Sheet asset rows and equipment acquisition reconciliation.

Pure port of the former frontend rules. Never writes an asset, journal entry
or an opening cash amount. Keep confirmed historical fallback assets distinct
from newly registered devices unless an explicit known alias agrees.
"""
from copy import deepcopy
from datetime import date
import re
from .financial_core import equipment_schedule, cents, number, maybe_number, activity


def array(raw):
    return raw if isinstance(raw, list) else []


def object_value(raw):
    return raw if isinstance(raw, dict) else {}


def asset_key(raw):
    return re.sub(r"[^a-z0-9]", "", str(raw or "").lower())


def alias(raw):
    key = asset_key(raw)
    return "rtx2080superpc" if key in ("rtx2080pc", "rtx2080superpc") else key


def category(name):
    text = str(name or "")
    if re.search(r"debt|loan|payable|credit card|liabilit", text, re.I):
        return "liabilities"
    if re.search(r"lulo|cash|bank|checking|savings|receivable|pending payout",
                 text, re.I):
        return "cash"
    if re.search(r"loopscale|defi|lending|invest|stock", text, re.I):
        return "defi"
    if re.search(r"rtx|gpu|computer|equipment|hardware|\bpc\b", text, re.I):
        return "equipment"
    return "digital"


def shift_month(month, delta):
    year, m = int(month[:4]), int(month[5:7])
    n = year * 12 + m - 1 + delta
    return f"{n // 12:04d}-{n % 12 + 1:02d}"


def financial_balance_rows(month, records, live, devices, current_month):
    """Server-side asset list prior to cash/AP ledger application."""
    records, live = object_value(records), object_value(live)
    current = object_value(records.get(month))
    previous = object_value(records.get(shift_month(month, -1)))
    saved = array(current.get("items"))
    prior = array(previous.get("items"))
    extra = array(current.get("balanceSheetItems"))
    prior_extra = array(previous.get("balanceSheetItems"))
    excluded_names = {asset_key(x) for x in array(current.get("excluded"))}
    excluded_equipment = set(str(x) for x in array(current.get("balanceExcluded")))
    ordinary, legacy_hardware = [], []
    names = ([x.get("name") for x in saved] if current.get("locked")
             else ([x.get("name") for x in saved] +
                   [x.get("name") for x in prior] +
                   ["BTC" if key == "btc" else key for key in live]))
    candidates = {}
    for item in names:
        name = str(item or "").strip()
        key = asset_key(name)
        if key and key not in candidates:
            candidates[key] = name
    for key, name in candidates.items():
        # Retired Grass, Rate X, and Rentals are not current Financials Balance Sheet assets.
        # Preserve previously locked historical months and the project feed;
        # exclude only current/open Balance Sheet projections, without writes.
        if not current.get("locked") and key in ("ratex", "grass", "rentals"):
            continue
        if key in excluded_names:
            continue
        row = next((r for r in saved if asset_key(r.get("name")) == key), {})
        old = next((r for r in prior if asset_key(r.get("name")) == key), {})
        start = maybe_number(row.get("start"))
        if start is None and not current.get("locked"):
            start = maybe_number(old.get("end"))
        # November 2026 provider inceptions: Bixberry and Honeygain have
        # their first recorded activity in November, with no prior-month
        # balance. This is a display opening for the inception month only;
        # never overwrite explicit starts, prior closes, or locked months.
        if (start is None and key in ("bixberry", "honeygain")
                and month == "2026-11" and not current.get("locked")
                and not any(asset_key(prior_row.get("name")) == key for prior_row in prior)):
            start = 0.0
        end = (maybe_number(live.get(key)) if month == current_month and
               maybe_number(live.get(key)) is not None else
               maybe_number(row.get("end")))
        val = {
            "id": "project:" + key, "name": name, "category": category(name),
            "start": start, "end": end, "source": "monthly-changes",
        }
        (legacy_hardware if val["category"] == "equipment" else ordinary).append(val)
    equipment, used_legacy, used_extra = [], set(), set()
    historical = {}
    for year_month, rec in sorted(records.items()):
        if year_month >= month or not isinstance(rec, dict):
            continue
        for item in array(rec.get("balanceSheetItems")):
            if isinstance(item, dict) and item.get("id"):
                historical[item["id"]] = item
        for key in array(rec.get("balanceExcluded")):
            historical.pop(key, None)
    all_extra = extra + [
        val for val in historical.values()
        if not any(x.get("id") == val.get("id") for x in extra)
    ]
    registered = [] if current.get("locked") else [
        d for d in array(devices) if isinstance(d, dict) and
        number(d.get("cost")) > 0 and re.fullmatch(
            r"\d{4}-\d{2}", str(d.get("startMonth") or ""))
    ]
    # The original $500 RTX 2080 PC was split into a $260 base PC and
    # $240 RTX 2080 Super. Historical saved rows must not be booked a second
    # time alongside both registered components in an open month.
    registered_names = {asset_key(d.get("name")) for d in registered}
    split_2080_pc = (
        "rtx2080super" in registered_names and
        any(name.startswith("pcbase") for name in registered_names)
    )
    legacy_split_ids = {"hardware:rtx2080super-pc"}
    legacy_split_names = {"rtx2080pc", "rtx2080superpc"}
    seen = set()
    for device in registered:
        key = str(device.get("id") or "") or (
            asset_key(device.get("name")) + ":" + str(device.get("startMonth")) +
            ":" + str(device.get("cost")))
        if key in seen:
            continue
        seen.add(key)
        schedule = equipment_schedule(device, month)
        if not schedule:
            continue
        name = str(device.get("name") or "")
        old_index = next((i for i, row in enumerate(legacy_hardware)
                          if i not in used_legacy and alias(row.get("name")) == alias(name)), -1)
        extra_index = next((i for i, row in enumerate(all_extra)
                            if i not in used_extra and alias(row.get("name")) == alias(name)), -1)
        if old_index >= 0:
            used_legacy.add(old_index)
        if extra_index >= 0:
            used_extra.add(extra_index)
        equipment.append({
            "id": "device:" + str(device.get("id") or asset_key(name)),
            "name": name, "category": "equipment",
            "start": schedule["start"], "end": schedule["end"],
            "depreciation": schedule["depreciation"],
            "historicalCost": schedule["cost"],
            "acquisitionMonth": device.get("startMonth"),
            "source": "hardware-payback",
        })
    for i, row in enumerate(legacy_hardware):
        if i in used_legacy:
            continue
        if split_2080_pc and alias(row.get("name")) in legacy_split_names:
            continue
        key = alias(row.get("name"))
        if any(alias(x.get("name")) == key and x.get("source") != "hardware-payback"
               for x in equipment):
            continue
        if any(j not in used_extra and alias(e.get("name")) == key
               and e.get("category") == "equipment" for j, e in enumerate(all_extra)):
            continue
        canonical = key in ("rtx2080superpc", "rtx5070gpu")
        if canonical and not current.get("locked") and month >= "2026-11":
            schedule = equipment_schedule({
                "cost": 500, "startMonth": "2026-11",
            }, month)
            if schedule:
                equipment.append({
                    **row, "name": "RTX 2080 Super PC" if
                    key == "rtx2080superpc" else row["name"],
                    **schedule, "historicalCost": 500,
                    "acquisitionMonth": "2026-11",
                })
                continue
        equipment.append(dict(row))
    for i, row in enumerate(all_extra):
        if not isinstance(row, dict) or i in used_extra or str(row.get("id")) in excluded_equipment:
            continue
        if split_2080_pc and (
            str(row.get("id")) in legacy_split_ids or
            alias(row.get("name")) in legacy_split_names
        ):
            continue
        if not current.get("locked") and asset_key(row.get("name")) in ("ratex", "grass", "rentals"):
            continue
        if any(alias(x.get("name")) == alias(row.get("name")) and
               x.get("source") != "hardware-payback" for x in equipment):
            continue
        saved_this_month = any(x.get("id") == row.get("id") for x in extra)
        schedule = None
        if (row.get("category") == "equipment" and row.get("placedInServiceMonth")
                and number(row.get("historicalCost")) > 0 and not
                (current.get("locked") and saved_this_month)):
            schedule = equipment_schedule({
                "cost": row["historicalCost"],
                "startMonth": row["placedInServiceMonth"],
                "usefulLifeMonths": row.get("usefulLifeMonths"),
            }, month)
        older = next((e for e in prior_extra if e.get("id") == row.get("id")), {})
        start = (schedule["start"] if schedule else
                 maybe_number(row.get("start")))
        if start is None and not current.get("locked"):
            start = maybe_number(older.get("end"))
        end = schedule["end"] if schedule else maybe_number(row.get("end"))
        if end is None and not current.get("locked"):
            end = maybe_number(row.get("start"))
        value = {
            "id": row.get("id"), "name": row.get("name"),
            "category": row.get("category") or category(row.get("name")),
            "start": start, "end": end,
            "source": "saved-balance-sheet",
        }
        if schedule:
            value.update({
                "depreciation": schedule["depreciation"],
                "historicalCost": schedule["cost"],
                "acquisitionMonth": row.get("placedInServiceMonth"),
            })
        equipment.append(value)
    if not current.get("locked") and month >= "2026-11":
        fallbacks = [
            {"id": "hardware:rtx2080super-pc", "name": "RTX 2080 Super PC",
             "cost": 500, "startMonth": "2026-11"},
            {"id": "hardware:rtx5070", "name": "RTX 5070 GPU",
             "cost": 500, "startMonth": "2026-11"},
        ]
        for fallback in fallbacks:
            if split_2080_pc and fallback["id"] in legacy_split_ids:
                continue
            if fallback["id"] in excluded_equipment or any(
                alias(row.get("name")) == alias(fallback["name"]) for row in equipment
            ):
                continue
            schedule = equipment_schedule(fallback, month)
            if schedule:
                equipment.append({
                    "id": fallback["id"], "name": fallback["name"],
                    "category": "equipment", **schedule,
                    "historicalCost": fallback["cost"],
                    "acquisitionMonth": fallback["startMonth"],
                    "source": "confirmed-fallback",
                })
    deduped = []
    for row in equipment:
        key = asset_key(row.get("name"))
        if key not in ("rtx2080pc", "rtx2080superpc"):
            deduped.append(row)
            continue
        idx = next((i for i, other in enumerate(deduped)
                    if asset_key(other.get("name")) in ("rtx2080pc", "rtx2080superpc")
                    and asset_key(other.get("name")) != key and
                    maybe_number(other.get("historicalCost")) is not None and
                    maybe_number(row.get("historicalCost")) is not None and
                    abs(number(other.get("historicalCost")) -
                        number(row.get("historicalCost"))) < .005 and
                    str(other.get("acquisitionMonth") or "") ==
                    str(row.get("acquisitionMonth") or "")), -1)
        if idx < 0:
            deduped.append(row)
            continue
        partner = deduped[idx]
        preferred = max((row, partner), key=lambda r: (
            r.get("source") == "hardware-payback",
            asset_key(r.get("name")) == "rtx2080superpc"))
        deduped[idx] = {**preferred, "name": "RTX 2080 Super PC"}
    return ordinary + deduped


def with_journal_equipment(base_rows, journal, month, locked=False):
    rows = deepcopy(array(base_rows))
    if locked:
        return rows
    for entry in array(journal):
        if not isinstance(entry, dict):
            continue
        date_str = str(entry.get("date") or "")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_str) or date_str[:7] > month:
            continue
        amount = cents(activity([entry], "equipment"))
        if amount <= 0:
            continue
        description = str(entry.get("description") or "")
        cleaned = asset_key(description)
        candidates = []
        for row in rows:
            if row.get("category") != "equipment" or row.get("source") == "journal-purchase":
                continue
            key = asset_key(row.get("name"))
            normalized = alias(row.get("name"))
            stripped = re.sub(r"^equipment", "", key)
            match = (
                (key and key in cleaned) or (normalized and normalized in cleaned) or
                (len(stripped) >= 5 and stripped in cleaned) or
                (normalized == "rtx2080superpc" and "rtx2080pc" in cleaned)
            )
            if len(normalized) >= 5 and match and row.get("acquisitionMonth") == date_str[:7]:
                candidates.append(row)
        # A legacy journal description can still name the whole RTX 2080
        # PC after it was split. Match its component cost only when there is
        # exactly one component with that amount in the acquisition month.
        if re.search(r"2080|pcbase", cleaned):
            components = [
                row for row in rows if row.get("source") == "hardware-payback"
                and row.get("acquisitionMonth") == date_str[:7]
                and (asset_key(row.get("name")) == "rtx2080super"
                     or asset_key(row.get("name")).startswith("pcbase"))
                and abs(number(row.get("historicalCost")) - amount) < .005
            ]
            if len(components) == 1:
                candidates = components
        if len(candidates) == 1 and amount + .005 >= number(candidates[0].get("historicalCost")):
            existing = candidates[0]
            if amount > number(existing.get("historicalCost")) + .005:
                schedule = equipment_schedule({
                    "cost": amount, "startMonth": existing.get("acquisitionMonth"),
                    "usefulLifeMonths": existing.get("usefulLifeMonths"),
                }, month)
                if schedule:
                    existing.update(schedule)
                    existing["historicalCost"] = amount
            continue
        if any(row.get("id") == "journal-equipment:" + str(entry.get("id")) for row in rows):
            continue
        schedule = equipment_schedule({
            "cost": amount, "startMonth": date_str[:7],
        }, month)
        if schedule:
            rows.append({
                "id": "journal-equipment:" + str(entry.get("id") or cleaned + date_str),
                "name": "Equipment — " + (description[:55] + "…" if len(description) > 55
                                           else description),
                "category": "equipment",
                **schedule, "historicalCost": amount,
                "acquisitionMonth": date_str[:7], "source": "journal-purchase",
            })
    for row in rows:
        if row.get("category") != "equipment" or not row.get("id"):
            continue
        account = "equipment:" + str(row["id"])
        disposals = sorted([
            entry for entry in array(journal)
            if isinstance(entry, dict) and
            re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(entry.get("date") or "")) and
            str(entry.get("date"))[:7] <= month and
            not entry.get("automatic") and
            activity([entry], account) < -.005
        ], key=lambda e: str(e.get("date")))
        for disposal in disposals:
            disposal_month = str(disposal["date"])[:7]
            if row.get("acquisitionMonth") and disposal_month < row["acquisitionMonth"]:
                continue
            scheduled = (row if disposal_month == month else
                         equipment_schedule({
                             "cost": row.get("historicalCost"),
                             "startMonth": row.get("acquisitionMonth"),
                             "usefulLifeMonths": row.get("usefulLifeMonths"),
                         }, disposal_month))
            if not scheduled or scheduled.get("end") is None:
                continue
            credited = cents(-activity([disposal], account))
            if credited + .01 < number(scheduled["end"]):
                continue
            if disposal_month < month:
                row["start"] = 0
            row.update({"end": 0, "depreciation": 0, "retired": True,
                        "retirementMonth": disposal_month})
            break
    return rows
