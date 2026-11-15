import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";

/** The cumulative trial balance is computed by the backend only. */
export function useBackendTrialBalance(entries, accounts) {
  const signature = useMemo(() => JSON.stringify({ entries, accounts }),
    [entries, accounts]);
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    setState(previous => previous?.signature === signature
      ? previous : { signature, loading: true });
    api.post("/api/project-tracking/financial-core/trial-balance",
      JSON.parse(signature)).then(data => {
      if (!active) return;
      const valid = data?.sourceOfCalculation === "backend-financial-core" &&
        Array.isArray(data.rows) &&
        Number.isFinite(data.debitTotal) &&
        Number.isFinite(data.creditTotal);
      setState(valid ? { signature, result: data } :
        { signature, error: true });
    }).catch(() => { if (active) setState({ signature, error: true }); });
    return () => { active = false; };
  }, [signature]);
  return state?.signature === signature ? state : { loading: true };
}
