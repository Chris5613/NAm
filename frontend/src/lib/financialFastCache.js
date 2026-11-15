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

export function readFinancialCache(key, maxAgeMs = 15000) {
  const item = entries.get(key);
  if (!item || Date.now() - item.savedAt > maxAgeMs) return null;
  // LRU eviction. All values were validated before being cached.
  entries.delete(key);
  entries.set(key, item);
  return item.value;
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
