import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Coins,
  Copy,
  Cpu,
  Gauge,
  KeyRound,
  Layers3,
  PlugZap,
  RefreshCw,
  TrendingUp,
  Zap,
} from "lucide-react";
import { api, settingsApi } from "@/lib/apiClient";
import { toast } from "sonner";

const SETTINGS_KEY = "mining_power_dashboard_v1";
const DEFAULTS = {
  dailyRevenueUsd: 3.55,
  offPeakRate: 0.0893,
  midPeakRate: 0.1670,
  peakRate: 0.4313,
};

const DEVICE_META = {
  rtx5070: {
    image: "https://iprsoftwaremedia.com/219/files/20250/202501271934/6797dfce3d6332c6cd77c43b_geforce-rtx-5070/geforce-rtx-5070_0a8c3f1a-8080-4bfe-a202-f8f49c8108a7-prv.jpg?v=0a8c3f1a-8080-4bfe-a202-f8f49c8108a7",
    alt: "NVIDIA GeForce RTX 5070",
  },
  rtx2080super: {
    image: "https://nvidianews.nvidia.com/_gallery/get_file/?file_id=5d1b83192cfac25fdf677895",
    alt: "NVIDIA GeForce RTX 2080 Super",
  },
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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value) || 0);
}

function formatUpdated(value) {
  if (!value) return "No reading yet";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "No reading yet";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatCard({ title, value, subtitle, icon: Icon, accent = "sky" }) {
  const accents = {
    sky: "border-sky-500/35 bg-sky-500/[0.035] text-sky-400",
    amber: "border-amber-500/35 bg-amber-500/[0.035] text-amber-400",
    cyan: "border-cyan-400/35 bg-cyan-400/[0.035] text-cyan-300",
    green: "border-emerald-500/35 bg-emerald-500/[0.04] text-emerald-400",
  };
  return (
    <section className={"rounded-2xl border bg-card p-5 shadow-[0_10px_30px_rgba(0,0,0,0.12)] " + accents[accent]}>
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-background/70 p-2.5">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-2 text-[clamp(28px,2.6vw,38px)] font-semibold leading-none tracking-tight text-foreground tabular-nums">{value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </section>
  );
}

function DeviceCard({ device, combined = false, rate }) {
  const watts = Number(device?.watts) || 0;
  const dailyKwh = watts * 24 / 1000;
  const dailyCost = dailyKwh * rate;
  const meta = !combined ? DEVICE_META[device?.id] : null;
  return (
    <section className={"rounded-2xl border bg-card p-5 shadow-[0_10px_30px_rgba(0,0,0,0.12)] " + (combined ? "border-cyan-400/55" : "border-border/55")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={"rounded-lg p-2 " + (combined ? "bg-cyan-400/10 text-cyan-300" : "bg-sky-400/10 text-sky-300")}>
            {combined ? <Layers3 className="h-4 w-4" /> : <Cpu className="h-4 w-4" />}
          </div>
          <h2 className="text-base font-semibold">{device?.label || (combined ? "Combined" : "PC")}</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Live
        </span>
      </div>

      <div className="relative mt-5 min-h-[112px] overflow-hidden">
        <div className={meta ? "relative z-10 max-w-[58%]" : "relative z-10"}>
          <p className={"text-[36px] font-semibold leading-none tracking-tight tabular-nums " + (combined ? "text-cyan-300" : "text-foreground")}>
            {watts.toFixed(0)} W
          </p>
        </div>

        {meta?.image && (
          <>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-[46%] bg-gradient-to-l from-card via-card/45 to-transparent" />
            <img
              src={meta.image}
              alt={meta.alt}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="pointer-events-none absolute -bottom-2 right-0 h-[118px] w-[47%] object-contain object-right drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)]"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-2 divide-x divide-border/40 border-t border-border/35 pt-4">
        <div className="pr-4">
          <div className="flex items-center gap-2 text-cyan-300">
            <Zap className="h-4 w-4" />
            <span className="text-sm font-semibold tabular-nums">{dailyKwh.toFixed(2)} kWh</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">24h usage</p>
        </div>
        <div className="pl-4">
          <div className="flex items-center gap-2 text-amber-400">
            <Coins className="h-4 w-4" />
            <span className="text-sm font-semibold tabular-nums">{money(dailyCost)}</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">24h power cost</p>
        </div>
      </div>
    </section>
  );
}

export default function MiningPowerCard() {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [power, saved] = await Promise.all([
        api.get("/api/power/status"),
        settingsApi.get(SETTINGS_KEY).catch(() => null),
      ]);
      setStatus(power);
      if (saved && typeof saved === "object") {
        setSettings(current => ({ ...current, ...saved }));
      }
    } catch {
      setStatus(null);
    } finally {
      if (manual) setRefreshing(false);
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
  const dailyCost = hourlyCost * 24;
  const dailyRevenue = Math.max(0, Number(settings.dailyRevenueUsd) || 0);
  const dailyNet = dailyRevenue - dailyCost;
  const deviceRows = useMemo(() => Array.isArray(latest?.devices) ? latest.devices : [], [latest]);

  const combinedDevice = useMemo(() => ({
    label: "Combined",
    watts: totalWatts,
  }), [totalWatts]);

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
      toast.success("Mining power settings saved");
    } catch (error) {
      toast.error(error.message || "Could not save mining power settings");
    }
  };

  if (!deviceRows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card px-6 py-12 text-center">
        <Activity className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Waiting for Tapo power readings</p>
        <p className="mt-1 text-xs text-muted-foreground">Start the Windows bridge and this page will populate automatically.</p>
        <button type="button" onClick={createToken} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
          <KeyRound className="h-3.5 w-3.5" />
          {status?.configured ? "Rotate bridge token" : "Generate bridge token"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4 px-1">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Zap className="h-8 w-8 text-emerald-400" />
            <h1 className="text-[32px] font-semibold tracking-tight">Mining Power</h1>
            <span className={"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium " + (live ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-border bg-secondary text-muted-foreground")}>
              <span className={"h-2 w-2 rounded-full " + (live ? "bg-emerald-400" : "bg-muted-foreground")} />
              {live ? "Live" : "Stale"}
            </span>
          </div>
          <p className="mt-1 pl-11 text-sm text-muted-foreground">Live Tapo P115 wall-power readings, electricity cost, and mining profitability.</p>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Last updated: {formatUpdated(latest?.observedAt)}</span>
          <button type="button" onClick={() => refresh(true)} className="rounded-full border border-border/50 p-2 hover:bg-secondary hover:text-foreground" aria-label="Refresh mining power">
            <RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Power" value={totalWatts.toFixed(0) + " W"} subtitle="Live draw (combined)" icon={Zap} accent="sky" />
        <StatCard title="Cost / Hour" value={money(hourlyCost)} subtitle={"≈ " + money(dailyCost) + " / 24h"} icon={Coins} accent="amber" />
        <StatCard title="Current Rate" value={(rateInfo.rate * 100).toFixed(2) + "¢/kWh"} subtitle={rateInfo.label + " rate"} icon={PlugZap} accent="cyan" />
        <StatCard title="Net Profit / Day" value={money(dailyNet)} subtitle="Est. after electricity cost" icon={TrendingUp} accent="green" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {deviceRows.map(device => <DeviceCard key={device.id} device={device} rate={rateInfo.rate} />)}
        <DeviceCard device={combinedDevice} combined rate={rateInfo.rate} />
      </div>

      <section className="rounded-2xl border border-border/55 bg-card shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
        <div className="border-b border-border/40 px-5 py-4">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Profitability (24h)</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 divide-y divide-border/35 md:grid-cols-4 md:divide-x md:divide-y-0">
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400"><Coins className="h-4 w-4" /></div>
              <div><p className="text-xs text-muted-foreground">Power Cost (24h)</p><p className="mt-1 text-2xl font-semibold text-amber-400 tabular-nums">{money(dailyCost)}</p></div>
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-cyan-400/10 p-2 text-cyan-300"><Layers3 className="h-4 w-4" /></div>
              <div><p className="text-xs text-muted-foreground">Estimated Revenue (24h)</p><p className="mt-1 text-2xl font-semibold text-cyan-300 tabular-nums">{money(dailyRevenue)}</p></div>
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400"><TrendingUp className="h-4 w-4" /></div>
              <div><p className="text-xs text-muted-foreground">Net Profit (24h)</p><p className={"mt-1 text-2xl font-semibold tabular-nums " + (dailyNet >= 0 ? "text-emerald-400" : "text-rose-400")}>{money(dailyNet)}</p></div>
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-sky-400/10 p-2 text-sky-300"><Zap className="h-4 w-4" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Utility Tier</p>
                <p className="mt-1 text-xl font-semibold text-cyan-300">{rateInfo.label}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{(rateInfo.rate * 100).toFixed(2)}¢/kWh</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/55 bg-card">
        <button type="button" onClick={() => setEditing(value => !value)} className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-secondary/20">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Settings</p>
              <p className="text-[10px] text-muted-foreground">Rates, revenue, and bridge token</p>
            </div>
          </div>
          {editing ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {editing && (
          <div className="border-t border-border/40 p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-[10px] text-muted-foreground">Mining revenue / day ($)
                <input type="number" step="0.01" min="0" value={settings.dailyRevenueUsd} onChange={event => setSettings({...settings, dailyRevenueUsd:event.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground" />
              </label>
              <label className="text-[10px] text-muted-foreground">Off-peak ($/kWh)
                <input type="number" step="0.0001" min="0" value={settings.offPeakRate} onChange={event => setSettings({...settings, offPeakRate:event.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground" />
              </label>
              <label className="text-[10px] text-muted-foreground">Mid-peak ($/kWh)
                <input type="number" step="0.0001" min="0" value={settings.midPeakRate} onChange={event => setSettings({...settings, midPeakRate:event.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground" />
              </label>
              <label className="text-[10px] text-muted-foreground">Peak ($/kWh)
                <input type="number" step="0.0001" min="0" value={settings.peakRate} onChange={event => setSettings({...settings, peakRate:event.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground" />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={saveSettings} className="rounded-lg bg-foreground px-4 py-2 text-xs font-medium text-background">Save settings</button>
              <button type="button" onClick={createToken} className="inline-flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                <KeyRound className="h-3.5 w-3.5" />
                {status?.configured ? "Rotate bridge token" : "Generate bridge token"}
              </button>
            </div>

            {token && (
              <div className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/5 p-3">
                <p className="text-[10px] font-medium text-amber-300">Copy this token now. NAm only stores its hash.</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{token}</code>
                  <button type="button" onClick={copyToken} className="rounded p-1 hover:bg-secondary" aria-label="Copy power bridge token">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
