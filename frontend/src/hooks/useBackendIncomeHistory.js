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
 * Warm verified backend monthly history concurrently with account hydration.
 * In-flight requests are shared with the chart. Generation protection in
 * financialFastCache prevents stale sessions from repopulating a cleared cache.
 * Unlike the old prefetch, it never rejects a request based on page unmount.
 */
export function prefetchBackendIncomeHistory(month) {
  if (!/^[0-9]{4}-[0-9]{2}$/.test(String(month))) return Promise.resolve(null);
  const path = incomePath(month);
  return requestFinancialCache(
    financialCacheKey(path),
    () => api.get(path),
    data => validIncomeHistory(data, month),
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
    maxAgeMs: 12000, intervalMs: 8000,
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
