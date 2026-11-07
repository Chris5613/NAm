// A localStorage-compatible facade backed by the server.
//
// Pages read synchronously, so the server copy is hydrated into memory once at
// sign-in and writes are flushed back in the background. This keeps the existing
// synchronous call sites intact while making every value persist across devices.

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

const cache = new Map();
const pendingTimers = new Map();
const listeners = new Set();
const conflictListeners = new Set();
let hydrated = false;
let savedProjects = [];
const savedValues = new Map();
const writes = new Map();
const conflicts = new Set();
const JOURNAL_PREFIX = "nam_unsaved_v1:";

// These values are derived caches/baselines that can be rebuilt from canonical
// server-backed data. A stale tab journal must never turn them into a manual
// cross-device conflict or repeatedly notify the user.
const AUTO_RESOLVE_SERVER_KEYS = new Set([
  "daily_category_baseline_pst",
  "daily_net_worth_baseline_pst",
  "crypto_wallet_balance_cache",
]);

let journalOwner = "default";
const journalKey = key => `${JOURNAL_PREFIX}${journalOwner}:${key}`;
const clone = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
function journal(key, before, after) {
  try { window.sessionStorage.setItem(journalKey(key), JSON.stringify({ before: clone(before), after: clone(after) })); } catch {}
}
function clearJournal(key) { try { window.sessionStorage.removeItem(journalKey(key)); } catch {} }
function readJournal(key) {
  try {
    const raw = window.sessionStorage.getItem(journalKey(key));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
let projectWrite = Promise.resolve();
let projectConflict = false;
let storeGeneration = 0;
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

export function subscribeConflicts(listener) {
  conflictListeners.add(listener);
  return () => conflictListeners.delete(listener);
}

export function getStoreConflicts() {
  const keys = new Set(conflicts);
  if (projectConflict) keys.add("networth_projects");
  return [...keys].sort();
}

function notifyConflicts() {
  const snapshot = getStoreConflicts();
  conflictListeners.forEach(listener => {
    try {
      listener(snapshot);
    } catch {
      /* a bad subscriber must not break conflict reporting */
    }
  });
}

export class StoreConflictError extends Error {
  constructor(key, message = "This data changed on another device before it could be saved.") {
    super(message);
    this.name = "StoreConflictError";
    this.key = key;
    this.code = "STORE_CONFLICT";
  }
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
  // Financial project rows must never be silently dropped because two
  // different IDs happen to have the same display name/category. Preserve
  // all entries and let projectChanges reject invalid duplicate IDs.
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

async function pushProjects({ throwOnError = false } = {}) {
  const generation = storeGeneration;
  projectWrite = projectWrite.catch(() => {}).then(async () => {
    if (generation !== storeGeneration) return;
    if (projectConflict) {
      if (throwOnError) throw new StoreConflictError("networth_projects");
      return;
    }
    const sent = JSON.parse(JSON.stringify(cache.get("networth_projects") || []));
    try {
      const changes = projectChanges(savedProjects, sent);
      if (!changes.length) return;
      const saved = await resourceApi.patchProjects(changes);
      if (generation !== storeGeneration) return;
      savedProjects = saved;
      cache.set("networth_projects", rebaseProjects(sent, cache.get("networth_projects") || [], saved));
      if (JSON.stringify(savedProjects) === JSON.stringify(cache.get("networth_projects"))) clearJournal("networth_projects");
      else journal("networth_projects", savedProjects, cache.get("networth_projects"));
      notify("networth_projects");
    } catch (error) {
      if (generation !== storeGeneration) return;
      if (error.status === 409 || error.code === "INVALID_PROJECT_IDS") {
        projectConflict = true;
        conflicts.add("networth_projects");
        notifyConflicts();
      }
      onError(`Could not save projects: ${error.message}`);
      if (throwOnError) throw error;
    }
  });
  return projectWrite;
}

async function pushKey(key, { throwOnError = false } = {}) {
  if (key === "networth_projects") return pushProjects({ throwOnError });
  const generation = storeGeneration;
  const previous = writes.get(key) || Promise.resolve();
  const job = previous.catch(() => {}).then(async () => {
    if (generation !== storeGeneration) return;
    if (conflicts.has(key)) {
      if (throwOnError) throw new StoreConflictError(key);
      return;
    }
    const sent = clone(cache.get(key));
    const before = clone(savedValues.get(key));
    const resource = COLLECTION_RESOURCES[key];
    try {
      if (resource) {
        const changes = projectChanges(before || [], sent || []);
        if (!changes.length) return;
        const saved = await resourceApi.patchRecords(resource, changes);
        if (generation !== storeGeneration) return;
        savedValues.set(key, clone(saved));
        cache.set(key, rebaseProjects(sent || [], cache.get(key) || [], saved));
      } else {
        if (JSON.stringify(before) === JSON.stringify(sent)) return;
        const saved = await settingsApi.patch(key, before, sent);
        if (generation !== storeGeneration) return;
        savedValues.set(key, clone(saved));
      }
      if (JSON.stringify(savedValues.get(key)) === JSON.stringify(cache.get(key))) clearJournal(key);
      else journal(key, savedValues.get(key), cache.get(key));
      notify(key);
    } catch (error) {
      if (generation !== storeGeneration) return;
      if ((error.status === 409 || error.code === "INVALID_PROJECT_IDS") && AUTO_RESOLVE_SERVER_KEYS.has(key)) {
        try {
          const serverValue = await settingsApi.get(key);
          if (generation !== storeGeneration) return;
          cache.set(key, clone(serverValue));
          savedValues.set(key, clone(serverValue));
          conflicts.delete(key);
          clearJournal(key);
          notify(key);
          notifyConflicts();
          return;
        } catch {
          // Fall through to the normal error path if the refresh itself fails.
        }
      }
      if (error.status === 409 || error.code === "INVALID_PROJECT_IDS") {
        conflicts.add(key);
        notifyConflicts();
      }
      onError(`Could not save "${key}": ${error.message}. Your edit is retained in this tab.`);
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
  await Promise.all(keys.map(key => pushKey(key)));
  await projectWrite.catch(() => {});
  await Promise.all([...writes.values()].map(job => job.catch(() => {})));
}

export async function flushKey(key) {
  clearTimeout(pendingTimers.get(key));
  pendingTimers.delete(key);
  if (getStoreConflicts().includes(key)) throw new StoreConflictError(key);
  await pushKey(key, { throwOnError: true });
  if (getStoreConflicts().includes(key)) throw new StoreConflictError(key);
}

export async function resolveStoreConflict(key, strategy) {
  if (!getStoreConflicts().includes(key)) return;
  if (!["server", "local"].includes(strategy)) throw new Error("Unknown conflict resolution strategy.");

  const generation = storeGeneration;
  const localValue = clone(cache.get(key));
  const journalEntry = readJournal(key);
  const resource = COLLECTION_RESOURCES[key];

  if (key === "networth_projects") {
    const serverValue = await resourceApi.list("projects");
    if (generation !== storeGeneration) return;
    if (strategy === "local") {
      // Rebase only this tab's edits onto the latest server collection.
      // A project added/changed elsewhere is preserved unless this tab
      // explicitly changed that same project relative to its before-image.
      const localBase = Array.isArray(journalEntry?.before)
        ? journalEntry.before
        : (savedProjects || []);
      const rebased = rebaseProjects(localBase, localValue || [], serverValue || []);
      const changes = projectChanges(serverValue || [], rebased);
      const saved = changes.length ? await resourceApi.patchProjects(changes) : serverValue;
      if (generation !== storeGeneration) return;
      savedProjects = clone(saved || []);
      cache.set(key, clone(saved || []));
      savedValues.set(key, clone(saved || []));
    } else {
      savedProjects = clone(serverValue || []);
      cache.set(key, clone(serverValue || []));
      savedValues.set(key, clone(serverValue || []));
    }
    projectConflict = false;
  } else if (resource) {
    const serverValue = await resourceApi.list(resource);
    if (generation !== storeGeneration) return;
    if (strategy === "local") {
      const localBase = Array.isArray(journalEntry?.before)
        ? journalEntry.before
        : (savedValues.get(key) || []);
      const rebased = rebaseProjects(localBase, localValue || [], serverValue || []);
      const changes = projectChanges(serverValue || [], rebased);
      const saved = changes.length ? await resourceApi.patchRecords(resource, changes) : serverValue;
      if (generation !== storeGeneration) return;
      cache.set(key, clone(saved || []));
      savedValues.set(key, clone(saved || []));
    } else {
      cache.set(key, clone(serverValue || []));
      savedValues.set(key, clone(serverValue || []));
    }
  } else {
    const serverValue = await settingsApi.get(key);
    if (generation !== storeGeneration) return;
    if (strategy === "local") {
      const saved = JSON.stringify(serverValue) === JSON.stringify(localValue)
        ? serverValue
        : await settingsApi.patch(key, serverValue, localValue);
      if (generation !== storeGeneration) return;
      cache.set(key, clone(saved));
      savedValues.set(key, clone(saved));
    } else {
      cache.set(key, clone(serverValue));
      savedValues.set(key, clone(serverValue));
    }
  }

  conflicts.delete(key);
  if (key === "networth_projects") projectConflict = false;
  clearJournal(key);
  notify(key);
  notifyConflicts();
}

export async function hydrate(ownerId = journalOwner) {
  // A sign-out or newer hydration invalidates any earlier async response.
  // Do not allow an old account's delayed network results into a new session.
  const generation = ++storeGeneration;
  journalOwner = String(ownerId);
  projectConflict = false;
  pendingTimers.forEach((timer) => clearTimeout(timer));
  pendingTimers.clear();
  savedProjects = [];
  savedValues.clear();
  conflicts.clear();
  hydrated = false;
  cache.clear();

  const settings = await settingsApi.all();
  if (generation !== storeGeneration) return;
  const resources = await Promise.all(
    Object.entries(COLLECTION_RESOURCES).map(async ([key, resource]) => [key, await resourceApi.list(resource)])
  );
  if (generation !== storeGeneration) return;

  Object.entries(settings || {}).forEach(([key, value]) => cache.set(key, value));
  resources.forEach(([key, records]) => cache.set(key, records || []));
  savedProjects = clone(cache.get("networth_projects") || []);
  savedValues.clear();
  for (const [key, value] of cache) savedValues.set(key, clone(value));
  // Restore unsaved tab edits only against the exact server version they came from.
  // A changed server version stays blocked for manual review.
  try {
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const journalKey = window.sessionStorage.key(i);
      if (!journalKey?.startsWith(`${JOURNAL_PREFIX}${journalOwner}:`)) continue;
      const key = journalKey.slice(`${JOURNAL_PREFIX}${journalOwner}:`.length);
      const { before, after } = JSON.parse(window.sessionStorage.getItem(journalKey));
      const serverValue = clone(savedValues.get(key) ?? null);
      if (JSON.stringify(before) !== JSON.stringify(serverValue)) {
        if (AUTO_RESOLVE_SERVER_KEYS.has(key)) {
          cache.set(key, serverValue);
          clearJournal(key);
          conflicts.delete(key);
          continue;
        }
        conflicts.add(key);
        console.info(`Could not restore "${key}" automatically because it changed on the server. Your edit is retained in this tab.`);
      }
      cache.set(key, after);
      if (key === "networth_projects") projectConflict = conflicts.has(key);
      if (!conflicts.has(key)) scheduleWrite(key);
    }
  } catch { /* unavailable session storage leaves server values intact */ }
  projectConflict ||= conflicts.has("networth_projects");
  hydrated = true;
  notify(null);
  notifyConflicts();
}

export function resetStore() {
  storeGeneration += 1;
  savedProjects = [];
  savedValues.clear();
  conflicts.clear();
  projectConflict = false;
  cache.clear();
  notifyConflicts();
  pendingTimers.forEach((timer) => clearTimeout(timer));
  pendingTimers.clear();
  hydrated = false;
}

/** Re-fetches one collection (e.g. "networth_assets") from the server, bypassing the in-memory cache. */
export async function refreshCollection(key) {
  const resource = COLLECTION_RESOURCES[key];
  if (!resource) return;
  const generation = storeGeneration;
  await pushKey(key);
  if (generation !== storeGeneration) return;
  const hasLocalChanges = () => JSON.stringify(key === "networth_projects" ? savedProjects : savedValues.get(key))
    !== JSON.stringify(cache.get(key));
  // Never erase unsaved edits or a conflict during a refresh.
  if (hasLocalChanges() || conflicts.has(key) || (key === "networth_projects" && projectConflict)) return;
  const records = await resourceApi.list(resource);
  if (generation !== storeGeneration) return;
  if (hasLocalChanges() || conflicts.has(key) || (key === "networth_projects" && projectConflict)) return;
  if (key === "networth_projects") {
    savedProjects = JSON.parse(JSON.stringify(records || []));
    projectConflict = false;
  }
  cache.set(key, records || []);
  savedValues.set(key, clone(records || []));
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
    // Identical telemetry/preferences should not trigger repeated network PUTs.
    if (JSON.stringify(cache.get(key)) === JSON.stringify(parsed)) return;
    cache.set(key, parsed);
    journal(key, key === "networth_projects" ? savedProjects : savedValues.get(key), parsed);
    scheduleWrite(key);
    notify(key);
  },
  removeItem(key) {
    if (cache.get(key) === null || !cache.has(key)) return;
    cache.set(key, null);
    journal(key, key === "networth_projects" ? savedProjects : savedValues.get(key), null);
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
