import { useFinancialFastQuery } from "@/hooks/useFinancialFastQuery";

/** Persisted source-income history, cached in memory and still backend-owned.
 * The response is never reconstructed from wallets, provider estimates, or
 * browser month-to-month deltas. Invalid backend responses are not cached.
 */
export function useBackendIncomeHistory(payload) {
  const month = payload?.currentMonth;
  const result = useFinancialFastQuery({
    path: "/api/project-tracking/financial-core/source-income-history",
    maxAgeMs: 12000, intervalMs: 60000,
    enabled: Boolean(month),
    validator: data => data?.sourceOfCalculation ===
      "backend-persisted-income-history" &&
      data.currentMonth === month && Array.isArray(data.months) &&
      data.months.every(row => /^\\d{4}-\\d{2}$/.test(row.monthKey) &&
        Number.isFinite(row.total) &&
        row.sources && typeof row.sources === "object" &&
        !Array.isArray(row.sources)),
  });
  return result.data?.currentMonth === month ? result.data.months : [];
}
