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

