import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";
import { getTodayKey } from "@/lib/yieldFarmingAccounting";
import { statsMatch } from "@/lib/yieldProviderParity";

// The backend calculates from persisted tracker snapshots. The browser still
// receives extension events; while a new event is flushing to PostgreSQL,
// preserve the locally newer result rather than displaying stale server data.
export function useBackendProviderStats(trackers, localStats) {
  const [serverSnapshot, setServerSnapshot] = useState(null);
  const snapshotSignature = JSON.stringify(trackers);

  useEffect(() => {
    let active = true;
    const requestServerStats = async () => {
      try {
        const value = await api.get("/api/project-tracking/provider-stats");
        if (active && value?.todayKey === getTodayKey() && value?.stats) {
          setServerSnapshot(value);
        }
      } catch {
        // A backend outage must never blank the projects dashboard.
      }
    };
    // The storage adapter flushes writes after 600ms; wait for the latest
    // extension observation to reach PostgreSQL before comparing the result.
    const initial = window.setTimeout(requestServerStats, 1750);
    const periodic = window.setInterval(requestServerStats, 90000);
    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(periodic);
    };
  }, [snapshotSignature]);

  return useMemo(() => {
    const result = {};
    for (const [source, local] of Object.entries(localStats)) {
      const backend = serverSnapshot?.todayKey === getTodayKey()
        ? serverSnapshot?.stats?.[source] : null;
      result[source] = statsMatch(local, backend)
        ? { ...local, ...backend, miners: local.miners }
        : local;
      // Only Kryptex has a miner list. Avoid adding a new field to others.
      if (!Object.prototype.hasOwnProperty.call(local, "miners")) {
        delete result[source].miners;
      }
    }
    return result;
  }, [serverSnapshot, localStats]);
}
