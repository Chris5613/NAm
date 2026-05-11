import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "nam_tello_dashboard_data";

function formatUpdated(value) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "Unknown";
  }
}

function getDataPercent(line) {
  const remaining = parseFloat(line.dataRemaining);
  const total = parseFloat(line.dataTotal);

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
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    function handleMessage(event) {
      if (event.source !== window) return;
      if (event.data?.type !== "NAM_TELLO_DATA_SYNC") return;

      const nextAccounts = Array.isArray(event.data.accounts)
        ? event.data.accounts
        : [];

      setAccounts(nextAccounts);
      setLastSync(new Date().toISOString());

      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAccounts));
    }

    window.addEventListener("message", handleMessage);

    window.postMessage(
      {
        type: "NAM_TELLO_REQUEST_SYNC"
      },
      "*"
    );

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const totalLines = useMemo(() => {
    return accounts.reduce((sum, account) => {
      return sum + (account.lines?.length || 0);
    }, 0);
  }, [accounts]);

  return (
    <div className="min-h-screen bg-[#0f1419] text-white px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-sky-400">NAm</p>
            <h1 className="text-3xl font-black tracking-tight text-white">
              Tello Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Synced from your Chrome extension.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-xs text-slate-400">Total saved lines</div>
            <div className="text-2xl font-black text-sky-300">{totalLines}</div>
          </div>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#151c24] p-4">
            <div className="text-xs text-slate-400">Saved accounts</div>
            <div className="mt-1 text-2xl font-black">{accounts.length}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#151c24] p-4">
            <div className="text-xs text-slate-400">Lines</div>
            <div className="mt-1 text-2xl font-black">{totalLines}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#151c24] p-4">
            <div className="text-xs text-slate-400">Last page sync</div>
            <div className="mt-1 text-sm font-bold text-slate-200">
              {lastSync ? formatUpdated(lastSync) : "Waiting for extension"}
            </div>
          </div>
        </div>

        {!accounts.length ? (
          <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
            <h2 className="text-xl font-black">No Tello data synced yet</h2>
            <p className="mt-2 text-sm text-slate-400">
              Open Tello, scan your account with the extension, then come back to this page.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {accounts.map((account) => (
              <section
                key={account.accountId || account.label}
                className="rounded-3xl border border-white/10 bg-[#121922] p-4 shadow-2xl shadow-black/20"
              >
                <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-xl font-black text-sky-300">
                      {account.label || "Tello Account"}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Last scanned: {formatUpdated(account.lastScanned)}
                    </p>
                  </div>

                  <div className="text-sm font-bold text-slate-300">
                    {account.lines?.length || 0} line(s)
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {(account.lines || []).map((line) => {
                    const percent = getDataPercent(line);

                    return (
                      <div
                        key={line.phone}
                        className="rounded-2xl border border-white/10 bg-[#18212b] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-black text-white">
                              {line.phone}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {line.plan || "Unknown plan"}
                            </div>
                          </div>

                          <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">
                            {line.price || "Unknown"}
                          </div>
                        </div>

                        <div className="mt-5 flex items-end justify-between gap-3">
                          <div>
                            <div className="text-3xl font-black text-white">
                              {line.dataRemaining || "Unknown"}
                            </div>
                            <div className="text-xs text-slate-500">
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

                        <div className="mt-4 flex flex-col gap-1 text-xs text-slate-500">
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
    </div>
  );
}