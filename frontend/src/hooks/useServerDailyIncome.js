import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";

export function useServerDailyIncome(
  todayKey,
  dailySourceTotals,
  mergeHighWaterSources
) {
  const [serverDailyIncome, setServerDailyIncome] = useState(null);

  useEffect(() => {
    let active = true;

    api.get(`/api/project-tracking/daily-earnings/${todayKey}`)
      .then(result => {
        if (active && result?.date === todayKey) {
          setServerDailyIncome(result);
        }
      })
      .catch(() => {
        // Local high-water remains authoritative until the server responds.
      });

    return () => {
      active = false;
    };
  }, [todayKey]);

  const dailySourceSignature = JSON.stringify(dailySourceTotals);

  useEffect(() => {
    let active = true;
    const sources = JSON.parse(dailySourceSignature);

    api.put("/api/project-tracking/daily-earnings", {
      date: todayKey,
      sources,
    })
      .then(result => {
        if (active && result?.complete && result?.date === todayKey) {
          setServerDailyIncome(result);
        }
      })
      .catch(() => {
        // Preserve the local cumulative high-water during backend outages.
      });

    return () => {
      active = false;
    };
  }, [dailySourceSignature, todayKey]);

  useEffect(() => {
    if (
      serverDailyIncome?.date !== todayKey ||
      !serverDailyIncome?.sources
    ) {
      return;
    }
    mergeHighWaterSources(serverDailyIncome.sources);
  }, [mergeHighWaterSources, serverDailyIncome, todayKey]);

  return serverDailyIncome;
}
