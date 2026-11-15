// Canonical crypto valuation rules shared by project and wallet views.
// Invested cost, earned income and historical token rewards are never holdings.
export function currentProjectBalance(project) {
  const candidates = [
    project?.lulo_total_balance_usd,
    project?.totalBalance,
    project?.currentBalance,
    project?.current_balance,
    project?.balance,
    project?.value,
  ];
  for (const value of candidates) {
    if (value == null || value === "") continue;
    const amount = Number(value);
    if (Number.isFinite(amount) && amount >= 0) return amount;
  }
  return 0; // Unknown valuation must not fall back to invested principal.
}

export function uniqueProjectSources(projects, externalEntries) {
  const external = new Set((externalEntries || []).map(entry =>
    String(entry?.platform || "").trim().toLowerCase()).filter(Boolean));
  return (Array.isArray(projects) ? projects : []).filter(project =>
    !project?.inactive && !project?.is_inactive &&
    !external.has(String(project?.platform || project?.name || "").trim().toLowerCase()));
}

export function currentRollerCoinBalance(tracker, liveTrxPrice = 0) {
  if (!tracker || tracker.currentTrxBalance == null) return null;
  const trx = Number(tracker.currentTrxBalance);
  const price = Number(liveTrxPrice) > 0
    ? Number(liveTrxPrice) : Number(tracker.lastTrxPrice);
  if (!Number.isFinite(trx) || trx < 0 ||
      !Number.isFinite(price) || price <= 0) return null;
  return { trx, price, balanceUsd: trx * price };
}

export function canonicalProjectBitcoinTotal(summary, bitcoinValue) {
  const raw = summary?.portfolioBalance;
  if (raw == null || raw === "") return null;
  const projects = Number(raw);
  const bitcoin = Number(bitcoinValue);
  if (!Number.isFinite(projects) || projects < 0 ||
      !Number.isFinite(bitcoin) || bitcoin < 0) return null;
  return projects + bitcoin;
}
