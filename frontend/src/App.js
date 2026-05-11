import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import InvestmentOverview from "@/pages/InvestmentOverview";
import CryptoPage from "@/pages/CryptoPage";
import GoMiningPage from "@/pages/GoMiningPage";
import IntegrationsPage from "@/pages/IntegrationsPage";
import PhoneList from "@/pages/PhoneList";
import UnityDevicesPage from "@/pages/UnityDevicesPage";
import { Toaster } from "@/components/ui/sonner";
import { netWorthApi } from "@/lib/api";
import { localStorage as storage } from "@/lib/localStorage";
import {
  syncNosanaEarnings,
  msUntilNext2345Utc,
  shouldRunCatchupNow,
  runTodayOnlyMigrationIfNeeded,
} from "@/lib/nosanaSync";
import { runAcurastUsdToAcuMigrationIfNeeded } from "@/lib/acurastSync";
import { installExtensionListener } from "@/lib/unityNetworkExtensionSync";
import { bootstrapDemoData } from "@/lib/bootstrap";
import TelloDashboard from "./pages/TelloDashboard";


// Module-level flag prevents React.StrictMode from double-firing the daily
// snapshot in dev. Survives the StrictMode remount; reset on full page reload.
let dailySnapshotAttempted = false;
let nosanaSchedulerStarted = false;
let demoBootstrapAttempted = false;
let unityExtensionListenerStarted = false;

function App() {
  // Daily auto-snapshot: on first mount each calendar day, append a net-worth
  // snapshot to history. Idempotent — only runs once per day per browser.
  useEffect(() => {
    if (dailySnapshotAttempted) return;
    dailySnapshotAttempted = true;
    const ensureDailySnapshot = async () => {
      try {
        const history = storage.getHistory() || [];
        const today = new Date().toISOString().split("T")[0];
        const last = history[history.length - 1];
        const lastDay = last?.timestamp ? last.timestamp.split("T")[0] : null;
        if (lastDay === today) return; // already snapshotted today
        await netWorthApi.saveSnapshot('auto');
      } catch {
        /* silent — snapshot is best-effort */
      }
    };
    ensureDailySnapshot();
  }, []);

  // One-time demo bootstrap — pre-seeds the Nosana config + first sync so
  // the user can play with the app immediately. No-op if the user already
  // has Nosana configured or if we've seeded before.
  //
  // We chain the today-only migration *after* bootstrap so demo users who
  // were seeded with the legacy 35-day backfill get auto-collapsed to a
  // "today only" view (matches the latest product spec) on next app load.
  useEffect(() => {
    if (demoBootstrapAttempted) return;
    demoBootstrapAttempted = true;
    (async () => {
      await bootstrapDemoData();
      await runTodayOnlyMigrationIfNeeded();
      // Acurast switched data models (USD → ACU tokens). Wipes any earlier
      // USD-based config + its synced txns so the user starts clean.
      await runAcurastUsdToAcuMigrationIfNeeded();
    })();
  }, []);

  // Nosana auto-sync scheduler — fires at 23:45 UTC daily. Also runs an
  // immediate catch-up sync if the user opens the app after 23:45 UTC and
  // today's sync was missed (e.g. browser was closed). Module-level flag
  // guards against StrictMode double-mount.
  useEffect(() => {
    if (nosanaSchedulerStarted) return;
    nosanaSchedulerStarted = true;

    let timeoutId = null;

    const runOnce = async () => {
      try {
        const config = storage.getNosanaConfig();
        if (!config?.enabled || !config?.node_address) return;
        await syncNosanaEarnings({ silent: true });
      } catch (err) {
        console.warn("Nosana scheduled sync failed:", err);
      }
    };

    const scheduleNext = () => {
      const delay = msUntilNext2345Utc();
      timeoutId = setTimeout(async () => {
        await runOnce();
        scheduleNext();
      }, delay);
    };

    // Catch-up: if the user opens the app after 23:45 UTC and we missed
    // today's sync, fire one immediately. Then schedule the next 23:45 UTC.
    if (shouldRunCatchupNow()) {
      // Defer slightly so the rest of the app boots first.
      setTimeout(runOnce, 4000);
    }
    scheduleNext();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Unity Nodes Chrome-extension listener — registers a window.postMessage
  // handler so the extension's content script can push earnings to us in
  // real time. Pure client-side: no polling, no backend hop. The extension
  // runs its own schedule (default 7:30 PM PST) and posts whenever it has
  // fresh data. Idempotent on payload.synced_at.
  useEffect(() => {
    if (unityExtensionListenerStarted) return;
    unityExtensionListenerStarted = true;
    installExtensionListener();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <BrowserRouter>
        <Sidebar />
        <main className="pl-56 min-h-screen">
          <div className="max-w-[1400px] mx-auto px-6 py-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/investments" element={<InvestmentOverview />} />
              <Route path="/crypto" element={<CryptoPage />} />
              <Route path="/gomining" element={<GoMiningPage />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
              <Route path="/phone-list" element={<PhoneList />} />
              <Route path="/unity-devices" element={<UnityDevicesPage />} />
              <Route path="/tello-dashboard" element={<TelloDashboard />} />
            </Routes>
          </div>
        </main>
      </BrowserRouter>
      <Toaster />
    </div>
  );
}

export default App;
