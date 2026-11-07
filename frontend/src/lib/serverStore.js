// A localStorage-compatible facade backed by the server.
//
// The server is the source of truth. Pages read synchronously from an in-memory
// cache hydrated at sign-in. Writes are debounced, but stale-write conflicts
// always resolve by refreshing the latest server value into this tab.
//
// A failed non-conflict save may remain visible in the current tab so the user
// can retry, but it is never restored across reload/login.

import { resourceApi, settingsApi } from "./apiClient";
import { projectChanges, rebaseProjects } from "./projectChanges";

// Keys whose values are record collections with their own tables.
const COLLECTION_RESOURCES = {
  networth_assets: "assets",
  networth_phones: "phones",
  networth_wallets: "wallets",
  networth_projects: "projects",
  cloud_manual_bets: "bets",
};

const WRITE_DEBOUNCE_MS = 600;
const LEGACY_JOURNAL_PREFIX = "nam_unsaved_v1:";

const cache = new Map();
const pendingTimers = new Map();
const listeners = new Set();
let hydrated = false;
let savedProjects = [];
const savedValues = new Map();
const writes = new Map();
let projectWrite = Promise.resolve();
let storeGeneration = 0;
let onError = (message) => console.warn(message);

const clone = value =>
  value === undefined ? null : JSON.parse(JSON.stringify(value));

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
      // A bad subscriber must not break persistence.
    }
  });
}

function clearLegacyJournals() {
  if (typeof window === "undefined") return;
  try {
    const keys = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(LEGACY_JOURNAL_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Session storage is optional. Server hydration remains authoritative.
  }
}

function exactText(value) {
  return String(value ?? "").trim();
}

function dedupeCollection(key, value) {
  if (!Array.isArray(value)) return value;

  // Financial record collections are identity-based and validated server-side.
  // Never collapse two distinct IDs because they happen to share a display name.
  if (COLLECTION_RESOURCES[key]) return value;

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

function isConflict(error) {
  return error?.status === 409;
}

async function loadServerValue(key) {
  if (key === "networth_projects") {
    return resourceApi.list("projects");
  }
  const resource = COLLECTION_RESOURCES[key];
  if (resource) return resourceApi.list(resource);
  return settingsApi.get(key);
}

function applyServerValue(key, value) {
  const next = clone(value ?? (COLLECTION_RESOURCES[key] ? [] : null));

  if (key === "networth_projects") {
    savedProjects = clone(next || []);
    cache.set(key, clone(next || []));
    savedValues.set(key, clone(next || []));
  } else {
    cache.set(key, next);
    savedValues.set(key, clone(next));
  }

  notify(key);
}

async function refreshFromServer(key, generation) {
  const value = await loadServerValue(key);
  if (generation !== storeGeneration) return null;
  applyServerValue(key, value);
  return value;
}

async function pushProjects({ throwOnError = false } = {}) {
  const generation = storeGeneration;

  projectWrite = projectWrite.catch(() => {}).then(async () => {
    if (generation !== storeGeneration) return;

    const sent = clone(cache.get("networth_projects") || []);

    try {
      const changes = projectChanges(savedProjects, sent);
      if (!changes.length) return;

      const saved = await resourceApi.patchProjects(changes);
      if (generation !== storeGeneration) return;
      if (!Array.isArray(saved)) throw new Error("Invalid projects response from server.");

      savedProjects = clone(saved);
      cache.set(
        "networth_projects",
        rebaseProjects(sent, cache.get("networth_projects") || [], saved || [])
      );
      savedValues.set("networth_projects", clone(savedProjects));
      notify("networth_projects");
    } catch (error) {
      if (generation !== storeGeneration) return;

      if (isConflict(error)) {
        try {
          await refreshFromServer("networth_projects", generation);
          console.info("Projects changed on the server; refreshed the server copy.");
          return;
        } catch (refreshError) {
          onError(`Could not refresh projects after a stale save: ${refreshError.message}`);
          if (throwOnError) throw refreshError;
          return;
        }
      }

      onError(`Could not save projects: ${error.message}`);
      if (throwOnError) throw error;
    }
  });

  return projectWrite;
}

async function pushKey(key, { throwOnError = false } = {}) {
  if (key === "networth_projects") {
    return pushProjects({ throwOnError });
  }

  const generation = storeGeneration;
  const previous = writes.get(key) || Promise.resolve();

  const job = previous.catch(() => {}).then(async () => {
    if (generation !== storeGeneration) return;

    const sent = clone(cache.get(key));
    const before = clone(savedValues.get(key));
    const resource = COLLECTION_RESOURCES[key];

    try {
      if (resource) {
        const changes = projectChanges(before || [], sent || []);
        if (!changes.length) return;

        const saved = await resourceApi.patchRecords(resource, changes);
        if (generation !== storeGeneration) return;
        if (!Array.isArray(saved)) throw new Error(`Invalid ${resource} response from server.`);

        savedValues.set(key, clone(saved));
        cache.set(
          key,
          rebaseProjects(sent || [], cache.get(key) || [], saved)
        );
      } else {
        if (JSON.stringify(before) === JSON.stringify(sent)) return;

        const saved = await settingsApi.patch(key, before, sent);
        if (generation !== storeGeneration) return;

        savedValues.set(key, clone(saved));
        // Keep a newer edit made while this request was in flight.
        if (JSON.stringify(cache.get(key)) === JSON.stringify(sent)) {
          cache.set(key, clone(saved));
        }
      }

      notify(key);
    } catch (error) {
      if (generation !== storeGeneration) return;

      if (isConflict(error)) {
        try {
          await refreshFromServer(key, generation);
          console.info(`"${key}" changed on the server; refreshed the server copy.`);
          return;
        } catch (refreshError) {
          onError(`Could not refresh "${key}" after a stale save: ${refreshError.message}`);
          if (throwOnError) throw refreshError;
          return;
        }
      }

      onError(`Could not save "${key}": ${error.message}. The edit remains in this tab until reload.`);
      if (throwOnError) throw error;
    }
  });

  writes.set(key, job);
  return job;
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

  await Promise.all(keys.map((key) => pushKey(key)));
  await projectWrite.catch(() => {});
  await Promise.all([...writes.values()].map((job) => job.catch(() => {})));
}

export async function flushKey(key) {
  clearTimeout(pendingTimers.get(key));
  pendingTimers.delete(key);
  await pushKey(key, { throwOnError: true });
}

export async function hydrate() {
  // A sign-out or newer hydration invalidates any earlier async response.
  const generation = ++storeGeneration;

  pendingTimers.forEach((timer) => clearTimeout(timer));
  pendingTimers.clear();
  savedProjects = [];
  savedValues.clear();
  hydrated = false;
  cache.clear();

  // Old builds may have left unsaved journals behind. Under the server-wins
  // policy they are intentionally discarded before loading canonical data.
  clearLegacyJournals();

  const settings = await settingsApi.all();
  if (generation !== storeGeneration) return;

  const resources = await Promise.all(
    Object.entries(COLLECTION_RESOURCES).map(
      async ([key, resource]) => [key, await resourceApi.list(resource)]
    )
  );
  if (generation !== storeGeneration) return;

  Object.entries(settings || {}).forEach(([key, value]) => cache.set(key, value));
  resources.forEach(([key, records]) => cache.set(key, records || []));

  savedProjects = clone(cache.get("networth_projects") || []);
  for (const [key, value] of cache) {
    savedValues.set(key, clone(value));
  }

  hydrated = true;
  notify(null);
}

export function resetStore() {
  storeGeneration += 1;
  savedProjects = [];
  savedValues.clear();
  cache.clear();

  pendingTimers.forEach((timer) => clearTimeout(timer));
  pendingTimers.clear();

  hydrated = false;
}

export async function refreshCollection(key) {
  const resource = COLLECTION_RESOURCES[key];
  if (!resource) return;

  const generation = storeGeneration;

  // First try to persist any current-tab edit. A stale-write conflict resolves
  // to the server inside pushKey(). A non-conflict network failure preserves the
  // edit in this tab instead of silently erasing it.
  await pushKey(key);
  if (generation !== storeGeneration) return;

  const hasUnsavedLocalChanges = () =>
    JSON.stringify(
      key === "networth_projects" ? savedProjects : savedValues.get(key)
    ) !== JSON.stringify(cache.get(key));

  if (hasUnsavedLocalChanges()) return;

  const records = await resourceApi.list(resource);
  if (generation !== storeGeneration) return;
  if (hasUnsavedLocalChanges()) return;

  applyServerValue(key, records || []);
}

/** Mirrors the Web Storage API so existing synchronous call sites work. */
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

    if (JSON.stringify(cache.get(key)) === JSON.stringify(parsed)) return;

    cache.set(key, parsed);
    scheduleWrite(key);
    notify(key);
  },

  removeItem(key) {
    if (!cache.has(key) || cache.get(key) === null) return;

    cache.set(key, null);
    scheduleWrite(key);
    notify(key);
  },

  clear() {
    [...cache.keys()].forEach((key) => remoteStorage.removeItem(key));
  },
};

// Flush anything still debounced when the tab goes away. If it cannot save,
// the next load still hydrates the canonical server version.
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingWrites();
  });
  window.addEventListener("pagehide", () => flushPendingWrites());
}
