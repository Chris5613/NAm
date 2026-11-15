import { useMemo } from "react";
import { useFinancialFastQuery } from "@/hooks/useFinancialFastQuery";

/** Validated read-through cache of read-only backend Financials statements. */
export function useBackendFinancialCore(month, entries, rows, devices, savedExpenses) {
  const payload = useMemo(() => ({
    month, entries, rows, devices, savedExpenses,
  }), [month, entries, rows, devices, savedExpenses]);
  return useFinancialFastQuery({
    path: "/api/project-tracking/financial-core/evaluate",
    payload, enabled: Array.isArray(rows),
    maxAgeMs: 12000, intervalMs: 45000,
    validator: data => data?.sourceOfCalculation === "backend-financial-core" &&
      data.month === month && data.profit && data.revenueSources &&
      data.cashFlow && Array.isArray(data.statementRows) &&
      data.statementTotals?.sourceOfCalculation ===
        "backend-financial-statement-totals-v1" &&
      data.displayTotals?.sourceOfCalculation ===
        "backend-financial-statement-totals-v1" &&
      Number.isFinite(data.cashMovements?.cashIn) &&
      Number.isFinite(data.cashMovements?.cashOut),
  });
}
