import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";
import { reportFinancialParity } from "@/lib/financialParityTelemetry";

/**
 * Server-side income history projection. It is non-posting and never replaces
 * a stale tab's local edits; the response is tied to the exact data signature.
 */
export function useBackendIncomeHistory(payload, localMonths) {
  const signature = useMemo(() => JSON.stringify(payload), [payload]);
  const [result, setResult] = useState(null);
  const [persisted, setPersisted] = useState(null);
  useEffect(() => {
    let active = true;
    api.post("/api/project-tracking/financial-core/income-history",
      JSON.parse(signature))
      .then(data => {
        if (active && data?.sourceOfCalculation === "backend-income-history" &&
            data.currentMonth === payload.currentMonth &&
            Array.isArray(data.months)) setResult({ signature, data });
      }).catch(() => { if (active) setResult(null); });
    return () => { active = false; };
  }, [signature, payload.currentMonth]);
  // Unlike the legacy POST preview, this GET derives its input entirely
  // from the saved backend provider ledger, projects, dividends and account
  // configuration. Prefer it when it reconciles source-by-source.
  useEffect(() => {
    let active = true;
    api.get("/api/project-tracking/financial-core/source-income-history")
      .then(data => {
        if (active && data?.sourceOfCalculation === "backend-persisted-income-history" &&
            data.currentMonth === payload.currentMonth && Array.isArray(data.months))
          setPersisted({ signature, data });
      }).catch(() => { if (active) setPersisted(null); });
    return () => { active = false; };
  }, [signature, payload.currentMonth]);

  const persistedMonths = persisted?.signature === signature
    ? persisted.data.months : null;
  const serverMonths = result?.signature === signature ? result.data.months : null;
  const matchedPersisted = incomeHistoryMatches(localMonths, persistedMonths);
  const matchedProjection = incomeHistoryMatches(localMonths, serverMonths);
  useEffect(() => {
    if (persistedMonths) reportFinancialParity(
      "income-history", payload.currentMonth, matchedPersisted,
      "backend-persisted", signature);
  }, [signature, payload.currentMonth, persistedMonths, matchedPersisted]);
  return matchedPersisted ? persistedMonths :
    matchedProjection ? serverMonths : localMonths;
}

export function incomeHistoryMatches(local, remote) {
  if (!Array.isArray(local) || !Array.isArray(remote) ||
      local.length !== remote.length) return false;
  const byKey = new Map(remote.map(row => [row.monthKey, row]));
  if (byKey.size !== remote.length) return false;
  return local.every(row => {
    const b = byKey.get(row.monthKey);
    if (!b || Math.abs(Number(row.total ?? 0) - Number(b.total ?? 0)) >= .005 ||
        Math.abs(Number(row.projectTotal ?? 0) -
          Number(b.projectTotal ?? 0)) >= .005) return false;
    const keys = new Set([...Object.keys(row.sources || {}),
      ...Object.keys(b.sources || {})]);
    return [...keys].every(k => Math.abs(Number(row.sources?.[k] || 0) -
      Number(b.sources?.[k] || 0)) < .005);
  });
}
