import "@/App.css";
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
} from "@/lib/serverStore";
import {
  seedProjectCryptoCache,
  startProjectCryptoAutoSync,
} from "@/lib/projectCryptoPortfolio";
import { Loader2 } from "lucide-react";

let kryptexExtensionListenerStarted = false;

function App() {
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
   * Lulo, RateX, Loopscale and BTC refresh here.
   * The resulting total is also written to the existing
   * crypto cache used by the Net Worth dashboard.
   */
  useEffect(() => {
    const stop =
      startProjectCryptoAutoSync();

    return stop;
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <BrowserRouter>
        <Sidebar />

        <main className="min-h-screen pl-[244px]">
          <div className="w-full px-8 py-7">
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

    setStoreErrorHandler(
      (message) =>
        toast.error(message)
    );

    hydrate()
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