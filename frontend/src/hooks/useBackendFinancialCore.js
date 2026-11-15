import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";

/**
 * Server-calculated financial statement preview.
 * Never posts transactions or modifies balances. A response is accepted only
 * for the current exact input; older async requests cannot replace it.
 */
export function useBackendFinancialCore(month, entries, rows, devices, savedExpenses) {
  const signature = useMemo(() => JSON.stringify({
    month, entries, rows, devices, savedExpenses,
  }), [month, entries, rows, devices, savedExpenses]);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    let payload;
    try { payload = JSON.parse(signature); }
    catch { return () => { active = false; }; }
    api.post("/api/project-tracking/financial-core/evaluate", payload)
      .then(data => {
        if (active && data?.sourceOfCalculation === "backend-financial-core" &&
            data?.month === month) setResult({ signature, data });
      }).catch(() => {
        if (active) setResult(null);
      });
    return () => { active = false; };
  }, [signature, month]);
  return result?.signature === signature ? result.data : null;
}

export function financialReportMatches(frontend, backend) {
  if (!frontend || !backend) return false;
  return ["revenue", "disposalGain", "operating", "fees", "depreciation",
    "expenses", "profit"].every(key =>
      Number.isFinite(Number(frontend[key])) &&
      Math.abs(Number(frontend[key]) - Number(backend[key])) < 0.005
    ) && frontend.unitemizedExpenseOverlap === backend.unitemizedExpenseOverlap;
}

export function financialFlowsMatch(frontend, backend) {
  if (!frontend || !backend) return false;
  return ["operating", "investing", "financing", "transfers"].every(key =>
    Math.abs(Number(frontend.totals?.[key] ?? 0) -
      Number(backend.totals?.[key] ?? 0)) < 0.005
  );
}
