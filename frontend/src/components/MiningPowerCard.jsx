import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  Coins,
  Cpu,
  PlugZap,
  Pencil,
  Check,
  X,
  RefreshCw,
  TrendingUp,
  Zap,
} from "lucide-react";
import { api, settingsApi } from "@/lib/apiClient";
import { getCurrentMonthKey } from "@/lib/yieldFarmingAccounting";
import { hasFreeMiningPower, outOfPocketMiningPowerCost } from "@/lib/powerOutOfPocket";
import { toast } from "sonner";

const SETTINGS_KEY = "mining_power_dashboard_v1";
const TOD_EFFECTIVE_AT = new Date("2026-12-10T00:00:00-08:00");
const TOD_EFFECTIVE_MONTH = "2026-12";
const DEFAULTS = {
  dailyRevenueUsd: 3.55,
  offPeakRate: 0.0893,
  midPeakRate: 0.1670,
  peakRate: 0.4313,
  basicRate: 0.1691,
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
  if (date < TOD_EFFECTIVE_AT) return { rate: settings.basicRate, label: "Basic" };
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

function daysInPacificMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return new Date(Number(values.year), Number(values.month), 0).getDate();
}

function trackedDays(seconds) {
  return Math.max(0, Number(seconds) || 0) / 86400;
}

function usageCost(usage, settings, monthKey) {
  const tiers = usage?.tiers || {};
  const totalKwh = Number(usage?.totalKwh ?? usage?.kwh) || 0;

  // Months before TOD activation were billed entirely on Basic Service.
  if (monthKey && monthKey < TOD_EFFECTIVE_MONTH) {
    return totalKwh * Number(settings.basicRate || 0);
  }

  return (
    (Number(tiers.basic) || 0) * Number(settings.basicRate || 0) +
    (Number(tiers.offPeak) || 0) * Number(settings.offPeakRate || 0) +
    (Number(tiers.midPeak) || 0) * Number(settings.midPeakRate || 0) +
    (Number(tiers.peak) || 0) * Number(settings.peakRate || 0)
  );
}

function DeviceCard({ device, monthlyUsage, settings, monthKey, label, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [renameError, setRenameError] = useState("");
  const beginRename = () => {
    setDraftLabel(label || device?.label || "PC");
    setRenameError("");
    setEditing(true);
  };
  const saveLabel = async event => {
    event.preventDefault();
    const next=draftLabel.trim();
    if(!next || next.length>80) {
      setRenameError("Enter a name (up to 80 characters).");
      return;
    }
    try {
      await onRename(device.id,next);
      setEditing(false);
      setRenameError("");
    } catch(error) {
      setRenameError(error?.message || "Couldn't save this name.");
    }
  };
  const watts = Number(device?.watts) || 0;
  const monthlyKwh = Number(monthlyUsage?.kwh) || 0;
  const monthlyCost = outOfPocketMiningPowerCost(usageCost(monthlyUsage, settings, monthKey), monthKey || getCurrentMonthKey());
  const originalMeta = DEVICE_META[device?.id] || null;
  // Do not display an RTX 5070 product photo for a renamed RTX 5080.
  const meta = /5080/i.test(label || "") && device?.id === "rtx5070" ? null : originalMeta;
  return (
    <section className="rounded-2xl border border-border/55 bg-card p-5 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-sky-400/10 p-2 text-sky-300">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            {editing ? (
              <form onSubmit={saveLabel} className="flex flex-wrap items-center gap-1.5">
                <input autoFocus aria-label="GPU name" maxLength={80} value={draftLabel}
                  onChange={event=>setDraftLabel(event.target.value)}
                  onKeyDown={event=>{if(event.key==="Escape"){setEditing(false);setRenameError("");}}}
                  className="w-[min(210px,45vw)] rounded-md border border-sky-400/50 bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-sky-400"/>
                <button type="submit" aria-label="Save GPU name" className="rounded p-1 text-emerald-400 hover:bg-secondary"><Check size={16}/></button>
                <button type="button" aria-label="Cancel GPU rename" onClick={()=>{setEditing(false);setRenameError("");}}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary"><X size={16}/></button>
              </form>
            ) : (
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-semibold">{label || device?.label || "PC"}</h2>
                <button type="button" aria-label={"Rename " + (label || device?.label || "GPU")}
                  title="Rename GPU" onClick={beginRename}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-sky-300"><Pencil size={14}/></button>
              </div>
            )}
            {renameError && <p role="alert" className="mt-1 text-xs text-rose-400">{renameError}</p>}
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
          <p className="text-[38px] font-semibold leading-none tracking-tight text-foreground tabular-nums">
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
            <CalendarDays className="h-4 w-4" />
            <span className="text-sm font-semibold tabular-nums">{monthlyKwh.toFixed(2)} kWh</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Total kWh this month</p>
        </div>
        <div className="pl-4">
          <div className="flex items-center gap-2 text-amber-400">
            <Coins className="h-4 w-4" />
            <span className="text-sm font-semibold tabular-nums">{money(monthlyCost)}</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Total monthly cost</p>
        </div>
      </div>
    </section>
  );
}

export default function MiningPowerCard() {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [refreshing, setRefreshing] = useState(false);
  const renameDevice = useCallback(async (id,label) => {
    // Keep immutable Tapo device IDs for readings and historic kWh totals.
    const updated={...settings,deviceLabels:{...(settings.deviceLabels || {}),[id]:label}};
    await settingsApi.set(SETTINGS_KEY,updated);
    setSettings(updated);
    toast.success("GPU name updated");
  },[settings]);

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
  const freePower = hasFreeMiningPower(getCurrentMonthKey());
  const hourlyCost = outOfPocketMiningPowerCost(totalWatts / 1000 * rateInfo.rate, getCurrentMonthKey());
  const dailyCost = hourlyCost * 24;
  const dailyRevenue = Math.max(0, Number(settings.dailyRevenueUsd) || 0);
  const dailyNet = dailyRevenue - dailyCost;

  const currentMonth = status?.currentMonth || null;
  const monthTiers = currentMonth?.tiers || {};
  const offPeakKwh = Number(monthTiers.offPeak) || 0;
  const midPeakKwh = Number(monthTiers.midPeak) || 0;
  const peakKwh = Number(monthTiers.peak) || 0;
  const monthKwh = Number(currentMonth?.totalKwh) || 0;
  const monthTrackedSeconds = Number(currentMonth?.trackedSeconds) || 0;
  const monthTrackedDays = trackedDays(monthTrackedSeconds);
  const monthCost = outOfPocketMiningPowerCost(
    usageCost(currentMonth, settings, currentMonth?.month), currentMonth?.month || getCurrentMonthKey()
  );
  const monthEstimatedRevenue = dailyRevenue * monthTrackedDays;
  const monthEstimatedNet = monthEstimatedRevenue - monthCost;
  const monthDays = daysInPacificMonth();
  const projectionReady = monthTrackedSeconds >= 900;
  const projectedMonthCost = projectionReady && monthTrackedDays > 0
    ? monthCost / monthTrackedDays * monthDays
    : 0;

  const monthlyDevices = currentMonth?.devices || {};
  const deviceRows = useMemo(() => Array.isArray(latest?.devices) ? latest.devices : [], [latest]);
  const gpuGridClass =
    deviceRows.length <= 1
      ? "grid-cols-1"
      : deviceRows.length === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : deviceRows.length === 3
          ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";




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
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Last updated: {formatUpdated(latest?.observedAt)}</span>
          <button type="button" onClick={() => refresh(true)} className="rounded-full border border-border/50 p-2 hover:bg-secondary hover:text-foreground" aria-label="Refresh mining power">
            <RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")} />
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-border/55 bg-card shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">This Month</h2>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {currentMonth?.startedAt ? "Tracking since " + formatUpdated(currentMonth.startedAt) : "Tracking starts with the new meter"}
          </p>
        </div>

        <div className="grid grid-cols-1 divide-y divide-border/35 sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
          <div className="p-5">
            <p className="text-xs text-muted-foreground">Energy used</p>
            <p className="mt-1 text-2xl font-semibold text-cyan-300 tabular-nums">{monthKwh.toFixed(2)} kWh</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{monthTrackedDays.toFixed(2)} tracked days</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-muted-foreground">Cost so far</p>
            <p className="mt-1 text-2xl font-semibold text-amber-400 tabular-nums">{money(monthCost)}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{freePower ? "Power provided at no cost" : "Tracked energy cost"}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-muted-foreground">Projected month-end cost</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {projectionReady ? money(projectedMonthCost) : "Collecting…"}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">{freePower ? "Power provided at no cost" : "Based on tracked usage rate"}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-muted-foreground">Est. net since tracking</p>
            <p className={"mt-1 text-2xl font-semibold tabular-nums " + (monthEstimatedNet >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {money(monthEstimatedNet)}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">Uses {money(dailyRevenue)}/day revenue estimate</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-border/35 px-5 py-4 text-sm">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-sky-400" />
            <span className="text-muted-foreground">Total Power</span>
            <span className="font-semibold tabular-nums">{totalWatts.toFixed(0)} W</span>
          </div>
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-400" />
            <span className="text-muted-foreground">Cost / Hour</span>
            <span className="font-semibold tabular-nums">{money(hourlyCost)}</span>
          </div>
          <div className="flex items-center gap-2">
            <PlugZap className="h-4 w-4 text-cyan-300" />
            <span className="text-muted-foreground">Effective Rate</span>
            <span className="font-semibold tabular-nums">{(freePower ? 0 : rateInfo.rate * 100).toFixed(2)}¢/kWh</span>
            <span className="text-xs text-muted-foreground">{rateInfo.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <span className="text-muted-foreground">Net Profit / Day</span>
            <span className={"font-semibold tabular-nums " + (dailyNet >= 0 ? "text-emerald-400" : "text-rose-400")}>{money(dailyNet)}</span>
          </div>
        </div>

      </section>

      <div className={"grid gap-4 " + gpuGridClass}>
        {deviceRows.map(device => (
          <DeviceCard
            key={device.id}
            device={device}
            label={settings.deviceLabels?.[device.id] || device.label}
            onRename={renameDevice}
            monthlyUsage={monthlyDevices[device.id]}
            settings={settings}
            monthKey={currentMonth?.month}
          />
        ))}
      </div>




    </div>
  );
}
