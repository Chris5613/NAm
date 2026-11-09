import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { useBackendMonthlyIncome } from "@/hooks/useBackendMonthlyIncome";
import { mergeBackendLoopscaleHistory } from "@/lib/mergeBackendLoopscaleHistory";
import { mergeManualIncome } from "@/lib/manualIncomeHistory";
import { STOCK_DIVIDEND_PAYOUTS_KEY } from "@/lib/stockDividendPayouts";
import {
  buildIncomeHistory,
  legacyProjectIncome,
  reconcileLuloIncome,
} from "@/lib/incomeHistory";
import {
  buildProjectIncome,
  getCurrentMonthKey,
  getTodayKey,
  getEffectiveProjectIncome,
  loadKryptexTracker,
  loadLoopscaleHistory,
  loadMonthlyBackfills,
  loadMonthlySnapshots,
  loadRollerCoinTracker,
  loadSaladTracker,
  loadUnetworkTracker,
  PROJECT_QUICK_CACHE_KEY,
  readObject,
} from "@/lib/yieldFarmingAccounting";

function readPassiveIncomeHistory() {
  let legacyProjects = [];

  try {
    const saved = JSON.parse(
      remoteStorage.getItem("networth_projects") || "[]"
    );
    if (Array.isArray(saved)) legacyProjects = saved;
  } catch {
    // Keep the rest of the saved income available if legacy data is malformed.
  }

  return {
    legacyProjects,
    luloProjects: (
      readObject(PROJECT_QUICK_CACHE_KEY).projects || []
    ).filter(
      (project) =>
        project?.yield_tracking === "lulo_lending"
    ),
    loopscale: loadLoopscaleHistory(),
    salad: loadSaladTracker(),
    rollercoin: loadRollerCoinTracker(),
    unetwork: loadUnetworkTracker(),
    kryptex: loadKryptexTracker(),
    backfills: loadMonthlyBackfills(),
    snapshots: loadMonthlySnapshots(),
    payouts: readObject(STOCK_DIVIDEND_PAYOUTS_KEY),
    manualIncome: {},
    luloBackfills: {},
  };
}

export default function usePassiveIncomeHistory() {
  const [history, setHistory] = useState(
    readPassiveIncomeHistory
  );
  const [clock, setClock] = useState(Date.now());

  useEffect(
    () =>
      subscribe(() =>
        setHistory((current) => ({
          ...readPassiveIncomeHistory(),
          manualIncome: current.manualIncome,
          luloBackfills: current.luloBackfills,
        }))
      ),
    []
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => setClock(Date.now()),
      60000
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const result = await api.get(
          "/api/yield-sources/earnings"
        );

        if (active && result) {
          setHistory((current) => ({
            ...current,
            loopscale: mergeBackendLoopscaleHistory(
              current.loopscale,
              result.loopscaleHistory
            ),
            manualIncome:
              result.manualIncomeHistory ||
              current.manualIncome,
            luloBackfills:
              result.luloBackfills &&
              typeof result.luloBackfills === "object"
                ? result.luloBackfills
                : current.luloBackfills,
          }));
        }
      } catch {
        // Keep the last successfully saved passive-income history.
      }
    };

    refresh();
    const timer = window.setInterval(refresh, 90000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const currentMonth = useMemo(
    getCurrentMonthKey,
    [clock]
  );
  const currentDay = useMemo(getTodayKey, [clock]);

  const trackers = useMemo(
    () => ({
      salad: history.salad,
      rollercoin: history.rollercoin,
      unetwork: history.unetwork,
      kryptex: history.kryptex,
    }),
    [
      history.salad,
      history.rollercoin,
      history.unetwork,
      history.kryptex,
    ]
  );

  const localMonths = useMemo(
    () =>
      buildProjectIncome(
        history.luloProjects,
        history.loopscale,
        history.salad,
        history.backfills,
        history.rollercoin,
        history.unetwork,
        history.kryptex
      ),
    [history]
  );

  const liveMonths = useBackendMonthlyIncome(
    trackers,
    localMonths
  );

  const projectMonths = useMemo(
    () =>
      reconcileLuloIncome(
        getEffectiveProjectIncome(
          liveMonths,
          history.snapshots
        ),
        history.backfills,
        history.luloBackfills,
        currentMonth,
        history.luloProjects,
        currentDay
      ),
    [
      liveMonths,
      history.snapshots,
      history.backfills,
      history.luloBackfills,
      history.luloProjects,
      currentMonth,
      currentDay,
    ]
  );

  const legacy = useMemo(
    () => legacyProjectIncome(history.legacyProjects),
    [history.legacyProjects]
  );

  return useMemo(() => {
    const recorded = buildIncomeHistory(
      projectMonths,
      history.payouts,
      currentMonth,
      legacy
    );

    return mergeManualIncome(
      recorded,
      history.manualIncome?.monthly || {},
      currentMonth
    );
  }, [
    projectMonths,
    history.payouts,
    currentMonth,
    legacy,
    history.manualIncome,
  ]);
}
