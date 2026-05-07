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
const STALE_DAYS = 7;
const AMOUNT_EPSILON = 0.00001;

async function findOrCreateProject(name) {
  console.log("[RC SYNC] findOrCreateProject", name);

  const res = await projectsApi.getAll();
  const list = res.data || [];

  const target = (name || "").trim().toLowerCase();

  let project = list.find(
    (p) => (p.name || "").trim().toLowerCase() === target
  );

  if (project) {
    console.log("[RC SYNC] existing project found", project);
    return project;
  }

  console.log("[RC SYNC] creating new project");

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

  console.log("[RC SYNC] project created", created.data);

  return created.data;
}

// Live TRX → USD price with caching and fallback
export async function getTrxPrice() {
  console.log("[RC SYNC] getTrxPrice start");

  try {
    const price = await coinGeckoApi.getPrice(TRX_COINGECKO_ID);

    console.log("[RC SYNC] CoinGecko price response", price);

    const numPrice = Number(price) || 0;

    if (numPrice > 0) {
      storage.setTrxPriceCache({
        price: numPrice,
        fetched_at: new Date().toISOString(),
      });

      console.log("[RC SYNC] using live TRX price", numPrice);

      return numPrice;
    }
  } catch (err) {
    console.warn("[RC SYNC] CoinGecko failed", err);
  }

  const cached = storage.getTrxPriceCache();

  console.log("[RC SYNC] using cached price", cached);

  return Number(cached?.price) || 0;
}

export function getTrxPriceCacheInfo() {
  const cached = storage.getTrxPriceCache();

  if (!cached?.price) return null;

  return {
    price: Number(cached.price),
    fetched_at: cached.fetched_at,
  };
}

export function isRollerCoinStale(config = null) {
  const c = config || storage.getRollerCoinConfig();

  if (!c?.enabled) return false;
  if (!c?.last_updated_at) return true;

  const ageMs =
    Date.now() - new Date(c.last_updated_at).getTime();

  return ageMs >= STALE_DAYS * 24 * 60 * 60 * 1000;
}

export async function applyRollerCoinBalanceUpdate({
  newBalance,
  action,
  trxPriceOverride = null,
  label = null,
}) {
  console.log("[RC SYNC] applyRollerCoinBalanceUpdate called", {
    newBalance,
    action,
    trxPriceOverride,
    label,
  });

  const config = storage.getRollerCoinConfig();

  console.log("[RC SYNC] config", config);

  if (!config?.enabled) {
    throw new Error("RollerCoin integration is disabled");
  }

  const baselineBefore =
    Number(config.baseline_trx) || 0;

  const nextBalance =
    Math.max(0, Number(newBalance) || 0);

  const deltaTrx =
    nextBalance - baselineBefore;

  console.log("[RC SYNC] balance calculation", {
    baselineBefore,
    nextBalance,
    deltaTrx,
    action,
  });

  if (
    action === "no_change" ||
    Math.abs(deltaTrx) < AMOUNT_EPSILON
  ) {
    console.log("[RC SYNC] no_change branch");

    const next = {
      ...config,
      last_updated_at: new Date().toISOString(),
    };

    storage.setRollerCoinConfig(next);

    console.log("[RC SYNC] updated config", next);

    await syncCryptoHolding(
      baselineBefore,
      trxPriceOverride || 0
    );

    window.dispatchEvent(
      new CustomEvent("rollercoin-sync-complete")
    );

    return {
      txn: null,
      delta_trx: 0,
      delta_usd: 0,
      action: "no_change",
      baseline_before: baselineBefore,
      baseline_after: baselineBefore,
    };
  }

  if (action === "withdrawal") {
    console.log("[RC SYNC] withdrawal branch");

    const next = {
      ...config,
      baseline_trx: nextBalance,
      last_updated_at: new Date().toISOString(),
    };

    storage.setRollerCoinConfig(next);

    console.log("[RC SYNC] updated withdrawal baseline", next);

    await syncCryptoHolding(
      nextBalance,
      trxPriceOverride || 0
    );

    window.dispatchEvent(
      new CustomEvent("rollercoin-sync-complete")
    );

    return {
      txn: null,
      delta_trx: deltaTrx,
      delta_usd: 0,
      action: "withdrawal",
      baseline_before: baselineBefore,
      baseline_after: nextBalance,
    };
  }

  if (action === "earning" && deltaTrx <= 0) {
    console.error("[RC SYNC] invalid earning delta", deltaTrx);

    throw new Error(
      "Cannot record an earning when the new balance is lower than the baseline."
    );
  }

  console.log("[RC SYNC] fetching TRX price");

  const trxPrice =
    trxPriceOverride != null
      ? Number(trxPriceOverride)
      : await getTrxPrice();

  console.log("[RC SYNC] trxPrice resolved", trxPrice);

  if (!(trxPrice > 0)) {
    throw new Error(
      "TRX price unavailable — enter a manual price override or try again later."
    );
  }

  const deltaUsd =
    Number((deltaTrx * trxPrice).toFixed(6));

  console.log("[RC SYNC] pricing result", {
    trxPrice,
    deltaUsd,
  });

  const projectName =
    config.project_name ||
    ROLLERCOIN_PROJECT_NAME_DEFAULT;

  const project =
    await findOrCreateProject(projectName);

  console.log("[RC SYNC] project resolved", project);

  const categoryName =
    label || "RollerCoin";

  const today =
    new Date().toISOString().split("T")[0];

  console.log("[RC SYNC] creating earning transaction", {
    projectId: project.id,
    deltaTrx,
    deltaUsd,
    categoryName,
  });

  const txnsRes =
    await projectsApi.addTransaction(project.id, {
      type: "earning",
      amount: deltaUsd,
      category: categoryName,
      notes: `RollerCoin balance update: +${deltaTrx.toFixed(
        4
      )} TRX @ $${trxPrice.toFixed(4)}`,
      date: today,
      source: "rollercoin",
      source_trx_delta: Number(
        deltaTrx.toFixed(6)
      ),
      source_trx_price: trxPrice,
    });

  console.log("[RC SYNC] addTransaction response", txnsRes);

  const txns = txnsRes.data || [];

  const created = [...txns]
    .reverse()
    .find(
      (t) =>
        t.source === "rollercoin" &&
        t.source_trx_delta ===
          Number(deltaTrx.toFixed(6))
    );

  console.log("[RC SYNC] matched created txn", created);

  const nextEarned =
    Math.max(
      0,
      (Number(project.earned) || 0) + deltaUsd
    );

  await projectsApi.update(project.id, {
    earned: nextEarned,
  });

  console.log("[RC SYNC] updated project earned", {
    nextEarned,
  });

  await projectsApi.addToCategory(
    project.id,
    categoryName,
    deltaUsd
  );

  console.log("[RC SYNC] updated category totals");

  const nextConfig = {
    ...config,
    baseline_trx: nextBalance,
    last_updated_at: new Date().toISOString(),
  };

  storage.setRollerCoinConfig(nextConfig);

  console.log("[RC SYNC] updated baseline config", nextConfig);

  console.log("[RC SYNC] syncing crypto holding", {
    nextBalance,
    trxPrice,
  });

  await syncCryptoHolding(
    nextBalance,
    trxPrice
  );

  window.dispatchEvent(
    new CustomEvent("rollercoin-sync-complete")
  );

  console.log("[RC SYNC] earning sync complete", {
    delta_trx: Number(deltaTrx.toFixed(6)),
    delta_usd: deltaUsd,
  });

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

async function syncCryptoHolding(
  newBalance,
  trxPrice
) {
  console.log("[RC SYNC] syncCryptoHolding start", {
    newBalance,
    trxPrice,
  });

  try {
    const all =
      (await customTokensApi.getAll()).data || [];

    console.log("[RC SYNC] current crypto tokens", all);

    const existing = all.find(
      (t) =>
        (t.symbol || "").toUpperCase() === "TRX"
    );

    if (existing) {
      console.log("[RC SYNC] updating existing TRX token", existing);

      await customTokensApi.update(existing.id, {
        amount: newBalance,
        price:
          trxPrice > 0
            ? trxPrice
            : existing.price || 0,
        coingecko_id:
          existing.coingecko_id ||
          TRX_COINGECKO_ID,
      });
    } else {
      console.log("[RC SYNC] creating TRX token");

      await customTokensApi.create({
        symbol: "TRX",
        name: "Tron",
        amount: newBalance,
        price: trxPrice > 0 ? trxPrice : 0,
        icon_url:
          "https://assets.coingecko.com/coins/images/1094/small/tron-logo.png",
        chain: "tron",
        coingecko_id: TRX_COINGECKO_ID,
      });
    }

    window.dispatchEvent(
      new CustomEvent("crypto-holding-updated")
    );

    console.log("[RC SYNC] crypto holding sync complete");
  } catch (err) {
    console.warn(
      "[RC SYNC] failed to sync crypto holding",
      err
    );
  }
}