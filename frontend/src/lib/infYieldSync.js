import { jupiterPriceApi } from "./external-apis";

export const INF_MINT = "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm";
export const SOL_MINT = "So11111111111111111111111111111111111111112";

function getUsdPrice(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  return Number(value?.usdPrice ?? value?.price ?? value?.priceUsd ?? 0);
}

function toDayKey(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export async function getInfYieldSnapshot() {
  const prices = await jupiterPriceApi.getPrices([INF_MINT, SOL_MINT]);
  const infUsd = getUsdPrice(prices[INF_MINT]);
  const solUsd = getUsdPrice(prices[SOL_MINT]);

  if (!(infUsd > 0) || !(solUsd > 0)) {
    throw new Error("INF or SOL price is unavailable");
  }

  return {
    infSolRate: infUsd / solUsd,
    infUsd,
    solUsd,
    source: "jupiter_market_ratio",
  };
}

export function applyInfYieldSnapshot(projects = [], snapshot, now = new Date()) {
  const currentRate = Number(snapshot?.infSolRate) || 0;
  const solUsd = Number(snapshot?.solUsd) || 0;
  const dayKey = toDayKey(now);

  if (!(currentRate > 0) || !(solUsd > 0) || !dayKey) return projects;

  return projects.map((project) => {
    if (project?.yield_tracking !== "sanctum_inf") return project;

    const infAmount = Number(project.inf_amount) || 0;
    if (!(infAmount > 0) || project?.inactive === true || project?.is_inactive === true) {
      return project;
    }

    const transactions = [...(project.transactions || [])];
    const recordedRate = transactions
      .filter((transaction) => transaction.source === "inf_yield")
      .reduce((highest, transaction) => Math.max(highest, Number(transaction.inf_to_rate) || 0), 0);
    const previousRate = Math.max(Number(project.inf_last_rate) || 0, recordedRate);

    if (!(previousRate > 0)) {
      return {
        ...project,
        inf_last_rate: currentRate,
        inf_last_rate_source: snapshot.source,
        inf_last_synced_at: now.toISOString(),
      };
    }

    if (currentRate <= previousRate) {
      return {
        ...project,
        inf_last_rate_source: snapshot.source,
        inf_last_synced_at: now.toISOString(),
      };
    }

    const earnedSol = infAmount * (currentRate - previousRate);
    const earnedUsd = Number((earnedSol * solUsd).toFixed(6));
    if (!(earnedUsd > 0)) return project;

    const existingIndex = transactions.findIndex(
      (transaction) => transaction.source === "inf_yield" && transaction.source_date === dayKey
    );

    if (existingIndex >= 0) {
      transactions[existingIndex] = {
        ...transactions[existingIndex],
        amount: Number(((Number(transactions[existingIndex].amount) || 0) + earnedUsd).toFixed(6)),
        earned_sol: Number(((Number(transactions[existingIndex].earned_sol) || 0) + earnedSol).toFixed(9)),
        inf_to_rate: currentRate,
        sol_usd: solUsd,
        rate_source: snapshot.source,
      };
    } else {
      transactions.push({
        type: "earning",
        amount: earnedUsd,
        category: "INF Liquid Staking",
        notes: `INF redemption-rate yield (${dayKey})`,
        date: dayKey,
        source: "inf_yield",
        source_date: dayKey,
        earned_sol: Number(earnedSol.toFixed(9)),
        inf_from_rate: previousRate,
        inf_to_rate: currentRate,
        sol_usd: solUsd,
        rate_source: snapshot.source,
      });
    }

    return {
      ...project,
      transactions,
      earned: (Number(project.earned) || 0) + earnedUsd,
      inf_last_rate: currentRate,
      inf_last_rate_source: snapshot.source,
      inf_last_synced_at: now.toISOString(),
    };
  });
}