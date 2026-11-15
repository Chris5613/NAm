import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";

/**
 * The authenticated backend owns monthly equipment depreciation and
 * estimated electricity accruals. No browser estimation, double-posting,
 * or implicit zero balance is allowed when the backend is unavailable.
 */
export function useBackendAutomaticExpenses(
  month, baseRows, manualEntries, autoPower,
) {
  const signature = useMemo(() => JSON.stringify({
    month, baseRows, manualEntries, autoPower,
  }), [month, baseRows, manualEntries, autoPower]);
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    if (!Array.isArray(baseRows)) {
      setState({ signature, loading: true });
      return () => { active = false; };
    }
    setState(previous => previous?.signature === signature
      ? previous : { signature, loading: true });
    api.post("/api/project-tracking/financial-core/auto-expenses",
      JSON.parse(signature))
      .then(data => {
        if (!active) return;
        const valid = data?.sourceOfCalculation === "backend-financial-core" &&
          data.month === month && Array.isArray(data.entries) &&
          data.entries.every(entry => entry.automatic === true &&
            Array.isArray(entry.lines));
        setState(valid ? { signature, entries: data.entries } :
          { signature, error: true });
      }).catch(() => {
        if (active) setState({ signature, error: true });
      });
    return () => { active = false; };
  }, [signature, month, baseRows]);
  return state?.signature === signature ? state : { loading: true };
}
