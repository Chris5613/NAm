"""Read-only integration invariants for NAm provider and accounting data.

The goal is to expose independently testable facts, not to force unlike
accounting concepts (mark-to-market balances, realized income, and projected
profitability) to match. Never mutates settings or journal entries.
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from math import isfinite

from .project_accounting import portfolio_summary
from .provider_monthly_income import monthly_provider_income


def safe_number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
        return number if isfinite(number) else None
    except (ValueError, TypeError):
        return None


def as_object(value):
    return value if isinstance(value, dict) else {}


def audit_integration_settings(values, now=None):
    """Return a concise, non-mutating audit of live authoritative records."""
    now = now or datetime.now(timezone.utc)
    values = as_object(values)
    checks = []

    def add(code, status, explanation, **details):
        checks.append({"code": code, "status": status, "message": explanation, **details})

    tracker = as_object(values.get("project_income_kryptex_tracker_v1"))
    mining = as_object(tracker.get("kryptexMiningDaily"))
    confirmations = as_object(tracker.get("kryptexConfirmedDays"))
    by_month = as_object(tracker.get("monthlyEarnings"))
    sats = as_object(tracker.get("kryptexMiningSatsDaily"))
    pending = tracker.get("kryptexPendingEarningsDays")
    pending = [d for d in pending if isinstance(d, str)] if isinstance(pending, list) else []
    observed_months = sorted({str(d)[:7] for d in mining if confirmations.get(d)})

    for month in observed_months:
        observed = sum(
            max(0, safe_number(value) or 0) for day, value in mining.items()
            if str(day).startswith(month + "-") and confirmations.get(day)
        )
        reported = safe_number(by_month.get(month))
        if reported is None:
            add("kryptex_monthly_" + month, "warning",
                "Confirmed daily rewards exist but monthly Kryptex total is absent.",
                observedUsd=round(observed, 8))
        elif abs(reported - observed) > 0.02:
            add("kryptex_monthly_" + month, "error",
                "Kryptex monthly total does not reconcile with confirmed daily rewards.",
                monthlyUsd=round(reported, 8), confirmedDailyUsd=round(observed, 8),
                differenceUsd=round(reported - observed, 8))
        else:
            add("kryptex_monthly_" + month, "pass",
                "Confirmed daily Kryptex rewards reconcile to monthly total.",
                monthlyUsd=round(reported, 8))

    flagged = sorted({
        day for day in pending if (safe_number(sats.get(day)) or 0) > 0
    } | {
        day for day, value in sats.items()
        if (safe_number(value) or 0) > 0 and not
        (confirmations.get(day) and (safe_number(mining.get(day)) or 0) > 0)
    })
    add("kryptex_missing_conversions", "warning" if flagged else "pass",
        "Kryptex satoshi rewards without confirmed positive USD income." if flagged
        else "No recorded Kryptex satoshi rewards awaiting USD conversion.",
        days=flagged)

    snapshots = as_object(values.get("yield_monthly_snapshots_v1"))
    for month, raw in sorted(snapshots.items()):
        row = as_object(raw)
        platforms = row.get("platforms")
        if not isinstance(platforms, list) or not platforms:
            continue
        total = safe_number(row.get("total"))
        provider_sum = sum(
            safe_number(as_object(provider).get("amount")) or 0 for provider in platforms
        )
        if total is None or abs(total-provider_sum) > 0.02:
            add("monthly_snapshot_sum_" + month, "error",
                "Monthly snapshot does not equal the sum of its project rows.",
                totalUsd=total, summedProjectsUsd=round(provider_sum, 8))
        else:
            add("monthly_snapshot_sum_" + month, "pass",
                "Monthly snapshot matches its project rows.",
                totalUsd=round(total, 8))
        # The tracker is the authoritative Kryptex income ledger. An unlocked
        # current monthly snapshot should match it after provider sync.
        if not row.get("locked"):
            project = next(
                (as_object(p) for p in platforms
                 if str(as_object(p).get("platform", "")).lower() == "kryptex"), None
            )
            canonical = safe_number(by_month.get(month))
            snapshot_kryptex = safe_number(project.get("amount")) if project else None
            if canonical is not None and snapshot_kryptex is not None:
                delta = canonical - snapshot_kryptex
                add("kryptex_snapshot_" + month,
                    "warning" if abs(delta) > 0.02 else "pass",
                    "Kryptex provider snapshot differs from the mining income ledger."
                    if abs(delta) > 0.02 else
                    "Kryptex snapshot matches the mining income ledger.",
                    trackerUsd=round(canonical, 8),
                    snapshotUsd=round(snapshot_kryptex, 8),
                    differenceUsd=round(delta, 8))

    # Independent provider trackers, rather than a partially hydrated browser,
    # determine current-month earned income. The earlier audit checked only
    # Kryptex; the other extension providers could silently regress together.
    current_month = now.astimezone(ZoneInfo("America/Los_Angeles")).strftime("%Y-%m")
    current_snapshot = as_object(snapshots.get(current_month))
    if current_snapshot.get("platforms") and not current_snapshot.get("locked"):
        provider_keys = {
            "kryptex": "project_income_kryptex_tracker_v1",
            "salad": "project_income_salad_tracker_v1",
            "rollercoin": "project_income_rollercoin_tracker_v2",
            "unetwork": "project_income_unetwork_tracker_v1",
        }
        canonical = monthly_provider_income(
            {name: values.get(key) for name, key in provider_keys.items()},
            current_month,
        )
        expected = next((row for row in canonical
                         if row.get("monthKey") == current_month), None)
        if expected:
            observed = {
                str(p.get("platform")): safe_number(p.get("amount"))
                for p in current_snapshot.get("platforms", [])
                if isinstance(p, dict)
            }
            mismatches = []
            for item in expected.get("platforms", []):
                name = str(item.get("platform") or "")
                actual = observed.get(name)
                authoritative = safe_number(item.get("amount"))
                if authoritative is not None and (
                    actual is None or abs(actual - authoritative) > 0.02
                ):
                    mismatches.append({
                        "provider": name,
                        "snapshotUsd": actual,
                        "trackerUsd": round(authoritative, 6),
                    })
            add("extension_provider_snapshot_" + current_month,
                "error" if mismatches else "pass",
                "Current unlocked monthly snapshot differs from dated provider trackers."
                if mismatches else
                "Current unlocked monthly extension providers match backend trackers.",
                mismatches=mismatches)

    # Source polling is independent of the user opening a browser tab.
    # Do not treat a stale Lulo balance as live or silently mark its prior
    # value down to zero; report the failure and age with no wallet exposure.
    registration = as_object(values.get("yield_backend_source_wallets_v1"))
    upstream = as_object(values.get("yield_backend_source_snapshots_v1"))
    if upstream or registration.get("lulo") or registration.get("loopscale"):
        from datetime import timedelta
        max_age = timedelta(minutes=30)

        def freshness(raw):
            if not isinstance(raw, dict):
                return False
            text_date = raw.get("syncedAt")
            if not isinstance(text_date, str):
                return False
            try:
                stamp = datetime.fromisoformat(text_date.replace("Z", "+00:00"))
                if stamp.tzinfo is None:
                    stamp = stamp.replace(tzinfo=timezone.utc)
                return timedelta(0) <= now - stamp <= max_age
            except (TypeError, ValueError, OverflowError):
                return False

        lulo = as_object(upstream.get("lulo"))
        provider_errors = as_object(upstream.get("errors"))
        expected_lulo = registration.get("lulo")
        expected_lulo = expected_lulo if isinstance(expected_lulo, list) else []
        lulo_stale = [
            index for index, wallet in enumerate(expected_lulo)
            if not freshness(as_object(lulo.get(wallet)))
        ]
        loop_registered = isinstance(registration.get("loopscale"), str) and bool(
            registration["loopscale"])
        loop_stale = loop_registered and not freshness(as_object(upstream.get("loopscale")))
        categories = sorted(set(
            "lulo" if key.startswith("lulo:") else "loopscale"
            for key in provider_errors if isinstance(key, str)
            and (key.startswith("lulo:") or key == "loopscale")
        ))
        issues = bool(lulo_stale or loop_stale or categories)
        add("yield_upstream_source_health",
            "warning" if issues else "pass",
            "Registered yield source snapshots are stale or polling failed."
            if issues else "Registered yield source polling is current.",
            staleLuloWalletCount=len(lulo_stale),
            loopscaleStale=bool(loop_stale),
            failingProviders=categories,
            checkedAt=upstream.get("checkedAt"))

    journal = values.get("financials_journal_v1")
    entries = journal if isinstance(journal, list) else []
    invalid = []
    for entry in entries:
        entry = as_object(entry)
        lines = entry.get("lines")
        if not isinstance(lines, list):
            continue  # Legacy simple 2-account entries balance by construction.
        debit = sum(safe_number(as_object(line).get("debit")) or 0 for line in lines)
        credit = sum(safe_number(as_object(line).get("credit")) or 0 for line in lines)
        if abs(debit - credit) > 0.01:
            invalid.append({"id": str(entry.get("id", ""))[:100],
                            "differenceUsd": round(debit-credit, 2)})
    add("journal_balanced", "error" if invalid else "pass",
        "Journal has unbalanced compound entries." if invalid else
        "All compound journal entries have equal debits and credits.",
        unbalanced=invalid, checked=len(entries))

    devices = values.get("hardware_payback_devices_v1")
    devices = devices if isinstance(devices, list) else []
    device_ids = [str(as_object(device).get("id") or "") for device in devices]
    bad_ids = any(not d for d in device_ids) or len(set(device_ids)) != len(device_ids)
    bad_costs = [str(as_object(device).get("id") or "") for device in devices
                 if (safe_number(as_object(device).get("cost")) or 0) <= 0]
    add("hardware_register", "error" if bad_ids or bad_costs else "pass",
        "Hardware register has missing/duplicate IDs or invalid costs."
        if bad_ids or bad_costs else "Hardware IDs and purchase costs are valid.",
        devices=len(devices), duplicateOrMissingIds=bad_ids,
        invalidCostIds=bad_costs)

    # Audit the same backend-owned source feeding the fast Crypto Dashboard.
    # This invariant is about current holdings, not earned mining income.
    feed = as_object(values.get("yield_project_latest_balance_feed_v1"))
    source_rows = feed.get("projects")
    source_rows = source_rows if isinstance(source_rows, list) else []
    saved_summary = as_object(values.get("project_income_portfolio_summary_v1"))
    if feed.get("receivedAt") and source_rows:
        expected = portfolio_summary(source_rows)
        total = safe_number(saved_summary.get("portfolioBalance"))
        active = safe_number(saved_summary.get("activePortfolioBalance"))
        valid_owner = saved_summary.get("source") == "backend-project-feed"
        if not valid_owner:
            add("crypto_portfolio_authority", "warning",
                "Project portfolio has not yet been published by the backend-only feed.",
                source=saved_summary.get("source"))
        elif (total is None or active is None or
              abs(total - expected["totalUsd"]) > 0.02 or
              abs(active - expected["activeTotalUsd"]) > 0.02):
            add("crypto_portfolio_authority", "error",
                "Backend project summary and unique validated provider feed differ.",
                summaryUsd=total, feedUsd=expected["totalUsd"],
                summaryActiveUsd=active, feedActiveUsd=expected["activeTotalUsd"])
        else:
            add("crypto_portfolio_authority", "pass",
                "Backend project total and active-only value reconcile with provider feed.",
                totalUsd=round(total, 8), activeUsd=round(active, 8),
                providerCount=expected["projectCount"])
        provider_ids = {
            "kryptex-project", "salad-project",
            "unetwork-project", "rollercoin-project",
        }
        latest = {str(row.get("id")): row for row in source_rows
                  if isinstance(row, dict) and row.get("id")}
        not_server_owned = [
            id for id in sorted(provider_ids & latest.keys())
            if latest[id].get("balanceSource") != "backend-provider-tracker"
        ]
        add("crypto_provider_authority",
            "warning" if not_server_owned else "pass",
            "Some provider balances still lack backend-tracker provenance."
            if not_server_owned else
            "All present extension-provider holdings use backend tracker values.",
            unverifiedProviders=not_server_owned)

    # A legacy browser cache can simultaneously contain two BTC market
    # prices for the same coins. This is price provenance drift, NOT newly
    # mined income or a transfer. Never alter saved balances to hide it.
    legacy_crypto = as_object(values.get("networth_crypto_cache"))
    legacy_portfolio = as_object(legacy_crypto.get("projectPortfolio"))
    portfolio_btc = as_object(legacy_portfolio.get("bitcoin"))
    btc_quote = safe_number(portfolio_btc.get("price"))
    chain_prices = [
        safe_number(as_object(token).get("price"))
        for chain in (legacy_crypto.get("chains") or [])
        if isinstance(chain, dict) and str(chain.get("chain") or "").lower() == "bitcoin"
        for token in (chain.get("tokens") or [])
        if isinstance(token, dict) and str(token.get("symbol") or "").upper() == "BTC"
    ]
    chain_prices = [p for p in chain_prices if p is not None and p > 0]
    if btc_quote is not None and btc_quote > 0 and chain_prices:
        biggest_gap = max(abs(p - btc_quote) for p in chain_prices)
        add("bitcoin_legacy_quote_drift",
            "warning" if biggest_gap > max(100.0, btc_quote * 0.01) else "pass",
            "Legacy wallet and chain cache contain different BTC quotes; "
            "use backend /bitcoin-valuation for one market quote."
            if biggest_gap > max(100.0, btc_quote * 0.01) else
            "Legacy Bitcoin quotations agree within display tolerance.",
            walletQuoteUsd=round(btc_quote, 2),
            chainQuoteUsd=round(chain_prices[0], 2),
            maxPriceGapUsd=round(biggest_gap, 2))

    published = as_object(values.get("passive_income_monthly_chart_total_v1"))
    published_month = str(published.get("month") or "")
    published_amount = safe_number(published.get("amount"))
    if published_month and published_amount is not None:
        # Daily chart and month-end provider snapshots can differ legitimately:
        # do not assert they are interchangeable or silently reconcile them.
        add("monthly_chart_source", "info",
            "Legacy browser-published chart cache (deprecated after backend "
            "earnings-dashboard cutover). Do not use for canonical totals.",
            month=published_month, publishedDailyUsd=round(published_amount, 8))

    recovery = as_object(values.get("kryptex_recovery_verified_2026_11_01_06_v1"))
    if recovery:
        add("historical_mining_provenance", "pass",
            "Recovered historical Kryptex earnings retain source metadata and backup.")
    else:
        add("historical_mining_provenance", "info",
            "No historical Kryptex recovery metadata present for this account.")

    status = "error" if any(c["status"] == "error" for c in checks) else (
        "warning" if any(c["status"] == "warning" for c in checks) else "pass"
    )
    return {
        "status": status,
        "checkedAt": now.isoformat(),
        "checks": checks,
        "summary": {
            status: sum(c["status"] == status for c in checks)
            for status in ("pass", "warning", "error", "info")
        },
    }
