// Unity Nodes Chrome-extension → Net Worth bridge.
//
// The companion Chrome extension (Unity Nodes Earnings Tracker, MV3) auto-syncs
// daily at the user's configured time (default 7:30 PM PST) and POSTs a JSON
// payload to our backend inbox at:
//
//     POST {REACT_APP_BACKEND_URL}/api/integrations/unity-network/inbox
//
// We poll GET on that same URL, dedupe by `synced_at`, and credit the delta
// to the same Phone Farm investment project the manual flow uses. Idempotency
// is anchored on the extension's `lifetime_usd` figure (monotonic — only ever
// increases) so withdrawals/swaps never produce phantom earnings.
//
// All state is client-side. The backend holds at most one in-memory payload
// (the most recent push) and forgets it on restart, which is fine — the
// extension will re-push on its next cycle.

import axios from "axios";
import { localStorage as storage } from "./localStorage";
import { applyUnityNetworkBalanceUpdate } from "./unityNetworkSync";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (typeof import.meta !== "undefined" && import.meta?.env?.REACT_APP_BACKEND_URL) ||
  "";

const INBOX_URL = `${BACKEND_URL}/api/integrations/unity-network/inbox`;

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

// Fetch the latest payload from the backend inbox. Returns:
//   { empty: true } when the inbox is empty
//   { empty: false, received_at, today_usd, payload } on hit
//   null on network error (caller decides whether to surface)
export async function fetchInbox({ since = null } = {}) {
  if (!BACKEND_URL) return null;
  try {
    const params = since ? { since } : {};
    const res = await axios.get(INBOX_URL, { params, timeout: 10_000 });
    return res.data;
  } catch (err) {
    // Network/CORS issues are not fatal — we just try again next poll.
    console.warn("Unity inbox fetch failed:", err?.message || err);
    return null;
  }
}

// Manually clear the in-memory inbox on the backend (used by the "Reset"
// affordance + after a successful apply if we want to free the slot). Not
// strictly required — the next push will overwrite anyway.
export async function clearInbox() {
  if (!BACKEND_URL) return false;
  try {
    await axios.delete(INBOX_URL, { timeout: 10_000 });
    return true;
  } catch (err) {
    console.warn("Unity inbox clear failed:", err?.message || err);
    return false;
  }
}

function pickNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Apply an extension payload to the Unity Network / Phone Farm tracking.
//
// Strategy: use `lifetime_usd` (cumulative, monotonic) as the new baseline.
// `applyUnityNetworkBalanceUpdate` already handles the delta math, transaction
// posting, and project.earned bumping. If the delta is below the
// sub-cent tolerance, it short-circuits to a no-op.
//
// Returns:
//   { applied: true, action, delta_usd, txn } on success
//   { applied: false, reason } when nothing to do (already up to date / no config)
async function applyPayload(envelope, { allowAutoConfigure = false } = {}) {
  const payload = envelope?.payload;
  if (!payload) return { applied: false, reason: "empty_payload" };

  const lifetime = pickNumber(payload.lifetime_usd, NaN);
  if (!Number.isFinite(lifetime) || lifetime < 0) {
    return { applied: false, reason: "invalid_lifetime" };
  }

  const config = storage.getUnityNetworkConfig();
  if (!config?.enabled) {
    if (!allowAutoConfigure) {
      // Stash the latest snapshot so the card can preview today's earnings
      // even if Unity Network tracking isn't enabled yet.
      setExtensionState({
        last_today_date: payload.date || null,
        last_today_usd: pickNumber(payload.total_usd),
        last_balance_usd: pickNumber(payload.balance_usd),
        last_lifetime_usd: lifetime,
        last_device_count: pickNumber(payload.device_count),
        last_email: payload.email || null,
        last_seen_at: new Date().toISOString(),
      });
      return { applied: false, reason: "tracking_disabled" };
    }
    // Bootstrap: enable tracking with the current lifetime as baseline so
    // the very first push doesn't get retroactively credited as one giant
    // earning.
    storage.setUnityNetworkConfig({
      baseline_usd: Number(lifetime.toFixed(6)),
      project_name: "Phone Farm",
      enabled: true,
      last_updated_at: new Date().toISOString(),
    });
    setExtensionState({
      last_applied_lifetime_usd: lifetime,
      last_applied_synced_at: payload.synced_at || envelope.received_at || null,
      last_applied_received_at: envelope.received_at || null,
      last_today_date: payload.date || null,
      last_today_usd: pickNumber(payload.total_usd),
      last_balance_usd: pickNumber(payload.balance_usd),
      last_lifetime_usd: lifetime,
      last_device_count: pickNumber(payload.device_count),
      last_email: payload.email || null,
      last_seen_at: new Date().toISOString(),
    });
    return { applied: true, action: "bootstrap", delta_usd: 0, txn: null };
  }

  const ext = getExtensionState();
  const baselineUsd = pickNumber(config.baseline_usd);
  const delta = lifetime - baselineUsd;

  // Always refresh the snapshot fields so the UI can render today's data
  // even when there's no delta to credit.
  setExtensionState({
    last_today_date: payload.date || null,
    last_today_usd: pickNumber(payload.total_usd),
    last_balance_usd: pickNumber(payload.balance_usd),
    last_lifetime_usd: lifetime,
    last_device_count: pickNumber(payload.device_count),
    last_email: payload.email || null,
    last_seen_at: new Date().toISOString(),
  });

  // Already-seen synced_at → idempotent no-op even if backend re-served it.
  const incomingSyncedAt = payload.synced_at || envelope.received_at || null;
  if (
    incomingSyncedAt &&
    ext.last_applied_synced_at &&
    incomingSyncedAt <= ext.last_applied_synced_at
  ) {
    return { applied: false, reason: "already_applied" };
  }

  if (Math.abs(delta) < AMOUNT_EPSILON) {
    // Bump the last_updated_at + extension trackers so the stale badge resets.
    await applyUnityNetworkBalanceUpdate({
      newBalanceUsd: lifetime,
      action: "no_change",
    });
    setExtensionState({
      last_applied_synced_at: incomingSyncedAt,
      last_applied_received_at: envelope.received_at || null,
      last_applied_lifetime_usd: lifetime,
    });
    return { applied: true, action: "no_change", delta_usd: 0, txn: null };
  }

  if (delta < 0) {
    // Lifetime went down — Unity Nodes lifetime is monotonic so this is
    // surprising. Treat as a withdrawal-style baseline reset (no earnings
    // credited) and log a warning.
    console.warn(
      `Unity extension reported lifetime_usd dropping from ${baselineUsd} to ${lifetime}; treating as baseline reset.`,
    );
    await applyUnityNetworkBalanceUpdate({
      newBalanceUsd: lifetime,
      action: "withdrawal",
    });
    setExtensionState({
      last_applied_synced_at: incomingSyncedAt,
      last_applied_received_at: envelope.received_at || null,
      last_applied_lifetime_usd: lifetime,
    });
    return { applied: true, action: "withdrawal", delta_usd: delta, txn: null };
  }

  // Positive delta — credit it as an earning on Phone Farm.
  const result = await applyUnityNetworkBalanceUpdate({
    newBalanceUsd: lifetime,
    action: "earning",
    label: "Unity Nodes",
  });

  setExtensionState({
    last_applied_synced_at: incomingSyncedAt,
    last_applied_received_at: envelope.received_at || null,
    last_applied_lifetime_usd: lifetime,
  });

  return {
    applied: true,
    action: result.action,
    delta_usd: result.delta_usd,
    txn: result.txn,
  };
}

// Public entrypoint — fetch the inbox and apply if there's a new push. Safe
// to call repeatedly; no-op when nothing has changed since the last apply.
export async function pollAndApplyExtension({ allowAutoConfigure = false, force = false } = {}) {
  const ext = getExtensionState();
  const since = force ? null : ext.last_applied_synced_at;
  const envelope = await fetchInbox({ since });
  if (!envelope) return { ok: false, reason: "fetch_failed" };
  if (envelope.empty) {
    setExtensionState({ last_seen_at: new Date().toISOString() });
    return { ok: true, applied: false, reason: "empty" };
  }
  const result = await applyPayload(envelope, { allowAutoConfigure });
  return { ok: true, ...result, payload: envelope.payload };
}

// Convenience: returns true when a payload exists for "today" (UTC) — used by
// the card to decide whether to show the "Today's earnings" tile.
export function hasTodayReading() {
  const ext = getExtensionState();
  if (!ext.last_today_date) return false;
  const todayUtc = new Date().toISOString().split("T")[0];
  return ext.last_today_date === todayUtc;
}
