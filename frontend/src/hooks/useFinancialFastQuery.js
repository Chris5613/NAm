import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { financialCacheKey, readFinancialCacheState, requestFinancialCache, clearFinancialCache } from "@/lib/financialFastCache";

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
    const cached = enabled ? readFinancialCacheState(signature, maxAgeMs) : null;
    return cached === null ? { signature, loading: true } :
      { signature, data: cached.data, cached: true, stale: cached.stale, refreshing: cached.stale };
  });

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setResult({ signature, loading: true });
      return () => { active = false; };
    }
    const cached = readFinancialCacheState(signature, maxAgeMs);
    setResult(previous => {
      if (cached !== null) {
        return { signature, data: cached.data, cached: true, stale: cached.stale,
          refreshing: cached.stale };
      }
      return previous.signature === signature && previous.data ?
        { ...previous, refreshing: true } : { signature, loading: true };
    });
    // Request from the stable serialized key rather than the newly allocated
    // render-time payload, keeping refresh intervals keyed to exact inputs.
    const requestPayload = JSON.parse(signature)[1];
    const refresh = () => requestFinancialCache(
      signature,
      () => requestPayload === null ? api.get(path) : api.post(path, requestPayload),
      data => validatorRef.current(data),
      { force: true, maxAgeMs },
    ).then(data => {
      if (active) setResult({ signature, data, cached: false, stale: false, refreshing: false });
    }).catch(error => {
      if (!active) return;
      // A rejected session must never continue showing another signed-in user's
      // prior financial projections, even temporarily.
      if (error?.status === 401 || error?.status === 403) {
        clearFinancialCache();
        setResult({ signature, error: true, unauthorized: true });
        return;
      }
      setResult(previous => previous.signature === signature && previous.data
        ? { ...previous, stale: true, refreshing: false, error: true }
        : { signature, error: true });
    });
    // A fresh cached result already satisfies this request. Do not make a
    // redundant network call on every tab/page remount.
    if (cached === null || cached.stale) refresh();
    const timer = intervalMs > 0 ? window.setInterval(refresh, intervalMs) : null;
    const refreshOnFocus = () => {
      const current = readFinancialCacheState(signature, maxAgeMs);
      if (!current || current.stale) refresh();
    };
    if (onFocus) window.addEventListener("focus", refreshOnFocus);
    return () => {
      active = false;
      if (timer !== null) window.clearInterval(timer);
      if (onFocus) window.removeEventListener("focus", refreshOnFocus);
    };
  // signature captures exact payload; do not re-fetch for an unstable
  // validator function or an equivalent newly allocated payload object.
  }, [signature, enabled, path, intervalMs, maxAgeMs, onFocus]);
  return result.signature === signature ? result : { signature, loading: true };
}
