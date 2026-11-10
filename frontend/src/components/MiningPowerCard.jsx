import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Coins,
  Cpu,
  Gauge,
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
    brand: "MSI",
    image: "/gpu/rtx5070-msi.webp",
    alt: "MSI GeForce RTX 5070",
    glow: "from-sky-400/18 via-sky-400/5",
  },
  rtx2080super: {
    brand: "GIGABYTE",
    image: "/gpu/rtx2080-super.webp",
    alt: "Gigabyte GeForce RTX 2080 Super",
    glow: "from-orange-400/16 via-orange-400/5",
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
          <div>
            <h2 className="text-base font-semibold">{device?.label || (combined ? "Combined" : "PC")}</h2>
            {meta?.brand && (
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {meta.brand}
              </p>
            )}
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Live
        </span>
      </div>

      <div className="relative mt-4 min-h-[126px] overflow-hidden rounded-xl">
        <div className={meta ? "relative z-20 max-w-[52%] pt-3" : "relative z-20 pt-3"}>
          <p className={"text-[38px] font-semibold leading-none tracking-tight tabular-nums " + (combined ? "text-cyan-300" : "text-foreground")}>
            {watts.toFixed(0)} W
          </p>
        </div>

        {meta?.image && (
          <>
            <div className={"pointer-events-none absolute -right-10 -top-8 h-44 w-72 rounded-full bg-gradient-to-l " + meta.glow + " to-transparent blur-2xl"} />
            <div className="pointer-events-none absolute inset-y-0 right-[40%] z-10 w-24 bg-gradient-to-r from-card via-card/70 to-transparent" />
            <img
              src={meta.image}
              alt={meta.alt}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="pointer-events-none absolute -bottom-1 right-2 z-10 h-[128px] w-[50%] object-contain object-right opacity-95 drop-shadow-[0_18px_28px_rgba(0,0,0,0.58)]"
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




  if (!deviceRows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card px-6 py-12 text-center">
        <Activity className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Waiting for Tapo power readings</p>
        <p className="mt-1 text-xs text-muted-foreground">Start the Windows bridge and this page will populate automatically.</p>
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

    </div>
  );
}
