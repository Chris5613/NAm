import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/apiClient";

export function useBackendPhoneAssets(month, phones, localRows) {
  const signature = useMemo(() => JSON.stringify({ month, phones }),
    [month, phones]);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    api.post("/api/project-tracking/financial-core/phone-assets",
      JSON.parse(signature)).then(response => {
        if (active && response?.sourceOfCalculation === "backend-financial-core" &&
            response.month === month && Array.isArray(response.rows))
          setResult({ signature, rows: response.rows });
      }).catch(() => { if (active) setResult(null); });
    return () => { active = false; };
  }, [signature, month]);
  const rows = result?.signature === signature ? result.rows : null;
  if (!Array.isArray(localRows) || !Array.isArray(rows) ||
      rows.length !== localRows.length) return localRows;
  const parity = localRows.every((item, index) => {
    const remote = rows[index];
    return remote?.id === item.id && remote.name === item.name &&
      ["start","end","depreciation","historicalCost"].every(key =>
        item[key] == null || remote[key] == null
          ? item[key] == remote[key]
          : Math.abs(Number(item[key]) - Number(remote[key])) < .005);
  });
  return parity ? rows : localRows;
}
