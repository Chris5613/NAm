// Acurast manual sync — there's no public Acurast operator earnings API,
// so the user periodically types their current ACU token balance from the
// Acurast dashboard. We compute the delta vs. the last stored baseline and
// (on confirm) push that delta as an earning transaction into the
// "Phone Farm" investment project, priced in USD via CoinGecko.
//
// This mirrors the RollerCoin/TRX flow exactly — same baseline-as-source-
// of-truth model, same earning/withdrawal/no-change classification, same
// edit/delete reversal — but with the Acurast (`acurast`) CoinGecko coin
// ID and the "Phone Farm" project name as defaults.
//
// Anti-double-dip:
//   Withdrawals lower the baseline without creating earnings, so swaps to
//   another wallet/asset never get re-counted as earnings.
//
// Edit/delete reversal:
//   Synced txns carry `source: 'acurast'` + `source_acu_delta`. Deleting a
//   synced txn lowers `baseline_acu` by that delta and decrements
//   `project.earned`, so the next "Update balance" re-arms correctly.
import { coinGeckoApi } from "./external-apis";
import { projectsApi, customTokensApi } from "./api";
import { localStorage as storage } from "./localStorage";

const ACURAST_PROJECT_NAME_DEFAULT = "Phone Farm";
const ACU_COINGECKO_ID = "acurast";
const STALE_DAYS = 7;
const AMOUNT_EPSILON = 0.000001; // sub-fractional ACU drift

async function findOrCreateProject(name) {
  const res = await projectsApi.getAll();
  const list = res.data || [];
  const target = (name || "").trim().toLowerCase();
  let project = list.find((p) => (p.name || "").trim().toLowerCase() === target);
  if (project) return project;
  const created = await projectsApi.create({
    name,
    icon_url: "",
    invested: 0,
    earned: 0,
    per_day: 0,
    per_week: 0,
    per_month: 0,
    per_year: 0,
    categories: [],
  });
  return created.data;
}

// Live ACU → USD price with automatic caching and fallback.
// When CoinGecko succeeds, the price is cached in localStorage.
// When CoinGecko fails (e.g. rate-limited), returns the cached price
// so the user isn't blocked from syncing earnings.
export async function getAcuPrice() {
  try {
    const price = await coinGeckoApi.getPrice(ACU_COINGECKO_ID);
    const numPrice = Number(price) || 0;
    if (numPrice > 0) {
      // Cache the successful price
      storage.setAcuPriceCache({ price: numPrice, fetched_at: new Date().toISOString() });
      return numPrice;
    }
    // CoinGecko returned 0 — fall through to cached
  } catch {
    // Network/rate-limit error — fall through to cached
  }
  // Fallback: use the last cached price
  const cached = storage.getAcuPriceCache();
  return Number(cached?.price) || 0;
}

// Returns metadata about the cached price (for UI staleness indicators).
export function getAcuPriceCacheInfo() {
  const cached = storage.getAcuPriceCache();
  if (!cached?.price) return null;
  return { price: Number(cached.price), fetched_at: cached.fetched_at };
}

// Returns true if the user hasn't entered a balance in >= STALE_DAYS or has
// never entered one at all — drives the orange "update me" badge on the card.
export function isAcurastStale(config = null) {
  const c = config || storage.getAcurastConfig();
  if (!c?.enabled) return false;
  if (!c?.last_updated_at) return true;
  const ageMs = Date.now() - new Date(c.last_updated_at).getTime();
  return ageMs >= STALE_DAYS * 24 * 60 * 60 * 1000;
}

// Apply a new-balance entry. `action` is one of:
//   - "earning"    → delta > 0 is credited as a new earning transaction
//   - "withdrawal" → baseline lowered, no transaction (any delta direction)
//   - "no_change"  → bump `last_updated_at` only (resets the stale nudge)
// Returns: { txn, delta_acu, delta_usd, action, baseline_before, baseline_after }
export async function applyAcurastBalanceUpdate({ newBalance, action, acuPriceOverride = null, label = null }) {
  const config = storage.getAcurastConfig();
  if (!config?.enabled) throw new Error("Acurast integration is disabled");

  const baselineBefore = Number(config.baseline_acu) || 0;
  const nextBalance = Math.max(0, Number(newBalance) || 0);
  const deltaAcu = nextBalance - baselineBefore;

  if (action === "no_change" || Math.abs(deltaAcu) < AMOUNT_EPSILON) {
    const next = { ...config, last_updated_at: new Date().toISOString() };
    storage.setAcurastConfig(next);
    await syncCryptoHolding(baselineBefore, acuPriceOverride || 0);
    window.dispatchEvent(new CustomEvent("acurast-sync-complete"));
    return {
      txn: null, delta_acu: 0, delta_usd: 0, action: "no_change",
      baseline_before: baselineBefore, baseline_after: baselineBefore,
    };
  }

  // Withdrawal / correction — update baseline, no txn.
  if (action === "withdrawal") {
    const next = {
      ...config,
      baseline_acu: nextBalance,
      last_updated_at: new Date().toISOString(),
    };
    storage.setAcurastConfig(next);
    await syncCryptoHolding(nextBalance, acuPriceOverride || 0);
    window.dispatchEvent(new CustomEvent("acurast-sync-complete"));
    return {
      txn: null, delta_acu: deltaAcu, delta_usd: 0, action: "withdrawal",
      baseline_before: baselineBefore, baseline_after: nextBalance,
    };
  }

  // Earning — only meaningful if delta is positive. Guard defensively.
  if (action === "earning" && deltaAcu <= 0) {
    throw new Error("Cannot record an earning when the new balance is lower than the baseline.");
  }

  // 1. Price the delta in USD at the current ACU rate.
  const acuPrice =
    acuPriceOverride != null ? Number(acuPriceOverride) : await getAcuPrice();
  if (!(acuPrice > 0)) throw new Error("ACU price unavailable — enter a manual price override or try again later.");
  const deltaUsd = Number((deltaAcu * acuPrice).toFixed(6));

  // 2. Locate (or create) the Phone Farm investment project.
  const projectName = config.project_name || ACURAST_PROJECT_NAME_DEFAULT;
  const project = await findOrCreateProject(projectName);

  // 3. Post the earning transaction tagged with the source metadata.
  const categoryName = label || "Acurast";
  const today = new Date().toISOString().split("T")[0];
  const txnsRes = await projectsApi.addTransaction(project.id, {
    type: "earning",
    amount: deltaUsd,
    category: categoryName,
    notes: `Acurast balance update: +${deltaAcu.toFixed(4)} ACU @ $${acuPrice.toFixed(4)}`,
    date: today,
    source: "acurast",
    source_acu_delta: Number(deltaAcu.toFixed(6)),
    source_acu_price: acuPrice,
  });
  const txns = txnsRes.data || [];
  const created = [...txns]
    .reverse()
    .find((t) => t.source === "acurast" && t.source_acu_delta === Number(deltaAcu.toFixed(6)));

  // 4. Bump project.earned by the USD amount.
  const nextEarned = Math.max(0, (Number(project.earned) || 0) + deltaUsd);
  await projectsApi.update(project.id, { earned: nextEarned });

  // 4b. Auto-update sub-category breakdown.
  await projectsApi.addToCategory(project.id, categoryName, deltaUsd);

  // 5. Update baseline + last_updated_at.
  const nextConfig = {
    ...config,
    baseline_acu: nextBalance,
    last_updated_at: new Date().toISOString(),
  };
  storage.setAcurastConfig(nextConfig);

  // 6. Sync ACU holding in Crypto tab.
  await syncCryptoHolding(nextBalance, acuPrice);

  window.dispatchEvent(new CustomEvent("acurast-sync-complete"));

  return {
    txn: created || null,
    delta_acu: Number(deltaAcu.toFixed(6)),
    delta_usd: deltaUsd,
    action: "earning",
    baseline_before: baselineBefore,
    baseline_after: nextBalance,
    acu_price: acuPrice,
  };
}

// ─── Crypto tab holding sync ───────────────────────────────────────────────
// After every balance update (earning, withdrawal, or no_change) we ensure the
// "ACU" custom token in the Crypto tab reflects the current balance. This keeps
// the portfolio view in sync without the user manually editing it.
async function syncCryptoHolding(newBalance, acuPrice) {
  try {
    const all = (await customTokensApi.getAll()).data || [];
    const existing = all.find(
      (t) => (t.symbol || "").toUpperCase() === "ACU",
    );
    if (existing) {
      await customTokensApi.update(existing.id, {
        amount: newBalance,
        price: acuPrice > 0 ? acuPrice : (existing.price || 0),
        coingecko_id: existing.coingecko_id || ACU_COINGECKO_ID,
      });
    } else {
      await customTokensApi.create({
        symbol: "ACU",
        name: "Acurast",
        amount: newBalance,
        price: acuPrice > 0 ? acuPrice : 0,
        icon_url: null,
        chain: "ethereum",
        coingecko_id: ACU_COINGECKO_ID,
      });
    }
    window.dispatchEvent(new CustomEvent("crypto-holding-updated"));
  } catch (err) {
    console.warn("Acurast: failed to sync crypto holding", err);
  }
}

// One-shot migration: an earlier prototype tracked Acurast in plain USD
// (`baseline_usd`). The user clarified afterwards that it should mirror
// the RollerCoin/TRX flow with ACU tokens + live USD price, so we:
//   1. Delete every transaction tagged `source: 'acurast'` (and roll back
//      `project.earned` via the standard reversal hook in api.js).
//   2. Wipe the legacy config so the user reconfigures with the new
//      ACU-balance flow on next setup.
// Idempotent — flag in localStorage prevents re-runs.
const MIGRATION_FLAG = "networth_acurast_usd_to_acu_migration_v1";
export async function runAcurastUsdToAcuMigrationIfNeeded() {
  try {
    if (window.localStorage.getItem(MIGRATION_FLAG) === "true") {
      return { migrated: false, reason: "already-run" };
    }
    const config = storage.getAcurastConfig();
    const isLegacy = config && config.baseline_usd != null && config.baseline_acu == null;
    if (!isLegacy) {
      window.localStorage.setItem(MIGRATION_FLAG, "true");
      return { migrated: false, reason: "no-op" };
    }

    // Find and delete every source:'acurast' txn across all projects. The
    // existing `deleteTransaction` reversal in api.js handles project.earned
    // adjustment for us.
    const projects = storage.getProjects() || [];
    let removed = 0;
    for (const project of projects) {
      const txns = (project.transactions || []).filter((t) => t?.source === "acurast");
      for (const t of txns) {
        try {
          await projectsApi.deleteTransaction(t.id);
          removed += 1;
        } catch (err) {
          console.warn("Acurast migration: failed to delete txn", t.id, err);
        }
      }
    }

    // Clear the legacy config so the card reverts to "not configured".
    window.localStorage.removeItem("networth_acurast_config");
    window.localStorage.setItem(MIGRATION_FLAG, "true");
    try { window.dispatchEvent(new CustomEvent("acurast-sync-complete")); } catch { /* ignore */ }
    return { migrated: true, removed };
  } catch (err) {
    console.warn("runAcurastUsdToAcuMigrationIfNeeded failed:", err);
    return { migrated: false, reason: "error", error: String(err) };
  }
}
