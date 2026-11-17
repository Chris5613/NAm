import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { hardwareImageFor } from "@/lib/hardwarePhotos";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { toast } from "sonner";

const SETTINGS_KEY = "mining_power_dashboard_v1";
const HARDWARE_KEY = "hardware_payback_devices_v1";

function readHardwarePaybackDevices() {
  try {
    const saved = JSON.parse(remoteStorage.getItem(HARDWARE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

// Use Hardware Payback as the single source of GPU photos; never copy photos
// into Mining Power settings or alter Tapo device IDs.
export function rtx5080PaybackPhoto(hardware) {
  const matching = (Array.isArray(hardware) ? hardware : [])
    .filter(row => /5080/i.test(String(row?.name || "")));
  const withPhoto = matching.find(row => /asus/i.test(String(row.name)) && row.photo) ||
    matching.find(row => row.photo);
  const device = withPhoto || matching.find(row => /asus/i.test(String(row.name))) ||
    matching[0] || { name: "ASUS RTX 5080" };
  return hardwareImageFor(device);
}
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

function trackedDays(seconds) {
  return Math.max(0, Number(seconds) || 0) / 86400;
}

function DeviceCard({ device, monthlyUsage, backendDeviceCost, label, onRename, live, hardware, gpu, sharedRig, photo, onPhoto }) {
  const photoInput = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const changePhoto = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || photoBusy) return;
    setPhotoBusy(true);
    try {
      if (!["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 12*1024*1024) throw new Error("Choose a PNG, JPG or WebP under 12 MB.");
      const url = URL.createObjectURL(file);
      let result;
      try {
        const img = new Image();
        await new Promise((resolve,reject) => { img.onload=resolve; img.onerror=()=>reject(new Error("Unable to open image.")); img.src=url; });
        const canvas=document.createElement("canvas");
        const scale=Math.min(1,760/Math.max(img.width,img.height));
        canvas.width=Math.max(1,Math.round(img.width*scale)); canvas.height=Math.max(1,Math.round(img.height*scale));
        canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
        for (const quality of [0.85,0.7,0.5,0.35]) {
          const candidate=canvas.toDataURL("image/webp",quality);
          if (candidate.startsWith("data:image/webp;base64,") && candidate.length<215000) {result=candidate;break;}
        }
      } finally { URL.revokeObjectURL(url); }
      if (!result) throw new Error("Could not compress this image.");
      await onPhoto(device.id,result);
    } catch(error) {toast.error(error?.message || "Couldn't save GPU image.");}
    finally {setPhotoBusy(false);}
  };
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
  const watts = Number.isFinite(Number(device?.watts)) && device?.watts != null
    ? Number(device.watts) : null;
  const monthlyKwh = monthlyUsage?.kwh == null ? null : Number(monthlyUsage.kwh);
  const monthlyCost = backendDeviceCost?.complete ? backendDeviceCost.outOfPocketUsd : null;
  const is5080 = /5080/i.test(label || device?.label || "");
  const meta = is5080
    ? {
        brand: "ASUS",
        image: rtx5080PaybackPhoto(hardware),
        alt: "ASUS GeForce RTX 5080",
        glow: "from-cyan-400/18 via-cyan-400/5",
      }
    : gpu?.id === "4070-ti" ? {
        image: hardwareImageFor(hardware.find(row => /4070\s*ti/i.test(String(row?.name || ""))) || {name:"RTX 4070 Ti"}),
        alt: "GeForce RTX 4070 Ti",
        glow: "from-sky-400/18 via-sky-400/5",
      } : DEVICE_META[device?.id] || null;
  return (
    <section className="flex h-[390px] min-h-[390px] min-w-0 flex-col rounded-xl border border-border/55 bg-[#0d1116] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.13)]" data-testid="mining-device-card">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-lg bg-sky-400/10 p-1.5 text-sky-300">
            <Cpu className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            {editing ? (
              <form onSubmit={saveLabel} className="flex min-w-0 items-center gap-1">
                <input autoFocus aria-label="GPU name" maxLength={80} value={draftLabel}
                  onChange={event => setDraftLabel(event.target.value)}
                  onKeyDown={event => {if(event.key==="Escape"){setEditing(false);setRenameError("");}}}
                  className="min-w-0 w-full rounded-md border border-sky-400/50 bg-background px-1.5 py-1 text-xs text-foreground outline-none focus:border-sky-400" />
                <button type="submit" aria-label="Save GPU name" className="shrink-0 rounded p-1 text-emerald-400 hover:bg-secondary"><Check size={13} /></button>
                <button type="button" aria-label="Cancel GPU rename" onClick={() => {setEditing(false);setRenameError("");}}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary"><X size={13} /></button>
              </form>
            ) : (
              <div className="flex min-w-0 items-center gap-0.5">
                <h2 className="truncate text-[15px] font-semibold leading-tight" title={label || device?.label || "PC"}>{label || device?.label || "PC"}</h2>
                <button type="button" aria-label={"Rename " + (label || device?.label || "GPU")}
                  title="Rename GPU" onClick={beginRename}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-sky-300"><Pencil size={11} /></button>
              </div>
            )}
          </div>
        </div>
        <span className={"inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium " + (live ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" : "border-border bg-secondary text-muted-foreground")}>
          <span className={"h-1 w-1 rounded-full " + (live ? "bg-emerald-400" : "bg-muted-foreground")} />
          {live ? "Live" : gpu && gpu.gpuWatts == null ? "Not reporting" : "Stale"}
        </span>
      </div>
      {renameError && <p role="alert" className="mt-1 text-xs text-rose-400">{renameError}</p>}
      <p title={gpu ? (gpu.allocatedWatts != null ? "GPU plus allocated system overhead" : gpu.gpuWatts != null ? "GPU only; overhead not allocated" : "No GPU telemetry") : "Tapo wall power"} className="mt-3 text-[34px] font-semibold leading-none tracking-tight tabular-nums text-foreground">{watts == null ? "—" : watts.toFixed(0) + "W"}</p>
      <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={changePhoto}/>
      <button type="button" title="Change GPU image" aria-label={"Change image for " + label} disabled={photoBusy} onClick={()=>photoInput.current?.click()} className="relative mt-3 flex min-h-0 flex-1 min-w-0 cursor-pointer items-center justify-center overflow-hidden rounded-md hover:bg-white/5 focus-visible:outline focus-visible:outline-sky-400 disabled:opacity-60">
        {(photo || meta?.image) ? (
          <>
            <div className={"pointer-events-none absolute inset-0 bg-gradient-to-t " + (meta?.glow || "from-sky-400/18") + " to-transparent blur-xl"} />
            <img src={photo || meta?.image} alt={meta?.alt || label} loading="lazy" referrerPolicy="no-referrer"
              className="relative h-full max-h-[205px] w-full object-contain drop-shadow-[0_10px_15px_rgba(0,0,0,0.55)]" />
          </>
        ) : (
          <Cpu className="h-12 w-12 text-sky-400/25" aria-hidden="true" />
        )}
      </button>
      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border/40 pt-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[15px] font-semibold tabular-nums text-cyan-300">
            <CalendarDays className="h-3 w-3 shrink-0" />{monthlyKwh == null ? "—" : monthlyKwh.toFixed(2) + " kWh"}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">This month</p>
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[15px] font-semibold tabular-nums text-amber-400">
            <Coins className="h-3 w-3 shrink-0" />{monthlyCost == null ? "—" : money(monthlyCost)}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Monthly cost</p>
        </div>
      </div>
    </section>
  );
}

export default function MiningPowerCard() {
  const [status, setStatus] = useState(null);
  const [kryptexDailyRevenue, setKryptexDailyRevenue] = useState(null);
  // Device labels are persisted backend settings; no browser tariff defaults.
  const [settings, setSettings] = useState({});
  const [hardware, setHardware] = useState(readHardwarePaybackDevices);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const refreshHardware = () => setHardware(readHardwarePaybackDevices());
    const unsubscribe = subscribe(key => {
      if (key === HARDWARE_KEY) refreshHardware();
    });
    window.addEventListener("hardware-payback-updated", refreshHardware);
    refreshHardware();
    return () => {
      unsubscribe();
      window.removeEventListener("hardware-payback-updated", refreshHardware);
    };
  }, []);
  const renameDevice = useCallback(async (id,label) => {
    // Guarded settings writes require an exact before/after pair. Fetch the
    // latest server value first so a stale refresh cannot overwrite settings.
    // Preserve the device ID: Tapo readings and historical kWh use that ID.
    for(let attempt=0; attempt<2; attempt++) {
      const before=await settingsApi.get(SETTINGS_KEY);
      const base=before && typeof before==="object" && !Array.isArray(before) ? before : {};
      const after={...base,deviceLabels:{...(base.deviceLabels || {}),[id]:label}};
      try {
        const saved=await settingsApi.patch(SETTINGS_KEY,before,after);
        setSettings(current=>({...current,...(saved || after)}));
        toast.success("GPU name updated");
        return;
      } catch(error) {
        // Retry once if another tab wrote settings between GET and PATCH.
        if(attempt===1 || !String(error?.message || "").includes("changed in another session")) throw error;
      }
    }
  },[]);

  const savePhoto = useCallback(async (id,photo) => {
    for(let attempt=0;attempt<2;attempt++) {
      const before=await settingsApi.get(SETTINGS_KEY);
      const base=before && typeof before==="object" && !Array.isArray(before) ? before : {};
      const after={...base,devicePhotos:{...(base.devicePhotos || {}),[id]:photo}};
      try {
        const saved=await settingsApi.patch(SETTINGS_KEY,before,after);
        setSettings(current=>({...current,...(saved || after)}));
        toast.success("GPU image updated");
        return;
      } catch(error) {
        if(attempt===1 || !String(error?.message || "").includes("changed in another session")) throw error;
      }
    }
  },[]);
  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [power, saved, kryptex] = await Promise.all([
        api.get("/api/power/status"),
        settingsApi.get(SETTINGS_KEY).catch(() => null),
        api.get("/api/project-tracking/kryptex/aggregate").catch(() => null),
      ]);
      setStatus(power);
      const reportedDaily = kryptex?.status?.profitability_usd_day;
      const value = reportedDaily == null ? NaN : Number(reportedDaily);
      setKryptexDailyRevenue(Number.isFinite(value) && value >= 0 && Number(kryptex?.machine_count) > 0 ? value : null);
      if (saved && typeof saved === "object") {
        setSettings(current => ({ ...current, ...saved }));
      }
    } catch {
      setStatus(null);
      setKryptexDailyRevenue(null);
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
  const totalWatts = latest?.totalWatts != null && Number.isFinite(Number(latest.totalWatts))
    ? Number(latest.totalWatts) : null;
  const staleMs = latest?.observedAt ? Date.now() - new Date(latest.observedAt).getTime() : Infinity;
  const live = staleMs < 90000;
  const powerCost = status?.powerCost?.sourceOfCalculation === "backend-power-meter-tariffs"
    ? status.powerCost : null;
  const rateInfo = powerCost?.currentRate || null;
  const freePower = powerCost?.freeMiningPower === true;
  const hourlyCost = powerCost?.hourlyOutOfPocketUsd ?? null;
  const dailyCost = powerCost?.dailyOutOfPocketUsd ?? null;
  // The observed two-PC Kryptex machine estimate is separate from real
  // credited earnings. The meter expense is computed by the backend only.
  const dailyRevenue = kryptexDailyRevenue;
  const dailyNet = dailyRevenue == null || dailyCost == null
    ? null : dailyRevenue - dailyCost;

  const currentMonth = status?.currentMonth || null;
  const monthTiers = currentMonth?.tiers || {};
  const offPeakKwh = Number(monthTiers.offPeak) || 0;
  const midPeakKwh = Number(monthTiers.midPeak) || 0;
  const peakKwh = Number(monthTiers.peak) || 0;
  const monthKwh = Number(currentMonth?.totalKwh) || 0;
  const monthTrackedSeconds = Number(currentMonth?.trackedSeconds) || 0;
  const monthTrackedDays = trackedDays(monthTrackedSeconds);
  const monthCost = powerCost?.complete ? powerCost.outOfPocketUsd : null;
  const monthEstimatedRevenue = dailyRevenue == null ? null : dailyRevenue * monthTrackedDays;
  const monthEstimatedNet = monthEstimatedRevenue == null || monthCost == null
    ? null : monthEstimatedRevenue - monthCost;
  const projectionReady = monthTrackedSeconds >= 900;
  const projectedMonthCost = projectionReady
    ? powerCost?.projectedOutOfPocketMonthEndUsd ?? null : null;

  const monthlyDevices = currentMonth?.devices || {};
  const deviceRows = useMemo(() => Array.isArray(latest?.devices) ? latest.devices : [], [latest]);
  // Preserve the earlier compact five-column GPU layout.
  const gpuGridClass = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";



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
    <div className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl bg-emerald-500/10 p-2 text-emerald-400"><Zap className="h-5 w-5" /></span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Mining Power</h1>
        </div>
        <div className="flex items-center gap-2">
          <span title={"Last updated: " + formatUpdated(latest?.observedAt)}
            className={"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium " + (live ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" : "border-border bg-secondary text-muted-foreground")}>
            <span className={"h-1.5 w-1.5 rounded-full " + (live ? "bg-emerald-400" : "bg-muted-foreground")} />
            {live ? "Meter Readings Live" : "Readings Stale"}
          </span>
          <button type="button" onClick={() => refresh(true)} aria-label="Refresh mining power"
            title={"Refresh · Last updated: " + formatUpdated(latest?.observedAt)}
            className="rounded-lg border border-border/50 p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")} />
          </button>
        </div>
      </header>

      <section aria-label="Mining power summary"
        className="grid min-w-0 grid-cols-1 rounded-xl border border-border/55 bg-[#0d1116] px-3 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:grid-cols-3 sm:divide-x sm:divide-border/35">
        <div className="min-w-0 py-1 sm:px-3">
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-400" />Total Mining Power
          </p>
          <p className="mt-1 text-xl font-semibold leading-none tabular-nums text-foreground">{totalWatts == null ? "—" : totalWatts.toFixed(0) + "W"}</p>
        </div>
        <div className="min-w-0 border-t border-border/35 py-2 sm:border-t-0 sm:px-4 sm:py-1">
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-cyan-300" />Total Monthly Usage
          </p>
          <p className="mt-1 text-xl font-semibold leading-none tabular-nums text-cyan-300">{monthKwh.toFixed(2)} kWh</p>
        </div>
        <div className="min-w-0 border-t border-border/35 py-2 sm:border-t-0 sm:px-4 sm:py-1">
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Coins className="h-3.5 w-3.5 shrink-0 text-amber-400" />Total Monthly Cost
          </p>
          <p className="mt-1 text-xl font-semibold leading-none tabular-nums text-amber-400">{monthCost == null ? "—" : money(monthCost)}</p>
        </div>
      </section>

      <section aria-label="Tracked mining GPUs" className={"grid min-w-0 items-stretch gap-3 " + gpuGridClass}>
        {deviceRows.flatMap(device => {
          const breakdown = status?.gpuBreakdown?.[device.id];
          const shared = (breakdown?.gpus?.length || 0) > 1;
          if (!breakdown?.gpus?.length) return [<DeviceCard key={device.id} device={device}
            label={settings.deviceLabels?.[device.id] || device.label}
            hardware={hardware} onRename={renameDevice} photo={settings.devicePhotos?.[device.id]} onPhoto={savePhoto}
            monthlyUsage={monthlyDevices[device.id]}
            backendDeviceCost={powerCost?.deviceCosts?.[device.id] || null}
            live={live}/>];
          return breakdown.gpus.map((gpu, index) => {
            const id = index === 0 ? device.id : device.id + ":" + gpu.id;
            const display = {...device, id, watts: live ? (gpu.allocatedWatts ?? gpu.gpuWatts) : null};
            const cost = powerCost?.deviceCosts?.[device.id];
            return <DeviceCard key={id} device={display}
              label={settings.deviceLabels?.[id] || gpu.name}
              hardware={hardware} onRename={renameDevice} gpu={gpu} photo={settings.devicePhotos?.[id]} onPhoto={savePhoto}
              sharedRig={shared && index === 0}
              monthlyUsage={shared ? (status?.gpuMonthlyUsage?.[id] ?? (index === 0 ? monthlyDevices[device.id] : null)) : monthlyDevices[device.id]}
              backendDeviceCost={shared ? (status?.gpuMonthlyCosts?.[id] ?? (index === 0 ? cost : null)) : cost}
              live={live && gpu.gpuWatts != null}/>;
          });
        })}
      </section>
    </div>
  );
}
