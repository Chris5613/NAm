import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";

/**
 * Server-side income history projection. It is non-posting and never replaces
 * a stale tab's local edits; the response is tied to the exact data signature.
 */
export function useBackendIncomeHistory(payload, localMonths) {
  const signature = useMemo(() => JSON.stringify(payload), [payload]);
  const [result, setResult] = useState(null);
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
  const serverMonths = result?.signature === signature ? result.data.months : null;
  if (!incomeHistoryMatches(localMonths, serverMonths)) return localMonths;
  return serverMonths;
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
