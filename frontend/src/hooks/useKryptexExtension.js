import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { kryptexIncrease } from "@/lib/kryptexEarnings";
import {
  recordKryptexDailyBalance,
} from "@/lib/kryptexDailyBalance";
import {
  getCurrentMonthKey,
  getKryptexOpeningBalanceUsd,
  getTodayKey,
  loadKryptexTracker,
  readObject,
} from "@/lib/yieldFarmingAccounting";

export function kryptexStatusMessage(payload) {
  const day = getTodayKey();
  if (Object.prototype.hasOwnProperty.call(
    payload?.earnings?.daily_usd || {},
    day
  )) {
    return "Kryptex earnings chart synced.";
  }
  if (Object.prototype.hasOwnProperty.call(
    payload?.earnings?.daily_sats || {},
    day
  )) {
    return "Kryptex sats captured; waiting for a BTC price.";
  }
  if (payload?.chart_scan?.series_count === 0) {
    return "Kryptex chart is visible, but its earnings data was not recognized.";
  }
  return "Open Kryptex's Satoshi earnings chart to sync today's income.";
}

export function updateKryptexTracker(current, payload, nowIso = new Date().toISOString()) {
  const status = payload?.status || {};
  const hasBalance = status?.balance_usd != null;
  const currentBalance = Number(
    hasBalance ? status.balance_usd : loadKryptexTracker()?.lastBalance
  );

  if (!Number.isFinite(currentBalance) || currentBalance < 0) {
    return current;
  }

  const syncedAt = payload?.synced_at || nowIso;
  const profitabilityUsdDay = Number(status?.profitability_usd_day) || 0;
  const withdrawableUsd = Number(status?.withdrawable_usd) || 0;
  const miners = Array.isArray(status?.miners) ? status.miners : [];

  const previousBalance = Number(current?.lastBalance);
  const baselineBalance = Number.isFinite(previousBalance)
    ? previousBalance
    : getKryptexOpeningBalanceUsd();

  const { peak: peakBalance } =
    kryptexIncrease(currentBalance, baselineBalance, current?.peakBalance);

  const day = getTodayKey();
  const recordedToday =
    Number(
      readObject("yield_daily_earnings_by_source_v2")
        ?.days?.[day]?.sources?.Kryptex
    ) || 0;
  const dailyBalanceDays = recordKryptexDailyBalance(
    current,
    currentBalance,
    day,
    recordedToday
  );

  const monthKey = getCurrentMonthKey();
  const monthlyEarnings = {
    ...(current?.monthlyEarnings || {
      "2026-09": getKryptexOpeningBalanceUsd(),
    }),
  };

  const existingMonth =
    Number(monthlyEarnings[monthKey]) ||
    (monthKey === "2026-09" ? getKryptexOpeningBalanceUsd() : 0);

  const kryptexMiningDaily = {
    ...(current?.kryptexMiningDaily || {}),
  };
  const confirmedDays = {
    ...(current?.kryptexConfirmedDays || {}),
  };
  const confirmedChartDays = payload?.earnings?.daily_usd || {};

  for (const [entryDay, value] of Object.entries(confirmedChartDays)) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(entryDay) ||
      entryDay < "2026-11-01" ||
      entryDay > day
    ) {
      continue;
    }

    const confirmedUsd = Number(value);
    if (!Number.isFinite(confirmedUsd) || confirmedUsd < 0) continue;

    kryptexMiningDaily[entryDay] = confirmedUsd;
    confirmedDays[entryDay] = true;
  }

  const confirmedMonth = Object.entries(kryptexMiningDaily)
    .reduce(
      (sum, [entryDay, amount]) =>
        entryDay.startsWith(`${monthKey}-`) && confirmedDays[entryDay]
          ? sum + Math.max(0, Number(amount) || 0)
          : sum,
      0
    );
  monthlyEarnings[monthKey] = Number(confirmedMonth.toFixed(6));

  const lifetimeEarnedUsd =
    Math.max(
      getKryptexOpeningBalanceUsd(),
      (Number(current?.lifetimeEarnedUsd) ||
        getKryptexOpeningBalanceUsd()) - existingMonth
    ) + confirmedMonth;

  return {
    ...current,
    initialized: true,
    currentBalance,
    lastBalance: currentBalance,
    peakBalance,
    dailyBalanceDays,
    openingBalanceUsd: getKryptexOpeningBalanceUsd(),
    lifetimeEarnedUsd: Number(lifetimeEarnedUsd.toFixed(6)),
    profitabilityUsdDay,
    withdrawableUsd,
    monthlyEarnings,
    kryptexMiningDaily,
    kryptexConfirmedDays: confirmedDays,
    lastSyncedAt: syncedAt,
    reachable: hasBalance && payload?.reachable !== false,
    miners,
  };
}

export function useKryptexExtension() {
  const [kryptexTracker, setKryptexTracker] = useState(loadKryptexTracker);
  const [kryptexConnected, setKryptexConnected] = useState(false);
  const [kryptexMessage, setKryptexMessage] = useState("");

  const importKryptexPayload = useCallback(payload => {
    // v1.4.10+ sends per-PC telemetry as local_status; retain status support
    // for older extension builds.
    const status = payload?.local_status || payload?.status || {};
    const hasBalance = status?.balance_usd != null;
    const currentBalance = Number(
      hasBalance ? status.balance_usd : loadKryptexTracker()?.lastBalance
    );

    if (!Number.isFinite(currentBalance) || currentBalance < 0) {
      setKryptexMessage("Kryptex returned an invalid balance.");
      return;
    }

    // v1.4+ machine payloads are persisted and merged by the backend.
    if (payload?.machine?.id) {
      setKryptexConnected(true);
      setKryptexMessage(kryptexStatusMessage(payload));
      return;
    }

    setKryptexTracker(current => updateKryptexTracker(current, payload));
    setKryptexConnected(true);
    setKryptexMessage(kryptexStatusMessage(payload));
  }, []);

  useEffect(() => {
    const handleAggregate = event => {
      const detail = event?.detail || {};
      const status = detail?.status || {};
      const profitabilityUsdDay = Number(status?.profitability_usd_day);

      if (!Number.isFinite(profitabilityUsdDay) || profitabilityUsdDay < 0) {
        return;
      }

      if (detail?.tracker && typeof detail.tracker === "object") {
        setKryptexTracker(detail.tracker);
      } else {
        setKryptexTracker(current => ({
          ...current,
          profitabilityUsdDay,
          miners: Array.isArray(status?.miners) ? status.miners : [],
          lastSyncedAt:
            detail?.synced_at ||
            current?.lastSyncedAt ||
            new Date().toISOString(),
          reachable: Math.max(0, Number(detail?.machine_count) || 0) > 0,
          activeMachineCount: Math.max(
            0,
            Number(detail?.machine_count) || 0
          ),
        }));
      }

      setKryptexConnected(
        Math.max(0, Number(detail?.machine_count) || 0) > 0
      );
    };

    window.addEventListener("kryptex-aggregate-update", handleAggregate);
    return () =>
      window.removeEventListener("kryptex-aggregate-update", handleAggregate);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshCombinedKryptex = async () => {
      try {
        const response = await api.get(
          "/api/project-tracking/kryptex/aggregate"
        );
        if (cancelled) return;

        const profitabilityUsdDay =
          Number(response?.status?.profitability_usd_day);
        if (
          !Number.isFinite(profitabilityUsdDay) ||
          profitabilityUsdDay < 0
        ) {
          return;
        }

        if (response?.tracker && typeof response.tracker === "object") {
          setKryptexTracker(response.tracker);
        } else {
          setKryptexTracker(current => ({
            ...current,
            profitabilityUsdDay,
            miners: Array.isArray(response?.status?.miners)
              ? response.status.miners
              : (current?.miners || []),
            lastSyncedAt:
              response?.received_at ||
              current?.lastSyncedAt ||
              null,
            activeMachineCount: Math.max(
              0,
              Number(response?.machine_count) || 0
            ),
            reachable:
              Math.max(0, Number(response?.machine_count) || 0) > 0,
          }));
        }

        setKryptexConnected(
          Math.max(0, Number(response?.machine_count) || 0) > 0
        );
      } catch {
        // Keep the last known tracker value if server refresh is unavailable.
      }
    };

    refreshCombinedKryptex();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshCombinedKryptex();
      }
    }, 30000);
    const onFocus = () => refreshCombinedKryptex();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const requestKryptexLatest = useCallback(() => {
    window.postMessage(
      {
        source: "kryptex-tracker-app",
        type: "REQUEST_LATEST",
      },
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
      if (data?.source !== "kryptex-tracker-ext") return;

      if (data.type === "READY") {
        setKryptexConnected(true);
        requestKryptexLatest();
        return;
      }

      if (data.type === "KRYPTEX_PUSH") {
        setKryptexConnected(true);
        if (data.payload) importKryptexPayload(data.payload);
        return;
      }

      if (data.type === "KRYPTEX_STATUS") {
        setKryptexConnected(true);
        setKryptexTracker(current => ({
          ...current,
          reachable: false,
        }));
        setKryptexMessage(
          "Kryptex Desktop is not reachable right now. Showing the last synced values."
        );
      }
    };

    window.addEventListener("message", handleMessage);
    const firstRequest = window.setTimeout(requestKryptexLatest, 500);
    const secondRequest = window.setTimeout(requestKryptexLatest, 1500);
    const handleFocus = () => requestKryptexLatest();
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("focus", handleFocus);
      window.clearTimeout(firstRequest);
      window.clearTimeout(secondRequest);
    };
  }, [importKryptexPayload, requestKryptexLatest]);

  return {
    kryptexTracker,
    kryptexConnected,
    kryptexMessage,
    requestKryptexLatest,
  };
}
