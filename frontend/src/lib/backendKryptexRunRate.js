/**
 * Backend Kryptex machine aggregate is the ONLY daily mining profitability
 * estimate. This is a run-rate projection, not already-earned USD and NEVER
 * posted to a journal or historical mining ledger.
 */
export function extractBackendKryptexRunRate(response) {
  const count = response?.machine_count;
  const raw = response?.status?.profitability_usd_day;
  if (typeof count !== "number" || !Number.isFinite(count) || count < 1 ||
      typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  const synced = response?.received_at || response?.machines?.[0]?.last_seen_at || null;
  return {
    usdPerDay: raw,
    machineCount: Math.floor(count),
    source: "backend-kryptex-machine-aggregate",
    observedAt: typeof synced === "string" && Number.isFinite(Date.parse(synced))
      ? synced : null,
  };
}

export function projectedDailyMiningNet(runRate, outOfPocketDailyCost) {
  if (!runRate || runRate.source !== "backend-kryptex-machine-aggregate" ||
      typeof runRate.usdPerDay !== "number" || !Number.isFinite(runRate.usdPerDay) ||
      runRate.usdPerDay < 0 ||
      typeof outOfPocketDailyCost !== "number" ||
      !Number.isFinite(outOfPocketDailyCost) || outOfPocketDailyCost < 0)
    return null;
  return runRate.usdPerDay - outOfPocketDailyCost;
}
