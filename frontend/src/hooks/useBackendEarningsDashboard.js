import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { getTodayKey } from "@/lib/yieldFarmingAccounting";
import { subscribe } from "@/lib/serverStore";
import {
  readBackendEarningsCache, writeBackendEarningsCache,
  validateBackendEarningsSnapshot,
} from "@/lib/backendEarningsCache";

const pending = new Map();

function fetchBackendEarnings(userId, month, todayKey, projectsOnly = false) {
  const key = String(userId) + ":" + month + ":" + todayKey + ":" + projectsOnly;
  if (pending.has(key)) return pending.get(key);
  const request = api.get(`/api/project-tracking/earnings-dashboard/${month}${projectsOnly ? "?projects_only=true" : ""}`)
    .then(result => {
      const validated = validateBackendEarningsSnapshot(result, month, todayKey);
      if (!validated) throw new Error("Invalid backend earnings dashboard response");
      return validated;
    }).finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
  pending.set(key, request);
  return request;
}

/**
 * Warm the authenticated Crypto Dashboard before opening it.
 * A cancellation guard prevents logout/switching accounts from storing
 * a response from the preceding session.
 */
export async function prefetchBackendEarningsDashboard(userId, month, isCurrent = () => true) {
  if (userId == null || !/^\d{4}-\d{2}$/.test(String(month))) return null;
  const todayKey = getTodayKey();
  const previous = readBackendEarningsCache(userId, month, todayKey);
  if (previous && Date.now() - previous.cachedAt < 30_000) return previous;
  const data = await fetchBackendEarnings(userId, month, todayKey);
  if (!isCurrent()) return null;
  return writeBackendEarningsCache(userId, month, data);
}

/**
 * Account-specific session preview followed by backend revalidation.
 * No local earnings formula, cached figure writeback, or invented $0.
 */
export function useBackendEarningsDashboard(month, projectsOnly = false) {
  const { user } = useAuth();
  const userId = user?.id;
  const cacheUserId = projectsOnly && userId != null ? String(userId) + ":projects-only" : userId;
  const [state, setState] = useState(() => {
    const saved = readBackendEarningsCache(cacheUserId, month, getTodayKey());
    return { userId, month, todayKey: getTodayKey(), data: saved?.data || null,
      cachedAt: saved?.cachedAt || 0, isCached: Boolean(saved), error: null };
  });

  useEffect(() => {
    const todayKey = getTodayKey();
    const saved = readBackendEarningsCache(cacheUserId, month, todayKey);
    setState({ userId, month, todayKey, data: saved?.data || null,
      cachedAt: saved?.cachedAt || 0, isCached: Boolean(saved), error: null });
    if (userId == null || !/^\d{4}-\d{2}$/.test(String(month))) return;

    let active = true;
    const refresh = async () => {
      const requestingDay = getTodayKey();
      if (requestingDay !== todayKey) {
        // A Pacific midnight rollover requires a fresh date-specific result.
        // Never carry a yesterday total forward as today's income.
        if (active) setState(previous => ({ ...previous,
          todayKey: requestingDay, data: null, isCached: false, cachedAt: 0 }));
      }
      try {
        const data = await fetchBackendEarnings(userId, month, requestingDay, projectsOnly);
        if (!active || requestingDay !== getTodayKey()) return;
        const savedResult = writeBackendEarningsCache(cacheUserId, month, data);
        if (active) setState({ userId, month, todayKey: requestingDay,
          data: savedResult?.data || data, cachedAt: savedResult?.cachedAt || Date.now(),
          isCached: Boolean(savedResult && Date.parse(savedResult.data.calculatedAt) >
            Date.parse(data.calculatedAt)), error: null });
      } catch {
        if (active) setState(previous => ({
          ...previous, error: "Backend earnings unavailable; showing last verified snapshot.",
        }));
      }
    };

    refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30000);
    // Extension imports are persisted with a short server-store debounce.
    // Read the fresh backend projection as soon as a provider reading saves
    // rather than waiting for the next 30-second timer. This does not use
    // the browser's earnings estimate as an accounting total.
    let sourceTimer = null;
    const providerKeys = new Set([
      "project_income_kryptex_tracker_v1",
      "project_income_salad_tracker_v1",
      "project_income_unetwork_tracker_v1",
      "project_income_rollercoin_tracker_v2",
      "yield_today_earnings_high_water_v1",
      "yield_daily_earnings_by_source_v2",
    ]);
    const unsubscribe = subscribe(key => {
      if (!active || document.hidden || !providerKeys.has(key)) return;
      if (sourceTimer !== null) window.clearTimeout(sourceTimer);
      sourceTimer = window.setTimeout(() => {
        sourceTimer = null;
        if (active) refresh();
      }, 1500);
    });
    const visible = () => { if (!document.hidden) refresh(); };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(interval);
      if (sourceTimer !== null) window.clearTimeout(sourceTimer);
      unsubscribe();
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [userId, month, projectsOnly, cacheUserId]);

  const todayKey = getTodayKey();
  const current = userId != null && String(state.userId) === String(userId) &&
    state.month === month && state.todayKey === todayKey ? state :
    { userId, month, data: null, cachedAt: 0, isCached: false,
      error: null };
  return { data: current.data, error: current.error,
    isCached: current.isCached, cachedAt: current.cachedAt };
}
