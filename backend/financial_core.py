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
from urllib.parse import quote, unquote


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
            source = unquote(descriptor.split(":", 2)[-1]).lower()
        else:
            source = str(entry.get("description") or "").lower()
        category = ("yield" if re.search(r"lulo|loopscale|yield|lending|interest", source)
                    else "mining" if re.search(
                        r"kryptex|roller\s*coin|salad|unetwork|unity\s*network|mining", source)
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


def phone_asset_rows(phones, month):
    """Business-use Unetwork phones: 120-month life from opt-in start month."""
    rows = []
    for phone in entries_list(phones):
        if not isinstance(phone, dict):
            continue
        device = {**phone, "usefulLifeMonths": 120}
        schedule = equipment_schedule(device, month)
        if not schedule:
            continue
        rows.append({
            "id": "unetwork-phone:" + str(phone.get("id") or ""),
            "name": phone.get("name"),
            "category": "equipment",
            "start": schedule["start"], "end": schedule["end"],
            "depreciation": schedule["depreciation"],
            "historicalCost": schedule["cost"],
            "acquisitionMonth": phone.get("startMonth"),
            "source": "unetwork-business-phone",
            "fundingAccount": phone.get("fundingAccount"),
        })
    return rows


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


def build_statement_rows(base_rows, ledger_entries, cash_opening=None,
                         payable_opening=None):
    """Project Cash / Bank and AP against recorded ledger movements.

    Observed platform balances already include income. Only BANK and PAYABLE
    are projected from journal movements, never a second copy of mining yield.
    """
    rows = [dict(r) for r in entries_list(base_rows) if isinstance(r, dict)]
    cash_delta = activity(ledger_entries, "cash")
    payable_delta = -activity(ledger_entries, "payable")
    payable_start = maybe_number(payable_opening)
    if payable_start is None:
        payable_start = 0
    bank_re = r"cash\s*/?\s*bank|bank|checking|business\s+cash|cash"
    bank = next((r for r in rows if r.get("category") == "cash" and
                 re.fullmatch(bank_re, str(r.get("name") or "").strip(), re.I)), None)
    opening = maybe_number(cash_opening)
    if bank is not None:
        start = opening if opening is not None else maybe_number(bank.get("start"))
        observed_end = maybe_number(bank.get("end"))
        end = observed_end if observed_end is not None else (
            cents(start + cash_delta) if start is not None else None)
        bank.update({
            "start": start, "end": end, "journalChange": cash_delta,
            "unverifiedOpening": start is None,
            "explicitEnd": observed_end is not None,
        })
        if observed_end is not None and start is not None:
            bank["unreconciledCash"] = cents(end - start - cash_delta)
    elif cash_delta != 0 or opening is not None:
        rows.append({
            "id": "ledger:cash", "name": "Cash / Bank", "category": "cash",
            "start": opening,
            "end": cents(opening + cash_delta) if opening is not None else None,
            "journalChange": cash_delta, "unverifiedOpening": opening is None,
            "source": "ledger",
        })
    payable = next((r for r in rows if re.fullmatch(
        r"accounts\s+payable|payable",
        str(r.get("name") or "").strip(), re.I)), None)
    if payable is not None:
        start = maybe_number(payable.get("start"))
        if start is None:
            start = payable_start
        payable.update({
            "start": start,
            "end": maybe_number(payable.get("end")) if
            maybe_number(payable.get("end")) is not None else
            cents(start + payable_delta),
            "journalChange": payable_delta,
        })
    elif payable_delta != 0 or payable_start != 0:
        rows.append({
            "id": "ledger:payable", "name": "Accounts Payable",
            "category": "liabilities", "start": payable_start,
            "end": cents(payable_start + payable_delta),
            "journalChange": payable_delta, "source": "ledger",
        })
    return rows


def project_automatic_expenses(month, base_rows, ledger_entries,
                               auto_power=0, min_month="2026-09"):
    """Generate read-only depreciation and documented electricity estimates.

    No direct financial posting. Existing manual depreciation is netted out;
    recorded provider balances are not credited again for revenue.
    """
    if not isinstance(month, str) or not re.fullmatch(
        r"\d{4}-(0[1-9]|1[0-2])", month,
    ):
        raise ValueError("Invalid reporting month")
    scheduled = cents(sum(number(row.get("depreciation"))
                          for row in entries_list(base_rows)
                          if isinstance(row, dict) and
                          row.get("category") == "equipment"))
    manual = cents(activity(ledger_entries, "depreciation"))
    adjustment = max(0, cents(scheduled - manual))
    nominal_power = max(0, cents(auto_power))
    entries = []
    if month >= min_month and adjustment > 0:
        entries.append({
            "id": "auto-depreciation:" + month,
            "date": month + "-28",
            "description": "Monthly equipment depreciation",
            "lines": [
                {"account": "depreciation", "debit": adjustment, "credit": 0},
                {"account": "accDep", "debit": 0, "credit": adjustment},
            ],
            "automatic": True,
        })
    if month >= min_month and nominal_power > 0:
        entries.append({
            "id": "auto-power-estimate:" + month,
            "date": month + "-28",
            "description": "Estimated mining electricity — not a confirmed payment",
            "lines": [
                {"account": "electric", "debit": nominal_power, "credit": 0},
                {"account": "payable", "debit": 0, "credit": nominal_power},
            ],
            "automatic": True,
            "estimated": True,
        })
    return {
        "sourceOfCalculation": "backend-financial-core",
        "month": month,
        "scheduledDepreciationUsd": scheduled,
        "manualDepreciationUsd": manual,
        "autoDepreciationUsd": adjustment if month >= min_month else 0,
        "powerEstimateUsd": nominal_power if month >= min_month else 0,
        "entries": entries,
    }


def trial_balance(accounts, ledger):
    """Compute cumulative debit and credit activity by chart-of-account ID.

    Balancing is diagnostic; a missing account is reported as an imbalance,
    never fixed by inventing an account or a synthetic journal entry.
    """
    accounts = entries_list(accounts)
    ledger = entries_list(ledger)
    rows = []
    seen = set()
    for account in accounts:
        if not isinstance(account, dict):
            continue
        key = account.get("id")
        if not isinstance(key, str) or not key or key in seen:
            continue
        seen.add(key)
        val = activity(ledger, key)
        debit = max(0, val)
        credit = max(0, -val)
        if debit or credit:
            rows.append({
                **account, "debit": debit, "credit": credit,
            })
    debits = cents(sum(r["debit"] for r in rows))
    credits = cents(sum(r["credit"] for r in rows))
    return {
        "sourceOfCalculation": "backend-trial-balance",
        "rows": rows,
        "debitsUsd": debits,
        "creditsUsd": credits,
        "differenceUsd": cents(debits - credits),
        "balanced": abs(debits - credits) < .005,
    }


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
    statement_rows = build_statement_rows(
        data.get("rows"), ledger,
        data.get("cashOpening"), data.get("payableOpening"))
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
        "statementRows": statement_rows,
        "business": sum_business_rows(statement_rows),
    }


SOURCE_KEYS = ("lulo", "loopscale", "stocks", "kryptex", "rollercoin",
               "salad", "unetwork")


def source_key(raw):
    value = re.sub(r"\s+", " ", str(raw or "").strip().lower())
    if re.search(r"roller\s*coin", value):
        return "rollercoin"
    if re.search(r"unity\s*network|unitynetwork|unetwork", value):
        return "unetwork"
    for key in ("kryptex", "loopscale", "lulo", "salad"):
        if re.search(r"\b" + key + r"\b", value):
            return key
    if re.search(r"stocks|dividend|\bvoo\b|\bvti\b", value):
        return "stocks"
    return value


def debit_for_income(source):
    return {"lulo": "luloCash", "loopscale": "defi",
            "stocks": "brokerage", "kryptex": "platform:kryptex",
            "rollercoin": "platform:rollercoin", "salad": "platform:salad",
            "unetwork": "platform:unetwork"}.get(source, "platform")


def auto_income_journal(month, income_month, manual_journal,
                        current_month, today_key=None):
    """Read-only, idempotent projection matching the old automatic accruals.

    A posted manual income credit substitutes for projected income. Asset
    withdrawals do not. Unknown revenue accounts are flagged for review,
    never fabricated as a platform receivable.
    """
    blank = {"entries": [], "syncedTotal": None, "manualRevenueTotal": 0,
             "generatedRevenueTotal": 0, "unexplainedManualRevenue": 0,
             "pendingReview": [], "pendingReviewTotal": 0}
    if not isinstance(income_month, dict):
        return blank
    synced = max(0, cents(income_month.get("total")))
    blank["syncedTotal"] = synced
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", str(month or "")):
        return blank
    sources = {}
    for label, raw in (income_month.get("sources") or {}).items():
        amount = max(0, cents(raw))
        key = source_key(label)
        if amount <= 0 or not key:
            continue
        if key not in sources:
            sources[key] = {"key": key, "label": label, "amount": 0.}
        sources[key]["amount"] = cents(sources[key]["amount"] + amount)
    total_sources = cents(sum(s["amount"] for s in sources.values()))
    residual = cents(synced - total_sources)
    if synced > total_sources and not (
        len(sources) >= 2 and residual <= .01
    ):
        sources["unallocated-income"] = {
            "key": "unallocated-income", "label": "Unallocated tracked income",
            "amount": residual,
        }
    manual_revenue = []
    for entry in entries_list(manual_journal):
        if not isinstance(entry, dict) or str(entry.get("date") or "")[:7] != month:
            continue
        amount = cents(sum(line["credit"] - line["debit"] for line in
                           normalize_lines(entry)
                           if line["account"] in ("revenue", "dividendRevenue")))
        if amount > 0:
            manual_revenue.append({**entry, "amount": amount})
    manual_total = cents(sum(row["amount"] for row in manual_revenue))
    remaining_sources = [dict(s) for s in sources.values()]
    unattributed = 0.
    for entry in manual_revenue:
        description = source_key(entry.get("description"))
        match = next((s for s in remaining_sources
                      if s["key"] in description or
                      (s["key"] == "stocks" and re.search(
                          r"dividend|\bvoo\b|\bvti\b", description))), None)
        if not match:
            unattributed = cents(unattributed + entry["amount"])
            continue
        offset = min(match["amount"], cents(entry["amount"]))
        match["amount"] = cents(match["amount"] - offset)
        unattributed = cents(unattributed + max(0, cents(entry["amount"] - offset)))
    for source in sorted(remaining_sources, key=lambda s: s["key"] != "unallocated-income"):
        amount = min(unattributed, source["amount"])
        source["amount"] = cents(source["amount"] - amount)
        unattributed = cents(unattributed - amount)
    limit = max(0, cents(synced - manual_total))
    remaining = limit
    day = (today_key if month == current_month and isinstance(today_key, str) and
           today_key.startswith(month) else
           f"{month}-{monthrange(int(month[:4]), int(month[5:]))[1]:02d}")
    entries = []
    review = []
    for source in remaining_sources:
        value = min(remaining, max(0, cents(source["amount"])))
        if value <= 0:
            continue
        key = source["key"]
        if key not in SOURCE_KEYS:
            review.append({"source": source["label"], "amount": value})
            remaining = cents(remaining - value)
            continue
        entries.append({
            "id": "synced-income:" + month + ":" + quote(key, safe="-_.!~*'()"),
            "date": day, "description": "Synced " + str(source["label"]) + " income",
            "automatic": True, "origin": "crypto-income", "amount": value,
            "lines": [
                {"account": debit_for_income(key), "debit": value, "credit": 0},
                {"account": "dividendRevenue" if key == "stocks" else "revenue",
                 "debit": 0, "credit": value},
            ],
        })
        remaining = cents(remaining - value)
    return {
        "entries": entries, "syncedTotal": synced,
        "manualRevenueTotal": manual_total,
        "generatedRevenueTotal": cents(sum(x["amount"] for x in entries)),
        "pendingReview": review,
        "pendingReviewTotal": cents(sum(x["amount"] for x in review)),
        "unexplainedManualRevenue": max(0, cents(manual_total - synced)),
    }


def project_break_even(positions, stats, saved_payback):
    """Backend payback analysis from recorded provider earnings, not balances.

    Portfolio balances never become earned income. User-entered totalSpent is
    kept exactly as saved and a zero-cost project has no fabricated recovery.
    """
    from math import ceil
    group = {}
    for row in entries_list(positions):
        if not isinstance(row, dict):
            continue
        name = str(row.get("platform") or "Other").strip() or "Other"
        key = name.lower()
        g = group.setdefault(key, {"id": "manual-project-" + key,
                                   "name": name, "earned": 0.,
                                   "balance": 0., "daily": 0.})
        earned, balance, apy = (number(row.get("earned")),
                                number(row.get("balance")),
                                number(row.get("apy")))
        g["earned"] += earned
        g["balance"] += balance
        g["daily"] += balance * apy / 100 / 365
    result = [{"id": g["id"], "name": g["name"], "earned": g["earned"],
               "daily": g["daily"]} for g in group.values()]
    providers = (
        ("salad-project", "Salad", "salad", "lifetimeUsd", "estimatedDailyUsd"),
        ("rollercoin-project", "RollerCoin", "rollercoin", "lifetimeUsd", "todayUsd"),
        ("unetwork-project", "Unetwork", "unetwork", "lifetimeUsd", "estimatedDailyUsd"),
        ("kryptex-project", "Kryptex", "kryptex", "lifetimeUsd", "dailyUsd"),
    )
    for pid, name, key, earned_key, daily_key in providers:
        provider = stats.get(key) if isinstance(stats.get(key), dict) else {}
        result.append({"id": pid, "name": name, "earned": number(provider.get(earned_key)),
                       "daily": max(0, number(provider.get(daily_key)))})
    payback = saved_payback if isinstance(saved_payback, dict) else {}
    rows = []
    for row in result:
        configured = payback.get(row["id"]) or {}
        spent = max(0, number(configured.get("totalSpent")))
        earned = row["earned"]
        remaining = max(0, spent - earned)
        row.update({
            "spent": spent,
            "configured": spent > 0,
            "pnl": earned - spent if spent > 0 else None,
            "remaining": remaining if spent > 0 else None,
            "daysToProfit": (
                0 if spent > 0 and remaining == 0
                else ceil(remaining / row["daily"]) if spent > 0 and row["daily"] > 0
                else None
            ),
            "recovered": (earned >= spent if spent > 0
                          else row["id"] == "salad-project" and earned > 0),
            "recoveredPct": max(0, earned) / spent * 100 if spent > 0 else 0.,
        })
        rows.append(row)
    valid = [row for row in rows if row["spent"] > 0]
    total_spent = sum(row["spent"] for row in valid)
    total_earned = sum(max(0, row["earned"]) for row in valid)
    return {
        "sourceOfCalculation": "backend-project-break-even",
        "rows": rows,
        "totalSpent": total_spent, "totalEarned": total_earned,
        "recoveredCount": sum(row["earned"] >= row["spent"] for row in valid),
        "overallPercent": total_earned / total_spent * 100 if total_spent > 0 else 0.,
    }
