import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Smartphone, CheckCircle2, AlertCircle } from "lucide-react";

const SITE_STORAGE_KEY = "nam_tello_dashboard_data";

function formatUpdated(value) {
  if (!value) return "Unknown";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return "Unknown";
  }
}

function getDataPercent(line) {
  const remaining = parseFloat(line?.dataRemaining);
  const total = parseFloat(line?.dataTotal);

  if (!Number.isFinite(remaining) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  const remainingUnit = String(line.dataRemaining || "").toUpperCase().includes("GB")
    ? "GB"
    : "MB";

  const totalUnit = String(line.dataTotal || "").toUpperCase().includes("GB")
    ? "GB"
    : "MB";

  const remainingMb = remainingUnit === "GB" ? remaining * 1024 : remaining;
  const totalMb = totalUnit === "GB" ? total * 1024 : total;

  return Math.max(0, Math.min(100, (remainingMb / totalMb) * 100));
}

export default function TelloDashboard() {
  const [accounts, setAccounts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SITE_STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const [lastSync, setLastSync] = useState(null);
  const [syncStatus, setSyncStatus] = useState("Waiting for extension");
  const [isSyncing, setIsSyncing] = useState(false);

  function syncFromExtension() {
    console.log("[NAmTelloDashboard] Requesting sync from extension...");

    setIsSyncing(true);
    setSyncStatus("Requesting data from extension...");

    window.postMessage(
      {
        type: "NAM_TELLO_REQUEST_SYNC",
      },
      "*"
    );

    setTimeout(() => {
      setIsSyncing(false);
    }, 1200);
  }

  useEffect(() => {
    function handleMessage(event) {
      if (event.source !== window) return;
      if (event.data?.type !== "NAM_TELLO_DATA_SYNC") return;

      const nextAccounts = Array.isArray(event.data.accounts)
        ? event.data.accounts
        : [];

      console.log("[NAmTelloDashboard] Received Tello accounts:", nextAccounts);

      setAccounts(nextAccounts);
      setLastSync(new Date().toISOString());
      setIsSyncing(false);

      localStorage.setItem(SITE_STORAGE_KEY, JSON.stringify(nextAccounts));

      if (nextAccounts.length) {
        setSyncStatus(`Synced ${nextAccounts.length} account(s) from extension`);
      } else {
        setSyncStatus("Extension connected, but no saved Tello data found");
      }
    }

    window.addEventListener("message", handleMessage);

    syncFromExtension();

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const totalLines = useMemo(() => {
    return accounts.reduce((sum, account) => {
      return sum + (account.lines?.length || 0);
    }, 0);
  }, [accounts]);

  return (
    <div className="min-h-screen text-white">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-sky-400">NAm</p>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Tello Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Synced from your Chrome extension.
          </p>

          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            {accounts.length ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-yellow-400" />
            )}
            <span>{syncStatus}</span>
          </div>
        </div>

        <button
          onClick={syncFromExtension}
          disabled={isSyncing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-bold text-sky-300 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
            strokeWidth={1.8}
          />
          {isSyncing ? "Syncing..." : "Sync from Extension"}
        </button>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="text-xs text-muted-foreground">Saved accounts</div>
          <div className="mt-1 text-2xl font-black">{accounts.length}</div>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="text-xs text-muted-foreground">Saved lines</div>
          <div className="mt-1 text-2xl font-black">{totalLines}</div>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="text-xs text-muted-foreground">Last page sync</div>
          <div className="mt-1 text-sm font-bold text-foreground">
            {lastSync ? formatUpdated(lastSync) : "Not synced yet"}
          </div>
        </div>
      </div>

      {!accounts.length ? (
        <div className="rounded-3xl border border-dashed border-border/60 bg-card/50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10">
            <Smartphone className="h-6 w-6 text-sky-300" strokeWidth={1.8} />
          </div>

          <h2 className="text-xl font-black">No Tello data synced yet</h2>

          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Open Tello, scan your account with the extension, then come back here
            and click <b>Sync from Extension</b>.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {accounts.map((account) => (
            <section
              key={account.accountId || account.label}
              className="rounded-3xl border border-border/40 bg-card p-4 shadow-2xl shadow-black/20"
            >
              <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-black text-sky-300">
                    {account.label || "Tello Account"}
                  </h2>

                  <p className="text-xs text-muted-foreground">
                    Last scanned: {formatUpdated(account.lastScanned)}
                  </p>
                </div>

                <div className="text-sm font-bold text-muted-foreground">
                  {account.lines?.length || 0} line(s)
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {(account.lines || []).map((line) => {
                  const percent = getDataPercent(line);

                  return (
                    <div
                      key={line.phone}
                      className="rounded-2xl border border-border/40 bg-background/40 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-black text-foreground">
                            {line.phone}
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground">
                            {line.plan || "Unknown plan"}
                          </div>
                        </div>

                        <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">
                          {line.price || "Unknown"}
                        </div>
                      </div>

                      <div className="mt-5 flex items-end justify-between gap-3">
                        <div>
                          <div className="text-3xl font-black text-foreground">
                            {line.dataRemaining || "Unknown"}
                          </div>

                          <div className="text-xs text-muted-foreground">
                            remaining / {line.dataTotal || "Unknown"}
                          </div>
                        </div>

                        <div className="rounded-full bg-sky-400/10 px-3 py-1 text-xs font-black text-sky-300">
                          {line.texts || "Unknown"}
                        </div>
                      </div>

                      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>

                      <div className="mt-4 flex flex-col gap-1 text-xs text-muted-foreground">
                        <span>Renewal: {line.renewalDate || "Unknown"}</span>
                        <span>Updated: {formatUpdated(line.lastScanned)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}