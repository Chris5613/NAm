const LULO_API_BASE = "https://api.lulo.fi";
const USDS_MINT = "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA";

function toDayKey(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

async function getJson(path, walletAddress) {
  const url = `${LULO_API_BASE}/${path}?owner=${encodeURIComponent(walletAddress)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Lulo returned HTTP ${response.status}`);
  return response.json();
}

export async function getLuloYieldSnapshot(walletAddress) {
  const [account, pools, customAccount] = await Promise.all([
    getJson("v1/account.getAccount", walletAddress),
    getJson("v1/pool.getPools", walletAddress),
    getJson("v0/account.getAccount", walletAddress),
  ]);

  const regularBalanceUsd = Number(account.lusdUsdBalance) || 0;
  const protectedBalanceUsd = Number(account.pusdUsdBalance) || 0;
  const usdsToken = (customAccount.tokenBalances || []).find((token) => token.mint === USDS_MINT);
  const usdsBalanceUsd = Number(usdsToken?.usdValue) || 0;
  const customBalanceUsd = Number(customAccount.totalValue) || usdsBalanceUsd;
  const totalBalanceUsd = (Number(account.totalUsdValue) || 0) + customBalanceUsd;
  const regularApy = (Number(pools.regular?.apy) || 0) * 100;
  const protectedApy = (Number(pools.protected?.apy) || 0) * 100;
  const usdsApy = Number(customAccount.realtimeAPY) || 0;
  const weightedApy = totalBalanceUsd > 0
    ? (
      (regularBalanceUsd * regularApy) +
      (protectedBalanceUsd * protectedApy) +
      (customBalanceUsd * usdsApy)
    ) / totalBalanceUsd
    : 0;
  const customInterestEarnedUsd = Number(customAccount.interestEarned) || 0;

  return {
    walletAddress,
    totalBalanceUsd,
    regularBalanceUsd,
    protectedBalanceUsd,
    usdcBalanceUsd: regularBalanceUsd,
    usdsBalanceUsd,
    usdsApy,
    customBalanceUsd,
    customInterestEarnedUsd,
    totalInterestEarnedUsd: (Number(account.totalInterestEarned) || 0) + customInterestEarnedUsd,
    regularInterestEarnedUsd: Number(account.regularInterestEarned) || 0,
    protectedInterestEarnedUsd: Number(account.protectedInterestEarned) || 0,
    regularApy,
    protectedApy,
    weightedApy,
    blockTime: Number(account.blockTime) || null,
    source: "lulo_api",
  };
}

export function applyLuloYieldSnapshot(project, snapshot, now = new Date()) {
  if (project?.yield_tracking !== "lulo_lending") return project;

  const dayKey = toDayKey(now);
  const currentInterest = Number(snapshot?.totalInterestEarnedUsd);
  if (!dayKey || !Number.isFinite(currentInterest) || currentInterest < 0) return project;

  const transactions = [...(project.transactions || [])];
  const previousInterest = Number(project.lulo_last_interest_usd);
  const hasBaseline = Number.isFinite(previousInterest) && previousInterest >= 0;
  const initialEarned = project.lulo_initial_earned != null && Number.isFinite(Number(project.lulo_initial_earned))
    ? Number(project.lulo_initial_earned)
    : hasBaseline
      ? 0
      : currentInterest;
  const getTrackedEarned = (items) => initialEarned + items
    .filter((transaction) => transaction.source === "lulo_yield")
    .reduce((total, transaction) => total + (Number(transaction.amount) || 0), 0);
  const interestDelta = hasBaseline
    ? Number(Math.max(0, currentInterest - previousInterest).toFixed(6))
    : 0;

  if (interestDelta > 0) {
    const existingIndex = transactions.findIndex(
      (transaction) => transaction.source === "lulo_yield" && transaction.source_date === dayKey
    );

    if (existingIndex >= 0) {
      transactions[existingIndex] = {
        ...transactions[existingIndex],
        amount: Number(((Number(transactions[existingIndex].amount) || 0) + interestDelta).toFixed(6)),
        interest_to_usd: currentInterest,
        sync_to: now.toISOString(),
      };
    } else {
      transactions.push({
        type: "earning",
        amount: interestDelta,
        category: "Lulo Lending",
        notes: `Lulo interest (${dayKey})`,
        date: dayKey,
        source: "lulo_yield",
        source_date: dayKey,
        interest_from_usd: previousInterest,
        interest_to_usd: currentInterest,
        sync_from: project.lulo_last_synced_at,
        sync_to: now.toISOString(),
      });
    }
  }

  const totalBalanceUsd = Number(snapshot.totalBalanceUsd) || 0;
  const configuredInvested = Number(project.invested) || 0;
  const usesMultiTokenBalance = project.lulo_balance_model === "multi_token_v2";
  const invested = usesMultiTokenBalance && configuredInvested > 0
    ? configuredInvested
    : Math.max(0, totalBalanceUsd - currentInterest);

  return {
    ...project,
    invested,
    lulo_balance_model: "multi_token_v2",
    transactions,
    lulo_initial_earned: initialEarned,
    earned: getTrackedEarned(transactions),
    lulo_total_balance_usd: totalBalanceUsd,
    lulo_regular_balance_usd: Number(snapshot.regularBalanceUsd) || 0,
    lulo_protected_balance_usd: Number(snapshot.protectedBalanceUsd) || 0,
    lulo_usdc_balance_usd: Number(snapshot.usdcBalanceUsd) || 0,
    lulo_usds_balance_usd: Number(snapshot.usdsBalanceUsd) || 0,
    lulo_usds_apy: Number(snapshot.usdsApy) || 0,
    lulo_regular_apy: Number(snapshot.regularApy) || 0,
    lulo_protected_apy: Number(snapshot.protectedApy) || 0,
    lulo_weighted_apy: Number(snapshot.weightedApy) || 0,
    lulo_lifetime_interest_usd: currentInterest,
    lulo_last_interest_usd: currentInterest,
    lulo_last_synced_at: now.toISOString(),
  };
}