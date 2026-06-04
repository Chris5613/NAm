import { useEffect, useState } from "react";
import { Server, RefreshCw, Wallet, Activity, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cloreTrackingApi } from "@/lib/api";

export default function CloreEarningsCard() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [projectName, setProjectName] = useState("Clore AI");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = async () => {
    try {
      const res = await cloreTrackingApi.getStatus();
      setStatus(res.data);

      if (res.data?.project_name) {
        setProjectName(res.data.project_name);
      }
    } catch (err) {
      console.warn("Failed to load Clore status:", err);
    }
  };

  const loadOverview = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await cloreTrackingApi.getOverview();
      setData(res.data);
    } catch (err) {
      setError(err.message || "Failed to load Clore data");
    } finally {
      setLoading(false);
    }
  };

  const syncEarnings = async () => {
    try {
      setSyncing(true);
      setError("");

      await cloreTrackingApi.configure(projectName);

      const res = await cloreTrackingApi.sync(projectName);
      setData(res.data);

      await loadStatus();
    } catch (err) {
      setError(err.message || "Failed to sync Clore earnings");
    } finally {
      setSyncing(false);
    }
  };

  const resetBaseline = async () => {
    try {
      setSyncing(true);
      setError("");

      const res = await cloreTrackingApi.resetBaseline();

      setStatus((prev) => ({
        ...(prev || {}),
        ...res.data,
        history: [],
      }));

      await loadOverview();
    } catch (err) {
      setError(err.message || "Failed to reset Clore baseline");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadStatus();
    loadOverview();
  }, []);

  const cloreBalance = Number(data?.cloreBalance || 0);
  const dailyPotentialClore = Number(data?.totalDailyPotentialClore || 0);
  const earnedClore = Number(data?.earnedClore || 0);
  const history = status?.history || data?.history || [];

  return (
    <div
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
      data-testid="clore-earnings-card"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-emerald-400" strokeWidth={1.5} />
            <h2 className="text-xl font-semibold text-foreground">
              Clore AI
            </h2>
          </div>

          <p className="text-sm text-muted-foreground mt-1">
            Track CLORE balance, server status, and sync new CLORE earnings into Project Overview.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={loadOverview}
            disabled={loading || syncing}
            variant="outline"
            size="sm"
            data-testid="refresh-clore-btn"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>

          <Button
            onClick={syncEarnings}
            disabled={loading || syncing}
            className="bg-white text-black hover:bg-neutral-200"
            size="sm"
            data-testid="sync-clore-btn"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`}
            />
            Sync Earnings
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
        <div>
          <label className="text-xs text-muted-foreground">
            Project name in Project Overview
          </label>

          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
            placeholder="Clore AI"
          />
        </div>

        <div className="flex items-end">
          <Button
            onClick={resetBaseline}
            disabled={loading || syncing}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Baseline
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {!data && !error && (
        <div className="mt-4 text-sm text-muted-foreground">
          {loading ? "Loading Clore data..." : "No Clore data loaded yet."}
        </div>
      )}

      {data && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <MetricBox
              icon={<Wallet className="w-4 h-4" strokeWidth={1.5} />}
              label="CLORE Balance"
              value={`${cloreBalance.toFixed(8)} CLORE`}
            />

            <MetricBox
              icon={<Activity className="w-4 h-4" strokeWidth={1.5} />}
              label="Daily Potential"
              value={`${dailyPotentialClore.toFixed(8)} CLORE/day`}
            />

            <MetricBox
              label="New Synced Earnings"
              value={`+${earnedClore.toFixed(8)} CLORE`}
            />

            <MetricBox
              label="Servers Online"
              value={`${data.onlineServers}/${data.totalServers}`}
            />
          </div>

          {data.servers?.length > 0 ? (
            <div className="space-y-3">
              {data.servers.map((server) => (
                <div
                  key={server.name}
                  className="rounded-xl border border-border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-foreground">
                        {server.name}
                      </h3>

                      <p className="text-sm text-muted-foreground">
                        {server.gpu}
                      </p>
                    </div>

                    <span className="text-sm">
                      {server.online ? "🟢 Online" : "🔴 Offline"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
              No Clore servers found.
            </div>
          )}

          {history.length > 0 && (
            <div className="rounded-xl border border-border p-4">
              <h3 className="text-sm font-medium text-foreground">
                Recent CLORE Sync History
              </h3>

              <div className="mt-3 space-y-2">
                {history
                  .slice()
                  .reverse()
                  .slice(0, 7)
                  .map((item) => (
                    <div
                      key={item.id || item.timestamp}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {item.date}
                      </span>

                      <span className="text-foreground">
                        +{Number(item.earned_clore || 0).toFixed(8)} CLORE
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(data.updatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

function MetricBox({ icon, label, value }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>

      <p className="text-xl font-semibold mt-1 text-foreground">
        {value}
      </p>
    </div>
  );
}