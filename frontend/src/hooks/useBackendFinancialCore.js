import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";

/**
 * Server-calculated financial statement preview.
 * Never posts transactions or modifies balances. A response is accepted only
 * for the current exact input; older async requests cannot replace it.
 */
export function useBackendFinancialCore(month, entries, rows, devices, savedExpenses, cashOpening, payableOpening) {
  const signature = useMemo(() => JSON.stringify({
    month, entries, rows, devices, savedExpenses, cashOpening, payableOpening,
  }), [month, entries, rows, devices, savedExpenses, cashOpening, payableOpening]);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    let payload;
    try { payload = JSON.parse(signature); }
    catch {
      setResult({ signature, error: true });
      return () => { active = false; };
    }
    setResult(prev => prev?.signature === signature && prev?.data
      ? prev : { signature, loading: true });
    api.post("/api/project-tracking/financial-core/evaluate", payload)
      .then(data => {
        if (!active) return;
        const valid = data?.sourceOfCalculation === "backend-financial-core" &&
          data.month === month && data.profit && data.revenueSources &&
          data.cashFlow && Array.isArray(data.statementRows);
        setResult(valid ? { signature, data } : { signature, error: true });
      }).catch(() => {
        if (active) setResult({ signature, error: true });
      });
    return () => { active = false; };
  }, [signature, month]);
  return result?.signature === signature ? result : { loading: true };
}

