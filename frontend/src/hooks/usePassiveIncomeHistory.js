import { useEffect, useState } from "react";
import { useBackendIncomeHistory } from "@/hooks/useBackendIncomeHistory";
import { getCurrentMonthKey } from "@/lib/yieldFarmingAccounting";

/**
 * Shared recorded-income consumer for Spending and legacy dashboard widgets.
 * All provider sourcing, historical reconciliation, dividends and manual
 * earnings now come from the authenticated backend.
 */
export default function usePassiveIncomeHistory() {
  const [month, setMonth] = useState(getCurrentMonthKey);
  useEffect(() => {
    const timer = window.setInterval(
      () => setMonth(getCurrentMonthKey()), 60000
    );
    return () => window.clearInterval(timer);
  }, []);
  return useBackendIncomeHistory({ currentMonth: month });
}
