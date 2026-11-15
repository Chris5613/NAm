import { useBackendIncomeHistory } from "@/hooks/useBackendIncomeHistory";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, CalendarDays, Zap } from "lucide-react";
import { previewHardwareCheckpointEdit } from "@/lib/backendHardwareCheckpointEdit";
import { useBackendHardwarePayback } from "@/hooks/useBackendHardwarePayback";
import { hardwareImageFor, prepareHardwarePhoto } from "@/lib/hardwarePhotos";
import { sharedPaybackSources } from "@/lib/hardwarePaybackReporting";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { outOfPocketMiningPowerCost } from "@/lib/powerOutOfPocket";



import { formatCurrency, getCurrentMonthKey, getTodayKey, INACTIVE_PROJECTS_KEY, loadKryptexTracker, loadLoopscaleHistory, loadRollerCoinTracker, loadSaladTracker, loadUnetworkTracker, PROJECT_QUICK_CACHE_KEY, readObject } from "@/lib/yieldFarmingAccounting";

const KEY = "hardware_payback_devices_v1";
const INTEGRATED_SOURCES = ["Kryptex", "Salad", "RollerCoin", "Unetwork", "Loopscale", "Lulo"];
const panel = "rounded-2xl border border-[#263342] bg-[#0b1017]";
const money = value => formatCurrency(Number(value) || 0);
const label = key => new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-15T12:00:00Z`));
const readDevices = () => { try { const rows = JSON.parse(remoteStorage.getItem(KEY) || "[]"); return Array.isArray(rows) ? rows : []; } catch { return []; } };
const canonicalSourceName = source => {
  const value = String(source || "").trim().replace(/\s+/g, " ");
  const normalized = value.toLowerCase();
  if (["unity network", "unitynetwork", "unetwork"].includes(normalized)) return "Unetwork";
  if (normalized === "roller coin") return "RollerCoin";
  return value;
};
const deviceSources = device => Array.from(new Set(
  (Array.isArray(device?.sources) ? device.sources : [device?.source])
    .map(canonicalSourceName).filter(Boolean)
));
const sourceOptionsFor = (history, months) => {
  const activeNames = new Set((history.activeProjectNames || []).map(canonicalSourceName));
  const hasTrackerData = tracker => tracker && Object.keys(tracker).some(key =>
    ["initialized", "lastSyncedAt", "balanceSyncedAt", "daily", "monthlyEarnings", "positions", "kryptexMiningDaily"].includes(key) &&
    tracker[key] && (typeof tracker[key] !== "object" || Object.keys(tracker[key]).length > 0));
  INTEGRATED_SOURCES.forEach(source => {
    const tracker = source === "Kryptex" ? history.kryptex : source === "Salad" ? history.salad : source === "RollerCoin" ? history.rollercoin : source === "Unetwork" ? history.unetwork : source === "Loopscale" ? history.loopscale : history.luloProjects?.length ? history.luloProjects : null;
    if (hasTrackerData(tracker) || (source === "Lulo" && history.luloProjects?.length)) activeNames.add(source);
  });
  const recorded = (months || []).flatMap(row => Object.keys(row?.sources || {})).map(canonicalSourceName);
  return Array.from(new Set([...activeNames, ...recorded.filter(source => activeNames.has(source))]))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
};
function readHistory() {
  let legacyProjects = [];
  try { const saved = JSON.parse(remoteStorage.getItem("networth_projects") || "[]"); if (Array.isArray(saved)) legacyProjects = saved; } catch {}
  const inactive = new Set((readObject(INACTIVE_PROJECTS_KEY).ids || []).map(String));
  const quickProjects = readObject(PROJECT_QUICK_CACHE_KEY).projects || [];
  const activeProjectNames = [
    ...legacyProjects.filter(project => !inactive.has(String(project?.id)) && project?.inactive !== true && project?.is_inactive !== true).map(project => project?.name),
    ...quickProjects.filter(project => !inactive.has(String(project?.id)) && project?.inactive !== true && project?.is_inactive !== true).map(project => project?.name),
  ].filter(Boolean);
  return { activeProjectNames, luloProjects: quickProjects.filter(p => p?.yield_tracking === "lulo_lending"), loopscale: loadLoopscaleHistory(), salad: loadSaladTracker(), rollercoin: loadRollerCoinTracker(), unetwork: loadUnetworkTracker(), kryptex: loadKryptexTracker() };
}
export default function HardwarePaybackPage() {
  const [devices, setDevices] = useState(readDevices);
  const [history, setHistory] = useState(readHistory);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const {data: backendRecovery, error: backendRecoveryError} = useBackendHardwarePayback();
  useEffect(() => subscribe(() => { setDevices(readDevices()); setHistory(readHistory()); }), []);
  useEffect(() => {
    // The canonical Kryptex endpoint reconciles chart rewards, satoshi
    // evidence, and BTC/USD repricing. Hardware Payback must observe its
    // confirmed tracker rather than write raw, potentially lower chart
    // conversions back over recovered historical income.
    const receiveAggregate = event => {
      const tracker = event?.detail?.tracker;
      if (tracker && typeof tracker === "object") {
        setHistory(current => ({ ...current, kryptex: tracker }));
      }
    };
    window.addEventListener("kryptex-aggregate-update", receiveAggregate);
    window.postMessage(
      { source: "kryptex-tracker-app", type: "REQUEST_LATEST" },
      window.location.origin
    );
    return () =>
      window.removeEventListener("kryptex-aggregate-update", receiveAggregate);
  }, []);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const currentMonth = useMemo(getCurrentMonthKey, [clock]);
  const currentDay = useMemo(getTodayKey, [clock]);
  const months = useBackendIncomeHistory({ currentMonth });

  const sourceOptions = useMemo(() => sourceOptionsFor(history, months), [history, months]);
  // Per-device credits intentionally use full selected source earnings.
  // When multiple devices share Kryptex (or another provider), summing these
  // credits is NOT distinct business revenue. Preserve the user's chosen
  // payback method, but label the rollup accurately.
  const sharedSources = sharedPaybackSources(devices, deviceSources);
  // Do not reuse the old browser checkpoint calculations for DISPLAY.
  // The legacy earnings helper above only supports compatibility when
  // an older device is edited; it does not determine visible recovery.
  const paybackRows = useMemo(() => new Map(
    (backendRecovery?.devices || []).map(row => [String(row.id), row])
  ), [backendRecovery]);
  const totalEarned = backendRecovery?.sumObservedDeviceCreditsUsd ?? null;
  const left = backendRecovery?.sumObservedRemainingUsd ?? null;
  const totalCost = backendRecovery?.sumDeviceCashCostUsd ?? null;
  async function persist(next) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const reviewed = await previewHardwareCheckpointEdit(devices, next);
      // No checkpoint is persisted until the backend has reviewed the
      // complete proposed register against the currently saved version.
      remoteStorage.setItem(KEY, JSON.stringify(reviewed));
      window.dispatchEvent(new Event("hardware-payback-updated"));
      setDevices(reviewed);
      setDraft(null);
    } catch (error) {
      setError(error?.message || "Hardware edit could not be verified by the backend");
    } finally {
      setSaving(false);
    }
  }
  const save = async event => {
    event.preventDefault();
    const name = draft.name.trim(), cost = Number(draft.cost), power = Number(draft.power || 0);
    if (photoLoading || saving) return;
    if (!name || (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(draft.earningsStartDay || "") || draft.earningsStartDay>currentDay) || !deviceSources(draft).length || !/^[0-9]{4}-[0-9]{2}$/.test(draft.startMonth) || draft.startMonth > currentMonth || !Number.isFinite(cost) || cost <= 0 || !Number.isFinite(power) || power < 0) {
      setError("Enter a name, purchase month, cost, earnings start date, and income source.");
      return;
    }
    const sources = deviceSources(draft);
    const device = { ...draft, sources, source: sources[0] };
    const next = draft.id
      ? devices.map(row => row.id === draft.id ? { ...device, name, cost, power } : row)
      : [...devices, { ...device, id: crypto.randomUUID(), name, cost, power }];
    await persist(next);
  };
  const remove = async id => {
    await persist(devices.filter(row => row.id !== id));
  };
  return <div className="min-w-0 space-y-4 pb-8 text-white" data-testid="hardware-payback-page">
    <header className="flex flex-wrap items-center justify-between gap-3 px-1"><h1 className="text-[32px] font-semibold tracking-tight">Hardware Payback</h1><button type="button" onClick={() => { setError(""); setDraft({ name: "", cost: "", power: "", startMonth: currentMonth, source: "", sources: [], earningsStartDay:currentDay }); }} className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"><Plus className="h-4 w-4"/>Add hardware</button></header>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[["Hardware cash cost", totalCost], ["Backend-observed device credits", totalEarned], ["Observed remaining to recover", left]].map(([title, value], i) => <section key={title} className={`${panel} border-t-2 p-5 sm:p-6 ${i === 0 ? "border-t-sky-500" : i === 1 ? "border-t-emerald-400" : "border-t-indigo-400"}`}><p className="text-sm font-semibold text-[#c4d1de]">{title}</p><strong className={`mt-3 block text-4xl tabular-nums ${i === 1 ? "text-emerald-400" : ""}`}>{devices.length && value != null ? money(value) : "—"}</strong></section>)}</div>
    {backendRecoveryError && <p role="status" className="px-1 text-xs text-amber-300">{backendRecoveryError}. No local checkpoint amount is substituted.</p>}
    {sharedSources.length > 0 && <p role="note" className="px-1 text-xs leading-relaxed text-[#91a4b8]">Shared source{sharedSources.length === 1 ? "" : "s"} ({sharedSources.join(", ")}) appear{sharedSources.length === 1 ? "s" : ""} on multiple devices. The credit total above counts each device's payback separately, so it is not unique mining income. Use Passive Income for the unduplicated earnings total.</p>}
    {devices.length > 0 && <section className={`${panel} p-5`}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Your hardware</h2><span className="text-sm text-[#91a4b8]">{left != null && left <= 0 && backendRecovery?.complete ? "Recovered" : "Forecast paused until backend source history is reconciled"}</span></div><div className="mt-4 grid grid-cols-1 gap-3">{devices.map((d, index) => {
          const evidence = paybackRows.get(String(d.id));
          const observed = evidence?.observedCreditUsd ?? null;
          const remaining = evidence?.observedRemainingUsd ?? null;
          const progress = evidence?.observedProgressPct != null
            ? Math.max(0, Math.min(1, evidence.observedProgressPct / 100)) : null;
          const provisional = evidence && !evidence.complete;
          return (
          <article key={d.id} role="button" tabIndex={0}
            aria-label={`Edit ${d.name} hardware and income source`}
            title="Click anywhere to edit hardware and income source"
            onClick={() => { setError(""); setDraft({ ...d, sources:deviceSources(d) }); }}
            onKeyDown={event => {
              if(event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setError("");
                setDraft({ ...d, sources:deviceSources(d) });
              }
            }}
            style={{ borderColor: ["#326e59", "#645284", "#94753e", "#386a91"][index % 4] }}
            className="w-full max-w-[280px] cursor-pointer rounded-xl border border-[#304252] bg-gradient-to-br from-[#132330] to-[#101720] p-4 transition-colors hover:bg-[#1a3041] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
            <div className="flex items-center gap-3">
              <img src={hardwareImageFor(d)} alt={d.name + " hardware"} className="h-12 w-20 shrink-0 rounded-xl border border-[#304252] bg-[#0b1017] object-contain p-1"/>
              <h3 className="min-w-0 flex-1 truncate text-lg font-semibold">{d.name}</h3>
              <span aria-hidden="true" className="rounded-lg border border-[#344657] p-2 text-[#aabac8]"><Pencil size={15}/></span>
            </div>
            <dl className="my-5 grid grid-cols-1 gap-4 text-sm">
              <div><dt>Hardware cash cost</dt><dd className="font-semibold">{evidence?.cashCostUsd != null ? money(evidence.cashCostUsd) : "—"}</dd></div>
              <div><dt>Backend observed recovery</dt><dd className="font-semibold text-emerald-300">{observed == null ? "—" : money(observed)}{provisional && <span className="ml-1 text-[10px] text-amber-300">(provisional)</span>}</dd></div>
              <div><dt>Observed remaining</dt><dd className="font-semibold">{remaining == null ? "—" : money(remaining)}</dd></div>
              <div><dt>Estimated recovered</dt><dd className="font-semibold">{remaining != null && remaining <= 0 && evidence?.complete ? "Recovered" : "Forecast not verified"}</dd></div>
            </dl>
            <div className="mb-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#253447]"><div className="h-full bg-emerald-400" style={{width: `${(progress ?? 0) * 100}%`}}/></div><span>{progress == null ? "—" : progress === 1 ? "100%" : Math.round(progress * 100) + "%"}</span></div>
            {evidence?.checkpointBaselineUnderstatesPriorRewards && <p role="alert" className="mb-3 text-xs text-amber-300">The saved checkpoint predates recovered source history. Backend credits start on {evidence.startDay}; older rewards are excluded.</p>}
            <div className="flex flex-col items-start gap-2 border-t border-[#304252] pt-3 text-sm text-[#b1c2d0]">
              <span className={`inline-flex items-center gap-2 ${d.source ? "" : "text-amber-300"}`}>{deviceSources(d).join(", ") || "Income source not selected"}</span>
              <span className="inline-flex items-center gap-2"><CalendarDays size={15}/>{label(d.startMonth)}</span>
              <span className="inline-flex items-center gap-2"><Zap size={15} className="text-amber-300"/>{money(outOfPocketMiningPowerCost(d.power, currentMonth))}/mo power</span>
            </div>
          </article>
        ); })}</div></section>}
    {!devices.length && <p className={`${panel} p-6`}>Add your first device to track payback.</p>}
    {draft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setDraft(null); }}><form onSubmit={save} role="dialog" aria-modal="true" aria-label={draft.id ? "Edit hardware" : "Add hardware"} className={`${panel} w-full max-w-2xl max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain space-y-4 p-5 sm:p-7 shadow-2xl`}><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{draft.id ? "Edit hardware" : "Add hardware"}</h2><button type="button" onClick={() => setDraft(null)} aria-label="Close" className="p-1 text-[#91a4b8]"><X className="h-5 w-5"/></button></div><label className="block text-sm">Name<input required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="RTX 5070" className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/></label><div className="space-y-2"><span className="text-sm">Hardware photo</span><div className="flex items-center gap-3">
<img src={hardwareImageFor(draft)} alt="Hardware photo preview" className="h-20 w-32 shrink-0 rounded-lg border border-[#3c5267] bg-[#111b25] object-contain p-1"/>
<div className="min-w-0 flex-1 space-y-2">
<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload hardware photo" disabled={photoLoading}
onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setPhotoLoading(true);setError("");
try {const photo=await prepareHardwarePhoto(file);setDraft(current=>({...current,photo}));}
catch(error){setError(error?.message || "Unable to load photo.");}
finally{setPhotoLoading(false);e.target.value="";}}}
className="block w-full text-xs text-[#aab9c6] file:mr-2 file:rounded-md file:border-0 file:bg-[#243a4e] file:px-2 file:py-1.5 file:text-white"/>
{draft.photo && <button type="button" className="text-xs text-rose-300 hover:underline" onClick={()=>setDraft(current=>({...current,photo:""}))}>Remove photo</button>}
<p className="text-[11px] text-[#91a4b8]">Optional JPG, PNG or WebP. RTX 5080 has a default illustration.</p>
</div></div></div><div className="grid grid-cols-2 gap-3"><label className="block text-sm">Purchase cost<input required type="number" min="0.01" step="0.01" value={draft.cost} onChange={e => setDraft({ ...draft, cost: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/></label><label className="block text-sm">Power cost / month<input type="number" min="0" step="0.01" value={draft.power} onChange={e => setDraft({ ...draft, power: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/></label></div><fieldset className="space-y-2"><legend className="text-sm">Income sources (select multiple)</legend><div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[#3c5267] bg-[#111b25] p-2">{Array.from(new Set([...sourceOptions,...deviceSources(draft)])).map(source=><label key={source} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/5"><input type="checkbox" checked={deviceSources(draft).includes(source)} onChange={event=>{ const current=deviceSources(draft); const sources=event.target.checked ? [...current,source] : current.filter(item=>item!==source); setDraft({...draft,sources,source:sources[0] || ""}); }} className="h-4 w-4 accent-emerald-400"/>{source}</label>)}</div></fieldset><label className="block text-sm">Purchase month<input required type="month" max={currentMonth} value={draft.startMonth} onChange={e => setDraft({ ...draft, startMonth: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/></label><label className="block text-sm">Earnings start date<input type="date" max={currentDay} value={draft.earningsStartDay || ""} onChange={e => setDraft({ ...draft, earningsStartDay: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/><span className="mt-1 block text-xs text-[#91a4b8]">Backend recovery uses this Pacific start date for every selected source. Changing income sources may require a separate historical checkpoint review. A blank start date cannot be certified.</span></label>{error && <p role="alert" className="text-sm text-rose-400">{error}</p>}<div className="flex gap-2">{draft.id && <button type="button" disabled={saving} onClick={() => remove(draft.id)} aria-label="Delete hardware" className="rounded-lg border border-rose-500/40 p-3 text-rose-400"><Trash2 className="h-4 w-4"/></button>}<button type="submit" disabled={saving || photoLoading} className="disabled:opacity-50 flex-1 rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-[#061810]">{saving ? "Verifying…" : "Save"}</button></div></form></div>}
  </div>;
}
