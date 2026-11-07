import { useCallback, useEffect, useState } from "react";
import {
  getCurrentMonthKey,
  loadSaladTracker,
} from "@/lib/yieldFarmingAccounting";

export function updateSaladTracker(current, payload, nowIso = new Date().toISOString()) {
  const currentBalance = Number(payload?.currentBalance);
  const lifetimeBalance = Number(payload?.lifetimeBalance);

  if (!Number.isFinite(currentBalance) || !Number.isFinite(lifetimeBalance)) {
    return current;
  }

  const syncedAt = payload?.syncedAt || nowIso;
  const incomingTimestamp = Date.parse(syncedAt);
  const savedTimestamp = Date.parse(current?.lastSyncedAt || "");

  // GET_LATEST and SYNC_NOW may resolve out of order.
  if (
    Number.isFinite(savedTimestamp) &&
    (!Number.isFinite(incomingTimestamp) || incomingTimestamp < savedTimestamp)
  ) {
    return current;
  }

  const incomingDaily =
    payload?.daily && typeof payload.daily === "object"
      ? payload.daily
      : {};
  const daily = { ...(current?.daily || {}) };

  Object.entries(incomingDaily).forEach(([date, amount]) => {
    const value = Number(amount) || 0;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(date)) && value >= 0) {
      daily[date] = value;
    }
  });

  // Preserve the user-verified Oct 29 morning amount while counting only
  // later lifetime-balance increases when dated history is missing.
  const fixedSaladEnd = Date.parse("2026-10-29T09:00:00-07:00");
  const previousLifetime = Number(current?.lastLifetimeBalance);
  const previousSync = Date.parse(current?.lastSyncedAt || "");
  const incomingSync = Date.parse(syncedAt);
  const validNewSync =
    Number.isFinite(incomingSync) &&
    (!Number.isFinite(previousSync) || incomingSync > previousSync);
  const postMorningDelta =
    validNewSync &&
    Number.isFinite(previousSync) &&
    previousSync >= fixedSaladEnd &&
    Number.isFinite(previousLifetime)
      ? Math.max(0, lifetimeBalance - previousLifetime)
      : 0;
  const saladPostMorningEarned = Number((
    Math.max(0, Number(current?.saladPostMorningEarned) || 0) +
    postMorningDelta
  ).toFixed(8));

  const monthlyEarnings = { ...(current?.monthlyEarnings || {}) };
  const exactMonthly = {};

  Object.entries(daily).forEach(([date, amount]) => {
    const monthKey = String(date).slice(0, 7);
    exactMonthly[monthKey] =
      (Number(exactMonthly[monthKey]) || 0) + (Number(amount) || 0);
  });

  Object.entries(exactMonthly).forEach(([monthKey, amount]) => {
    monthlyEarnings[monthKey] = Number(Number(amount).toFixed(6));
  });

  const monthKey = getCurrentMonthKey();
  const previousBaselineMonth = current?.monthBaselineMonth || null;
  const previousBaselineLifetime =
    Number(current?.monthBaselineLifetimeBalance);

  let monthBaselineMonth = previousBaselineMonth;
  let monthBaselineLifetimeBalance =
    Number.isFinite(previousBaselineLifetime)
      ? previousBaselineLifetime
      : null;

  if (
    previousBaselineMonth !== monthKey ||
    !Number.isFinite(monthBaselineLifetimeBalance)
  ) {
    monthBaselineMonth = monthKey;
    monthBaselineLifetimeBalance = lifetimeBalance;
    monthlyEarnings[monthKey] = 0;
  } else {
    monthlyEarnings[monthKey] = Number(
      Math.max(
        0,
        lifetimeBalance - monthBaselineLifetimeBalance
      ).toFixed(6)
    );
  }

  const syncedTimestamp = new Date(syncedAt).getTime();
  const cutoffTimestamp = Number.isFinite(syncedTimestamp)
    ? syncedTimestamp - 48 * 60 * 60 * 1000
    : Date.now() - 48 * 60 * 60 * 1000;

  const earningSnapshots = (
    Array.isArray(current?.earningSnapshots)
      ? current.earningSnapshots
      : []
  )
    .filter(entry => {
      const timestamp = new Date(entry?.syncedAt).getTime();
      return Number.isFinite(timestamp) && timestamp >= cutoffTimestamp;
    })
    .filter(entry => entry?.syncedAt !== syncedAt);

  earningSnapshots.push({
    syncedAt,
    lifetimeBalance: Number(lifetimeBalance.toFixed(8)),
  });
  earningSnapshots.sort(
    (a, b) =>
      new Date(a.syncedAt).getTime() -
      new Date(b.syncedAt).getTime()
  );

  return {
    ...current,
    initialized: true,
    startedMonth: current?.startedMonth || monthKey,
    currentBalance,
    lifetimeBalance,
    lastBalance: currentBalance,
    lastLifetimeBalance: lifetimeBalance,
    monthBaselineMonth,
    monthBaselineLifetimeBalance,
    lastSyncedAt: syncedAt,
    lastWithdrawalAt: null,
    withdrawals: 0,
    monthlyEarnings,
    daily,
    saladPostMorningEarned,
    earningSnapshots: earningSnapshots.slice(-2880),
  };
}

export function useSaladExtension() {
  const [saladTracker, setSaladTracker] = useState(loadSaladTracker);
  const [saladConnected, setSaladConnected] = useState(false);
  const [saladSyncing, setSaladSyncing] = useState(false);
  const [saladMessage, setSaladMessage] = useState("");

  const importSaladPayload = useCallback((payload) => {
    const currentBalance = Number(payload?.currentBalance);
    const lifetimeBalance = Number(payload?.lifetimeBalance);

    if (!Number.isFinite(currentBalance) || !Number.isFinite(lifetimeBalance)) {
      setSaladSyncing(false);
      setSaladMessage("Salad returned an invalid balance payload.");
      return;
    }

    const incomingDaily =
      payload?.daily && typeof payload.daily === "object"
        ? payload.daily
        : {};

    setSaladTracker(current => updateSaladTracker(current, payload));
    setSaladConnected(true);
    setSaladSyncing(false);

    const dayCount = Object.keys(incomingDaily).length;
    setSaladMessage(
      dayCount
        ? `Salad synced ${dayCount} earning day${dayCount === 1 ? "" : "s"}.`
        : "Salad balance synced."
    );
  }, []);

  const syncSaladBalance = useCallback(() => {
    setSaladSyncing(true);
    setSaladMessage("Syncing Salad earnings…");
    window.postMessage(
      { source: "salad-app", type: "SYNC_NOW" },
      window.location.origin
    );
  }, []);

  const requestSaladLatest = useCallback(() => {
    window.postMessage(
      { source: "salad-app", type: "REQUEST_LATEST" },
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
      if (data?.source !== "salad-ext") return;

      if (data.type === "READY") {
        setSaladConnected(true);
        requestSaladLatest();
        return;
      }

      if (
        data.type === "SALAD_PUSH" ||
        data.type === "SALAD_SYNC_RESULT"
      ) {
        setSaladConnected(true);
        if (data.payload) importSaladPayload(data.payload);
        else setSaladSyncing(false);
        return;
      }

      if (
        data.type === "SALAD_ERROR" ||
        data.type === "SALAD_SYNC_ERROR"
      ) {
        setSaladConnected(true);
        setSaladSyncing(false);
        setSaladMessage(
          data.error ||
          "Salad sync failed. Open Salad and make sure you are signed in."
        );
      }
    };

    window.addEventListener("message", handleMessage);

    const firstRequest = window.setTimeout(requestSaladLatest, 500);
    const secondRequest = window.setTimeout(requestSaladLatest, 1500);

    const handleFocus = () => {
      requestSaladLatest();
      syncSaladBalance();
    };

    window.addEventListener("focus", handleFocus);

    const liveSaladTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        syncSaladBalance();
      }
    }, 60000);

    return () => {
      window.clearInterval(liveSaladTimer);
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("focus", handleFocus);
      window.clearTimeout(firstRequest);
      window.clearTimeout(secondRequest);
    };
  }, [importSaladPayload, requestSaladLatest, syncSaladBalance]);

  return {
    saladTracker,
    saladConnected,
    saladSyncing,
    saladMessage,
    syncSaladBalance,
    requestSaladLatest,
  };
}
