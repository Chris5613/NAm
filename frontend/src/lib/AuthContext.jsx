import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi, ApiError } from "@/lib/apiClient";

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const me = await authApi.me();
      setUser(me);
      setUnreachable(false);
    } catch (error) {
      setUser(null);
      if (error instanceof ApiError && error.status === 0) {
        setUnreachable(true);
      } else {
        setUnreachable(false);
        try {
          const status = await authApi.status();
          setNeedsSetup(Boolean(status?.needs_setup));
        } catch {
          setUnreachable(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      needsSetup,
      loading,
      unreachable,
      refresh,
      login: async (username, password) => {
        await authApi.login(username, password);
        await refresh();
      },
      setup: async (username, password) => {
        await authApi.setup(username, password);
        await refresh();
      },
      logout: async () => {
        await authApi.logout();
        setUser(null);
        await refresh();
      },
    }),
    [loading, needsSetup, refresh, unreachable, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
