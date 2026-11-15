import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { financialCacheKey, readFinancialCache, requestFinancialCache } from "@/lib/financialFastCache";

/**
 * Authenticated Financials read-through cache. It stores only backend-
 * validated projections in memory, never saves ledger data or derives money.
 * Fast cached data is shown while server refreshes; an unavailable backend
 * is reported instead of treating an old cached result as verified forever.
 */
export function useFinancialFastQuery({
  path, payload, validator, intervalMs = 90000, maxAgeMs = 15000,
  enabled = true, onFocus = true,
}) {
  const signature = useMemo(
    () => financialCacheKey(path, payload), [path, payload]
  );
  const validatorRef = useRef(validator);
  validatorRef.current = validator;
  const [result, setResult] = useState(() => {
    const data = enabled ? readFinancialCache(signature, maxAgeMs) : null;
    return data === null ? { signature, loading: true } :
      { signature, data, cached: true, refreshing: true };
  });

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setResult({ signature, loading: true });
      return () => { active = false; };
    }
    const cached = readFinancialCache(signature, maxAgeMs);
    setResult(previous => {
      if (cached !== null) {
        return { signature, data: cached, cached: true, refreshing: true };
      }
      return previous.signature === signature && previous.data ?
        { ...previous, refreshing: true } : { signature, loading: true };
    });
    const refresh = () => requestFinancialCache(
      signature,
      () => payload === undefined ? api.get(path) : api.post(path, payload),
      data => validatorRef.current(data),
      { force: true, maxAgeMs },
    ).then(data => {
      if (active) setResult({ signature, data, cached: false, refreshing: false });
    }).catch(() => {
      if (!active) return;
      setResult(previous => previous.signature === signature && previous.data
        ? { ...previous, refreshing: false, error: true }
        : { signature, error: true });
    });
    refresh();
    const timer = intervalMs > 0 ? window.setInterval(refresh, intervalMs) : null;
    if (onFocus) window.addEventListener("focus", refresh);
    return () => {
      active = false;
      if (timer !== null) window.clearInterval(timer);
      if (onFocus) window.removeEventListener("focus", refresh);
    };
  // signature captures exact payload; do not re-fetch for an unstable
  // validator function or an equivalent newly allocated payload object.
  }, [signature, enabled, path, intervalMs, maxAgeMs, onFocus]);
  return result.signature === signature ? result : { signature, loading: true };
}
