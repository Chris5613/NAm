import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";

// Migration adapter. Server does the projection; a lagging network response
// cannot apply to another month/ledger revision, and no entries are posted.
export function useBackendAutoIncomeJournal(month, incomeMonth, manualJournal,
                                            currentMonth, todayKey) {
  const signature = useMemo(() => JSON.stringify({
    month, incomeMonth, manualJournal, currentMonth, todayKey,
  }), [month, incomeMonth, manualJournal, currentMonth, todayKey]);
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    const payload = JSON.parse(signature);
    api.post("/api/project-tracking/financial-core/auto-journal", payload)
      .then(data => {
        if (active && data?.sourceOfCalculation === "backend-financial-core" &&
            data.month === month) setState({ signature, data });
      }).catch(() => { if (active) setState(null); });
    return () => { active = false; };
  }, [month, signature]);
  return state?.signature === signature ? state.data : null;
}

export function autoIncomeMatches(local, remote) {
  if (!local || !remote) return false;
  const fields = ["syncedTotal", "manualRevenueTotal",
    "generatedRevenueTotal", "pendingReviewTotal", "unexplainedManualRevenue"];
  if (!fields.every(k => {
    if (local[k] == null || remote[k] == null) return local[k] == remote[k];
    return Math.abs(Number(local[k]) - Number(remote[k])) < 0.005;
  })) return false;
  const comparable = rows => (rows || []).map(row => ({
    id: row.id, date: row.date, amount: row.amount,
    lines: (row.lines || []).map(line => ({
      account: line.account, debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
    })),
  }));
  return JSON.stringify(comparable(local.entries)) ===
    JSON.stringify(comparable(remote.entries)) &&
    JSON.stringify(local.pendingReview) === JSON.stringify(remote.pendingReview);
}
