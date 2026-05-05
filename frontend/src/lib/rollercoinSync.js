// RollerCoin manual sync — there's no public RollerCoin API, so the user
// periodically types their current TRX balance. We compute the delta vs.
// the last stored baseline and, on confirm, push that delta as an earning
// transaction into a "RollerCoin" investment project.
//
// Anti-double-dip: withdrawals/swaps are distinguished from earnings by the
// user's explicit choice in the "Update balance" dialog. Withdrawals only
// lower the baseline; they never create earning transactions.
//
// Edit/delete reversal: synced transactions carry `source: 'rollercoin'` +
// `source_trx_delta` (the TRX amount that was credited). Deleting a txn in
// Investment Overview decrements project.earned AND lowers the baseline by
// that TRX delta, so the next "Update balance" re-arms correctly.
import { coinGeckoApi } from "./external-apis";
import { projectsApi, customTokensApi } from "./api";
import { localStorage as storage } from "./localStorage";

const ROLLERCOIN_PROJECT_NAME_DEFAULT = "RollerCoin";
const TRX_COINGECKO_ID = "tron";
const STALE_DAYS = 7;            // nudge threshold for the orange badge
const AMOUNT_EPSILON = 0.00001;  // sub-satoshi drift

async function findOrCreateProject(name) {
  const res = await projectsApi.getAll();
  const list = res.data || [];
  const target = (name || "").trim().toLowerCase();
  let project = list.find((p) => (p.name || "").trim().toLowerCase() === target);
  if (project) return project;
  const created = await projectsApi.create({
    name,
    icon_url: "https://rollercoin.com/static/img/logo-icon.svg",
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

// Live TRX → USD price with caching and fallback (same pattern as ACU/GMT).
export async function getTrxPrice() {
  try {
    const price = await coinGeckoApi.getPrice(TRX_COINGECKO_ID);
    const numPrice = Number(price) || 0;
    if (numPrice > 0) {
      storage.setTrxPriceCache({ price: numPrice, fetched_at: new Date().toISOString() });
      return numPrice;
    }
  } catch {
    // fall through to cached
  }
  const cached = storage.getTrxPriceCache();
  return Number(cached?.price) || 0;
}

// Returns cached price metadata for UI staleness indicators.
export function getTrxPriceCacheInfo() {
  const cached = storage.getTrxPriceCache();
  if (!cached?.price) return null;
  return { price: Number(cached.price), fetched_at: cached.fetched_at };
}

// Returns true if the user hasn't entered a balance in >= STALE_DAYS or has
// never entered one at all — drives the orange "update me" badge on the card.
export function isRollerCoinStale(config = null) {
  const c = config || storage.getRollerCoinConfig();
  if (!c?.enabled) return false;
  if (!c?.last_updated_at) return true;
  const ageMs = Date.now() - new Date(c.last_updated_at).getTime();
  return ageMs >= STALE_DAYS * 24 * 60 * 60 * 1000;
}

// Apply a new-balance entry. `action` is one of:
//   - "earning"    → delta > 0 is credited as a new earning transaction
//   - "withdrawal" → baseline lowered, no transaction (any delta direction)
//   - "no_change"  → bump `last_updated_at` only (resets the stale nudge)
// Returns: { txn, delta_trx, delta_usd, action, baseline_before, baseline_after }
export async function applyRollerCoinBalanceUpdate({ newBalance, action, trxPriceOverride = null, label = null }) {
  const config = storage.getRollerCoinConfig();
  if (!config?.enabled) throw new Error("RollerCoin integration is disabled");

  const baselineBefore = Number(config.baseline_trx) || 0;
  const nextBalance = Math.max(0, Number(newBalance) || 0);
  const deltaTrx = nextBalance - baselineBefore;

  if (action === "no_change" || Math.abs(deltaTrx) < AMOUNT_EPSILON) {
    const next = { ...config, last_updated_at: new Date().toISOString() };
    storage.setRollerCoinConfig(next);
    await syncCryptoHolding(baselineBefore, trxPriceOverride || 0);
    window.dispatchEvent(new CustomEvent("rollercoin-sync-complete"));
    return {
      txn: null, delta_trx: 0, delta_usd: 0, action: "no_change",
      baseline_before: baselineBefore, baseline_after: baselineBefore,
    };
  }

  // Withdrawal / correction — update baseline, no txn.
  if (action === "withdrawal") {
    const next = {
      ...config,
      baseline_trx: nextBalance,
      last_updated_at: new Date().toISOString(),
    };
    storage.setRollerCoinConfig(next);
    await syncCryptoHolding(nextBalance, trxPriceOverride || 0);
    window.dispatchEvent(new CustomEvent("rollercoin-sync-complete"));
    return {
      txn: null, delta_trx: deltaTrx, delta_usd: 0, action: "withdrawal",
      baseline_before: baselineBefore, baseline_after: nextBalance,
    };
  }

  // Earning — only meaningful if delta is positive. Guard defensively.
  if (action === "earning" && deltaTrx <= 0) {
    throw new Error("Cannot record an earning when the new balance is lower than the baseline.");
  }

  // 1. Price the delta in USD at the current TRX rate.
  const trxPrice =
    trxPriceOverride != null ? Number(trxPriceOverride) : await getTrxPrice();
  if (!(trxPrice > 0)) throw new Error("TRX price unavailable — enter a manual price override or try again later.");
  const deltaUsd = Number((deltaTrx * trxPrice).toFixed(6));

  // 2. Locate (or create) the RollerCoin investment project.
  const projectName = config.project_name || ROLLERCOIN_PROJECT_NAME_DEFAULT;
  const project = await findOrCreateProject(projectName);

  // 3. Post the earning transaction tagged with the source metadata.
  const categoryName = label || "RollerCoin";
  const today = new Date().toISOString().split("T")[0];
  const txnsRes = await projectsApi.addTransaction(project.id, {
    type: "earning",
    amount: deltaUsd,
    category: categoryName,
    notes: `RollerCoin balance update: +${deltaTrx.toFixed(4)} TRX @ $${trxPrice.toFixed(4)}`,
    date: today,
    source: "rollercoin",
    source_trx_delta: Number(deltaTrx.toFixed(6)),
    source_trx_price: trxPrice,
  });
  const txns = txnsRes.data || [];
  const created = [...txns]
    .reverse()
    .find((t) => t.source === "rollercoin" && t.source_trx_delta === Number(deltaTrx.toFixed(6)));

  // 4. Bump project.earned by the USD amount.
  const nextEarned = Math.max(0, (Number(project.earned) || 0) + deltaUsd);
  await projectsApi.update(project.id, { earned: nextEarned });

  // 4b. Auto-update sub-category breakdown.
  await projectsApi.addToCategory(project.id, categoryName, deltaUsd);

  // 5. Update baseline + last_updated_at.
  const nextConfig = {
    ...config,
    baseline_trx: nextBalance,
    last_updated_at: new Date().toISOString(),
  };
  storage.setRollerCoinConfig(nextConfig);

  // 6. Sync TRX holding in Crypto tab.
  await syncCryptoHolding(nextBalance, trxPrice);

  window.dispatchEvent(new CustomEvent("rollercoin-sync-complete"));

  return {
    txn: created || null,
    delta_trx: Number(deltaTrx.toFixed(6)),
    delta_usd: deltaUsd,
    action: "earning",
    baseline_before: baselineBefore,
    baseline_after: nextBalance,
    trx_price: trxPrice,
  };
}

// ─── Crypto tab holding sync ───────────────────────────────────────────────
// After every balance update we ensure the "TRX" custom token in the Crypto
// tab reflects the current RollerCoin balance. Keeps the portfolio in sync.
async function syncCryptoHolding(newBalance, trxPrice) {
  try {
    const all = (await customTokensApi.getAll()).data || [];
    const existing = all.find(
      (t) => (t.symbol || "").toUpperCase() === "TRX",
    );
    if (existing) {
      await customTokensApi.update(existing.id, {
        amount: newBalance,
        price: trxPrice > 0 ? trxPrice : (existing.price || 0),
        coingecko_id: existing.coingecko_id || TRX_COINGECKO_ID,
      });
    } else {
      await customTokensApi.create({
        symbol: "TRX",
        name: "Tron",
        amount: newBalance,
        price: trxPrice > 0 ? trxPrice : 0,
        icon_url: "https://assets.coingecko.com/coins/images/1094/small/tron-logo.png",
        chain: "tron",
        coingecko_id: TRX_COINGECKO_ID,
      });
    }
    window.dispatchEvent(new CustomEvent("crypto-holding-updated"));
  } catch (err) {
    console.warn("RollerCoin: failed to sync crypto holding", err);
  }
}
