import { useFinancialFastQuery } from "@/hooks/useFinancialFastQuery";

/** One cached backend preview of current ledger; never locally posts revenue. */
export function useBackendCurrentLedger(payload) {
  return useFinancialFastQuery({
    path: "/api/project-tracking/financial-core/current-ledger",
    payload, enabled: Array.isArray(payload?.baseRows),
    maxAgeMs: 12000, intervalMs: 45000,
    validator: data => data?.sourceOfCalculation ===
        "backend-current-financial-ledger-v1" &&
      data.month === payload.month && data.financialLedgerMutated === false &&
      Array.isArray(data.entries) &&
      data.entries.every(row => row && typeof row.id === "string" &&
        Array.isArray(row.lines)) &&
      data.income && Array.isArray(data.income.entries) &&
      data.automaticExpenses && Array.isArray(data.automaticExpenses.entries),
  });
}
