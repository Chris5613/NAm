import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";

/** Saved server provider observations are the only source for account assets. */
export function useBackendFinancialLiveBalances() {
  const [state, setState] = useState({ live: null, loading: true });
  useEffect(() => {
    let active = true;
    const refresh = () => api.get(
      "/api/project-tracking/financial-core/home-business"
    ).then(result => {
      if (!active) return;
      const valid = result?.sourceOfCalculation === "backend-home-business" &&
        result.live && typeof result.live === "object" &&
        !Array.isArray(result.live) &&
        Object.values(result.live).every(value =>
          typeof value === "number" && Number.isFinite(value));
      if (!valid) throw Error("Invalid backend provider asset observations");
      setState({ live: result.live, loading: false, error: false,
        observedMonth: result.month });
    }).catch(() => {
      if (active) setState(prev => ({ ...prev, loading: false, error: true }));
    });
    refresh();
    const poll = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(poll);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return state;
}
