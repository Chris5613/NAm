import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";
import { reportFinancialParity } from "@/lib/financialParityTelemetry";

/**
 * Pure, nonposting server projection of depreciation and estimated power.
 * The prior local calculation is a read-only parity fallback.
 */
export function useBackendAutomaticExpenses(
  month, baseRows, manualEntries, autoPower, localEntries,
) {
  const signature = useMemo(() => JSON.stringify({
    month, baseRows, manualEntries, autoPower,
  }), [month, baseRows, manualEntries, autoPower]);
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    api.post("/api/project-tracking/financial-core/auto-expenses",
      JSON.parse(signature))
      .then(response => {
        if (active && response?.sourceOfCalculation === "backend-financial-core" &&
            response.month === month && Array.isArray(response.entries))
          setState({ signature, response });
      }).catch(() => { if (active) setState(null); });
    return () => { active = false; };
  }, [signature, month]);
  const response = state?.signature === signature ? state.response : null;
  const reconciled = automaticExpenseEntriesMatch(localEntries, response?.entries);
  useEffect(() => {
    if (response) reportFinancialParity(
      "automatic-expenses", month, reconciled,
      "backend-projection", signature);
  }, [response, month, reconciled, signature]);
  return reconciled ? response.entries : localEntries;
}

export function automaticExpenseEntriesMatch(local, remote) {
  if (!Array.isArray(local) || !Array.isArray(remote) ||
      local.length !== remote.length) return false;
  return local.every((entry, index) => {
    const candidate = remote[index];
    if (!candidate || entry.id !== candidate.id ||
        entry.date !== candidate.date ||
        entry.description !== candidate.description ||
        entry.automatic !== candidate.automatic ||
        Boolean(entry.estimated) !== Boolean(candidate.estimated)) return false;
    if (entry.lines.length !== candidate.lines?.length) return false;
    return entry.lines.every((line, lineIndex) => {
      const target = candidate.lines[lineIndex];
      return target?.account === line.account &&
        Math.abs(Number(line.debit) - Number(target.debit)) < .005 &&
        Math.abs(Number(line.credit) - Number(target.credit)) < .005;
    });
  });
}
