// Kryptex Desktop Chrome-extension → Net Worth bridge.
//
// Why this exists: the deployed site (HTTPS, hosted remotely) can never
// reach the user's own PC's 127.0.0.1:8107 Kryptex service directly — a
// remote backend can't route to someone's home machine, and even a direct
// browser fetch would be blocked by CORS + mixed-content rules. The
// companion extension's background script has host_permissions for
// 127.0.0.1:8107 (which bypasses page-level CORS/mixed-content entirely),
// polls it locally, and pushes the summary into the page via
// window.postMessage — same approach already used for RollerCoin/Unity Nodes.
//
// Protocol:
//   ext → app: { source: "kryptex-tracker-ext", type: "KRYPTEX_PUSH", payload: <status> }
//   ext → app: { source: "kryptex-tracker-ext", type: "READY" }
//   app → ext: { source: "kryptex-tracker-app", type: "REQUEST_LATEST" }
import { reconcileKryptexStatus } from "./kryptexSync";
import { localStorage as storage } from "./localStorage";

const EXT_SOURCE = "kryptex-tracker-ext";
const APP_SOURCE = "kryptex-tracker-app";
const MSG_PUSH = "KRYPTEX_PUSH";
const MSG_READY = "READY";
const MSG_REQUEST = "REQUEST_LATEST";

function defaultState() {
  return {
    extension_detected: false,
    last_seen_at: null,
    last_payload: null,
    last_applied_synced_at: null,
    last_applied_received_at: null,
    auto_sync_enabled: true,
  };
}

export function getKryptexExtensionState() {
  return { ...defaultState(), ...(storage.getKryptexExtension() || {}) };
}

export function setKryptexExtensionState(patch) {
  const next = { ...getKryptexExtensionState(), ...(patch || {}) };
  storage.setKryptexExtension(next);
  window.dispatchEvent(new CustomEvent("kryptex-extension-update"));
  return next;
}

export function requestLatestKryptexFromExtension() {
  try {
    window.postMessage({ source: APP_SOURCE, type: MSG_REQUEST }, window.location.origin);
    return true;
  } catch {
    return false;
  }
}

let applyChain = Promise.resolve();

function enqueueApply(payload) {
  applyChain = applyChain.catch(() => null).then(() => applyKryptexExtensionPayload(payload));
  return applyChain;
}

export async function applyKryptexExtensionPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { applied: false, reason: "empty_payload" };
  }

  const syncedAt = payload.synced_at || new Date().toISOString();
  const state = getKryptexExtensionState();

  setKryptexExtensionState({
    extension_detected: true,
    last_seen_at: new Date().toISOString(),
    last_payload: payload,
  });

  if (state.last_applied_synced_at && syncedAt <= state.last_applied_synced_at) {
    return { applied: false, reason: "already_applied" };
  }

  const config = storage.getKryptexConfig();
  if (!config?.enabled) {
    return { applied: false, reason: "tracking_disabled" };
  }
  if (state.auto_sync_enabled === false) {
    return { applied: false, reason: "auto_sync_off" };
  }

  try {
    const result = await reconcileKryptexStatus(payload.status);
    setKryptexExtensionState({
      last_applied_synced_at: syncedAt,
      last_applied_received_at: new Date().toISOString(),
    });
    return { applied: true, ...result };
  } catch (error) {
    return { applied: false, reason: "exception", error: error?.message };
  }
}

let listenerInstalled = false;

export function installKryptexExtensionListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;

  window.addEventListener("message", async (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event?.data;
    if (!data || data.source !== EXT_SOURCE) return;

    if (data.type === MSG_READY) {
      setKryptexExtensionState({ extension_detected: true, last_seen_at: new Date().toISOString() });
      requestLatestKryptexFromExtension();
      return;
    }

    if (data.type === MSG_PUSH) {
      await enqueueApply(data.payload);
    }
  });
}

export function syncKryptexFromExtensionNow({ timeoutMs = 4000 } = {}) {
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
      const result = await enqueueApply(data.payload);
      finish({ ok: result.applied !== false, ...result });
    };

    window.addEventListener("message", handler);
    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);
    requestLatestKryptexFromExtension();
  });
}
