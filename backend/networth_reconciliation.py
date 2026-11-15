"""Non-mutating Home / Financials reconciliation and future snapshot provenance.

Home includes a business Balance Sheet and a cash-overlap adjustment.
The old nightly snapshot included only personal assets + provider balance +
an independently cached BTC quote. Those are NOT equivalent accounting bases.
Do not claim a certified combined net worth until the Financials ledger is
calculated and reconciled on the backend.
"""
from datetime import datetime, timezone
from math import isfinite

from .bitcoin_valuation import wallet_evidence, combine_crypto_valuation
from .project_accounting import portfolio_summary


def finite_number(raw):
    if raw is None or isinstance(raw, bool):
        return None
    try:
        value = float(raw)
    except (ValueError, TypeError, OverflowError):
        return None
    return value if isfinite(value) else None


def object_value(raw):
    return raw if isinstance(raw, dict) else {}


def legacy_nightly_components(assets, project_summary, crypto_cache):
    """Exactly describe (do not retroactively reprice) the existing scheduler."""
    categories = {"stocks": 0.0, "cash": 0.0, "other": 0.0, "debts": 0.0}
    for asset in assets:
        category = str(getattr(asset, "category", "") or "")
        if category not in categories:
            continue
        manual = getattr(asset, "manual_value", None)
        if category != "stocks" and manual is not None:
            value = float(manual or 0)
        else:
            value = float(getattr(asset, "quantity", None) or 0) * float(
                getattr(asset, "current_price", None) or 0
            )
        categories[category] += value

    summary = object_value(project_summary)
    cache = object_value(crypto_cache)
    project = finite_number(summary.get("portfolioBalance"))
    project_valid = project is not None
    project = project if project_valid else 0.0

    bitcoin = object_value(object_value(cache.get("projectPortfolio")).get("bitcoin"))
    btc = finite_number(bitcoin.get("value", bitcoin.get("balance", 0)) or 0)
    btc = btc if btc is not None else 0.0
    cached = finite_number(cache.get("total") or 0)
    cached = cached if cached is not None else 0.0

    crypto = project + btc if project_valid else cached
    subtotal = categories["stocks"] + categories["cash"] + categories["other"] - categories["debts"]
    # Preserve the exact original addition order for historical snapshot
    # compatibility, without inventing any new money or rounding the ledger.
    total = (categories["stocks"] + crypto + categories["cash"] +
             categories["other"] - categories["debts"])
    return {
        "formula": "legacy-personal-plus-projects-btc-v1",
        "personal": categories,
        "personalSubtotalUsd": round(subtotal, 8),
        "projectBalanceUsd": project if project_valid else None,
        "bitcoinLegacyUsd": round(btc, 8),
        "cryptoLegacyFallbackUsd": cached if not project_valid else None,
        "cryptoSubtotalUsd": round(crypto, 8),
        "totalUsd": total,
        "businessBalanceSheetIncluded": False,
        "bankCashDeduplicated": False,
        "componentSources": {
            "personal": "assets-postgres",
            "project": "project_income_portfolio_summary_v1" if project_valid
                       else "legacy-networth-crypto-total",
            "bitcoin": "legacy-networth-crypto-projectPortfolio-bitcoin",
        },
        "comparableToHomeFinancials": False,
    }


def personal_assets_home_basis(assets):
    """Same quote/manual priority as Home, but disclose unknown valuations."""
    categories = {"stocks": 0.0, "cash": 0.0, "other": 0.0, "debts": 0.0}
    unknown = []
    for asset in assets:
        category = str(getattr(asset, "category", "") or "")
        if category not in categories:
            continue
        qty = finite_number(getattr(asset, "quantity", None))
        price = finite_number(getattr(asset, "current_price", None))
        manual = finite_number(getattr(asset, "manual_value", None))
        if category == "stocks":
            value = qty * price if qty is not None and price is not None else manual
        else:
            value = manual if manual is not None else (
                qty * price if qty is not None and price is not None else None
            )
        if value is None:
            unknown.append(category)
        else:
            categories[category] += value
    subtotal = (
        categories["stocks"] + categories["cash"] +
        categories["other"] - categories["debts"]
    ) if not unknown else None
    return {
        "categories": {key: round(value, 8) for key, value in categories.items()},
        "subtotalUsd": round(subtotal, 8) if subtotal is not None else None,
        "unknownAssetCategories": sorted(set(unknown)),
        "fullyValued": not unknown,
    }


def lulo_withdrawal_review(journal, monthly_rows, month):
    """Signal plausible overlap but never post, reverse, or invent transfers."""
    entries = journal if isinstance(journal, list) else []
    month_record = object_value(object_value(monthly_rows).get(month))
    opening = None
    for row in month_record.get("items") or []:
        if (isinstance(row, dict) and
                str(row.get("name") or "").strip().lower() == "lulo"):
            opening = finite_number(row.get("start"))
            break

    amounts = []
    for entry in entries:
        if not isinstance(entry, dict) or not str(entry.get("date") or "").startswith(month):
            continue
        lines = entry.get("lines")
        if not isinstance(lines, list):
            continue
        cash_debits = sum(
            finite_number(row.get("debit")) or 0 for row in lines
            if isinstance(row, dict) and row.get("account") == "cash"
        )
        lulo_credits = sum(
            finite_number(row.get("credit")) or 0 for row in lines
            if isinstance(row, dict) and row.get("account") == "luloCash"
        )
        if cash_debits > 0 and abs(cash_debits - lulo_credits) < .01:
            amounts.append(round(cash_debits, 2))
    mismatch = opening is not None and bool(amounts) and (
        abs(opening - sum(amounts)) > 0.02
    )
    return {
        "month": month,
        "recordedLuloOpeningUsd": opening,
        "postedWithdrawalCashDebitsUsd": round(sum(amounts), 2) if amounts else None,
        "amountsRequireReview": bool(mismatch),
        "differenceUsd": round(sum(amounts)-opening, 2) if mismatch else 0,
        "bankReceiptIndependentlyVerified": False,
        "financialJournalMutated": False,
    }


def projected_business_cash(month, openings, journal, confirmed_movements=None):
    """Cash changes from POSTED journal lines, not inferred provider transfers.

    This is only a book-ledger projection. Even with a known opening, there is
    no independent bank statement proving that personal Home cash holds the
    same dollars. An unreviewed external movement renders it incomplete.
    """
    opening = finite_number(object_value(openings).get(month))
    transactions = journal if isinstance(journal, list) else []
    delta = 0.0
    invalid = False
    entry_count = 0
    for entry in transactions:
        if not isinstance(entry, dict) or not str(entry.get("date") or "").startswith(month):
            continue
        lines = entry.get("lines")
        entry_delta = 0.0
        relevant = False
        if isinstance(lines, list):
            for row in lines:
                if not isinstance(row, dict) or row.get("account") != "cash":
                    continue
                relevant = True
                debit = finite_number(row.get("debit"))
                credit = finite_number(row.get("credit"))
                if debit is None or credit is None or debit < 0 or credit < 0:
                    invalid = True
                    continue
                entry_delta += debit - credit
        else:
            amount = finite_number(entry.get("amount"))
            from_cash = entry.get("creditAccount") == "cash"
            to_cash = entry.get("debitAccount") == "cash"
            if from_cash or to_cash:
                relevant = True
                if amount is None or amount < 0:
                    invalid = True
                else:
                    entry_delta += amount * (int(to_cash) - int(from_cash))
        if relevant:
            entry_count += 1
            delta += entry_delta

    movements = confirmed_movements
    # A separate confirmed-movement store may duplicate journal entries or
    # contain legitimately unposted entries. Do not guess which.
    extra_count = len(movements) if isinstance(movements, (dict, list)) else 0
    reliable = opening is not None and not invalid and extra_count == 0
    known = round((opening or 0) + delta, 2) if opening is not None and not invalid else None
    return {
        "month": month,
        "openingUsd": opening,
        "journalCashChangeUsd": round(delta, 2),
        "journalCashEntries": entry_count,
        "unreviewedMovementCount": extra_count,
        "bookProjectedCashUsd": known if reliable else None,
        "knownJournalSubtotalUsd": known,
        "completeForJournalOnly": reliable,
        "independentlyMatchedToBank": False,
        "canDeduplicateFromHome": False,
        "source": "bank-opening-plus-posted-journal",
    }


def equipment_trade_review(journal, month):
    """Read the journal's trade-in math; never sell/remove the asset again."""
    trades = []
    for entry in journal if isinstance(journal, list) else []:
        if not isinstance(entry, dict) or not str(entry.get("date") or "").startswith(month):
            continue
        lines = entry.get("lines")
        if not isinstance(lines, list):
            continue
        debits = sum(finite_number(line.get("debit")) or 0 for line in lines
                     if isinstance(line, dict))
        credits = sum(finite_number(line.get("credit")) or 0 for line in lines
                      if isinstance(line, dict))
        cash_credit = sum(finite_number(line.get("credit")) or 0 for line in lines
                          if isinstance(line, dict) and line.get("account") == "cash")
        equipment_credit = sum(finite_number(line.get("credit")) or 0 for line in lines
                               if isinstance(line, dict) and
                               str(line.get("account") or "").startswith("equipment:"))
        gain_credit = sum(finite_number(line.get("credit")) or 0 for line in lines
                          if isinstance(line, dict) and line.get("account") == "gainDisposal")
        equipment_debit = sum(finite_number(line.get("debit")) or 0 for line in lines
                              if isinstance(line, dict) and line.get("account") == "equipment")
        if equipment_credit <= 0 or equipment_debit <= 0:
            continue
        trade_value = equipment_credit + gain_credit
        balanced = abs(debits - credits) <= .01
        reconciles = balanced and abs((equipment_debit - cash_credit) - trade_value) <= .02
        trades.append({
            "date": str(entry.get("date") or ""),
            "acquiredEquipmentUsd": round(equipment_debit, 2),
            "cashPaidUsd": round(cash_credit, 2),
            "disposedEquipmentBookValueUsd": round(equipment_credit, 2),
            "disposalGainUsd": round(gain_credit, 2),
            "tradeInValueUsd": round(trade_value, 2),
            "journalBalanced": balanced,
            "purchaseFundingReconciles": reconciles,
            "equipmentRegisterDisposalIndependentlyVerified": False,
        })
    return trades


def home_reconciliation_preview(
    assets, wallets, wallet_cache, provider_feed, portfolio_setting,
    legacy_crypto_cache, financial_monthly, journal, month, user_id,
    now=None, bank_openings=None, confirmed_movements=None
):
    now = now or datetime.now(timezone.utc)
    personal = personal_assets_home_basis(assets)
    legacy = legacy_nightly_components(assets, portfolio_setting, legacy_crypto_cache)
    feed = object_value(provider_feed)
    rows = feed.get("projects")
    provider = portfolio_summary(rows) if isinstance(rows, list) else {}
    summary = object_value(portfolio_setting)
    published = finite_number(summary.get("portfolioBalance"))
    total = finite_number(provider.get("totalUsd")) if (
        feed.get("receivedAt") and provider.get("complete")
    ) else None
    source_matches = (
        published is not None and total is not None and
        summary.get("source") == "backend-project-feed" and
        abs(published - total) <= .02
    )
    bitcoin_evidence = wallet_evidence(wallets, wallet_cache, now)
    btc = combine_crypto_valuation(
        bitcoin_evidence, total if source_matches else None,
        user_id=user_id, now=now
    )
    transfer = lulo_withdrawal_review(journal, financial_monthly, month)
    equipment_trades = equipment_trade_review(journal, month)
    cash_projection = projected_business_cash(
        month, bank_openings, journal, confirmed_movements
    )
    max_overlap = (
        round(min(max(0, personal["categories"]["cash"]),
                  max(0, cash_projection["bookProjectedCashUsd"])), 2)
        if cash_projection["bookProjectedCashUsd"] is not None and
        "cash" not in personal["unknownAssetCategories"]
        else None
    )
    flags = []
    if not source_matches:
        flags.append("project-feed-summary-mismatch-or-absent")
    if not btc["complete"]:
        flags.append("bitcoin-wallet-quantity-or-market-quote-missing")
    if btc["bitcoin"]["staleWalletCount"]:
        flags.append("bitcoin-wallet-observations-stale")
    if transfer["amountsRequireReview"]:
        flags.append("lulo-withdrawal-vs-opening-requires-review")
    if any(not trade["purchaseFundingReconciles"] for trade in equipment_trades):
        flags.append("equipment-trade-journal-imbalance")
    if equipment_trades:
        flags.append("traded-equipment-register-disposal-requires-review")
    if max_overlap is not None and max_overlap > 0:
        flags.append("possible-business-cash-overlap-unverified")
    if not cash_projection["completeForJournalOnly"]:
        flags.append("business-bank-book-projection-incomplete")
    flags.append("financials-business-ledger-not-yet-backend-reconciled")
    return {
        "sourceOfCalculation": "backend-read-only-reconciliation",
        "userId": user_id,
        "month": month,
        "calculatedAt": now.isoformat(),
        "personal": personal,
        "projectPortfolioUsd": total if source_matches else None,
        "bitcoin": btc["bitcoin"],
        "simplifiedPersonalPlusCryptoUsd": round(
            personal["subtotalUsd"] + btc["cryptoTotalUsd"], 8
        ) if personal["subtotalUsd"] is not None and
             btc["cryptoTotalUsd"] is not None else None,
        "currentLegacySchedulerProjectionUsd": legacy["totalUsd"],
        "legacySchedulerFormula": legacy["formula"],
        "legacyBasisIncludesFinancials": False,
        "businessBalanceSheetUsd": None,
        "homeCertifiedNetWorthUsd": None,
        "certified": False,
        "bankCashDeduplication": "unverified",
        "luloTransfer": transfer,
        "equipmentTrades": equipment_trades,
        "businessCashProjection": cash_projection,
        "possibleBankCashOverlapMaximumUsd": max_overlap,
        "bankCashOverlapVerified": False,
        "flags": flags,
        "financialRecordsMutated": False,
    }
