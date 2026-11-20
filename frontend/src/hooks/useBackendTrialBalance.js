import { useFinancialFastQuery } from "@/hooks/useFinancialFastQuery";

/** Historical trial balance stays backend-owned; cached by exact preview input. */
export function useBackendTrialBalance(payload, enabled = true) {
  const response = useFinancialFastQuery({
    path: "/api/project-tracking/financial-core/historical-trial-balance",
    payload, enabled: enabled && Array.isArray(payload?.currentEntries),
    maxAgeMs: 12000, intervalMs: 45000,
    validator: data => data?.sourceOfCalculation === "backend-trial-balance" &&
      Array.isArray(data.rows) &&
      Number.isFinite(data.debitsUsd) && Number.isFinite(data.creditsUsd) &&
      Number.isFinite(data.differenceUsd) && typeof data.balanced === "boolean" &&
      data.month === payload.month && Number.isInteger(data.includedEntries),
  });
  return response.data ? { ...response, result: response.data } : response;
}
