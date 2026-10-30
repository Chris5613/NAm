import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";
import { getCurrentMonthKey } from "@/lib/yieldFarmingAccounting";
import { mergeServerMonthlyIncome } from "@/lib/yieldProviderParity";

export function useBackendMonthlyIncome(trackers, localMonths) {
  const signature = JSON.stringify(trackers);
  const [backendMonths, setBackendMonths] = useState(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.get("/api/project-tracking/provider-monthly-income");
        if (active && result?.currentMonth === getCurrentMonthKey() &&
            Array.isArray(result.months)) setBackendMonths(result);
      } catch {
        // Cached frontend results stay available if backend is offline.
      }
    };
    // Allow the 600ms remoteStorage write to reach the server first.
    const initial = window.setTimeout(refresh, 1750);
    const interval = window.setInterval(refresh, 90000);
    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [signature]);

  return useMemo(() => {
    return backendMonths?.currentMonth === getCurrentMonthKey()
      ? mergeServerMonthlyIncome(localMonths, backendMonths.months)
      : localMonths;
  }, [backendMonths, localMonths]);
}
