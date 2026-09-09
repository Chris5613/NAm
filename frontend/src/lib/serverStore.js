// A localStorage-compatible facade backed by the server.
//
// Pages read synchronously, so the server copy is hydrated into memory once at
// sign-in and writes are flushed back in the background. This keeps the existing
// synchronous call sites intact while making every value persist across devices.

import { resourceApi, settingsApi } from "./apiClient";

// Keys whose values are record collections with their own tables.
const COLLECTION_RESOURCES = {
  networth_assets: "assets",
  networth_phones: "phones",
  networth_wallets: "wallets",
  networth_projects: "projects",
  cloud_manual_bets: "bets",
};

const WRITE_DEBOUNCE_MS = 600;

const cache = new Map();
const pendingTimers = new Map();
const listeners = new Set();
let hydrated = false;
let onError = (message) => console.warn(message);

export function setStoreErrorHandler(handler) {
  onError = handler;
}

export function isHydrated() {
  return hydrated;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(key) {
  listeners.forEach((listener) => {
    try {
      listener(key);
    } catch {
      /* a bad subscriber must not break writes */
    }
  });
}

function exactText(value) {
  return String(value ?? "").trim();
}

function dedupeCollection(key, value) {
  if (!Array.isArray(value)) return value;

  const seen = new Set();
  const deduped = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      deduped.push(item);
      continue;
    }

    let recordKey = "";

    if (key === "networth_assets") {
      recordKey = `${exactText(item.category)}::${exactText(item.name)}::${exactText(item.symbol)}`;
    } else if (key === "networth_wallets") {
      recordKey = `${exactText(item.chain)}::${exactText(item.address) || exactText(item.label)}`;
    } else if (key === "networth_projects") {
      recordKey = `${exactText(item.category)}::${exactText(item.name)}`;
    } else if (key === "networth_phones") {
      recordKey = exactText(item.model);
    } else if (key === "networth_tokens") {
      recordKey = `${exactText(item.chain)}::${exactText(item.symbol)}::${exactText(item.name)}`;
    } else if (key === "cloud_manual_bets") {
      recordKey = [
        exactText(item.date),
        exactText(item.title),
        exactText(item.matchup),
        exactText(item.awayTeam),
        exactText(item.homeTeam),
        exactText(item.gamePk),
        exactText(item.odds),
        exactText(item.stake ?? item.amount),
      ].join("::");
    }

    if (!recordKey) {
      deduped.push(item);
      continue;
    }

    if (seen.has(recordKey)) continue;
    seen.add(recordKey);
    deduped.push(item);
  }

  return deduped;
}

async function pushKey(key) {
  const value = cache.get(key);
  const resource = COLLECTION_RESOURCES[key];
  try {
    if (resource) {
      await resourceApi.replaceAll(resource, Array.isArray(value) ? value : []);
    } else {
      await settingsApi.set(key, value === undefined ? null : value);
    }
  } catch (error) {
    onError(`Could not save "${key}": ${error.message}`);
  }
}

function scheduleWrite(key) {
  clearTimeout(pendingTimers.get(key));
  pendingTimers.set(
    key,
    setTimeout(() => {
      pendingTimers.delete(key);
      pushKey(key);
    }, WRITE_DEBOUNCE_MS)
  );
}

export async function flushPendingWrites() {
  const keys = [...pendingTimers.keys()];
  keys.forEach((key) => clearTimeout(pendingTimers.get(key)));
  pendingTimers.clear();
  await Promise.all(keys.map(pushKey));
}

export async function hydrate() {
  const settings = await settingsApi.all();
  cache.clear();
  Object.entries(settings || {}).forEach(([key, value]) => cache.set(key, value));

  const resources = await Promise.all(
    Object.entries(COLLECTION_RESOURCES).map(async ([key, resource]) => [key, await resourceApi.list(resource)])
  );
  resources.forEach(([key, records]) => cache.set(key, records || []));

  hydrated = true;
  notify(null);
}

export function resetStore() {
  cache.clear();
  pendingTimers.forEach((timer) => clearTimeout(timer));
  pendingTimers.clear();
  hydrated = false;
}

/** Re-fetches one collection (e.g. "networth_assets") from the server, bypassing the in-memory cache. */
export async function refreshCollection(key) {
  const resource = COLLECTION_RESOURCES[key];
  if (!resource) return;
  const records = await resourceApi.list(resource);
  cache.set(key, records || []);
  notify(key);
}

/** Mirrors the Web Storage API so existing call sites work unchanged. */
export const remoteStorage = {
  get length() {
    return cache.size;
  },
  key(index) {
    return [...cache.keys()][index] ?? null;
  },
  getItem(key) {
    if (!cache.has(key)) return null;
    const value = cache.get(key);
    if (value === null || value === undefined) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  },
  setItem(key, value) {
    let parsed = value;
    if (typeof value === "string") {
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = value;
      }
    }
    if (Array.isArray(parsed)) {
      parsed = dedupeCollection(key, parsed);
    }
    cache.set(key, parsed);
    scheduleWrite(key);
    notify(key);
  },
  removeItem(key) {
    cache.set(key, null);
    scheduleWrite(key);
    notify(key);
  },
  clear() {
    [...cache.keys()].forEach((key) => remoteStorage.removeItem(key));
  },
};

// Flush anything still debounced when the tab goes away.
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingWrites();
  });
  window.addEventListener("pagehide", () => flushPendingWrites());
}
