import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import InvestmentOverview from "@/pages/InvestmentOverview";
import CloudPage from "@/pages/CloudPage";
import YieldFarmingPage from "@/pages/YieldFarmingPage";
import IncomeHistoryPage from "@/pages/IncomeHistoryPage";
import ProjectBreakEvenPage from "@/pages/ProjectBreakEvenPage";
import HardwarePaybackPage from "@/pages/HardwarePaybackPage";
import { Toaster } from "@/components/ui/sonner";
import { installKryptexExtensionListener } from "@/lib/kryptexExtensionSync";
import SpendingPage from "@/pages/SpendingPage";
import DoorDashPage from "@/pages/DoorDashPage";
import {
  AuthProvider,
  useAuth,
} from "@/lib/AuthContext";
import LoginScreen from "@/components/LoginScreen";
import {
  hydrate,
  resetStore,
  setStoreErrorHandler,
  getStoreConflicts,
  subscribeConflicts,
  resolveStoreConflict,
} from "@/lib/serverStore";
import {
  seedProjectCryptoCache,
  startProjectCryptoAutoSync,
} from "@/lib/projectCryptoPortfolio";
import { AlertTriangle, Loader2 } from "lucide-react";

let kryptexExtensionListenerStarted = false;

function App() {
  const [storeConflicts, setStoreConflicts] = useState(getStoreConflicts);
  const [resolvingConflicts, setResolvingConflicts] = useState(false);

  useEffect(() => subscribeConflicts(setStoreConflicts), []);

  const resolveAllConflicts = async (strategy) => {
    setResolvingConflicts(true);
    try {
      for (const key of getStoreConflicts()) {
        await resolveStoreConflict(key, strategy);
      }
      toast.success(strategy === "local"
        ? "Your changes were saved."
        : "Reloaded the latest server copy.");
    } catch (error) {
      toast.error(error?.message || "Could not resolve the data conflict.");
    } finally {
      setResolvingConflicts(false);
    }
  };

  useEffect(() => {
    if (kryptexExtensionListenerStarted) {
      return;
    }

    kryptexExtensionListenerStarted = true;
    installKryptexExtensionListener();
  }, []);

  /*
   * Keep Project Income + Bitcoin current regardless
   * of which page in NAm is open.
   *
   * Lulo, Loopscale and BTC refresh here.
   * The resulting total is also written to the existing
   * crypto cache used by the Net Worth dashboard.
   */
  useEffect(() => {
    const stop =
      startProjectCryptoAutoSync();

    return stop;
  }, []);

  return (
    <div className="min-h-screen">
      {storeConflicts.length > 0 && (
        <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center border-b border-amber-500/30 bg-amber-950/95 px-4 py-2 text-amber-100 shadow-lg">
          <div className="flex w-full max-w-4xl flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Unsaved changes conflict with data from another device.
            </span>
            <button
              type="button"
              disabled={resolvingConflicts}
              onClick={() => resolveAllConflicts("local")}
              className="rounded-md border border-amber-400/50 px-2.5 py-1 font-medium hover:bg-amber-400/10 disabled:opacity-50"
            >
              Keep this tab
            </button>
            <button
              type="button"
              disabled={resolvingConflicts}
              onClick={() => resolveAllConflicts("server")}
              className="rounded-md border border-amber-400/30 px-2.5 py-1 hover:bg-amber-400/10 disabled:opacity-50"
            >
              Use server copy
            </button>
          </div>
        </div>
      )}
      <BrowserRouter>
        <Sidebar />

        <main className={`min-h-screen min-w-0 pl-[240px] ${storeConflicts.length ? "pt-12" : ""}`}>
          <div className="min-h-screen w-full min-w-0 max-w-none px-3 py-4 sm:px-4 sm:py-5 xl:px-5 xl:py-5">
            <Routes>
              <Route
                path="/"
                element={<Dashboard />}
              />

              <Route
                path="/investments"
                element={
                  <InvestmentOverview />
                }
              />

              {/*
               * CryptoPage is retired.
               *
               * Old bookmarks still work, but now land
               * on Net Worth where the Crypto tab lives.
               */}
              <Route
                path="/crypto"
                element={
                  <Navigate
                    to="/"
                    replace
                  />
                }
              />

              <Route
                path="/yield-farming"
                element={
                  <YieldFarmingPage />
                }
              />

              <Route path="/income-history" element={<IncomeHistoryPage />} />
              <Route path="/project-break-even" element={<ProjectBreakEvenPage />} />
              <Route path="/hardware-payback" element={<HardwarePaybackPage />} />

              <Route
  path="/doordash"
  element={<DoorDashPage />}
/>

              <Route
                path="/spending"
                element={<SpendingPage />}
              />

              <Route
                path="/cloud"
                element={<CloudPage />}
              />
            </Routes>
          </div>
        </main>
      </BrowserRouter>
    </div>
  );
}

function AuthGate() {
  const {
    user,
    loading,
  } = useAuth();

  const [
    storeReady,
    setStoreReady,
  ] = useState(false);

  const [
    storeError,
    setStoreError,
  ] = useState("");

  /*
   * Pages read the server-backed store synchronously,
   * so hydrate first.
   *
   * Immediately after hydration we rebuild the crypto
   * cache from:
   *
   * Project Income + Bitcoin
   *
   * That means Dashboard sees the new Crypto total on
   * its very first render instead of waiting for the
   * retired Crypto page to populate it.
   */
  useEffect(() => {
    if (!user) {
      resetStore();
      setStoreReady(false);
      return;
    }

    let cancelled = false;

    setStoreErrorHandler((message) => {
      // Session-journal restore conflicts are informational: the server copy
      // already won and the tab retains its local edit. Do not spam the UI
      // with repeated error toasts for these expected cross-device conflicts.
      if (/^Could not restore ".+" automatically because it changed on the server\./.test(String(message || ""))) {
        console.info(message);
        return;
      }
      toast.error(message);
    });

    hydrate(user.id)
      .then(() => {
        try {
          seedProjectCryptoCache();
        } catch (error) {
          console.warn(
            "Could not seed Project Income crypto cache:",
            error
          );
        }

        if (!cancelled) {
          setStoreReady(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStoreError(
            error.message ||
              "Could not load your data."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (
    loading ||
    (
      user &&
      !storeReady &&
      !storeError
    )
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (storeError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <p className="font-semibold">
            Could not load your data
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            {storeError}
          </p>
        </div>
      </div>
    );
  }

  return user
    ? <App />
    : <LoginScreen />;
}

export default function Root() {
  return (
    <AuthProvider>
      <AuthGate />
      <Toaster />
    </AuthProvider>
  );
}
