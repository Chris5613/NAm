import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";

/** Read-only current ledger built by backend accounting modules.
 * Current journal is a nonposting browser draft. Prior provider income,
 * locked closes, approved movements and phones are read from server state.
 * A stale async response cannot replace another month or draft revision.
 */
export function useBackendCurrentLedger(payload) {
  const signature = useMemo(() => JSON.stringify(payload), [payload]);
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    if (!Array.isArray(payload.baseRows)) {
      setState({ signature, loading: true });
      return () => { active = false; };
    }
    setState(previous => previous?.signature === signature
      ? previous : { signature, loading: true });
    const refresh = () => api.post(
      "/api/project-tracking/financial-core/current-ledger",
      JSON.parse(signature)
    ).then(result => {
      if (!active) return;
      const valid = result?.sourceOfCalculation ===
        "backend-current-financial-ledger-v1" &&
        result.month === payload.month &&
        result.financialLedgerMutated === false &&
        Array.isArray(result.entries) &&
        result.entries.every(row => row && typeof row.id === "string" &&
          Array.isArray(row.lines)) &&
        result.income && Array.isArray(result.income.entries) &&
        result.automaticExpenses &&
        Array.isArray(result.automaticExpenses.entries);
      setState(valid ? { signature, data: result } :
        { signature, error: true });
    }).catch(() => {
      if (active) setState({ signature, error: true });
    });
    refresh();
    // Source income and confirmed movements can change while the browser
    // journal draft stays the same. Never replace a failed server response
    // with old browser-computed earnings.
    const timer = window.setInterval(refresh, 90000);
    return () => { active = false; window.clearInterval(timer); };
  }, [signature, payload.month, payload.baseRows]);
  return state?.signature === signature ? state : { loading: true };
}
