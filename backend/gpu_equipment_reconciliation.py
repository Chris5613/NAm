"""Read-only GPU fixed-asset reconciliation from saved register and journal.

Equipment register *cash cost* is not necessarily capitalized acquisition
value when a trade-in is part of funding. A matching journal debit determines
the recognized cost, without changing the register's purchase metadata.

All amounts are independently computed from explicit user records. This is
not a complete company balance sheet (phone inventory, unpriced assets and
liabilities remain outside this small GPU scope).
"""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
import re


def amount(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value))
    except (TypeError, ValueError, InvalidOperation):
        return None
    return result if result.is_finite() and result >= 0 else None


def cents(value):
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def month_index(month):
    if not isinstance(month, str) or not re.fullmatch(r"\d{4}-\d{2}", month):
        return None
    try:
        d = date.fromisoformat(month + "-01")
    except ValueError:
        return None
    return d.year * 12 + d.month


def canonical(name):
    key = re.sub(r"[^a-z0-9]", "", str(name or "").lower())
    return "rtx2080superpc" if key in ("rtx2080pc", "rtx2080superpc") else key


def schedule(cost, start_month, month, life=60):
    start, current = month_index(start_month), month_index(month)
    if cost is None or start is None or current is None or current < start:
        return None
    if not isinstance(life, int) or life <= 0 or life > 600:
        return None
    elapsed = min(life, current - start)
    prior = cents(cost * (Decimal(life - elapsed) / Decimal(life)))
    after = cents(cost * (Decimal(max(life - elapsed - 1, 0)) / Decimal(life)))
    return {"end": after, "depreciation": prior - after}


def journal_equipment_debit(entry):
    lines = entry.get("lines")
    if isinstance(lines, list):
        values = [amount(part.get("debit")) for part in lines
                  if isinstance(part, dict) and part.get("account") == "equipment"]
        return sum((v for v in values if v is not None), Decimal("0"))
    if entry.get("debitAccount") == "equipment":
        return amount(entry.get("amount")) or Decimal("0")
    return Decimal("0")


def credited_to_asset(entry, asset_id):
    lines = entry.get("lines")
    if not isinstance(lines, list):
        return Decimal("0")
    vals = [amount(part.get("credit")) for part in lines
            if isinstance(part, dict) and part.get("account") == "equipment:" + asset_id]
    return sum((v for v in vals if v is not None), Decimal("0"))


def reconcile_gpu_equipment(month, hardware, financial_monthly, journal):
    """Read assets without adding any entries or changing historical costs."""
    if month_index(month) is None:
        return {"month": month, "completeForReviewedScope": False,
                "issues": ["invalid-month"], "assets": []}
    if not isinstance(hardware, list) or not isinstance(financial_monthly, dict) or not isinstance(journal, list):
        return {"month": month, "completeForReviewedScope": False,
                "activeEquipmentBookValueUsd": None,
                "issues": ["required-equipment-ledger-source-missing"],
                "assets": [], "financialRecordsMutated": False}
    monthly = financial_monthly
    ledger = journal
    current_record = monthly.get(month)
    current_record = current_record if isinstance(current_record, dict) else {}
    extras = current_record.get("balanceSheetItems")
    extras = extras if isinstance(extras, list) else []

    assets = []
    issues = []
    for device in hardware:
        if not isinstance(device, dict):
            continue
        cost = amount(device.get("cost"))
        name = str(device.get("name") or "")
        mid = str(device.get("id") or "")
        start = str(device.get("startMonth") or "")
        if not mid or not name or cost is None or cost <= 0 or month_index(start) is None:
            issues.append("invalid-hardware-register-row")
            continue
        if month_index(start) > month_index(month):
            continue
        life = device.get("usefulLifeMonths")
        try:
            life = int(life) if life is not None else 60
        except (TypeError, ValueError, OverflowError):
            life = 0
        assets.append({"id": "device:" + mid, "name": name, "start": start,
                       "rawCost": cost, "life": life,
                       "source": "hardware-payback-register"})
    for saved in extras:
        if not isinstance(saved, dict) or saved.get("category") != "equipment":
            continue
        sid = str(saved.get("id") or "")
        start = str(saved.get("placedInServiceMonth") or "")
        cost = amount(saved.get("historicalCost"))
        if not sid or month_index(start) is None or cost is None or cost <= 0:
            issues.append("saved-equipment-unvalued")
            continue
        if month_index(start) > month_index(month):
            continue
        saved_name = canonical(saved.get("name"))
        matches = [a for a in assets if canonical(a["name"]) == saved_name
                   and a["start"] == start]
        if len(matches) == 1 and matches[0]["rawCost"] == cost:
            # One confirmed duplicate of the SAME registered physical machine.
            matches[0]["matchedSavedId"] = sid
        elif len(matches) > 1:
            issues.append("ambiguous-saved-equipment-alias:" + sid)
        else:
            try:
                life = int(saved.get("usefulLifeMonths") or 60)
            except (TypeError, ValueError, OverflowError):
                life = 0
            assets.append({"id": sid, "name": str(saved.get("name") or ""),
                           "start": start, "rawCost": cost, "life": life,
                           "source": "saved-financials-asset"})
    if len({a["id"] for a in assets}) != len(assets):
        issues.append("duplicate-equipment-id")

    # Each specific purchase journal can capitalize only ONE existing asset.
    purchases_by_asset = {}
    unmatched = []
    for entry in ledger:
        if not isinstance(entry, dict):
            continue
        date_str = str(entry.get("date") or "")
        purchase_month = date_str[:7]
        if (month_index(purchase_month) is None or
                month_index(purchase_month) > month_index(month)):
            continue
        debit = journal_equipment_debit(entry)
        if debit <= 0:
            continue
        description = canonical(entry.get("description"))
        candidates = [a for a in assets
                      if a["start"] == purchase_month and
                      len(canonical(a["name"])) >= 5 and (
                          canonical(a["name"]) in description or
                          (canonical(a["name"]) == "rtx2080superpc" and
                           "rtx2080pc" in description)
                      )]
        if len(candidates) != 1:
            unmatched.append({"date": date_str, "reason":
                              "ambiguous-purchase" if len(candidates) > 1 else
                              "outside-reviewed-equipment-scope"})
            continue
        key = candidates[0]["id"]
        purchases_by_asset.setdefault(key, []).append(debit)

    results = []
    for asset in assets:
        ids = [asset["id"]]
        if asset.get("matchedSavedId"):
            ids.append(asset["matchedSavedId"])
        journal_costs = purchases_by_asset.get(asset["id"], [])
        if len(journal_costs) > 1:
            issues.append("multiple-acquisition-entries:" + asset["id"])
        raw_cost = asset["rawCost"]
        capitalization = raw_cost
        if len(journal_costs) == 1 and journal_costs[0] >= raw_cost:
            capitalization = journal_costs[0]
        elif len(journal_costs) == 1 and journal_costs[0] < raw_cost:
            issues.append("register-exceeds-journal:" + asset["id"])
        depreciated = schedule(capitalization, asset["start"], month, asset["life"])
        if depreciated is None:
            issues.append("invalid-depreciation-schedule:" + asset["id"])
            continue

        retired_month = None
        for entry in ledger:
            if not isinstance(entry, dict):
                continue
            entry_date = str(entry.get("date") or "")
            entry_month = entry_date[:7]
            if (month_index(entry_month) is None or
                    month_index(entry_month) < month_index(asset["start"]) or
                    month_index(entry_month) > month_index(month)):
                continue
            credited = sum((credited_to_asset(entry, aid) for aid in ids), Decimal("0"))
            if credited <= 0:
                continue
            disposal_value = schedule(capitalization, asset["start"],
                                      entry_month, asset["life"])
            if disposal_value is None:
                issues.append("missing-disposal-schedule:" + asset["id"])
                continue
            if credited + Decimal("0.01") >= disposal_value["end"]:
                retired_month = entry_month
                break
            issues.append("partial-disposal-credit:" + asset["id"])
        end = Decimal("0") if retired_month else depreciated["end"]
        depreciation = Decimal("0") if retired_month else depreciated["depreciation"]
        results.append({
            "id": asset["id"], "name": asset["name"], "source": asset["source"],
            "registerCostUsd": float(raw_cost),
            "capitalizedCostUsd": float(capitalization),
            "capitalizationSource": "posted-equipment-debit"
                if len(journal_costs) == 1 and capitalization == journal_costs[0]
                else asset["source"],
            "endBookValueUsd": float(end), "depreciationUsd": float(depreciation),
            "retired": bool(retired_month), "retirementMonth": retired_month,
            "matchedSavedAssetId": asset.get("matchedSavedId"),
        })
    active = [r for r in results if not r["retired"]]
    return {
        "month": month, "source": "backend-equipment-register-plus-financials-journal",
        "reviewedGpuScopeOnly": True, "certifiesEntireBusinessBalanceSheet": False,
        "assets": results,
        "activeCount": len(active), "retiredCount": len(results) - len(active),
        "activeEquipmentBookValueUsd": round(sum(r["endBookValueUsd"] for r in active), 2),
        "activeCostBasisUsd": round(sum(r["capitalizedCostUsd"] for r in active), 2),
        "originalRegisterActiveCostUsd": round(sum(r["registerCostUsd"] for r in active), 2),
        "activeMonthlyDepreciationUsd": round(sum(r["depreciationUsd"] for r in active), 2),
        "unmatchedAcquisitionCount": len(unmatched),
        "unmatchedAcquisitions": unmatched[:15], "issues": sorted(set(issues)),
        "completeForReviewedScope": not issues and not any(
            r["capitalizationSource"] == "hardware-payback-register"
            for r in results if r["name"].lower().startswith("rtx 5080")
        ),
        "financialRecordsMutated": False,
    }
