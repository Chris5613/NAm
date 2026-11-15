/**
 * Short-lived, account-scoped display cache for the server-owned crypto view.
 *
 * Data is a copy of authenticated backend output only. It is NEVER a wallet
 * balance, accounting source, or input to a server POST. Session storage is
 * used intentionally: no persistent financial data is kept after the tab ends.
 */
export const CRYPTO_DASHBOARD_CACHE_PREFIX = "nam:crypto-dashboard:v1:user:";
export const CRYPTO_DASHBOARD_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export const cryptoDashboardCacheKey = userId =>
  userId == null || String(userId).trim() === ""
    ? null : CRYPTO_DASHBOARD_CACHE_PREFIX + encodeURIComponent(String(userId));

function storageOrNull(storage) {
  if (storage) return storage;
  try { return typeof window === "undefined" ? null : window.sessionStorage; }
  catch { return null; }
}

function finiteMoney(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function safeCryptoDashboardSnapshot(raw, userId) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
      raw.version !== 1 || String(raw.userId) !== String(userId) ||
      raw.sourceOfCalculation !== "backend-project-feed" ||
      raw.complete !== true || !finiteMoney(raw.totalUsd) ||
      !finiteMoney(raw.activeTotalUsd) ||
      !Number.isInteger(raw.activePositions) || raw.activePositions < 0 ||
      !Number.isInteger(raw.projectCount) || raw.projectCount < 0 ||
      !Array.isArray(raw.projects) ||
      !Number.isFinite(Date.parse(raw.receivedAt || "")) ||
      raw.projects.length > 100) return null;

  const projects = [];
  for (const project of raw.projects) {
    if (!project || typeof project !== "object" ||
        typeof project.id !== "string" || !project.id || project.id.length > 128 ||
        typeof project.name !== "string" || project.name.length > 128 ||
        !finiteMoney(project.balanceUsd)) return null;
    projects.push({
      id: project.id,
      name: project.name,
      balanceUsd: project.balanceUsd,
      inactive: project.inactive === true,
      stale: project.stale === true,
      sourceLastSyncedAt: typeof project.sourceLastSyncedAt === "string"
        ? project.sourceLastSyncedAt : null,
      balanceSource: typeof project.balanceSource === "string"
        ? project.balanceSource : null,
    });
  }
  if (projects.length !== raw.projectCount ||
      raw.activePositions > raw.projectCount) return null;

  return {
    version: 1,
    userId: raw.userId,
    sourceOfCalculation: "backend-project-feed",
    complete: true,
    totalUsd: raw.totalUsd,
    activeTotalUsd: raw.activeTotalUsd,
    activePositions: raw.activePositions,
    projectCount: raw.projectCount,
    projects,
    staleProjectIds: Array.isArray(raw.staleProjectIds)
      ? raw.staleProjectIds.filter(id => typeof id === "string").slice(0, 100) : [],
    receivedAt: raw.receivedAt,
    calculatedAt: typeof raw.calculatedAt === "string" ? raw.calculatedAt : null,
  };
}

export function readCryptoDashboardCache(userId, storage, now = Date.now()) {
  const key = cryptoDashboardCacheKey(userId);
  const store = storageOrNull(storage);
  if (!key || !store) return null;
  try {
    const saved = JSON.parse(store.getItem(key) || "null");
    if (!saved || typeof saved !== "object" ||
        !Number.isFinite(saved.cachedAt) ||
        saved.cachedAt > now + 60_000 || saved.cachedAt > now ||
        now - saved.cachedAt > CRYPTO_DASHBOARD_CACHE_MAX_AGE_MS) {
      store.removeItem(key);
      return null;
    }
    const data = safeCryptoDashboardSnapshot(saved.data, userId);
    if (!data) { store.removeItem(key); return null; }
    return { data, cachedAt: saved.cachedAt };
  } catch {
    try { store.removeItem(key); } catch {}
    return null;
  }
}

export function writeCryptoDashboardCache(userId, snapshot, storage, now = Date.now()) {
  const key = cryptoDashboardCacheKey(userId);
  const store = storageOrNull(storage);
  const data = safeCryptoDashboardSnapshot(snapshot, userId);
  if (!key || !store || !data) return null;
  try {
    const previous = readCryptoDashboardCache(userId, store, now);
    // Delayed network responses cannot replace a newer provider receipt.
    if (previous && Date.parse(data.receivedAt) < Date.parse(previous.data.receivedAt)) {
      return previous;
    }
    store.setItem(key, JSON.stringify({ cachedAt: now, data }));
    return { cachedAt: now, data };
  } catch {
    // Full/private-mode session storage must never block live data.
    return { cachedAt: now, data };
  }
}

export function clearCryptoDashboardCache(userId, storage) {
  const store = storageOrNull(storage);
  const key = cryptoDashboardCacheKey(userId);
  if (!store || !key) return;
  try { store.removeItem(key); } catch {}
}
