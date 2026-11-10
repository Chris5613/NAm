import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Copy, KeyRound, Zap } from "lucide-react";
import { api, settingsApi } from "@/lib/apiClient";
import { toast } from "sonner";

const SETTINGS_KEY = "mining_power_dashboard_v1";
const DEFAULTS = {
  dailyRevenueUsd: 3.55,
  offPeakRate: 0.0893,
  midPeakRate: 0.1670,
  peakRate: 0.4313,
};

function pacificParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function currentRate(settings, date = new Date()) {
  const parts = pacificParts(date);
  if (["Sat", "Sun"].includes(parts.weekday)) return { rate: settings.offPeakRate, label: "Off-peak" };
  const hour = Number(parts.hour) % 24;
  if (hour >= 17 && hour < 21) return { rate: settings.peakRate, label: "Peak" };
  if ((hour >= 21 && hour < 24) || hour < 7) return { rate: settings.offPeakRate, label: "Off-peak" };
  return { rate: settings.midPeakRate, label: "Mid-peak" };
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

export default function MiningPowerCard({ className = "" }) {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [power, saved] = await Promise.all([
        api.get("/api/power/status"),
        settingsApi.get(SETTINGS_KEY).catch(() => null),
      ]);
      setStatus(power);
      if (saved && typeof saved === "object") setSettings(current => ({ ...current, ...saved }));
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  const latest = status?.latest;
  const totalWatts = Number(latest?.totalWatts) || 0;
  const staleMs = latest?.observedAt ? Date.now() - new Date(latest.observedAt).getTime() : Infinity;
  const live = staleMs < 90000;
  const rateInfo = currentRate(settings);
  const hourlyCost = totalWatts / 1000 * rateInfo.rate;
  const dailyRunCostAtCurrentRate = hourlyCost * 24;
  const dailyRevenue = Math.max(0, Number(settings.dailyRevenueUsd) || 0);
  const dailyNetAtCurrentRate = dailyRevenue - dailyRunCostAtCurrentRate;

  const deviceRows = useMemo(() => Array.isArray(latest?.devices) ? latest.devices : [], [latest]);

  const createToken = async () => {
    try {
      const result = await api.post("/api/power/token", {});
      setToken(result?.token || "");
      toast.success("New power bridge token generated");
      await refresh();
    } catch (error) {
      toast.error(error.message || "Could not generate token");
    }
  };

  const copyToken = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    toast.success("Power bridge token copied");
  };

  const saveSettings = async () => {
    const next = {
      dailyRevenueUsd: Math.max(0, Number(settings.dailyRevenueUsd) || 0),
      offPeakRate: Math.max(0, Number(settings.offPeakRate) || 0),
      midPeakRate: Math.max(0, Number(settings.midPeakRate) || 0),
      peakRate: Math.max(0, Number(settings.peakRate) || 0),
    };
    try {
      await settingsApi.set(SETTINGS_KEY, next);
      setSettings(next);
      setEditing(false);
      toast.success("Mining power settings saved");
    } catch (error) {
      toast.error(error.message || "Could not save mining power settings");
    }
  };

  return (
    <section className={className} aria-label="Mining power">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Mining power</h2>
        </div>
        <span className={`flex items-center gap-1.5 text-[10px] ${live ? "text-emerald-400" : "text-muted-foreground"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-muted-foreground"}`} />
          {live ? "Live" : status?.configured ? "Waiting for bridge" : "Not connected"}
        </span>
      </div>

      <div className="space-y-3 px-4 py-3">
        {deviceRows.length ? (
          <>
            <div className="space-y-2">
              {deviceRows.map(device => (
                <div key={device.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-muted-foreground">{device.label}</span>
                  <span className="font-medium tabular-nums">{Number(device.watts || 0).toFixed(0)} W</span>
                </div>
              ))}
              <div className="flex items-end justify-between border-t border-border/35 pt-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Combined draw</p>
                  <p className="mt-0.5 text-[24px] font-semibold tabular-nums">{totalWatts.toFixed(0)} W</p>
                </div>
                <div className="text-right text-[11px]">
                  <p className="text-muted-foreground">{rateInfo.label} rate</p>
                  <p className="font-medium tabular-nums">{(rateInfo.rate * 100).toFixed(2)}¢/kWh</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg bg-background/55 p-2.5 text-center">
              <div><p className="text-[10px] text-muted-foreground">Cost / hour</p><p className="mt-0.5 text-xs font-medium tabular-nums">{money(hourlyCost)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">24h at this rate</p><p className="mt-0.5 text-xs font-medium tabular-nums">{money(dailyRunCostAtCurrentRate)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Net / day*</p><p className={`mt-0.5 text-xs font-medium tabular-nums ${dailyNetAtCurrentRate >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{money(dailyNetAtCurrentRate)}</p></div>
            </div>
            <p className="text-[9px] text-muted-foreground">*Uses your daily mining revenue and the current electricity rate for a simple 24-hour comparison.</p>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center">
            <Activity className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-xs text-muted-foreground">Install the Tapo bridge on one always-on PC to send live P115 readings.</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(value => !value)} className="rounded-md border border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground hover:text-foreground">
            Rates & revenue
          </button>
          <button type="button" onClick={createToken} className="flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground hover:text-foreground">
            <KeyRound className="h-3 w-3" />{status?.configured ? "Rotate bridge token" : "Generate bridge token"}
          </button>
        </div>

        {token && (
          <div className="rounded-lg border border-amber-400/25 bg-amber-400/5 p-2.5">
            <p className="text-[10px] font-medium text-amber-300">Copy this token now. NAm only stores its hash.</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{token}</code>
              <button type="button" onClick={copyToken} className="rounded p-1 hover:bg-secondary" aria-label="Copy power bridge token"><Copy className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        )}

        {editing && (
          <div className="grid gap-2 rounded-lg border border-border/50 bg-background/50 p-3 sm:grid-cols-2">
            <label className="text-[10px] text-muted-foreground">Mining revenue / day ($)
              <input type="number" step="0.01" min="0" value={settings.dailyRevenueUsd} onChange={event => setSettings({...settings, dailyRevenueUsd:event.target.value})} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
            </label>
            <label className="text-[10px] text-muted-foreground">Off-peak ($/kWh)
              <input type="number" step="0.0001" min="0" value={settings.offPeakRate} onChange={event => setSettings({...settings, offPeakRate:event.target.value})} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
            </label>
            <label className="text-[10px] text-muted-foreground">Mid-peak ($/kWh)
              <input type="number" step="0.0001" min="0" value={settings.midPeakRate} onChange={event => setSettings({...settings, midPeakRate:event.target.value})} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
            </label>
            <label className="text-[10px] text-muted-foreground">Peak ($/kWh)
              <input type="number" step="0.0001" min="0" value={settings.peakRate} onChange={event => setSettings({...settings, peakRate:event.target.value})} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
            </label>
            <button type="button" onClick={saveSettings} className="rounded-md bg-foreground px-3 py-1.5 text-[10px] font-medium text-background sm:col-span-2">Save</button>
          </div>
        )}
      </div>
    </section>
  );
}
