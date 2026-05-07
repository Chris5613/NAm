import { applyAcurastBalanceUpdate } from "./acurastSync";
import { localStorage as storage } from "./localStorage";

const EXT_SOURCE = "acurast-ext";
const APP_SOURCE = "acurast-app";
const MSG_PUSH = "ACURAST_PUSH";
const MSG_READY = "READY";
const MSG_REQUEST = "REQUEST_LATEST";

const STORAGE_KEY = "acurast:extension-state";
const AMOUNT_EPSILON = 0.000001;

function defaultState() {
  return {
    extension_detected: false,
    last_seen_at: null,
    last_synced_at: null,
    last_applied_synced_at: null,
    last_applied_received_at: null,
    last_payload: null,

    balance_acu: 0,
    auto_sync_enabled: true,
  };
}

function pickNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object") return null;

  return {
    ...payload,
    balance_acu: pickNumber(payload.balance_acu ?? payload.balanceAcu ?? payload.balance),
    synced_at: payload.synced_at || payload.syncedAt || new Date().toISOString(),
  };
}

export function getAcurastExtensionState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : {};
    return { ...defaultState(), ...(stored || {}) };
  } catch {
    return defaultState();
  }
}

export function setAcurastExtensionState(patch) {
  const next = {
    ...getAcurastExtensionState(),
    ...(patch || {}),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

  window.dispatchEvent(
    new CustomEvent("acurast-extension-update", {
      detail: next,
    })
  );

  return next;
}

export function setAcurastAutoSyncEnabled(enabled) {
  return setAcurastExtensionState({
    auto_sync_enabled: !!enabled,
  });
}

async function applyPayload(payload) {
  console.log("[ACU APP] applyPayload raw", payload);

  const normalized = normalizePayload(payload);

  console.log("[ACU APP] applyPayload normalized", normalized);

  if (!normalized) {
    return {
      applied: false,
      reason: "empty_payload",
    };
  }

  const state = getAcurastExtensionState();
  const nowIso = new Date().toISOString();
  const incomingSyncedAt = normalized.synced_at;

  setAcurastExtensionState({
    extension_detected: true,
    last_seen_at: nowIso,
    last_synced_at: incomingSyncedAt,
    last_payload: normalized,
    balance_acu: normalized.balance_acu,
  });

  if (
    state.last_applied_synced_at &&
    incomingSyncedAt <= state.last_applied_synced_at
  ) {
    return {
      applied: false,
      reason: "already_applied",
      payload: normalized,
    };
  }

  const config = storage.getAcurastConfig?.();

  if (!config?.enabled) {
    return {
      applied: false,
      reason: "tracking_disabled",
      payload: normalized,
    };
  }

  const baseline = Number(config.baseline_acu) || 0;
  const nextBalance = Number(normalized.balance_acu) || 0;
  const delta = nextBalance - baseline;

  let action = "no_change";

  if (Math.abs(delta) < AMOUNT_EPSILON) {
    action = "no_change";
  } else if (delta > 0) {
    action = "earning";
  } else {
    action = "withdrawal";
  }

  const result = await applyAcurastBalanceUpdate({
    newBalance: nextBalance,
    action,
    label: "Acurast",
  });

  setAcurastExtensionState({
    last_applied_synced_at: incomingSyncedAt,
    last_applied_received_at: nowIso,
  });

  return {
    applied: true,
    action: result.action,
    delta_acu: result.delta_acu,
    delta_usd: result.delta_usd,
    payload: normalized,
    txn: result.txn || null,
  };
}

export function requestLatestAcurastFromExtension() {
  try {
    console.log("[ACU APP] Sending REQUEST_LATEST");

    window.postMessage(
      {
        source: APP_SOURCE,
        type: MSG_REQUEST,
      },
      window.location.origin
    );

    return true;
  } catch (err) {
    console.warn("[ACU APP] request failed", err);
    return false;
  }
}

let listenerInstalled = false;
const subscribers = new Set();
let applyChain = Promise.resolve();

function enqueueApply(payload) {
  applyChain = applyChain
    .catch(() => null)
    .then(() => applyPayload(payload));

  return applyChain;
}

export function onAcurastExtensionApply(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function notifySubscribers(result, payload) {
  for (const cb of subscribers) {
    try {
      cb(result, payload);
    } catch (err) {
      console.warn("[ACU APP] subscriber threw", err);
    }
  }
}

export function installAcurastExtensionListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;

  const onMessage = async (event) => {
    const data = event?.data;

    if (event.origin !== window.location.origin) return;
    if (!data || typeof data !== "object") return;
    if (data.source !== EXT_SOURCE) return;

    if (data.type === MSG_READY) {
      console.log("[ACU APP] READY received");

      setAcurastExtensionState({
        extension_detected: true,
        last_seen_at: new Date().toISOString(),
      });

      requestLatestAcurastFromExtension();
      return;
    }

    if (data.type === MSG_PUSH) {
      console.log("[ACU APP] PUSH received", data.payload);

      try {
        const state = getAcurastExtensionState();

        if (state.auto_sync_enabled === false) {
          notifySubscribers(
            {
              applied: false,
              reason: "auto_sync_off",
            },
            data.payload
          );
          return;
        }

        const result = await enqueueApply(data.payload);
        notifySubscribers(result, data.payload);
      } catch (err) {
        notifySubscribers(
          {
            applied: false,
            reason: "exception",
            error: err?.message,
          },
          data.payload
        );
      }
    }
  };

  window.addEventListener("message", onMessage);
}

export function syncAcurastFromExtensionNow({ timeoutMs = 4000 } = {}) {
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
      const data = event?.data;

      if (event.origin !== window.location.origin) return;
      if (!data || data.source !== EXT_SOURCE || data.type !== MSG_PUSH) return;

      try {
        const state = getAcurastExtensionState();

        if (state.auto_sync_enabled === false) {
          finish({
            ok: false,
            reason: "auto_sync_off",
            payload: data.payload,
          });
          return;
        }

        const result = await enqueueApply(data.payload);

        finish({
          ok: true,
          ...result,
        });
      } catch (err) {
        finish({
          ok: false,
          reason: "exception",
          error: err?.message,
        });
      }
    };

    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          reason: "timeout",
        }),
      Math.max(500, timeoutMs)
    );

    window.addEventListener("message", handler);
    requestLatestAcurastFromExtension();
  });
}