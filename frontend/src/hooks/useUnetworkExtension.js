import { useCallback, useEffect, useState } from "react";
import {
  getCurrentMonthKey,
  getTodayKey,
  loadUnetworkTracker,
} from "@/lib/yieldFarmingAccounting";

function payloadSyncedAt(payload, fallback = new Date().toISOString()) {
  return payload?.synced_at || payload?.syncedAt || fallback;
}

export function getUnetworkBalance(payload) {
  const rawMicros = Number(
    payload?.balance_micros ?? payload?.balanceMicros
  );
  const explicitUsd = Number(
    payload?.balance_usd ?? payload?.balanceUsd
  );
  const availableBalance = Number.isFinite(explicitUsd)
    ? explicitUsd
    : Number.isFinite(rawMicros)
      ? rawMicros / 1_000_000
      : NaN;

  const pendingRawMicros = Number(
    payload?.pending_balance_micros ??
      payload?.pendingBalanceMicros ??
      payload?.pending_micros ??
      payload?.pendingMicros
  );
  const pendingExplicitUsd = Number(
    payload?.pending_balance_usd ??
      payload?.pendingBalanceUsd ??
      payload?.pending_usd ??
      payload?.pendingUsd
  );
  const pendingBalance = Number.isFinite(pendingExplicitUsd)
    ? Math.max(0, pendingExplicitUsd)
    : Number.isFinite(pendingRawMicros)
      ? Math.max(0, pendingRawMicros / 1_000_000)
      : 0;

  return {
    availableBalance,
    pendingBalance,
    currentBalance: Number.isFinite(availableBalance)
      ? availableBalance + pendingBalance
      : NaN,
  };
}

export function updateUnetworkTracker(
  current,
  payload,
  fallbackIso = new Date().toISOString()
) {
  const {
    availableBalance,
    pendingBalance,
    currentBalance,
  } = getUnetworkBalance(payload);

  if (!Number.isFinite(currentBalance) || currentBalance < 0) {
    return current;
  }

  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const nextDaily = { ...(current?.daily || {}) };
  const incomingRowsLifetimeUsd = rows.reduce(
    (sum, row) => sum + (Number(row?.usd) || 0),
    0
  );
  const currentMonth = getCurrentMonthKey();
  const incomingOpeningMonthRowsUsd = rows.reduce(
    (sum, row) =>
      String(row?.date || "").slice(0, 7) === currentMonth
        ? sum + (Number(row?.usd) || 0)
        : sum,
    0
  );

  const needsBaseline = !Boolean(current?.baselineInitialized);
  const openingEarnedUsd = needsBaseline
    ? currentBalance
    : Number(current?.openingEarnedUsd) || 0;
  const allocationsBaselineUsd = needsBaseline
    ? incomingRowsLifetimeUsd
    : Number(current?.allocationsBaselineUsd) || 0;
  const openingMonth = needsBaseline
    ? currentMonth
    : current?.openingMonth || currentMonth;
  const openingMonthRowsBaselineUsd = needsBaseline
    ? incomingOpeningMonthRowsUsd
    : Number(current?.openingMonthRowsBaselineUsd) || 0;

  if (rows.length) {
    rows.forEach(row => {
      const date = String(row?.date || "").slice(0, 10);
      const usd = Number(row?.usd);

      if (!date || !Number.isFinite(usd) || usd < 0) return;

      const previousEntry = nextDaily[date];
      const previousUsd =
        typeof previousEntry === "number"
          ? Number(previousEntry) || 0
          : Number(previousEntry?.usd) || 0;

      // Allocation history may be incomplete on later syncs.
      if (usd < previousUsd) return;

      nextDaily[date] = {
        usd,
        micros: Math.max(
          Number(previousEntry?.micros) || 0,
          Number(row?.micros) || 0
        ),
        count: Math.max(
          Number(previousEntry?.count) || 0,
          Number(row?.count) || 0
        ),
        syncedAt: payloadSyncedAt(payload, fallbackIso),
      };
    });
  } else {
    const previousBalance = Number(current?.lastBalance) || 0;
    const initialized = Boolean(current?.initialized);
    const balanceHighWater = initialized
      ? Math.max(
          Number(current?.balanceHighWater) || 0,
          previousBalance
        )
      : currentBalance;
    const positiveDelta = initialized
      ? Math.max(0, currentBalance - balanceHighWater)
      : 0;

    if (positiveDelta > 0) {
      const observedAt = new Date(
        payload?.synced_at || payload?.syncedAt || Date.now()
      );
      const today = Number.isNaN(observedAt.getTime())
        ? getTodayKey()
        : new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Los_Angeles",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(observedAt);

      const previousEntry = nextDaily[today];
      const previousUsd =
        typeof previousEntry === "number"
          ? Number(previousEntry) || 0
          : Number(previousEntry?.usd) || 0;

      nextDaily[today] = {
        usd: Number((previousUsd + positiveDelta).toFixed(8)),
        micros: 0,
        count: 0,
        syncedAt: payloadSyncedAt(payload, fallbackIso),
      };
    }
  }

  const previousBalance = Number(current?.lastBalance) || 0;
  const withdrawal =
    current?.initialized && currentBalance < previousBalance
      ? previousBalance - currentBalance
      : 0;

  return {
    ...current,
    initialized: true,
    baselineInitialized: true,
    openingEarnedUsd,
    allocationsBaselineUsd,
    openingMonth,
    openingMonthRowsBaselineUsd,
    currentBalance,
    availableBalance: Number.isFinite(availableBalance)
      ? availableBalance
      : 0,
    pendingBalance,
    lastBalance: currentBalance,
    balanceHighWater: Math.max(
      Number(current?.balanceHighWater) || 0,
      Number(current?.lastBalance) || 0,
      currentBalance
    ),
    withdrawals: (Number(current?.withdrawals) || 0) + withdrawal,
    daily: nextDaily,
    lastSyncedAt: payloadSyncedAt(payload, fallbackIso),
  };
}

export function useUnetworkExtension() {
  const [unetworkTracker, setUnetworkTracker] = useState(loadUnetworkTracker);
  const [unetworkConnected, setUnetworkConnected] = useState(false);
  const [unetworkSyncing, setUnetworkSyncing] = useState(false);
  const [unetworkMessage, setUnetworkMessage] = useState("");

  const importUnetworkPayload = useCallback(payload => {
    if (!payload) return;

    const { currentBalance } = getUnetworkBalance(payload);
    if (!Number.isFinite(currentBalance) || currentBalance < 0) {
      setUnetworkSyncing(false);
      setUnetworkMessage("Unetwork returned an invalid balance.");
      return;
    }

    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    setUnetworkTracker(current => updateUnetworkTracker(current, payload));
    setUnetworkConnected(true);
    setUnetworkSyncing(false);
    setUnetworkMessage(
      rows.length
        ? `Synced ${rows.length} Unetwork earning day${rows.length === 1 ? "" : "s"}.`
        : "Unetwork balance synced."
    );
  }, []);

  const requestUnetworkLatest = useCallback(() => {
    window.postMessage(
      { source: "unetwork-app", type: "REQUEST_LATEST" },
      window.location.origin
    );
    window.postMessage(
      { source: "unetwork-app", type: "REQUEST_STATUS" },
      window.location.origin
    );
  }, []);

  const syncUnetworkBalance = useCallback(() => {
    setUnetworkSyncing(true);
    setUnetworkMessage("Syncing Unetwork earnings…");
    window.postMessage(
      { source: "unetwork-app", type: "SYNC_NOW" },
      window.location.origin
    );
  }, []);

  useEffect(() => {
    const handleMessage = event => {
      if (
        event.origin !== window.location.origin ||
        event.source !== window
      ) {
        return;
      }

      const data = event.data;
      if (data?.source !== "unetwork-ext") return;

      if (data.type === "READY") {
        setUnetworkConnected(true);
        requestUnetworkLatest();
        return;
      }

      if (data.type === "UNETWORK_STATUS") {
        setUnetworkConnected(Boolean(
          data.payload?.unetworkOpen || data.payload?.lastPayload
        ));
        if (data.payload?.lastPayload) {
          importUnetworkPayload(data.payload.lastPayload);
        }
        return;
      }

      if (
        data.type === "UNETWORK_PUSH" ||
        data.type === "UNETWORK_SYNC_RESULT"
      ) {
        setUnetworkConnected(true);
        if (data.payload) importUnetworkPayload(data.payload);
        else setUnetworkSyncing(false);
        return;
      }

      if (
        data.type === "UNETWORK_SYNC_ERROR" ||
        data.type === "UNETWORK_ERROR"
      ) {
        setUnetworkConnected(true);
        setUnetworkSyncing(false);
        setUnetworkMessage(
          data.error ||
          "Unetwork sync failed. Open Unetwork and make sure you are signed in."
        );
      }
    };

    window.addEventListener("message", handleMessage);
    const firstRequest = window.setTimeout(requestUnetworkLatest, 500);
    const secondRequest = window.setTimeout(requestUnetworkLatest, 1500);
    const handleFocus = () => requestUnetworkLatest();
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("focus", handleFocus);
      window.clearTimeout(firstRequest);
      window.clearTimeout(secondRequest);
    };
  }, [importUnetworkPayload, requestUnetworkLatest]);

  return {
    unetworkTracker,
    unetworkConnected,
    unetworkSyncing,
    unetworkMessage,
    syncUnetworkBalance,
  };
}
