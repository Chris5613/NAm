import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";

/**
 * Read only durable, source-owned provider income from the backend.
 * The browser neither merges snapshots nor assigns provider revenue.
 * A failed request never substitutes an independently calculated total.
 */
export function useBackendIncomeHistory(payload) {
  const month = payload?.currentMonth;
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    setState(previous => previous?.month === month ? previous
      : { month, loading: true });
    const refresh = () => api.get(
      "/api/project-tracking/financial-core/source-income-history"
    ).then(result => {
      if (!active) return;
      const valid = result?.sourceOfCalculation ===
        "backend-persisted-income-history" &&
        result.currentMonth === month && Array.isArray(result.months) &&
        result.months.every(row => /^\d{4}-\d{2}$/.test(row.monthKey) &&
          Number.isFinite(row.total) &&
          typeof row.sources === "object" && row.sources !== null);
      if (!valid) throw Error("Incomplete backend income history");
      setState({ month, months: result.months, error: false });
    }).catch(() => {
      if (active) setState(previous => previous?.month === month
        ? { ...previous, error: true } : { month, error: true });
    });
    refresh();
    const poll = window.setInterval(refresh, 90000);
    return () => { active = false; window.clearInterval(poll); };
  }, [month]);
  // Existing pages expect an array. Never replace it with stale browser data.
  return state?.month === month ? state.months || [] : [];
}
