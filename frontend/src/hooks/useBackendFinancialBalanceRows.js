import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";
import { reportFinancialParity } from "@/lib/financialParityTelemetry";

/**
 * Migration bridge: server computes *all* Balance Sheet asset/equipment rows,
 * including saved custom assets and one-off journal equipment. Retain the
 * exact prior result until every row reconciles; no record is written.
 */
export function useBackendFinancialBalanceRows(payload, localRows) {
  const signature = useMemo(() => JSON.stringify(payload), [payload]);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    api.post("/api/project-tracking/financial-core/balance-rows",
      JSON.parse(signature)).then(data => {
      if (active && data?.sourceOfCalculation === "backend-financial-core" &&
          data.month === payload.month && Array.isArray(data.rows))
        setResult({ signature, rows: data.rows });
    }).catch(() => { if (active) setResult(null); });
    return () => { active = false; };
  }, [signature, payload.month]);
  const serverRows = result?.signature === signature ? result.rows : null;
  const reconciled = financialAssetRowsMatch(localRows, serverRows);
  useEffect(() => {
    if (serverRows) reportFinancialParity(
      "balance-rows", payload.month, reconciled,
      "backend-projection", signature);
  }, [serverRows, payload.month, reconciled, signature]);
  return reconciled ? serverRows : localRows;
}

export function financialAssetRowsMatch(localRows, serverRows) {
  if (!Array.isArray(localRows) || !Array.isArray(serverRows) ||
      localRows.length !== serverRows.length) return false;
  return localRows.every((local, index) => {
    const server = serverRows[index];
    if (!server || local?.id !== server.id ||
        local?.name !== server.name ||
        local?.category !== server.category ||
        local?.source !== server.source) return false;
    const keys = new Set([...Object.keys(local || {}), ...Object.keys(server)]);
    return [...keys].every(key => {
      const a = local[key], b = server[key];
      if (a == null || b == null) return a == b;
      if (typeof a === "number" || typeof b === "number")
        return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) &&
          Math.abs(Number(a) - Number(b)) < .005;
      return a === b;
    });
  });
}
