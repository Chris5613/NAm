// Unity Nodes Chrome-extension → Net Worth bridge.
//
// Pure client-side. The companion extension (Unity Nodes Earnings Tracker, MV3
// — https://github.com/Chris5613/Extention) injects a content script onto
// this app's URL. That content script reads the latest earnings payload from
// chrome.storage.local and forwards it to the page via window.postMessage.
//
// We listen, dedupe by `synced_at`, and credit the delta to the same Phone
// Farm investment project the manual flow uses. Idempotency is anchored on
// the extension's `lifetime_usd` figure (monotonic) so withdrawals/swaps
// never produce phantom earnings.
//
// Protocol (origin must match window.location.origin):
//
//   ext → app:  { source: "unity-nodes-tracker-ext", type: "EARNINGS_PUSH", payload: {...} }
//   ext → app:  { source: "unity-nodes-tracker-ext", type: "READY" }   // fired on content-script load
//   app → ext:  { source: "unity-nodes-tracker-app", type: "REQUEST_LATEST" }   // pull on demand

import { localStorage as storage } from "./localStorage";
import { applyUnityNetworkBalanceUpdate } from "./unityNetworkSync";

const EXT_SOURCE = "unity-nodes-tracker-ext";
const APP_SOURCE = "unity-nodes-tracker-app";
const MSG_PUSH = "EARNINGS_PUSH";
const MSG_READY = "READY";
const MSG_REQUEST = "REQUEST_LATEST";

// Sub-cent drift tolerance — matches unityNetworkSync.AMOUNT_EPSILON.
const AMOUNT_EPSILON = 0.005;

function defaultExtState() {
  return {
    last_applied_synced_at: null,
    last_applied_received_at: null,
    last_applied_lifetime_usd: 0,
    last_today_date: null,
    last_today_usd: 0,
    last_balance_usd: 0,
    last_lifetime_usd: 0,
    last_device_count: 0,
    last_email: null,
    last_seen_at: null,
    auto_sync_enabled: true,
    extension_detected: false, // flips true on first READY/PUSH from ext
  };
}

export function getExtensionState() {
  return { ...defaultExtState(), ...(storage.getUnityNetworkExtension() || {}) };
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

function pickNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Apply an extension payload to the Unity Network / Phone Farm tracking.
// Strategy: use `lifetime_usd` (cumulative, monotonic) as the new baseline.
async function applyPayload(payload, { allowAutoConfigure = false } = {}) {
  if (!payload || typeof payload !== "object") {
    return { applied: false, reason: "empty_payload" };
  }

  const lifetime = pickNumber(payload.lifetime_usd, NaN);
  if (!Number.isFinite(lifetime) || lifetime < 0) {
    return { applied: false, reason: "invalid_lifetime" };
  }

  const config = storage.getUnityNetworkConfig();
  const nowIso = new Date().toISOString();

  // Always refresh the snapshot fields so the UI can render today's data
  // even when there's no delta to credit.
  setExtensionState({
    last_today_date: payload.date || null,
    last_today_usd: pickNumber(payload.total_usd),
    last_balance_usd: pickNumber(payload.balance_usd),
    last_lifetime_usd: lifetime,
    last_device_count: pickNumber(payload.device_count),
    last_email: payload.email || null,
    last_seen_at: nowIso,
    extension_detected: true,
  });

  if (!config?.enabled) {
    if (!allowAutoConfigure) {
      return { applied: false, reason: "tracking_disabled" };
    }
    // Bootstrap: enable tracking with the current lifetime as baseline so
    // the very first push doesn't get retroactively credited as one giant
    // earning.
    storage.setUnityNetworkConfig({
      baseline_usd: Number(lifetime.toFixed(6)),
      project_name: "Phone Farm",
      enabled: true,
      last_updated_at: nowIso,
    });
    setExtensionState({
      last_applied_lifetime_usd: lifetime,
      last_applied_synced_at: payload.synced_at || nowIso,
      last_applied_received_at: nowIso,
    });
    return { applied: true, action: "bootstrap", delta_usd: 0, txn: null };
  }

  const ext = getExtensionState();
  const baselineUsd = pickNumber(config.baseline_usd);
  const delta = lifetime - baselineUsd;

  // Already-seen synced_at → idempotent no-op.
  const incomingSyncedAt = payload.synced_at || nowIso;
  if (
    incomingSyncedAt &&
    ext.last_applied_synced_at &&
    incomingSyncedAt <= ext.last_applied_synced_at
  ) {
    return { applied: false, reason: "already_applied" };
  }

  if (Math.abs(delta) < AMOUNT_EPSILON) {
    await applyUnityNetworkBalanceUpdate({
      newBalanceUsd: lifetime,
      action: "no_change",
    });
    setExtensionState({
      last_applied_synced_at: incomingSyncedAt,
      last_applied_received_at: nowIso,
      last_applied_lifetime_usd: lifetime,
    });
    return { applied: true, action: "no_change", delta_usd: 0, txn: null };
  }

  if (delta < 0) {
    console.warn(
      `Unity extension reported lifetime_usd dropping from ${baselineUsd} to ${lifetime}; treating as baseline reset.`,
    );
    await applyUnityNetworkBalanceUpdate({
      newBalanceUsd: lifetime,
      action: "withdrawal",
    });
    setExtensionState({
      last_applied_synced_at: incomingSyncedAt,
      last_applied_received_at: nowIso,
      last_applied_lifetime_usd: lifetime,
    });
    return { applied: true, action: "withdrawal", delta_usd: delta, txn: null };
  }

  const result = await applyUnityNetworkBalanceUpdate({
    newBalanceUsd: lifetime,
    action: "earning",
    label: "Unity Nodes",
  });

  setExtensionState({
    last_applied_synced_at: incomingSyncedAt,
    last_applied_received_at: nowIso,
    last_applied_lifetime_usd: lifetime,
  });

  return {
    applied: true,
    action: result.action,
    delta_usd: result.delta_usd,
    txn: result.txn,
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

// Convenience: returns true when a payload exists for "today" (UTC).
export function hasTodayReading() {
  const ext = getExtensionState();
  if (!ext.last_today_date) return false;
  const todayUtc = new Date().toISOString().split("T")[0];
  return ext.last_today_date === todayUtc;
}

// ────────────────────── postMessage listener (singleton) ──────────────────
// Installed once at app boot from App.js. Re-registering is a no-op.
let listenerInstalled = false;
const subscribers = new Set();

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
        const result = await applyPayload(data.payload, {
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
// tracking is disabled. Returns the apply result via Promise.
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
        const result = await applyPayload(data.payload, { allowAutoConfigure });
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
