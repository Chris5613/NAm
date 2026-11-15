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

export function statementRowsMatch(local, remote) {
  if (!Array.isArray(local) || !Array.isArray(remote) ||
      local.length !== remote.length) return false;
  return local.every((row, i) => {
    const candidate = remote[i];
    if (row.id !== candidate?.id || row.category !== candidate.category)
      return false;
    return ["start", "end", "journalChange", "unreconciledCash"].every(key => {
      const a = row[key], b = candidate[key];
      if (a == null || b == null) return a == b;
      return Math.abs(Number(a) - Number(b)) < .005;
    });
  });
}
