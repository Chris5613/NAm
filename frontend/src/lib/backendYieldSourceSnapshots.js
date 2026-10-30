import { api } from "./apiClient";

// PostgreSQL source snapshots can be used only when they are both recent and
// newer than the source already applied locally. A closed-browser poll must
// never roll a live balance backwards.
export function selectFreshSourceSnapshot(payload, provider, walletAddress, newerThan, now = Date.now(), referenceBalanceUsd = null) {
  if (!payload || !walletAddress) return null;
  const snapshot = provider === "lulo"
    ? payload.lulo?.[walletAddress]
    : provider === "loopscale"
      ? payload.loopscale : null;
  if (!snapshot || snapshot.walletAddress !== walletAddress) return null;
  const timestamp = Date.parse(snapshot.syncedAt || "");
  const previous = Date.parse(newerThan || "");
  if (!Number.isFinite(timestamp) || timestamp > now + 10000 ||
      now - timestamp > 120000 || (Number.isFinite(previous) && timestamp <= previous)) {
    return null;
  }
  if (provider === "lulo") {
    if (!(Number(snapshot.totalBalanceUsd) > 0) ||
        !Number.isFinite(Number(snapshot.totalInterestEarnedUsd)) ||
        !Array.isArray(snapshot.dailyPerformance)) return null;
  } else if (provider === "loopscale") {
    if (!(Number(snapshot.positionValueUsd) > 0) ||
        !Number.isFinite(Number(snapshot.pnlUsd))) return null;
  }
  const candidateBalance = provider === "lulo"
    ? Number(snapshot.totalBalanceUsd) : Number(snapshot.positionValueUsd);
  const previousBalance = Number(referenceBalanceUsd);
  if (referenceBalanceUsd !== null && referenceBalanceUsd !== undefined &&
      Number.isFinite(previousBalance) && previousBalance > 0 &&
      Math.abs(candidateBalance - previousBalance) > Math.max(2, previousBalance * 0.05)) {
    // A major balance change may be a real deposit/withdrawal or a bad
    // normalization. Fetch upstream directly before accepting it.
    return null;
  }
  return snapshot;
}

export async function getFreshBackendYieldSnapshot(provider, walletAddress, newerThan, referenceBalanceUsd = null) {
  try {
    const payload = await api.get("/api/yield-sources/latest");
    return selectFreshSourceSnapshot(
      payload, provider, walletAddress, newerThan, Date.now(), referenceBalanceUsd
    );
  } catch {
    return null; // The existing direct-provider API remains the fallback.
  }
}
