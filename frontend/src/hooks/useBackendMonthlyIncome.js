import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";
import { getCurrentMonthKey } from "@/lib/yieldFarmingAccounting";

const EXTENSION_PROVIDERS = new Set(["RollerCoin", "Salad", "Unetwork", "Kryptex"]);

function providerAmounts(months) {
  const values = new Map();
  for (const month of months || []) {
    for (const row of month.platforms || []) {
      if (!EXTENSION_PROVIDERS.has(row.platform)) continue;
      values.set(month.monthKey + ":" + row.platform, Number(row.amount));
    }
  }
  return values;
}

function matchingProviderMonths(local, server) {
  const left = providerAmounts(local);
  const right = providerAmounts(server);
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    const fromServer = right.get(key);
    if (!Number.isFinite(value) || !Number.isFinite(fromServer) ||
        Math.abs(fromServer - value) > 0.000002) return false;
  }
  return true;
}

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
    if (backendMonths?.currentMonth !== getCurrentMonthKey() ||
        !matchingProviderMonths(localMonths, backendMonths.months)) {
      return localMonths;
    }
    const fromServer = providerAmounts(backendMonths.months);
    return localMonths.map(month => {
      const platforms = (month.platforms || []).map(entry => {
        const key = month.monthKey + ":" + entry.platform;
        if (!EXTENSION_PROVIDERS.has(entry.platform) || !fromServer.has(key))
          return entry;
        return { ...entry, amount: fromServer.get(key) };
      });
      return {
        ...month, platforms,
        total: Number(platforms.reduce(
          (sum, entry) => sum + (Number(entry.amount) || 0), 0
        ).toFixed(6)),
      };
    });
  }, [backendMonths, localMonths]);
}
