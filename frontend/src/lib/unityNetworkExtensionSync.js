// Unity Nodes Chrome-extension → Net Worth bridge.
//
// Pure client-side. The companion extension (Unity Nodes Earnings Tracker, MV3
// — https://github.com/Chris5613/Extention) injects a content script onto
// this app's URL. That content script reads the latest earnings payload from
// chrome.storage.local and forwards it to the page via window.postMessage.
//
// Multi-account support
// ─────────────────────
// The extension can only hold one logged-in Unity Nodes session at a time, so
// the user signs in to each account in turn and syncs. We persist a per-email
// snapshot in `state.accounts[email]` and keep the displayed lifetime as the
// **sum across all known accounts**. When a single account's lifetime grows,
// the aggregated total grows by exactly that amount → only that delta is
// credited to Phone Farm, no double-counting and no withdrawal flap when the
// user switches accounts.
//
// Protocol (origin must match window.location.origin):
//
//   ext → app:  { source: "unity-nodes-tracker-ext", type: "EARNINGS_PUSH", payload: {...} }
//   ext → app:  { source: "unity-nodes-tracker-ext", type: "READY" }    // fired on content-script load
//   app → ext:  { source: "unity-nodes-tracker-app", type: "REQUEST_LATEST" } // pull on demand

import { localStorage as storage } from "./localStorage";
import { applyUnityNetworkBalanceUpdate } from "./unityNetworkSync";

const EXT_SOURCE = "unity-nodes-tracker-ext";
const APP_SOURCE = "unity-nodes-tracker-app";
const MSG_PUSH = "EARNINGS_PUSH";
const MSG_READY = "READY";
const MSG_REQUEST = "REQUEST_LATEST";

// Sub-cent drift tolerance — matches unityNetworkSync.AMOUNT_EPSILON.
const AMOUNT_EPSILON = 0.005;

// Sentinel used when a payload has no email (older extension builds). Lets
// the migration park the legacy baseline somewhere identifiable so the user
// can later reassign it from the UI.
const LEGACY_KEY = "_legacy";

function defaultExtState() {
  return {
    // Aggregated snapshot — what the card's tiles render. These are the SUM
    // (or most-recent, where summing doesn't make sense) across every entry
    // in `accounts`.
    last_today_date: null,
    last_today_usd: 0,
    last_balance_usd: 0,
    last_lifetime_usd: 0,
    last_device_count: 0,
    last_email: null,    // most-recent email pushed
    last_seen_at: null,  // most-recent push timestamp

    // Aggregated apply tracking (mirrors what's been credited to Phone Farm).
    last_applied_synced_at: null,
    last_applied_received_at: null,
    last_applied_lifetime_usd: 0,

    auto_sync_enabled: true,
    extension_detected: false,

    // Per-account state, keyed by lower-cased email (or LEGACY_KEY when an
    // email isn't available). Each entry holds that account's last reported
    // snapshot and the lifetime that has already been credited.
    accounts: {},
  };
}

function normalizeEmailKey(email) {
  if (!email) return LEGACY_KEY;
  const trimmed = String(email).trim().toLowerCase();
  return trimmed || LEGACY_KEY;
}

function pickNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Merge stored state with defaults, ensuring `accounts` is always an object
// and migrating any legacy single-account fields into the multi-account map
// on first read after upgrade.
export function getExtensionState() {
  const stored = storage.getUnityNetworkExtension() || {};
  const state = { ...defaultExtState(), ...stored };
  if (!state.accounts || typeof state.accounts !== "object") state.accounts = {};

  // ──────── one-shot migration ────────
  // If the user has been tracking Unity Nodes pre-multi-account, we have
  // a populated `last_applied_lifetime_usd` but `accounts` is empty.
  // Seed the previously-tracked account so the existing Phone Farm baseline
  // stays attributed to it and the next push from a *different* account is
  // treated as additive (not a withdrawal).
  if (
    Object.keys(state.accounts).length === 0 &&
    pickNumber(state.last_applied_lifetime_usd) > 0
  ) {
    const key = normalizeEmailKey(state.last_email);
    state.accounts[key] = {
      email: state.last_email || null,
      last_today_date: state.last_today_date || null,
      last_today_usd: pickNumber(state.last_today_usd),
      last_balance_usd: pickNumber(state.last_balance_usd),
      last_lifetime_usd: pickNumber(
        state.last_lifetime_usd || state.last_applied_lifetime_usd,
      ),
      last_device_count: pickNumber(state.last_device_count),
      last_seen_at: state.last_seen_at || null,
      last_applied_lifetime_usd: pickNumber(state.last_applied_lifetime_usd),
      last_applied_synced_at: state.last_applied_synced_at || null,
    };
  }

  return state;
}

export function setExtensionState(patch) {
  const next = { ...getExtensionState(), ...(patch || {}) };
  storage.setUnityNetworkExtension(next);
  window.dispatchEvent(new CustomEvent("unity-network-extension-update"));
  return next;
}

export function setAutoSyncEnabled(enabled) {
  return setExtensionState({ auto_sync_enabled: !!enabled });
}

// Aggregate snapshot fields across all per-account entries.
//   - lifetime_usd / device_count → SUM
//   - today_usd → SUM but ONLY for accounts whose `last_today_date` matches
//     today (UTC); otherwise that account contributes 0 (its "today" is stale)
//   - balance_usd → SUM of available balances (null treated as 0)
function computeAggregates(accounts) {
  const todayUtc = new Date().toISOString().split("T")[0];
  let totalLifetime = 0;
  let totalDevices = 0;
  let totalToday = 0;
  let totalBalance = 0;
  let mostRecentSeenAt = null;
  let mostRecentEmail = null;
  let anyTodayReading = false;

  for (const entry of Object.values(accounts || {})) {
    if (!entry) continue;
    totalLifetime += pickNumber(entry.last_lifetime_usd);
    totalDevices += pickNumber(entry.last_device_count);
    totalBalance += pickNumber(entry.last_balance_usd);
    if (entry.last_today_date && entry.last_today_date === todayUtc) {
      totalToday += pickNumber(entry.last_today_usd);
      anyTodayReading = true;
    }
    const seenAt = entry.last_seen_at;
    if (seenAt && (!mostRecentSeenAt || seenAt > mostRecentSeenAt)) {
      mostRecentSeenAt = seenAt;
      mostRecentEmail = entry.email || null;
    }
  }

  return {
    totalLifetimeUsd: Number(totalLifetime.toFixed(6)),
    totalDevices,
    totalTodayUsd: Number(totalToday.toFixed(6)),
    totalBalanceUsd: Number(totalBalance.toFixed(6)),
    mostRecentSeenAt,
    mostRecentEmail,
    todayDateForDisplay: anyTodayReading ? todayUtc : null,
  };
}

// Persist an updated `accounts` map and recompute the aggregated tiles.
function commitAccounts(nextAccounts, extra = {}) {
  const aggregates = computeAggregates(nextAccounts);
  return setExtensionState({
    accounts: nextAccounts,
    last_today_date: aggregates.todayDateForDisplay,
    last_today_usd: aggregates.totalTodayUsd,
    last_balance_usd: aggregates.totalBalanceUsd,
    last_lifetime_usd: aggregates.totalLifetimeUsd,
    last_device_count: aggregates.totalDevices,
    last_email: aggregates.mostRecentEmail || null,
    last_seen_at: aggregates.mostRecentSeenAt || null,
    extension_detected: true,
    ...extra,
  });
}

// Public: list every tracked account, sorted by most-recent push.
export function listAccounts() {
  const state = getExtensionState();
  return Object.entries(state.accounts || {})
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => {
      const ta = a.last_seen_at || "";
      const tb = b.last_seen_at || "";
      return tb.localeCompare(ta);
    });
}

// Remove a single account from per-account state. The aggregated lifetime
// drops by that account's contribution; we treat that as a withdrawal so
// `config.baseline_usd` follows the new total — no phantom earnings the next
// time the lifetime climbs back to where it was.
export async function removeAccount(emailKey) {
  const state = getExtensionState();
  const accounts = { ...(state.accounts || {}) };
  if (!accounts[emailKey]) {
    return { ok: false, reason: "not_found" };
  }
  delete accounts[emailKey];

  // Persist the new map first so the UI reflects the removal immediately.
  commitAccounts(accounts);

  // If tracking is enabled, push the new aggregated total down via a
  // withdrawal so we don't credit the gap as earnings later.
  const config = storage.getUnityNetworkConfig();
  if (config?.enabled) {
    const aggregates = computeAggregates(accounts);
    try {
      await applyUnityNetworkBalanceUpdate({
        newBalanceUsd: aggregates.totalLifetimeUsd,
        action: "withdrawal",
      });
    } catch (err) {
      console.warn("removeAccount: withdrawal apply failed:", err);
    }
    setExtensionState({
      last_applied_lifetime_usd: aggregates.totalLifetimeUsd,
      last_applied_received_at: new Date().toISOString(),
    });
  }

  return { ok: true };
}

// Wipe every per-account record (keeps `auto_sync_enabled` and the global
// `extension_detected` flag). Used as a manual "reset" escape hatch from the
// Configure dialog. Does NOT touch `config.baseline_usd` — the user is
// expected to set that back to whatever they want before re-syncing.
export function clearAllAccounts() {
  return commitAccounts({}, {
    last_applied_synced_at: null,
    last_applied_received_at: null,
    last_applied_lifetime_usd: 0,
  });
}

// Set / clear a custom display label for an account (e.g. "Personal phone",
// "Work farm 1"). Pass `null` or empty string to clear. Labels never replace
// the email key — they're purely cosmetic — so renaming is safe and the
// extension's per-email idempotency is unaffected.
export function setAccountLabel(emailKey, label) {
  const state = getExtensionState();
  const accounts = { ...(state.accounts || {}) };
  if (!accounts[emailKey]) return { ok: false, reason: "not_found" };
  const trimmed = (label || "").trim();
  accounts[emailKey] = {
    ...accounts[emailKey],
    label: trimmed || null,
  };
  setExtensionState({ accounts });
  return { ok: true, label: trimmed || null };
}

// Consolidate any historical per-account Unity-Nodes sub-categories
// (created by previous builds that labeled each account separately) into a
// single "Unity Network" bucket on the Phone Farm project. Idempotent —
// no-ops when there's nothing to merge.
//
// Matches: "Unity Network", "Unity Nodes", "Unity Nodes (any-email)" — all
// case-insensitive. Their earned amounts are summed and rewritten as a
// single { name: "Unity Network", earned: total } entry.
export function consolidateUnityCategories() {
  const config = storage.getUnityNetworkConfig();
  const projectName = (config?.project_name || "Phone Farm").trim().toLowerCase();
  const all = storage.getProjects() || [];
  const project = all.find(
    (p) => (p?.name || "").trim().toLowerCase() === projectName,
  );
  if (!project) return { ok: false, reason: "no_project" };

  const categories = Array.isArray(project.categories) ? project.categories : [];
  const isUnity = (name) => {
    const n = (name || "").trim().toLowerCase();
    return (
      n === "unity network" ||
      n === "unity nodes" ||
      n.startsWith("unity nodes (") ||
      n.startsWith("unity network (")
    );
  };
  const unityCats = categories.filter((c) => isUnity(c?.name));
  if (unityCats.length === 0) return { ok: true, merged: 0 };
  // Already consolidated: exactly one entry, named "Unity Network".
  if (
    unityCats.length === 1 &&
    (unityCats[0].name || "").trim() === "Unity Network"
  ) {
    return { ok: true, merged: 0 };
  }

  const totalEarned = unityCats.reduce(
    (sum, c) => sum + (Number(c?.earned) || 0),
    0,
  );
  const otherCats = categories.filter((c) => !isUnity(c?.name));
  const merged = [
    ...otherCats,
    { name: "Unity Network", earned: Number(totalEarned.toFixed(6)) },
  ];

  const next = all.map((p) =>
    p.id === project.id ? { ...p, categories: merged } : p,
  );
  storage.setProjects(next);
  window.dispatchEvent(new CustomEvent("unity-network-sync-complete"));
  return { ok: true, merged: unityCats.length, total: totalEarned };
}

// Apply an extension payload to the Unity Network / Phone Farm tracking.
//
// Strategy:
//   1. Update this account's per-email snapshot.
//   2. Recompute the aggregated lifetime (sum across all accounts).
//   3. Feed the aggregate to applyUnityNetworkBalanceUpdate. Because
//      `config.baseline_usd` was set to the previous aggregate at the last
//      apply, the delta naturally equals **just this account's growth**.
async function applyPayload(payload, { allowAutoConfigure = false } = {}) {
  if (!payload || typeof payload !== "object") {
    return { applied: false, reason: "empty_payload" };
  }

  const lifetime = pickNumber(payload.lifetime_usd, NaN);
  if (!Number.isFinite(lifetime) || lifetime < 0) {
    return { applied: false, reason: "invalid_lifetime" };
  }

  const state = getExtensionState();          // already-migrated
  const accounts = { ...(state.accounts || {}) };
  const emailKey = normalizeEmailKey(payload.email);
  const prev = accounts[emailKey] || null;
  const nowIso = new Date().toISOString();
  const incomingSyncedAt = payload.synced_at || nowIso;

  // Per-account idempotency (independent timeline per email).
  if (
    prev &&
    prev.last_applied_synced_at &&
    incomingSyncedAt <= prev.last_applied_synced_at
  ) {
    // Even on a duplicate we refresh `last_seen_at` so the "last push" tile
    // ticks but nothing else changes.
    accounts[emailKey] = { ...prev, last_seen_at: nowIso };
    commitAccounts(accounts);
    return { applied: false, reason: "already_applied" };
  }

  // Update this account's snapshot fields. `label` is preserved across
  // syncs since it's a user-set cosmetic name, not part of the payload.
  accounts[emailKey] = {
    email: payload.email || prev?.email || null,
    label: prev?.label ?? null,
    last_today_date: payload.date || null,
    last_today_usd: pickNumber(payload.total_usd),
    last_balance_usd: pickNumber(payload.balance_usd),
    last_lifetime_usd: lifetime,
    last_device_count: pickNumber(payload.device_count),
    last_seen_at: nowIso,
    last_applied_lifetime_usd: prev?.last_applied_lifetime_usd ?? 0,
    last_applied_synced_at: prev?.last_applied_synced_at ?? null,
  };

  // Persist the updated snapshot immediately so the UI shows the new account
  // even when tracking is disabled / no delta to credit.
  commitAccounts(accounts);

  const aggregates = computeAggregates(accounts);
  const aggregatedLifetime = aggregates.totalLifetimeUsd;

  const config = storage.getUnityNetworkConfig();

  if (!config?.enabled) {
    if (!allowAutoConfigure) {
      return { applied: false, reason: "tracking_disabled" };
    }
    // Bootstrap: enable tracking with the current AGGREGATED lifetime as the
    // baseline so the first push doesn't get retroactively credited.
    storage.setUnityNetworkConfig({
      baseline_usd: Number(aggregatedLifetime.toFixed(6)),
      project_name: "Phone Farm",
      enabled: true,
      last_updated_at: nowIso,
    });
    accounts[emailKey] = {
      ...accounts[emailKey],
      last_applied_lifetime_usd: lifetime,
      last_applied_synced_at: incomingSyncedAt,
    };
    commitAccounts(accounts, {
      last_applied_synced_at: incomingSyncedAt,
      last_applied_received_at: nowIso,
      last_applied_lifetime_usd: aggregatedLifetime,
    });
    return { applied: true, action: "bootstrap", delta_usd: 0, txn: null };
  }

  const baselineUsd = pickNumber(config.baseline_usd);
  const delta = aggregatedLifetime - baselineUsd;

  if (Math.abs(delta) < AMOUNT_EPSILON) {
    await applyUnityNetworkBalanceUpdate({
      newBalanceUsd: aggregatedLifetime,
      action: "no_change",
    });
    accounts[emailKey] = {
      ...accounts[emailKey],
      last_applied_lifetime_usd: lifetime,
      last_applied_synced_at: incomingSyncedAt,
    };
    commitAccounts(accounts, {
      last_applied_synced_at: incomingSyncedAt,
      last_applied_received_at: nowIso,
      last_applied_lifetime_usd: aggregatedLifetime,
    });
    return { applied: true, action: "no_change", delta_usd: 0, txn: null };
  }

  if (delta < 0) {
    console.warn(
      `Unity extension: aggregated lifetime dropped from ${baselineUsd} to ${aggregatedLifetime}; treating as withdrawal.`,
    );
    await applyUnityNetworkBalanceUpdate({
      newBalanceUsd: aggregatedLifetime,
      action: "withdrawal",
    });
    accounts[emailKey] = {
      ...accounts[emailKey],
      last_applied_lifetime_usd: lifetime,
      last_applied_synced_at: incomingSyncedAt,
    };
    commitAccounts(accounts, {
      last_applied_synced_at: incomingSyncedAt,
      last_applied_received_at: nowIso,
      last_applied_lifetime_usd: aggregatedLifetime,
    });
    return { applied: true, action: "withdrawal", delta_usd: delta, txn: null };
  }

  // delta > 0 → credit it. We always tag the txn with a single "Unity
  // Network" sub-category label so the Phone Farm breakdown shows ONE
  // consolidated line ("Unity Network · $X") rather than one entry per
  // account email. Per-account attribution still lives on the card itself.
  const result = await applyUnityNetworkBalanceUpdate({
    newBalanceUsd: aggregatedLifetime,
    action: "earning",
    label: "Unity Network",
  });

  // Best-effort: clean up any historical per-account category buckets
  // ("Unity Nodes (foo@bar)") that older builds wrote to the Phone Farm
  // project. Idempotent — only does work when something needs merging.
  try { consolidateUnityCategories(); } catch (e) { /* non-fatal */ }

  accounts[emailKey] = {
    ...accounts[emailKey],
    last_applied_lifetime_usd: lifetime,
    last_applied_synced_at: incomingSyncedAt,
  };
  commitAccounts(accounts, {
    last_applied_synced_at: incomingSyncedAt,
    last_applied_received_at: nowIso,
    last_applied_lifetime_usd: aggregatedLifetime,
  });

  return {
    applied: true,
    action: result.action,
    delta_usd: result.delta_usd,
    txn: result.txn,
    account_email: payload.email || null,
  };
}

// Public: ask the extension to (re)post its latest cached reading. The
// content script will reply with an EARNINGS_PUSH message which our listener
// then handles. Returns immediately — apply happens via the listener.
export function requestLatestFromExtension() {
  try {
    window.postMessage(
      { source: APP_SOURCE, type: MSG_REQUEST },
      window.location.origin,
    );
    return true;
  } catch (err) {
    console.warn("requestLatestFromExtension failed:", err);
    return false;
  }
}

// Convenience: returns true when ANY tracked account has a payload dated
// "today" (UTC). Drives the "Today's earnings" tile colour.
export function hasTodayReading() {
  const state = getExtensionState();
  if (!state.accounts || Object.keys(state.accounts).length === 0) return false;
  const todayUtc = new Date().toISOString().split("T")[0];
  return Object.values(state.accounts).some(
    (a) => a?.last_today_date && a.last_today_date === todayUtc,
  );
}

// ────────────────────── postMessage listener (singleton) ──────────────────
// Installed once at app boot from App.js. Re-registering is a no-op.
let listenerInstalled = false;
const subscribers = new Set();

// Module-level serialization queue. Both the singleton listener AND the
// `syncFromExtensionNow` manual path enqueue through this so concurrent
// pushes (or a listener + manual handler racing on the same EARNINGS_PUSH
// message) don't interleave their accounts-map reads and clobber each
// other's writes.
let applyChain = Promise.resolve();
function enqueueApply(payload, opts) {
  applyChain = applyChain
    .catch(() => null)
    .then(() => applyPayload(payload, opts));
  return applyChain;
}

// Subscribe to apply-results so the UI can show toasts in response to a
// real-time extension push. Cb signature: (result, payload) => void.
export function onExtensionApply(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function notifySubscribers(result, payload) {
  for (const cb of subscribers) {
    try { cb(result, payload); } catch (err) { console.warn("ext subscriber threw:", err); }
  }
}

export function installExtensionListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;

  const onMessage = async (event) => {
    // Hard origin check — only accept messages from our own page (the
    // content script runs in the same browsing context as us, so it posts
    // with our origin).
    if (event.origin !== window.location.origin) return;
    const data = event?.data;
    if (!data || typeof data !== "object" || data.source !== EXT_SOURCE) return;

    if (data.type === MSG_READY) {
      // Extension content script just loaded. Mark detected and ask for the
      // latest reading.
      setExtensionState({ extension_detected: true, last_seen_at: new Date().toISOString() });
      requestLatestFromExtension();
      return;
    }

    if (data.type === MSG_PUSH) {
      try {
        const ext = getExtensionState();
        const result = await enqueueApply(data.payload, {
          allowAutoConfigure: false, // background flow never auto-configures
        });
        if (ext.auto_sync_enabled === false) {
          // User opted out of auto-apply. Snapshot fields are still updated
          // by applyPayload so the card can preview today's earnings.
          notifySubscribers({ applied: false, reason: "auto_sync_off" }, data.payload);
          return;
        }
        notifySubscribers(result, data.payload);
      } catch (err) {
        console.warn("Failed to apply extension push:", err);
        notifySubscribers({ applied: false, reason: "exception", error: err?.message }, data.payload);
      }
    }
  };

  window.addEventListener("message", onMessage);
}

// Manual "Sync from extension" button entry point. Sends a REQUEST_LATEST
// and (if `allowAutoConfigure`) flips the apply path to auto-bootstrap when
// tracking is disabled. Routes through the same serialized queue as the
// singleton listener so a single inbound EARNINGS_PUSH (heard by both
// handlers) is applied exactly once.
export function syncFromExtensionNow({ allowAutoConfigure = false, timeoutMs = 4000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", handler);
      clearTimeout(timer);
      resolve(result);
    };
    const handler = async (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event?.data;
      if (!data || data.source !== EXT_SOURCE || data.type !== MSG_PUSH) return;
      try {
        const result = await enqueueApply(data.payload, { allowAutoConfigure });
        finish({ ok: true, ...result, payload: data.payload });
      } catch (err) {
        finish({ ok: false, reason: "exception", error: err?.message });
      }
    };
    const timer = setTimeout(
      () => finish({ ok: false, reason: "timeout" }),
      Math.max(500, timeoutMs),
    );
    window.addEventListener("message", handler);
    requestLatestFromExtension();
  });
}
