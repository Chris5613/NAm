import { useFinancialFastQuery } from "@/hooks/useFinancialFastQuery";

/** Short-lived cache of backend source-account valuations, never wallet-derived. */
export function useBackendFinancialLiveBalances() {
  const state = useFinancialFastQuery({
    path: "/api/project-tracking/financial-core/home-business",
    maxAgeMs: 10000, intervalMs: 30000,
    validator: result => result?.sourceOfCalculation === "backend-home-business" &&
      result.live && typeof result.live === "object" &&
      !Array.isArray(result.live) &&
      Object.values(result.live).every(value =>
        typeof value === "number" && Number.isFinite(value)),
  });
  return {
    ...state,
    live: state.data?.live || null,
    observedMonth: state.data?.month,
  };
}
