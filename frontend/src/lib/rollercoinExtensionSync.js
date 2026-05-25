// RollerCoin Chrome-extension → Dashboard bridge.
//
// Protocol:
//   ext → app: { source: "rollercoin-ext", type: "ROLLERCOIN_PUSH", payload: {...} }
//   ext → app: { source: "rollercoin-ext", type: "READY" }
//   app → ext: { source: "rollercoin-app", type: "REQUEST_LATEST" }

import { applyRollerCoinBalanceUpdate } from "./rollercoinSync";
import { localStorage as storage } from "./localStorage";

const EXT_SOURCE = "rollercoin-ext";
const APP_SOURCE = "rollercoin-app";
const MSG_PUSH = "ROLLERCOIN_PUSH";
const MSG_READY = "READY";
const MSG_REQUEST = "REQUEST_LATEST";
const MSG_POWER_PUSH = "ROLLERCOIN_POWER_PUSH";

const STORAGE_KEY = "rollercoin:extension-state";
const AMOUNT_EPSILON = 0.00001;

function defaultState() {
  return {
    extension_detected: false,
    last_seen_at: null,
    last_synced_at: null,
    last_applied_synced_at: null,
    last_applied_received_at: null,
    last_payload: null,
    total_trx: 0,
    today_trx: 0,
    balance_trx: 0,
    auto_sync_enabled: true,
  };
}

function pickNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function getRollerCoinExtensionState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : {};
    return { ...defaultState(), ...(stored || {}) };
  } catch {
    return defaultState();
  }
}

export function setRollerCoinExtensionState(patch) {
  const next = {
    ...getRollerCoinExtensionState(),
    ...(patch || {}),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

  window.dispatchEvent(
    new CustomEvent("rollercoin-extension-update", {
      detail: next,
    })
  );

  return next;
}

export function setRollerCoinAutoSyncEnabled(enabled) {
  return setRollerCoinExtensionState({
    auto_sync_enabled: !!enabled,
  });
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object") return null;

  return {
    ...payload,
    total_trx: pickNumber(
      payload.total_trx ??
        payload.totalTrx ??
        payload.total_income_trx ??
        payload.totalIncomeTrx
    ),
    today_trx: pickNumber(
      payload.today_trx ??
        payload.todayTrx ??
        payload.today_income_trx ??
        payload.todayIncomeTrx
    ),
    balance_trx: pickNumber(
      payload.balance_trx ??
        payload.balanceTrx ??
        payload.balance
    ),
    synced_at:
      payload.synced_at ||
      payload.syncedAt ||
      new Date().toISOString(),
  };
}

async function applyPayload(payload) {
  console.log("[RC APP] applyPayload raw payload", payload);

  const normalized = normalizePayload(payload);

  console.log("[RC APP] applyPayload normalized", normalized);

  if (!normalized) {
    return {
      applied: false,
      reason: "empty_payload",
    };
  }

  const state = getRollerCoinExtensionState();
  const nowIso = new Date().toISOString();
  const incomingSyncedAt = normalized.synced_at;

  setRollerCoinExtensionState({
    extension_detected: true,
    last_seen_at: nowIso,
    last_synced_at: incomingSyncedAt,
    last_payload: normalized,
    total_trx: normalized.total_trx,
    today_trx: normalized.today_trx,
    balance_trx: normalized.balance_trx,
  });

  if (
    state.last_applied_synced_at &&
    incomingSyncedAt <= state.last_applied_synced_at
  ) {
    console.warn("[RC APP] already applied payload", {
      incomingSyncedAt,
      last_applied_synced_at: state.last_applied_synced_at,
    });

    return {
      applied: false,
      reason: "already_applied",
      payload: normalized,
    };
  }

  const config = storage.getRollerCoinConfig?.();

  console.log("[RC APP] RollerCoin config", config);

  if (!config?.enabled) {
    console.warn("[RC APP] tracking disabled");

    return {
      applied: false,
      reason: "tracking_disabled",
      payload: normalized,
    };
  }

  const baseline = Number(config.baseline_trx) || 0;
  const nextBalance = Number(normalized.total_trx) || 0;
  const delta = nextBalance - baseline;

  let action = "no_change";

  if (Math.abs(delta) < AMOUNT_EPSILON) {
    action = "no_change";
  } else if (delta > 0) {
    action = "earning";
  } else {
    action = "withdrawal";
  }

  console.log("[RC APP] applying balance update", {
    baseline,
    nextBalance,
    delta,
    action,
  });

  const result = await applyRollerCoinBalanceUpdate({
    newBalance: nextBalance,
    action,
    label: "RollerCoin",
  });

  console.log("[RC APP] applyRollerCoinBalanceUpdate result", result);

  setRollerCoinExtensionState({
    last_applied_synced_at: incomingSyncedAt,
    last_applied_received_at: nowIso,
  });

  return {
    applied: true,
    action: result.action,
    delta_trx: result.delta_trx,
    delta_usd: result.delta_usd,
    payload: normalized,
    txn: result.txn || null,
  };
}

export function requestLatestRollerCoinFromExtension() {
  try {
    console.log("[RC APP] Sending REQUEST_LATEST");

    window.postMessage(
      {
        source: APP_SOURCE,
        type: MSG_REQUEST,
      },
      window.location.origin
    );

    return true;
  } catch (err) {
    console.warn("[RC APP] requestLatestRollerCoinFromExtension failed:", err);
    return false;
  }
}

let listenerInstalled = false;
const subscribers = new Set();

let applyChain = Promise.resolve();

function enqueueApply(payload) {
  console.log("[RC APP] enqueueApply", payload);

  applyChain = applyChain
    .catch((err) => {
      console.warn("[RC APP] previous apply failed", err);
      return null;
    })
    .then(() => applyPayload(payload));

  return applyChain;
}

export function onRollerCoinExtensionApply(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function notifySubscribers(result, payload) {
  console.log("[RC APP] notifySubscribers", { result, payload });

  for (const cb of subscribers) {
    try {
      cb(result, payload);
    } catch (err) {
      console.warn("[RC APP] RollerCoin subscriber threw:", err);
    }
  }
}

export function installRollerCoinExtensionListener() {
  if (listenerInstalled) {
    console.log("[RC APP] listener already installed");
    return;
  }

  listenerInstalled = true;
  console.log("[RC APP] installing RollerCoin extension listener");

  const onMessage = async (event) => {
    const data = event?.data;

if (data?.source === EXT_SOURCE || data?.source === APP_SOURCE) {
  console.log("[RC APP] message received", {
    origin: event.origin,
    data,
  });
}

    if (event.origin !== window.location.origin) return;
    if (!data || typeof data !== "object") return;
    if (data.source !== EXT_SOURCE) return;

    if (data.type === MSG_READY) {
      console.log("[RC APP] READY received");

      setRollerCoinExtensionState({
        extension_detected: true,
        last_seen_at: new Date().toISOString(),
      });

      requestLatestRollerCoinFromExtension();
      return;
    }

if (data.type === MSG_POWER_PUSH) {
  console.log("[RC APP] POWER PUSH received", data.payload);

  const current = getRollerCoinExtensionState();

  setRollerCoinExtensionState({
    ...current,
    power_payload: data.payload,
    power_last_seen_at: new Date().toISOString(),
  });

  window.dispatchEvent(
    new CustomEvent("rollercoin-power-update", {
      detail: data.payload,
    })
  );

  return;
}

if (data.type === MSG_PUSH) {
  console.log("[RC APP] PUSH received", data.payload);

  try {
    const state = getRollerCoinExtensionState();

    if (state.auto_sync_enabled === false) {
      console.warn("[RC APP] auto sync off");

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
    console.warn("[RC APP] Failed to apply RollerCoin extension push:", err);

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

export function syncRollerCoinFromExtensionNow({ timeoutMs = 4000 } = {}) {
  console.log("[RC APP] syncRollerCoinFromExtensionNow start");

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) return;

      settled = true;
      window.removeEventListener("message", handler);
      clearTimeout(timer);

      console.log("[RC APP] syncRollerCoinFromExtensionNow finish", result);

      resolve(result);
    };

    const handler = async (event) => {
      const data = event?.data;

      console.log("[RC APP] sync handler received", {
        origin: event.origin,
        sameOrigin: event.origin === window.location.origin,
        data,
      });

      if (event.origin !== window.location.origin) return;

      if (!data || data.source !== EXT_SOURCE || data.type !== MSG_PUSH) {
        return;
      }

      try {
        const state = getRollerCoinExtensionState();

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

    const timer = setTimeout(() => {
      console.warn("[RC APP] sync timed out");

      finish({
        ok: false,
        reason: "timeout",
      });
    }, Math.max(500, timeoutMs));

    window.addEventListener("message", handler);
    requestLatestRollerCoinFromExtension();
  });
}