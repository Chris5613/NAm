// Fast, bounded, per-login memory cache of validated backend Financials reads.
// Never persist accounting data in browser storage or use this as a ledger.
// Freshness is short; backend remains authoritative and every call is validated.
const MAX_ENTRIES = 36;
const entries = new Map();
const inFlight = new Map();
let generation = 0;

export function financialCacheKey(path, payload) {
  return JSON.stringify([path, payload ?? null]);
}

// Retain validated server responses briefly beyond their refresh window.
 // Stale data is view-only, never posted or substituted into changed inputs.
export const FINANCIAL_STALE_VIEW_MS = 5 * 60 * 1000;

export function readFinancialCacheState(key, maxAgeMs = 15000, maxStaleMs = FINANCIAL_STALE_VIEW_MS) {
  const item = entries.get(key);
  if (!item) return null;
  const ageMs = Date.now() - item.savedAt;
  if (ageMs < 0 || ageMs > maxStaleMs) {
    entries.delete(key);
    return null;
  }
  // Touch entries for LRU; only previously validated backend values qualify.
  entries.delete(key);
  entries.set(key, item);
  return { data: item.value, stale: ageMs > maxAgeMs, ageMs };
}

export function readFinancialCache(key, maxAgeMs = 15000) {
  const state = readFinancialCacheState(key, maxAgeMs, maxAgeMs);
  return state ? state.data : null;
}

export function peekFinancialCache(key) {
  return entries.get(key)?.value ?? null;
}

export function clearFinancialCache() {
  generation += 1;
  entries.clear();
  inFlight.clear();
}

export function invalidateFinancialCache() {
  // Called when persisted accounting settings change. Bump generation so a
  // pending response from the previous data cannot populate the next cache.
  clearFinancialCache();
}

export async function requestFinancialCache(key, request, validate, options = {}) {
  const { maxAgeMs = 15000, force = false } = options;
  if (!force) {
    const fresh = readFinancialCache(key, maxAgeMs);
    if (fresh !== null) return fresh;
  }
  const existing = inFlight.get(key);
  if (existing) return existing;
  const ownGeneration = generation;
  const promise = Promise.resolve().then(request).then(value => {
    if (!validate(value)) throw new Error("Invalid backend Financials response");
    if (ownGeneration !== generation) {
      throw new Error("Financial cache invalidated during request");
    }
    if (ownGeneration === generation) {
      entries.delete(key);
      entries.set(key, { savedAt: Date.now(), value });
      while (entries.size > MAX_ENTRIES) {
        entries.delete(entries.keys().next().value);
      }
    }
    return value;
  }).finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
