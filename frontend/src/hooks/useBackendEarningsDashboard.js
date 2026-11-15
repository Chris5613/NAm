import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";

/** Backend owns all money totals. No local cache or calculation fallback. */
export function useBackendEarningsDashboard(month) {
  const [state, setState] = useState({ month: null, data: null, error: null });
  useEffect(() => {
    if (!/^\\d{4}-\\d{2}$/.test(String(month))) return;
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.get(`/api/project-tracking/earnings-dashboard/${month}`);
        if (!active || result?.month !== month || result?.sourceOfCalculation !== "backend-postgres") return;
        setState({ month, data: result, error: null });
      } catch {
        if (active) setState(previous => ({
          month, data: previous.month === month ? previous.data : null,
          error: "Backend earnings unavailable",
        }));
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 30000);
    const visible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [month]);
  return {
    data: state.month === month ? state.data : null,
    error: state.month === month ? state.error : null,
  };
}
