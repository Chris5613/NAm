import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";

/**
 * Financials asset, equipment, GPU disposal, and phone PPE calculations
 * are owned by the authenticated backend. This adapter never reconstructs
 * accounting values in the browser or writes a local substitute.
 */
export function useBackendFinancialBalanceRows(payload) {
  const signature = useMemo(() => JSON.stringify(payload), [payload]);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    setResult(previous => previous?.signature === signature
      ? previous : { signature, loading: true });
    api.post("/api/project-tracking/financial-core/balance-rows",
      JSON.parse(signature)).then(data => {
      if (!active) return;
      const valid = data?.sourceOfCalculation === "backend-financial-core" &&
        data.month === payload.month && Array.isArray(data.rows) &&
        data.rows.every(row => row && typeof row.id === "string" &&
          typeof row.category === "string" &&
          (row.end == null || Number.isFinite(row.end)));
      setResult(valid ? { signature, rows: data.rows }
        : { signature, error: true });
    }).catch(() => {
      if (active) setResult({ signature, error: true });
    });
    return () => { active = false; };
  }, [signature, payload.month]);
  return result?.signature === signature ? result : { loading: true };
}
