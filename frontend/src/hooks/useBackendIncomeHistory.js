import { useFinancialFastQuery } from "@/hooks/useFinancialFastQuery";
import { api } from "@/lib/apiClient";
import { financialCacheKey, requestFinancialCache } from "@/lib/financialFastCache";

const incomePath = month =>
  "/api/project-tracking/financial-core/source-income-history?viewMonth=" +
  encodeURIComponent(month || "");

const validIncomeHistory = (data, month) =>
  data?.sourceOfCalculation === "backend-persisted-income-history" &&
  data.currentMonth === month && Array.isArray(data.months) &&
  data.months.every(row => /^[0-9]{4}-[0-9]{2}$/.test(row.monthKey) &&
    Number.isFinite(row.total) &&
    row.sources && typeof row.sources === "object" &&
    !Array.isArray(row.sources));

/**
 * Warm authenticated source-owned monthly earnings alongside initial app
 * hydration. Only validated backend data is cached in per-login memory.
 * A sign-out or session change cannot write an outstanding response.
 */
export async function prefetchBackendIncomeHistory(month, isCurrent = () => true) {
  if (!/^\\d{4}-\\d{2}$/.test(String(month))) return null;
  const path = incomePath(month);
  return requestFinancialCache(
    financialCacheKey(path),
    () => api.get(path).then(data => {
      if (!isCurrent()) throw new Error("Income history session changed");
      return data;
    }),
    data => isCurrent() && validIncomeHistory(data, month),
    { maxAgeMs: 12000 },
  );
}

/**
 * The status variant distinguishes an unknown/loading history from a
 * legitimately empty earnings ledger. Never render missing months as $0
 * while a separate source-history request is still pending.
 */
export function useBackendIncomeHistoryState(payload) {
  const month = payload?.currentMonth;
  const result = useFinancialFastQuery({
    path: incomePath(month),
    maxAgeMs: 12000, intervalMs: 60000,
    enabled: Boolean(month),
    validator: data => validIncomeHistory(data, month),
  });
  const ready = result.data?.currentMonth === month;
  return {
    months: ready ? result.data.months : [],
    loading: !ready && !result.error,
    error: Boolean(result.error) && !ready,
    refreshing: Boolean(result.refreshing),
  };
}

/** Existing recorded-income consumers receive only persisted backend rows. */
export function useBackendIncomeHistory(payload) {
  return useBackendIncomeHistoryState(payload).months;
}
