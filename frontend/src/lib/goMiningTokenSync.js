// GoMining manual sync — tracks two on-chain balances the user maintains
// in their GoMining account (GMT tokens + BTC) plus boost-spend events.
//
// Data model (per kind):
//   GMT — earning if balance went up, INVESTMENT if balance went down
//         (boost spend), withdrawal if user pulled tokens out manually,
//         or no_change.
//   BTC — earning if balance went up, withdrawal if balance went down
//         (cash-out), or no_change.
//
// Why GMT-down-as-investment?
//   When the user "boosts" a miner they pay GMT into GoMining's protocol
//   to increase a miner's hashrate. That GMT is gone but it's been spent
//   on increasing future earning power, so it counts as additional capital
//   invested — not a withdrawal. Tracking it as investment makes
//   project.invested correctly reflect total capital deployed.
//
// Posts to the **same "GoMining" project** the existing GoMining tab uses
// (default name, configurable). To avoid colliding with that tab's per-row
// reward sync (which uses `source: 'gomining'`), this card uses distinct
// `source: 'gomining_gmt'` / `'gomining_btc'` tags. Edit/delete reversal
// hooks in api.js handle baseline + project.earned/invested rollback.
import { coinGeckoApi } from "./external-apis";
import { projectsApi } from "./api";
import { localStorage as storage } from "./localStorage";

const GOMINING_PROJECT_NAME_DEFAULT = "GoMining";
const GMT_COINGECKO_ID = "gmt-token";
const BTC_COINGECKO_ID = "bitcoin";
const STALE_DAYS = 7;
const GMT_EPSILON = 0.000001;
const BTC_EPSILON = 0.00000001; // 1 satoshi

async function findOrCreateProject(name) {
  const res = await projectsApi.getAll();
  const list = res.data || [];
  const target = (name || "").trim().toLowerCase();
  let project = list.find((p) => (p.name || "").trim().toLowerCase() === target);
  if (project) return project;
  const created = await projectsApi.create({
    name,
    icon_url: "https://assets.coingecko.com/coins/images/27973/small/gmt-200.png",
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

// Fetch both prices in parallel with caching. Each call hits CoinGecko's
// `simple/price` endpoint with a single id — the in-house wrapper
// (`coinGeckoApi.getPrice`) only returns a number for single-id queries,
// so a comma-separated call would silently come back as 0.
// When CoinGecko succeeds, prices are cached in localStorage.
// When CoinGecko fails (rate-limited), cached prices are returned.
export async function getGoMiningPrices() {
  let gmt = 0;
  let btc = 0;
  try {
    const [gmtRaw, btcRaw] = await Promise.all([
      coinGeckoApi.getPrice(GMT_COINGECKO_ID).catch(() => 0),
      coinGeckoApi.getPrice(BTC_COINGECKO_ID).catch(() => 0),
    ]);
    gmt = Number(gmtRaw) || 0;
    btc = Number(btcRaw) || 0;
  } catch {
    // both failed
  }

  // Cache any successful prices
  if (gmt > 0 || btc > 0) {
    const cached = storage.getGoMiningPriceCache() || {};
    const next = {
      gmt: gmt > 0 ? gmt : (Number(cached.gmt) || 0),
      btc: btc > 0 ? btc : (Number(cached.btc) || 0),
      fetched_at: new Date().toISOString(),
    };
    storage.setGoMiningPriceCache(next);
    return next;
  }

  // Both failed — fall back to cached
  const cached = storage.getGoMiningPriceCache();
  return { gmt: Number(cached?.gmt) || 0, btc: Number(cached?.btc) || 0 };
}

// Returns cached price metadata for UI staleness indicators.
export function getGoMiningPriceCacheInfo() {
  const cached = storage.getGoMiningPriceCache();
  if (!cached) return null;
  return { gmt: Number(cached.gmt) || 0, btc: Number(cached.btc) || 0, fetched_at: cached.fetched_at };
}

export function isGoMiningTokenStale(config = null) {
  const c = config || storage.getGoMiningTokenConfig();
  if (!c?.enabled) return false;
  if (!c?.last_updated_at) return true;
  const ageMs = Date.now() - new Date(c.last_updated_at).getTime();
  return ageMs >= STALE_DAYS * 24 * 60 * 60 * 1000;
}

// Apply one GoMining balance update. The dialog supplies two new balances
// (GMT + BTC) plus per-kind action classifications.
//
// `gmtAction`:
//   - "earning"    → +delta is credited as a new earning txn (source: 'gomining_gmt', type:'earning')
//   - "boost"      → −delta is credited as an investment txn (source: 'gomining_gmt', type:'investment')
//   - "withdrawal" → baseline lowered, no transaction
//   - "no_change"  → ignored for this kind (used when GMT didn't move)
//   - "skip"       → don't touch GMT side at all (e.g. only BTC moved)
// `btcAction`:
//   - "earning"    → +delta credited as earning txn (source: 'gomining_btc')
//   - "withdrawal" → baseline lowered, no transaction
//   - "no_change"  → ignored
//   - "skip"       → don't touch BTC side at all
export async function applyGoMiningBalanceUpdate({
  newGmtBalance,
  newBtcBalance,
  gmtAction = "skip",
  btcAction = "skip",
  gmtPriceOverride = null,
  btcPriceOverride = null,
}) {
  const config = storage.getGoMiningTokenConfig();
  if (!config?.enabled) throw new Error("GoMining integration is disabled");

  const baselineGmtBefore = Number(config.baseline_gmt) || 0;
  const baselineBtcBefore = Number(config.baseline_btc) || 0;

  const nextGmtBalance = Math.max(0, Number(newGmtBalance) || 0);
  const nextBtcBalance = Math.max(0, Number(newBtcBalance) || 0);

  const deltaGmt = gmtAction === "skip" ? 0 : nextGmtBalance - baselineGmtBefore;
  const deltaBtc = btcAction === "skip" ? 0 : nextBtcBalance - baselineBtcBefore;

  // Validate per-side intent vs sign — defensive guards so a misclassified
  // submit can't silently produce wrong totals.
  if (gmtAction === "earning" && deltaGmt <= 0) {
    throw new Error("Cannot record a GMT earning when balance didn't increase.");
  }
  if (gmtAction === "boost" && deltaGmt >= 0) {
    throw new Error("Cannot record a GMT boost when balance didn't decrease.");
  }
  if (btcAction === "earning" && deltaBtc <= 0) {
    throw new Error("Cannot record a BTC earning when balance didn't increase.");
  }

  const projectName = config.project_name || GOMINING_PROJECT_NAME_DEFAULT;
  const project = await findOrCreateProject(projectName);
  const today = new Date().toISOString().split("T")[0];

  // Resolve prices once for the whole update so all txns share the same
  // snapshot rate (predictable rollback math + matches user's mental model).
  let gmtPrice = gmtPriceOverride;
  let btcPrice = btcPriceOverride;
  const needGmtPrice =
    (gmtAction === "earning" || gmtAction === "boost") && (gmtPrice == null || !(gmtPrice > 0));
  const needBtcPrice = btcAction === "earning" && (btcPrice == null || !(btcPrice > 0));
  if (needGmtPrice || needBtcPrice) {
    const fresh = await getGoMiningPrices();
    if (needGmtPrice) gmtPrice = fresh.gmt;
    if (needBtcPrice) btcPrice = fresh.btc;
  }

  const results = {
    gmt: { txn: null, delta_gmt: 0, delta_usd: 0, action: gmtAction, baseline_after: baselineGmtBefore },
    btc: { txn: null, delta_btc: 0, delta_usd: 0, action: btcAction, baseline_after: baselineBtcBefore },
  };

  let earnedDeltaUsd = 0;
  let investedDeltaUsd = 0;
  let baselineGmtAfter = baselineGmtBefore;
  let baselineBtcAfter = baselineBtcBefore;

  // ──────────────────── GMT side ────────────────────
  if (gmtAction !== "skip" && Math.abs(deltaGmt) >= GMT_EPSILON) {
    if (gmtAction === "earning") {
      if (!(gmtPrice > 0)) throw new Error("GMT price unavailable — enter a manual price in the dialog or try again later.");
      const deltaUsd = Number((deltaGmt * gmtPrice).toFixed(6));
      const txnsRes = await projectsApi.addTransaction(project.id, {
        type: "earning",
        amount: deltaUsd,
        category: "GoMining (GMT)",
        notes: `GoMining GMT earned: +${deltaGmt.toFixed(4)} GMT @ $${gmtPrice.toFixed(4)}`,
        date: today,
        source: "gomining_gmt",
        source_gmt_delta: Number(deltaGmt.toFixed(6)),
        source_gmt_price: gmtPrice,
      });
      const txns = txnsRes.data || [];
      const created = [...txns].reverse().find(
        (t) => t.source === "gomining_gmt" && t.source_gmt_delta === Number(deltaGmt.toFixed(6)) && t.type === "earning",
      );
      results.gmt = { txn: created || null, delta_gmt: Number(deltaGmt.toFixed(6)), delta_usd: deltaUsd, action: "earning", baseline_after: nextGmtBalance };
      earnedDeltaUsd += deltaUsd;
      baselineGmtAfter = nextGmtBalance;
    } else if (gmtAction === "boost") {
      if (!(gmtPrice > 0)) throw new Error("GMT price unavailable — enter a manual price in the dialog or try again later.");
      const spendGmt = Math.abs(deltaGmt);
      const investUsd = Number((spendGmt * gmtPrice).toFixed(6));
      const txnsRes = await projectsApi.addTransaction(project.id, {
        type: "investment",
        amount: investUsd,
        category: "GoMining (Boost)",
        notes: `GoMining boost spend: −${spendGmt.toFixed(4)} GMT @ $${gmtPrice.toFixed(4)}`,
        date: today,
        source: "gomining_gmt",
        // Negative delta — symmetric with earning so the same reversal
        // formula (baseline -= delta) works for both kinds.
        source_gmt_delta: Number(deltaGmt.toFixed(6)),
        source_gmt_price: gmtPrice,
      });
      const txns = txnsRes.data || [];
      const created = [...txns].reverse().find(
        (t) => t.source === "gomining_gmt" && t.source_gmt_delta === Number(deltaGmt.toFixed(6)) && t.type === "investment",
      );
      results.gmt = { txn: created || null, delta_gmt: Number(deltaGmt.toFixed(6)), delta_usd: -investUsd, action: "boost", baseline_after: nextGmtBalance };
      investedDeltaUsd += investUsd;
      baselineGmtAfter = nextGmtBalance;
    } else if (gmtAction === "withdrawal") {
      results.gmt = { txn: null, delta_gmt: Number(deltaGmt.toFixed(6)), delta_usd: 0, action: "withdrawal", baseline_after: nextGmtBalance };
      baselineGmtAfter = nextGmtBalance;
    }
  } else if (gmtAction === "no_change") {
    // intentional no-op — user signaled "nothing happened on the GMT side"
  }

  // ──────────────────── BTC side ────────────────────
  if (btcAction !== "skip" && Math.abs(deltaBtc) >= BTC_EPSILON) {
    if (btcAction === "earning") {
      if (!(btcPrice > 0)) throw new Error("BTC price unavailable — enter a manual price in the dialog or try again later.");
      const deltaUsd = Number((deltaBtc * btcPrice).toFixed(6));
      const txnsRes = await projectsApi.addTransaction(project.id, {
        type: "earning",
        amount: deltaUsd,
        category: "GoMining (BTC)",
        notes: `GoMining BTC earned: +${deltaBtc.toFixed(8)} BTC @ $${btcPrice.toFixed(2)}`,
        date: today,
        source: "gomining_btc",
        source_btc_delta: Number(deltaBtc.toFixed(8)),
        source_btc_price: btcPrice,
      });
      const txns = txnsRes.data || [];
      const created = [...txns].reverse().find(
        (t) => t.source === "gomining_btc" && t.source_btc_delta === Number(deltaBtc.toFixed(8)),
      );
      results.btc = { txn: created || null, delta_btc: Number(deltaBtc.toFixed(8)), delta_usd: deltaUsd, action: "earning", baseline_after: nextBtcBalance };
      earnedDeltaUsd += deltaUsd;
      baselineBtcAfter = nextBtcBalance;
    } else if (btcAction === "withdrawal") {
      results.btc = { txn: null, delta_btc: Number(deltaBtc.toFixed(8)), delta_usd: 0, action: "withdrawal", baseline_after: nextBtcBalance };
      baselineBtcAfter = nextBtcBalance;
    }
  }

  // Bump project.earned + project.invested in one go (avoids two writes
  // when both sides moved in the same update).
  if (Math.abs(earnedDeltaUsd) > 0.000001 || Math.abs(investedDeltaUsd) > 0.000001) {
    const nextEarned = Math.max(0, (Number(project.earned) || 0) + earnedDeltaUsd);
    const nextInvested = Math.max(0, (Number(project.invested) || 0) + investedDeltaUsd);
    await projectsApi.update(project.id, { earned: nextEarned, invested: nextInvested });
  }

  // Auto-update sub-category breakdown for each side that moved.
  if (results.gmt?.action === "earning" && results.gmt.delta_usd > 0) {
    await projectsApi.addToCategory(project.id, "GoMining (GMT)", results.gmt.delta_usd);
  }
  if (results.gmt?.action === "boost" && investedDeltaUsd > 0) {
    await projectsApi.addToCategory(project.id, "GoMining (Boost)", -investedDeltaUsd);
  }
  if (results.btc?.action === "earning" && results.btc.delta_usd > 0) {
    await projectsApi.addToCategory(project.id, "GoMining (BTC)", results.btc.delta_usd);
  }

  // Persist new baselines + last_updated_at.
  const nextConfig = {
    ...config,
    baseline_gmt: Number(baselineGmtAfter.toFixed(6)),
    baseline_btc: Number(baselineBtcAfter.toFixed(8)),
    last_updated_at: new Date().toISOString(),
  };
  storage.setGoMiningTokenConfig(nextConfig);

  try { window.dispatchEvent(new CustomEvent("gomining-token-sync-complete")); } catch { /* ignore */ }

  return {
    ...results,
    project_id: project.id,
    earned_delta_usd: earnedDeltaUsd,
    invested_delta_usd: investedDeltaUsd,
    gmt_price: gmtPrice || 0,
    btc_price: btcPrice || 0,
  };
}
