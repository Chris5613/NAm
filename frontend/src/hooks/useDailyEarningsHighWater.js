import { useCallback, useEffect, useState } from "react";
import { readObject, saveObject } from "@/lib/yieldFarmingAccounting";

const TODAY_EARNINGS_HIGH_WATER_KEY = "yield_today_earnings_high_water_v1";

const sanitizeSources = (sources = {}) =>
  Object.fromEntries(
    Object.entries(sources)
      .filter(([name]) => String(name || "").trim())
      .map(([name, amount]) => [
        name,
        Math.max(0, Number.isFinite(Number(amount)) ? Number(amount) : 0),
      ])
  );

export function mergeDailyHighWaterSources(previous = {}, incoming = {}) {
  const next = { ...sanitizeSources(previous) };
  for (const [name, amount] of Object.entries(sanitizeSources(incoming))) {
    next[name] = Math.max(0, Number(next[name]) || 0, amount);
  }
  return next;
}

export function useDailyEarningsHighWater(todayKey, observedSources) {
  const observed = sanitizeSources(observedSources);
  const observedSignature = JSON.stringify(observed);

  const [state, setState] = useState(() => {
    const saved = readObject(TODAY_EARNINGS_HIGH_WATER_KEY);
    return {
      days: saved?.days && typeof saved.days === "object" ? saved.days : {},
    };
  });

  const mergeSources = useCallback((incoming) => {
    setState(previous => {
      const priorSources = previous?.days?.[todayKey] || {};
      const nextSources = mergeDailyHighWaterSources(priorSources, incoming);
      if (JSON.stringify(nextSources) === JSON.stringify(priorSources)) {
        return previous;
      }
      const next = {
        ...previous,
        days: { ...(previous?.days || {}), [todayKey]: nextSources },
      };
      saveObject(TODAY_EARNINGS_HIGH_WATER_KEY, next);
      return next;
    });
  }, [todayKey]);

  useEffect(() => {
    mergeSources(JSON.parse(observedSignature));
  }, [mergeSources, observedSignature]);

  const persisted = state?.days?.[todayKey] || {};
  const dailySourceTotals = mergeDailyHighWaterSources(persisted, observed);

  return {
    dailySourceTotals,
    mergeHighWaterSources: mergeSources,
  };
}
