import React, { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";

const SITE_STORAGE_KEY = "nam_tello_dashboard_data";
const HIDDEN_LINES_KEY = "nam_tello_dashboard_hidden_lines";
const COLLAPSED_LINES_KEY = "nam_tello_dashboard_collapsed_lines";
const HOTSPOT_LABELS_KEY = "nam_tello_dashboard_hotspot_labels";

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

  const remainingUnit = String(line.dataRemaining || "")
    .toUpperCase()
    .includes("GB")
    ? "GB"
    : "MB";

  const totalUnit = String(line.dataTotal || "")
    .toUpperCase()
    .includes("GB")
    ? "GB"
    : "MB";

  const remainingMb = remainingUnit === "GB" ? remaining * 1024 : remaining;
  const totalMb = totalUnit === "GB" ? total * 1024 : total;

  return Math.max(0, Math.min(100, (remainingMb / totalMb) * 100));
}

function readStoredArray(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function makeLineKey(account, line) {
  return `${account.accountId || account.label || "account"}:${line.phone || "unknown"}`;
}

export default function TelloDashboard() {
  const [accounts, setAccounts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SITE_STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const [hiddenLines, setHiddenLines] = useState(() =>
    readStoredArray(HIDDEN_LINES_KEY)
  );

  const [collapsedLines, setCollapsedLines] = useState(() =>
    readStoredArray(COLLAPSED_LINES_KEY)
  );

  const [showHidden, setShowHidden] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncStatus, setSyncStatus] = useState("Waiting for extension");
  const [isSyncing, setIsSyncing] = useState(false);
  const [hotspotLabels, setHotspotLabels] = useState(() => {
  try {
    return JSON.parse(localStorage.getItem(HOTSPOT_LABELS_KEY) || "{}");
  } catch {
    return {};
  }
});
function saveHotspotLabels(next) {
  setHotspotLabels(next);
  localStorage.setItem(HOTSPOT_LABELS_KEY, JSON.stringify(next));
}

function addHotspotLabel(lineKey, label) {
  const clean = label.trim();
  if (!clean) return;

  const current = hotspotLabels[lineKey] || [];

  saveHotspotLabels({
    ...hotspotLabels,
    [lineKey]: [...current, clean],
  });
}

function removeHotspotLabel(lineKey, indexToRemove) {
  const current = hotspotLabels[lineKey] || [];

  saveHotspotLabels({
    ...hotspotLabels,
    [lineKey]: current.filter((_, index) => index !== indexToRemove),
  });
}

  function saveHiddenLines(next) {
    setHiddenLines(next);
    localStorage.setItem(HIDDEN_LINES_KEY, JSON.stringify(next));
  }

  function saveCollapsedLines(next) {
    setCollapsedLines(next);
    localStorage.setItem(COLLAPSED_LINES_KEY, JSON.stringify(next));
  }

  function toggleHidden(lineKey) {
    const next = hiddenLines.includes(lineKey)
      ? hiddenLines.filter((key) => key !== lineKey)
      : [...hiddenLines, lineKey];

    saveHiddenLines(next);
  }

  function toggleCollapsed(lineKey) {
    const next = collapsedLines.includes(lineKey)
      ? collapsedLines.filter((key) => key !== lineKey)
      : [...collapsedLines, lineKey];

    saveCollapsedLines(next);
  }

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

  const visibleLinesCount = useMemo(() => {
    return accounts.reduce((sum, account) => {
      return (
        sum +
        (account.lines || []).filter((line) => {
          const key = makeLineKey(account, line);
          return !hiddenLines.includes(key);
        }).length
      );
    }, 0);
  }, [accounts, hiddenLines]);

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

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowHidden((v) => !v)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-muted-foreground transition hover:bg-white/10"
          >
            {showHidden ? (
              <EyeOff className="h-4 w-4" strokeWidth={1.8} />
            ) : (
              <Eye className="h-4 w-4" strokeWidth={1.8} />
            )}
            {showHidden ? "Hide hidden phones" : "Show hidden phones"}
          </button>

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
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="text-xs text-muted-foreground">Saved accounts</div>
          <div className="mt-1 text-2xl font-black">{accounts.length}</div>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="text-xs text-muted-foreground">Visible lines</div>
          <div className="mt-1 text-2xl font-black">
            {visibleLinesCount}/{totalLines}
          </div>
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
          {accounts.map((account) => {
            const lines = account.lines || [];

            const visibleLines = lines.filter((line) => {
              const key = makeLineKey(account, line);
              return showHidden || !hiddenLines.includes(key);
            });

            return (
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
                    {visibleLines.length}/{lines.length} visible line(s)
                  </div>
                </div>

                <div className="space-y-3">
                  {visibleLines.map((line) => {
                    const percent = getDataPercent(line);
                    const lineKey = makeLineKey(account, line);
                    const isHidden = hiddenLines.includes(lineKey);
                    const isCollapsed = collapsedLines.includes(lineKey);

                    return (
                      <div
                        key={lineKey}
                        className={`rounded-2xl border p-4 transition ${
                          isHidden
                            ? "border-red-400/30 bg-red-500/5 opacity-60"
                            : "border-border/40 bg-background/40"
                        }`}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <button
                            type="button"
                            onClick={() => toggleCollapsed(lineKey)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            {isCollapsed ? (
                              <ChevronRight
                                className="h-5 w-5 shrink-0 text-muted-foreground"
                                strokeWidth={1.8}
                              />
                            ) : (
                              <ChevronDown
                                className="h-5 w-5 shrink-0 text-muted-foreground"
                                strokeWidth={1.8}
                              />
                            )}

<div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center md:justify-between">
  <div className="min-w-0">
    <div className="truncate text-lg font-black text-foreground">
      {line.phone}
    </div>

    <div className="text-xs text-muted-foreground">
      {line.dataRemaining || "Unknown"} remaining /{" "}
      {line.dataTotal || "Unknown"}
    </div>
  </div>

  <div className="w-full md:w-64">
    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span>Renewal: {line.renewalDate || "Unknown"}</span>
      <span>{Math.round(percent)}%</span>
    </div>

    <div className="h-2 overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  </div>
</div>
                          </button>

                          <div className="flex items-center gap-2">
                            <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">
                              {line.price || "Unknown"}
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleHidden(lineKey)}
                              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition ${
                                isHidden
                                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                                  : "border-red-400/30 bg-red-500/10 text-red-300"
                              }`}
                            >
                              {isHidden ? (
                                <>
                                  <Eye className="h-3.5 w-3.5" />
                                  Show
                                </>
                              ) : (
                                <>
                                  <EyeOff className="h-3.5 w-3.5" />
                                  Hide
                                </>
                              )}
                            </button>
                          </div>
                        </div>

{!isCollapsed && (
  <div className="mt-4 border-t border-border/30 pt-4">
    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      Connected hotspot phones
    </p>

    <div className="flex flex-col gap-2">
      {(hotspotLabels[lineKey] || []).length ? (
        hotspotLabels[lineKey].map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"
          >
            <span className="text-sm font-medium text-foreground">
              {label}
            </span>

            <button
              type="button"
              onClick={() => removeHotspotLabel(lineKey, index)}
              className="text-xs font-bold text-red-300 hover:text-red-200"
            >
              Remove
            </button>
          </div>
        ))
      ) : (
        <div className="rounded-xl bg-black/20 px-4 py-3 text-sm text-muted-foreground">
          No hotspot phones added yet
        </div>
      )}
    </div>

    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();

        const input = e.currentTarget.elements.hotspotLabel;
        addHotspotLabel(lineKey, input.value);
        input.value = "";
      }}
    >
      <input
        name="hotspotLabel"
        placeholder="Add label, ex: iPhone 15 Pro"
        className="flex-1 rounded-xl border border-border/40 bg-background/60 px-3 py-2 text-sm text-foreground outline-none"
      />

      <button
        type="submit"
        className="rounded-xl bg-sky-500/20 px-4 py-2 text-sm font-bold text-sky-300 hover:bg-sky-500/30"
      >
        Add
      </button>
    </form>
  </div>
)}
                      </div>
                    );
                  })}

                  {!visibleLines.length && (
                    <div className="rounded-2xl border border-dashed border-border/50 bg-background/30 p-6 text-center text-sm text-muted-foreground">
                      All phones in this account are hidden. Click{" "}
                      <b>Show hidden phones</b> above to bring one back.
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}