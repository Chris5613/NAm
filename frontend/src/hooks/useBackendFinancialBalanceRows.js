import { useFinancialFastQuery } from "@/hooks/useFinancialFastQuery";

/** Financial asset balances are calculated solely by the authenticated backend. */
export function useBackendFinancialBalanceRows(payload) {
  const response = useFinancialFastQuery({
    path: "/api/project-tracking/financial-core/balance-rows",
    payload, maxAgeMs: 12000, intervalMs: 45000,
    enabled: Boolean(payload?.live),
    validator: data => data?.sourceOfCalculation === "backend-financial-core" &&
      data.month === payload.month && Array.isArray(data.rows) &&
      data.rows.every(row => row && typeof row.id === "string" &&
        typeof row.category === "string" &&
        (row.end == null || Number.isFinite(row.end))),
  });
  return response.data ? { ...response, rows: response.data.rows } : response;
}
