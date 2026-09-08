import "@/App.css";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import InvestmentOverview from "@/pages/InvestmentOverview";
import CryptoPage from "@/pages/CryptoPage";
import IntegrationsPage from "@/pages/IntegrationsPage";
import CloudPage from "@/pages/CloudPage";
import { Toaster } from "@/components/ui/sonner";
import { installKryptexExtensionListener } from "@/lib/kryptexExtensionSync";
import SpendingPage from "./pages/SpendingPage";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import LoginScreen from "@/components/LoginScreen";
import { hydrate, resetStore, setStoreErrorHandler } from "@/lib/serverStore";
import { Loader2 } from "lucide-react";


let kryptexExtensionListenerStarted = false;

function App() {
  // Kryptex browser-extension bridge — works on the deployed site with no
  // backend, since the extension itself reaches 127.0.0.1:8107 locally.
  useEffect(() => {
    if (kryptexExtensionListenerStarted) return;
    kryptexExtensionListenerStarted = true;
    installKryptexExtensionListener();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <BrowserRouter>
        <Sidebar />
        <main className="pl-56 min-h-screen">
          <div className="w-full p-6 py-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/investments" element={<InvestmentOverview />} />
              <Route path="/crypto" element={<CryptoPage />} />
              <Route path="/spending" element={<SpendingPage />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
              <Route path="/cloud" element={<CloudPage />} />
            </Routes>
          </div>
        </main>
      </BrowserRouter>
    </div>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  const [storeReady, setStoreReady] = useState(false);
  const [storeError, setStoreError] = useState("");

  // Pages read the store synchronously, so it must be populated before they mount.
  useEffect(() => {
    if (!user) {
      resetStore();
      setStoreReady(false);
      return;
    }
    let cancelled = false;
    setStoreErrorHandler((message) => toast.error(message));
    hydrate()
      .then(() => !cancelled && setStoreReady(true))
      .catch((error) => !cancelled && setStoreError(error.message || "Could not load your data."));
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || (user && !storeReady && !storeError)) {
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
          <p className="font-semibold">Could not load your data</p>
          <p className="mt-2 text-sm text-muted-foreground">{storeError}</p>
        </div>
      </div>
    );
  }
  return user ? <App /> : <LoginScreen />;
}

export default function Root() {
  return (
    <AuthProvider>
      <AuthGate />
      <Toaster />
    </AuthProvider>
  );
}
