import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";

/** The cumulative trial balance is computed by the backend only. */
export function useBackendTrialBalance(payload) {
  const signature = useMemo(() => JSON.stringify(payload), [payload]);
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    setState(previous => previous?.signature === signature
      ? previous : { signature, loading: true });
    const refresh = () => api.post(
      "/api/project-tracking/financial-core/historical-trial-balance",
      JSON.parse(signature)
    ).then(data => {
      if (!active) return;
      const valid = data?.sourceOfCalculation === "backend-trial-balance" &&
        Array.isArray(data.rows) &&
        Number.isFinite(data.debitsUsd) &&
        Number.isFinite(data.creditsUsd) &&
        Number.isFinite(data.differenceUsd) &&
        typeof data.balanced === "boolean" &&
        data.month === payload.month &&
        Number.isInteger(data.includedEntries);
      setState(valid ? { signature, result: data } :
        { signature, error: true });
    }).catch(() => { if (active) setState({ signature, error: true }); });
    // Persisted journals and provider income can update without a browser
    // input change; poll the authoritative server projection.
    refresh();
    const interval = window.setInterval(refresh, 90000);
    return () => { active = false; window.clearInterval(interval); };
  }, [signature, payload.month]);
  return state?.signature === signature ? state : { loading: true };
}
