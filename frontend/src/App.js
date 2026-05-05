import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import InvestmentOverview from "@/pages/InvestmentOverview";
import CryptoPage from "@/pages/CryptoPage";
import GoMiningPage from "@/pages/GoMiningPage";
import PhoneList from "@/pages/PhoneList";
import { Toaster } from "@/components/ui/sonner";
import { netWorthApi } from "@/lib/api";
import { localStorage as storage } from "@/lib/localStorage";
import { syncNosanaEarnings, msUntilNext2345Utc, shouldRunCatchupNow } from "@/lib/nosanaSync";

// Module-level flag prevents React.StrictMode from double-firing the daily
// snapshot in dev. Survives the StrictMode remount; reset on full page reload.
let dailySnapshotAttempted = false;
let nosanaSchedulerStarted = false;

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
              <Route path="/phone-list" element={<PhoneList />} />
            </Routes>
          </div>
        </main>
      </BrowserRouter>
      <Toaster />
    </div>
  );
}

export default App;
