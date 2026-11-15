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
    // Refresh while the page stays open: another tab/device may record a
    // newer confirmed provider increment while this tab's extension is idle.
    const refresh = () => {
      api.get(`/api/project-tracking/daily-earnings/${todayKey}`)
        .then(result => {
          if (active && result?.date === todayKey) {
            setServerDailyIncome(previous => {
              if (previous?.date !== todayKey) return result;
              // A late response cannot erase previously observed source highs.
              const sources = { ...(previous.sources || {}) };
              for (const [name, raw] of Object.entries(result.sources || {})) {
                const n = Number(raw);
                if (!Number.isFinite(n) || n < 0) continue;
                sources[name] = Math.max(Number(sources[name]) || 0, n);
              }
              const recorded = Number(result.totalUsd);
              const last = Number(previous.totalUsd);
              const totalUsd = Math.max(0,
                Number.isFinite(recorded) ? recorded : 0,
                Number.isFinite(last) ? last : 0,
                Object.values(sources).reduce((total, value) => total + (Number(value) || 0), 0)
              );
              return { ...previous, ...result, sources, totalUsd };
            });
          }
        })
        .catch(() => {
          // Preserve the last verified daily high-water if polling fails.
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
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
