import { useEffect, useState } from "react";
import {
  DAILY_EARNINGS_CHART_OBSERVATIONS_KEY,
  getTodayKey,
  readObject,
  saveObject,
} from "@/lib/yieldFarmingAccounting";

export function useDailyEarningsObservations(todayEarnings, earningsClock, todayKey) {
  const [observations, setObservations] = useState(
    () => readObject(DAILY_EARNINGS_CHART_OBSERVATIONS_KEY)
  );

  useEffect(() => {
    if (!Number.isFinite(todayEarnings)) return;

    const currentDay = getTodayKey();
    const now = new Date();
    const hourParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);

    const timePart = type =>
      Number(hourParts.find(part => part.type === type)?.value || 0);
    const hour =
      timePart("hour") +
      timePart("minute") / 60 +
      timePart("second") / 3600;

    const stored = readObject(DAILY_EARNINGS_CHART_OBSERVATIONS_KEY);
    const currentPoints = Array.isArray(stored[currentDay])
      ? stored[currentDay]
      : [];
    const previous = currentPoints[currentPoints.length - 1];
    const priorMaximum = currentPoints.reduce(
      (highest, point) => Math.max(highest, Number(point?.value) || 0),
      0
    );
    const monotonicTodayEarnings = Math.max(
      0,
      priorMaximum,
      todayEarnings
    );

    // Only record a change, or a heartbeat every 15 minutes.
    if (
      previous &&
      Math.abs(Number(previous.value) - monotonicTodayEarnings) < 0.000001 &&
      hour - Number(previous.x) < 0.25
    ) {
      return;
    }

    const nextPoints = [
      ...currentPoints,
      { x: hour, value: Number(monotonicTodayEarnings.toFixed(8)) },
    ]
      .filter(point =>
        Number.isFinite(Number(point.x)) &&
        Number.isFinite(Number(point.value))
      )
      .sort((a, b) => a.x - b.x)
      .slice(-1500);

    const next = { ...stored, [currentDay]: nextPoints };
    saveObject(DAILY_EARNINGS_CHART_OBSERVATIONS_KEY, next);
    setObservations(next);
  }, [todayEarnings, earningsClock, todayKey]);

  return observations;
}
