"""Pure financial calculations for NAm's server-side migration.

No writes, no inferred opening cash, and no money derived from balance changes.
The browser supplies a view of candidate entries only during the transition;
the durable settings and closed-month records remain unchanged.
"""
from calendar import monthrange
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from math import isfinite
import re
from urllib.parse import quote


def number(raw, fallback=0.0):
    if raw is None or isinstance(raw, bool):
        return fallback
    try:
        n = float(raw)
        return n if isfinite(n) else fallback
    except (TypeError, ValueError, OverflowError):
        return fallback


def cents(value):
    return float(Decimal(str(number(value))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def maybe_number(value):
    return None if value is None or value == "" else number(value, None)


def entries_list(raw):
    return raw if isinstance(raw, list) else []


def normalize_lines(entry):
    if not isinstance(entry, dict):
        return []
    raw = entry.get("lines")
    if isinstance(raw, list):
        return [
            {"account": str(line.get("account") or ""),
             "debit": cents(line.get("debit")),
             "credit": cents(line.get("credit"))}
            for line in raw if isinstance(line, dict)
        ]
    debit = entry.get("debitAccount")
    credit = entry.get("creditAccount")
    if debit and credit:
        value = cents(entry.get("amount"))
        return [
            {"account": str(debit), "debit": value, "credit": 0.0},
            {"account": str(credit), "debit": 0.0, "credit": value},
        ]
    return []


def activity(entries, account):
    return cents(sum(
        line["debit"] - line["credit"]
        for entry in entries_list(entries)
        for line in normalize_lines(entry)
        if line["account"] == account
    ))


def compute_profit(entries, saved_expenses):
    balances = lambda name: activity(entries, name)
    revenue = cents(-balances("revenue") - balances("dividendRevenue"))
    gain = cents(-balances("gainDisposal"))
    fees = max(0, balances("fees"))
    ordinary = max(0, cents(balances("expense") + balances("electric")))
    depreciation = max(0, balances("depreciation"))
    saved = maybe_number(saved_expenses)
    operating = max(saved or 0, ordinary)
    expenses = cents(operating + fees)
    return {
        "revenue": revenue, "disposalGain": gain,
        "operating": operating, "fees": fees, "depreciation": depreciation,
        "expenses": expenses,
        "profit": cents(revenue + gain - expenses - depreciation),
        "unitemizedExpenseOverlap": saved is not None and ordinary > 0,
        "savedExpenses": saved,
    }


def split_revenue(entries):
    result = {"mining": 0.0, "yield": 0.0, "dividends": 0.0, "unclassified": 0.0}
    for entry in entries_list(entries):
        if not isinstance(entry, dict):
            continue
        revenue = cents(-activity([entry], "revenue"))
        dividends = cents(-activity([entry], "dividendRevenue"))
        result["dividends"] = cents(result["dividends"] + dividends)
        if revenue == 0:
            continue
        descriptor = str(entry.get("id") or "")
        if descriptor.startswith("synced-income:"):
            source = descriptor.split(":", 2)[-1].lower()
        else:
            source = str(entry.get("description") or "").lower()
        category = ("yield" if re.search(r"lulo|loopscale|yield|lending|interest", source)
                    else "mining" if re.search(
                        r"kryptex|roller.?coin|salad|unetwork|unity.?network|mining", source)
                    else "unclassified")
        result[category] = cents(result[category] + revenue)
    return result


def classify_cash_flows(entries):
    sections = {"operating": [], "investing": [], "financing": [], "transfers": []}
    for entry in entries_list(entries):
        if not isinstance(entry, dict):
            continue
        lines = normalize_lines(entry)
        cash = cents(sum(line["debit"] - line["credit"]
                         for line in lines if line["account"] == "cash"))
        if abs(cash) < .005:
            continue
        other = [line["account"] for line in lines if line["account"] != "cash"]
        if any(a == "equipment" or a.startswith("equipment:") for a in other):
            category = "investing"
        elif "equity" in other:
            category = "financing"
        elif any(a in {"revenue", "dividendRevenue", "expense", "fees", "electric"}
                 for a in other):
            category = "operating"
        else:
            category = "transfers"
        sections[category].append({
            "id": entry.get("id"), "date": entry.get("date"),
            "description": entry.get("description"), "delta": cash,
        })
    totals = {
        name: cents(sum(row["delta"] for row in rows))
        for name, rows in sections.items()
    }
    return {"sections": sections, "totals": totals,
            "total": cents(sum(totals.values()))}


def equipment_schedule(device, month):
    if not isinstance(device, dict) or not re.fullmatch(r"\d{4}-\d{2}", month or ""):
        return None
    cost = number(device.get("cost"))
    start = str(device.get("startMonth") or "")
    life = max(1, number(device.get("usefulLifeMonths"), 60))
    if cost <= 0 or not re.fullmatch(r"\d{4}-\d{2}", start) or month < start:
        return None
    elapsed = (int(month[:4]) - int(start[:4])) * 12 + int(month[5:]) - int(start[5:])
    previous = cents(cost * (1 - min(life, elapsed) / life))
    end = cents(cost * (1 - min(life, elapsed + 1) / life))
    return {"start": 0 if elapsed == 0 else previous,
            "end": end, "depreciation": cents(previous - end), "cost": cost}


def sum_business_rows(rows):
    rows = [r for r in entries_list(rows) if isinstance(r, dict)]
    assets = [r for r in rows if r.get("category") != "liabilities"]
    liabilities = [r for r in rows if r.get("category") == "liabilities"]
    incomplete = any(maybe_number(r.get("end")) is None for r in assets)
    liab_incomplete = any(maybe_number(r.get("end")) is None for r in liabilities)
    known = cents(sum(number(r.get("end")) for r in assets if r.get("end") is not None))
    cash = cents(sum(max(0, number(r.get("end"))) for r in rows
                     if r.get("category") == "cash" and (
                         r.get("id") == "ledger:cash" or re.fullmatch(
                             r"cash\s*/?\s*bank|bank|checking|business\s+cash|cash",
                             str(r.get("name") or "").strip(), re.I))))
    liabilities_total = None if liab_incomplete else cents(
        sum(number(r.get("end")) for r in liabilities))
    value = None if incomplete else known
    return {"value": value, "knownSubtotal": known,
            "incomplete": incomplete, "count": len(assets),
            "liabilityValue": liabilities_total, "bankCashValue": cash,
            "liabilitiesIncomplete": liab_incomplete,
            "netValue": None if value is None or liabilities_total is None
            else cents(value - liabilities_total)}


def calculate_net_worth(assets, business, crypto_total=0):
    breakdown = {"stocks": 0., "crypto": 0., "cash": 0., "other": 0., "debts": 0.}
    valid = {"stocks", "cash", "other", "debts"}
    assets = entries_list(assets)
    for asset in assets:
        if not isinstance(asset, dict):
            continue
        category = asset.get("category")
        if category not in valid:
            continue
        quote = (maybe_number(asset.get("quantity")) is not None
                 and maybe_number(asset.get("current_price")) is not None)
        manual = asset.get("manual_value") is not None and (
            category != "stocks" or not quote)
        value = number(asset.get("manual_value")) if manual else (
            number(asset.get("quantity")) * number(asset.get("current_price")))
        breakdown[category] += value
    b = business if isinstance(business, dict) else {}
    business_value = maybe_number(b.get("netValue"))
    complete = (not b.get("incomplete") and not b.get("liabilitiesIncomplete")
                and business_value is not None and number(b.get("count")) > 0)
    overlap = (min(max(0, number(b.get("bankCashValue"))),
                   max(0, breakdown["cash"])) if complete else 0.)
    breakdown["crypto"] = (cents(business_value - overlap) if complete
                           else number(crypto_total))
    total = sum(breakdown[k] for k in ("stocks", "crypto", "cash", "other")) - breakdown["debts"]
    return {"total_net_worth": total, "breakdown": breakdown,
            "asset_count": len(assets), "cashOverlapUsd": cents(overlap),
            "businessVerified": bool(complete),
            "needsTransferReconciliation": overlap > 0}


def evaluate_statement(data):
    """Read-only calculation of a complete supplied ledger. No persistence."""
    ledger = entries_list(data.get("entries"))
    month = data.get("month")
    if not isinstance(month, str) or not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise ValueError("Invalid financial reporting month")
    if len(ledger) > 10000:
        raise ValueError("Too many ledger entries")
    for entry in ledger:
        if not isinstance(entry, dict):
            raise ValueError("Invalid ledger entry")
        lines = normalize_lines(entry)
        if any(line["debit"] < 0 or line["credit"] < 0 or
               line["debit"] > 1e12 or line["credit"] > 1e12 for line in lines):
            raise ValueError("Invalid ledger line")
    devices = entries_list(data.get("devices"))
    return {
        "sourceOfCalculation": "backend-financial-core",
        "month": month,
        "profit": compute_profit(ledger, data.get("savedExpenses")),
        "revenueSources": split_revenue(ledger),
        "cashFlow": classify_cash_flows(ledger),
        "equipmentSchedule": [
            {"id": row.get("id"), **scheduled}
            for row in devices if isinstance(row, dict)
            if (scheduled := equipment_schedule(row, month)) is not None
        ],
        "business": sum_business_rows(data.get("rows")),
    }
