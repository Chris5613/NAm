import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import {
  readCryptoDashboardCache, writeCryptoDashboardCache,
  safeCryptoDashboardSnapshot,
} from "@/lib/cryptoDashboardCache";

const inFlight = new Map();

function requestSnapshot(userId) {
  const key = String(userId);
  if (inFlight.has(key)) return inFlight.get(key);
  const request = api.get("/api/project-tracking/crypto-dashboard")
    .then(result => {
      const verified = safeCryptoDashboardSnapshot(result, userId);
      if (!verified) throw new Error("Backend crypto snapshot is incomplete.");
      return verified;
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

/** Instant session preview, then revalidate the BACKEND source in background. */
export function useCryptoDashboardSnapshot() {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState(() => {
    const saved = readCryptoDashboardCache(userId);
    return { userId, data: saved?.data || null, cachedAt: saved?.cachedAt || 0,
             isCached: Boolean(saved), loading: false, error: null };
  });

  const refresh = useCallback(async () => {
    if (userId == null) return;
    setState(previous => ({ ...previous, loading: true }));
    try {
      const snapshot = await requestSnapshot(userId);
      const saved = writeCryptoDashboardCache(userId, snapshot);
      setState(previous => {
        if (String(previous.userId) !== String(userId)) return previous;
        return {
          userId, data: saved?.data || snapshot, cachedAt: saved?.cachedAt || Date.now(),
          isCached: false, loading: false, error: null,
        };
      });
    } catch {
      setState(previous => String(previous.userId) !== String(userId)
        ? previous
        : { ...previous, loading: false, error: "Could not refresh the backend snapshot." });
    }
  }, [userId]);

  useEffect(() => {
    const cached = readCryptoDashboardCache(userId);
    setState({ userId, data: cached?.data || null,
               cachedAt: cached?.cachedAt || 0,
               isCached: Boolean(cached), loading: false, error: null });
    if (userId == null) return;
    let active = true;
    const revalidate = () => { if (active) refresh(); };
    revalidate();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") revalidate();
    }, 30000);
    const focus = () => revalidate();
    const visible = () => { if (document.visibilityState === "visible") revalidate(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [userId, refresh]);

  const current = String(state.userId) === String(userId) && userId != null
    ? state : { data: null, cachedAt: 0, isCached: false, loading: false, error: null };
  return { ...current, refresh };
}
