import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, Cpu, CalendarDays, Zap } from "lucide-react";
import { api } from "@/lib/apiClient";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { useBackendMonthlyIncome } from "@/hooks/useBackendMonthlyIncome";
import { buildIncomeHistory, legacyProjectIncome, reconcileLuloIncome, shiftMonth } from "@/lib/incomeHistory";
import { mergeManualIncome } from "@/lib/manualIncomeHistory";
import { mergeBackendLoopscaleHistory } from "@/lib/mergeBackendLoopscaleHistory";
import { STOCK_DIVIDEND_PAYOUTS_KEY } from "@/lib/stockDividendPayouts";
import { buildProjectIncome, formatCurrency, getCurrentMonthKey, getEffectiveProjectIncome, INACTIVE_PROJECTS_KEY, loadKryptexTracker, loadLoopscaleHistory, loadMonthlyBackfills, loadMonthlySnapshots, loadRollerCoinTracker, loadSaladTracker, loadUnetworkTracker, PROJECT_QUICK_CACHE_KEY, readObject } from "@/lib/yieldFarmingAccounting";

const KEY = "hardware_payback_devices_v1";
const KRYPTEX_PAYBACK_LEDGER = "kryptex-mining-v1";
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
const monthSourceAmount = (row, source, kryptexTracker) => {
  if (canonicalSourceName(source) === "Kryptex" && kryptexTracker) {
    const miningTotal = Object.entries(kryptexTracker.kryptexMiningDaily || {})
      .filter(([date]) => String(date).slice(0, 7) === String(row?.monthKey || ""))
      .reduce((sum, [, amount]) => sum + Math.max(0, Number(amount) || 0), 0);
    if (miningTotal > 0) return miningTotal;
    // Use Kryptex's current reported mining rate while the dated ledger
    // initializes. Never use the balance/P&L delta for payback.
    if (row?.monthKey === getCurrentMonthKey()) {
      return Math.max(0, Number(kryptexTracker.profitabilityUsdDay) || 0);
    }
    return 0;
  }
  return Object.entries(row?.sources || {}).reduce((sum, [name, amount]) =>
    canonicalSourceName(name) === canonicalSourceName(source) ? sum + Math.max(0, Number(amount) || 0) : sum, 0);
};
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
  return { legacyProjects, activeProjectNames, luloProjects: quickProjects.filter(p => p?.yield_tracking === "lulo_lending"), loopscale: loadLoopscaleHistory(), salad: loadSaladTracker(), rollercoin: loadRollerCoinTracker(), unetwork: loadUnetworkTracker(), kryptex: loadKryptexTracker(), backfills: loadMonthlyBackfills(), snapshots: loadMonthlySnapshots(), payouts: readObject(STOCK_DIVIDEND_PAYOUTS_KEY), manualIncome: {}, luloBackfills: {} };
}
function buildTimeline(devices, months, currentMonth, kryptexTracker) {
  if (!devices.length) return { points: [], cost: 0, earned: 0, remaining: 0, halfway: null, breakEven: null, pace: 0 };
  const cost = devices.reduce((sum, d) => sum + Number(d.cost || 0), 0);
  const start = devices.map(d => d.startMonth).sort()[0];
  const day = Number(new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "America/Los_Angeles" }).format(new Date()));
  const days = new Date(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)), 0).getDate();
  const points = [{ month: `${start}-start`, label: "Purchase", actual: 0, forecast: null }]; let cumulative = 0;
  for (let month = start, count = 0; month <= currentMonth && count < 240; month = shiftMonth(month, 1), count++) {
    const fraction = month === currentMonth ? day / days : 1;
    const row = months.find(item => item.monthKey === month);
    const activeSources = new Set(devices.filter(device => device.source && month >= device.startMonth).map(device => device.source));
    const income = Array.from(activeSources).reduce((sum, source) => sum + monthSourceAmount(row, source, kryptexTracker), 0);
    cumulative = Math.max(0, cumulative + income - devices.reduce((sum, d) => month >= d.startMonth ? sum + (Number(d.power) || 0) * fraction : sum, 0));
    points.push({ month, label: label(month), actual: Math.round(cumulative * 100) / 100, forecast: null });
  }
  const earned = cumulative;
  const closed = points.slice(0, -1).slice(-3);
  const pace = closed.length ? closed.reduce((sum, row) => { const i = points.indexOf(row); return sum + row.actual - (i ? points[i - 1].actual : 0); }, 0) / closed.length : 0;
  const halfway = points.find(p => p.actual >= cost / 2)?.month || null;
  let breakEven = points.find(p => p.actual >= cost)?.month || null;
  if (points.length && pace > 0 && !breakEven) {
    points[points.length - 1].forecast = points[points.length - 1].actual;
    for (let i = 1; i <= 36; i++) {
      const month = shiftMonth(currentMonth, i);
      const forecast = Math.round((earned + pace * i) * 100) / 100;
      points.push({ month, label: label(month), actual: null, forecast });
      if (forecast >= cost) { breakEven = month; break; }
    }
  }
  return { points, cost, earned, remaining: Math.max(0, cost - earned), halfway, breakEven, pace };
}
// Fractional Pacific calendar month, used to prorate power after a checkpoint.
function monthPosition(time) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(time).map(part => [part.type, Number(part.value)]));
  const days = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  return parts.year * 12 + parts.month - 1 +
    (parts.day - 1 + (parts.hour + parts.minute / 60 + parts.second / 3600) / 24) / days;
}

function deviceEarnings(devices, months, month, now, legacyStats, kryptexTracker) {
  const costsBySource = devices.reduce((totals, device) => {
    if (device.source) totals[device.source] = (totals[device.source] || 0) + (Number(device.cost) || 0);
    return totals;
  }, {});
  return Object.fromEntries(devices.map(device => {
    if (!device.checkpoint || !device.source) return [device.id, 0];
    const checkpoint = device.checkpoint;
    // Older checkpoints were built from Kryptex balance changes, which can be
    // negative when BTC moves. They are not valid hardware-payback earnings.
    // Ignore them until the device is saved with the mining-income ledger.
    const isKryptex = canonicalSourceName(device.source) === "Kryptex";
    if (isKryptex && checkpoint.ledger !== KRYPTEX_PAYBACK_LEDGER) return [device.id, 0];
    const income = months.reduce((sum, row) =>
      row.monthKey >= checkpoint.month && row.monthKey <= month ? sum + monthSourceAmount(row, device.source, kryptexTracker) : sum, 0);
    const power = Math.max(0, monthPosition(now) - monthPosition(checkpoint.time)) * device.power;
    const sourceCost = costsBySource[device.source] || 0;
    const earned = Math.max(0, checkpoint.carried + (income - checkpoint.baseline) * device.cost / sourceCost - power);
    return [device.id, earned];
  }));
}

export default function HardwarePaybackPage() {
  const [devices, setDevices] = useState(readDevices);
  const [history, setHistory] = useState(readHistory);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [historyReady, setHistoryReady] = useState(false);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => subscribe(() => { setDevices(readDevices()); setHistory(current => ({ ...readHistory(), manualIncome: current.manualIncome, luloBackfills: current.luloBackfills })); }), []);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let active = true;
    const refresh = async () => { try { const result = await api.get("/api/yield-sources/earnings"); if (active && result) setHistory(current => ({ ...current, loopscale: mergeBackendLoopscaleHistory(current.loopscale, result.loopscaleHistory), manualIncome: result.manualIncomeHistory || current.manualIncome, luloBackfills: result.luloBackfills || current.luloBackfills })); if (active && result) setHistoryReady(true); } catch {} };
    refresh(); const timer = setInterval(refresh, 90000); return () => { active = false; clearInterval(timer); };
  }, []);
  const currentMonth = useMemo(getCurrentMonthKey, [clock]);
  const trackers = useMemo(() => ({ salad: history.salad, rollercoin: history.rollercoin, unetwork: history.unetwork, kryptex: history.kryptex }), [history.salad, history.rollercoin, history.unetwork, history.kryptex]);
  const localMonths = useMemo(() => buildProjectIncome(history.luloProjects, history.loopscale, history.salad, history.backfills, history.rollercoin, history.unetwork, history.kryptex), [history]);
  const liveMonths = useBackendMonthlyIncome(trackers, localMonths);
  const months = useMemo(() => {
    const projects = reconcileLuloIncome(getEffectiveProjectIncome(liveMonths, history.snapshots), history.backfills, history.luloBackfills, currentMonth);
    return mergeManualIncome(buildIncomeHistory(projects, history.payouts, currentMonth, legacyProjectIncome(history.legacyProjects)), history.manualIncome?.monthly || {}, currentMonth);
  }, [liveMonths, history, currentMonth]);
  useEffect(() => {
    if (!historyReady) return;
    const legacyKryptex = devices.filter(device =>
      canonicalSourceName(device.source) === "Kryptex" && device.checkpoint && device.checkpoint.ledger !== KRYPTEX_PAYBACK_LEDGER);
    if (!legacyKryptex.length) return;
    const now = Date.now();
    const currentRow = months.find(row => row.monthKey === currentMonth);
    const baseline = monthSourceAmount(currentRow, "Kryptex", history.kryptex);
    const migrated = devices.map(device => legacyKryptex.some(row => row.id === device.id)
      ? { ...device, checkpoint: { time: now, month: currentMonth, baseline, carried: 0, ledger: KRYPTEX_PAYBACK_LEDGER } }
      : device);
    remoteStorage.setItem(KEY, JSON.stringify(migrated));
    setDevices(migrated);
  }, [historyReady, devices, months, currentMonth, history.kryptex]);
  const sourceOptions = useMemo(() => sourceOptionsFor(history, months), [history, months]);
  const stats = useMemo(() => buildTimeline(devices, months, currentMonth, history.kryptex), [devices, months, currentMonth, history.kryptex]);
  const earnings = deviceEarnings(devices, months, currentMonth, Date.now(), stats, history.kryptex);
  const totalEarned = Object.values(earnings).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const left = devices.reduce((sum, device) => sum + Math.max(0, device.cost - earnings[device.id]), 0);
  function persist(next) {
    const time = Date.now();
    const carried = deviceEarnings(devices, months, currentMonth, time, stats, history.kryptex);
    const currentRow = months.find(row => row.monthKey === currentMonth);
    const updated = next.map(device => ({
      ...device,
      checkpoint: {
        time,
        month: currentMonth,
        baseline: monthSourceAmount(currentRow, device.source, history.kryptex),
        carried: devices.find(previous => previous.id === device.id)?.source === device.source ? (carried[device.id] ?? 0) : 0,
        ...(canonicalSourceName(device.source) === "Kryptex" ? { ledger: KRYPTEX_PAYBACK_LEDGER } : {}),
      },
    }));
    remoteStorage.setItem(KEY, JSON.stringify(updated));
    setDevices(updated);
    setDraft(null);
  }
  const save = event => {
    event.preventDefault();
    const name = draft.name.trim(), cost = Number(draft.cost), power = Number(draft.power || 0);
    if (!name || !draft.source || !/^\d{4}-\d{2}$/.test(draft.startMonth) || draft.startMonth > currentMonth || !Number.isFinite(cost) || cost <= 0 || !Number.isFinite(power) || power < 0) { setError("Enter a name, purchase month, cost, and income source."); return; }
    const device = { ...draft, source: draft.source.trim() };
    const next = draft.id ? devices.map(row => row.id === draft.id ? { ...device, name, cost, power } : row) : [...devices, { ...device, id: crypto.randomUUID(), name, cost, power }];
    persist(next); setError("");
  };
  const remove = id => { const next = devices.filter(row => row.id !== id); persist(next); };
  return <div className="min-w-0 space-y-4 pb-8 text-white" data-testid="hardware-payback-page">
    <header className="flex flex-wrap items-center justify-between gap-3 px-1"><h1 className="text-[32px] font-semibold tracking-tight">Hardware Payback</h1><button type="button" onClick={() => { setError(""); setDraft({ name: "", cost: "", power: "", startMonth: currentMonth, source: "" }); }} className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"><Plus className="h-4 w-4"/>Add hardware</button></header>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[["Hardware cost", stats.cost], ["Net project earnings", totalEarned], ["Left to recover", left]].map(([title, value], i) => <section key={title} className={`${panel} border-t-2 p-5 sm:p-6 ${i === 0 ? "border-t-sky-500" : i === 1 ? "border-t-emerald-400" : "border-t-indigo-400"}`}><p className="text-sm font-semibold text-[#c4d1de]">{title}</p><strong className={`mt-3 block text-4xl tabular-nums ${i === 1 ? "text-emerald-400" : ""}`}>{devices.length ? money(value) : "—"}</strong></section>)}</div>
    {devices.length > 0 && <section className={`${panel} p-5`}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Your hardware</h2><span className="text-sm text-[#91a4b8]">{left <= 0 ? "Recovered" : stats.pace > 0 ? `Estimated break-even: ${label(shiftMonth(currentMonth, Math.min(1200, Math.ceil(left / stats.pace))))}` : "No positive earnings pace yet"}</span></div><div className="mt-4 grid grid-cols-1 gap-3">{devices.map((d, index) => {
          const progress = Math.max(0, Math.min(1, earnings[d.id] / d.cost));
          return (
          <article key={d.id} style={{ borderColor: ["#326e59", "#645284", "#94753e", "#386a91"][index % 4] }} className="w-full max-w-[280px] rounded-xl border border-[#304252] bg-gradient-to-br from-[#132330] to-[#101720] p-4">
            <div className="flex items-center gap-3">
              <span className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-2.5 text-emerald-300"><Cpu size={20}/></span>
              <h3 className="min-w-0 flex-1 truncate text-lg font-semibold">{d.name}</h3>
              <button type="button" aria-label={`Edit ${d.name}`} onClick={() => { setError(""); setDraft({ ...d }); }} className="rounded-lg border border-[#344657] p-2 text-[#aabac8] hover:text-white"><Pencil size={15}/></button>
            </div>
            <dl className="my-5 grid grid-cols-1 gap-4 text-sm">
              <div><dt>Cost</dt><dd className="font-semibold">{money(d.cost)}</dd></div>
              <div><dt>Allocated recovery</dt><dd className="font-semibold text-emerald-300">{money(d.cost * progress)}</dd></div>
              <div><dt>Left</dt><dd className="font-semibold">{money(Math.max(0, d.cost - earnings[d.id]))}</dd></div>
            </dl>
            <div className="mb-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#253447]"><div className="h-full bg-emerald-400" style={{width: `${progress * 100}%`}}/></div><span>{progress === 1 ? "Recovered" : Math.round(progress * 100) + "%"}</span></div>
            <div className="flex flex-col items-start gap-2 border-t border-[#304252] pt-3 text-sm text-[#b1c2d0]">
              <span className={`inline-flex items-center gap-2 ${d.source ? "" : "text-amber-300"}`}>{d.source || "Income source not selected"}</span>
              <span className="inline-flex items-center gap-2"><CalendarDays size={15}/>{label(d.startMonth)}</span>
              <span className="inline-flex items-center gap-2"><Zap size={15} className="text-amber-300"/>{money(d.power)}/mo power</span>
            </div>
          </article>
        ); })}</div></section>}
    {!devices.length && <p className={`${panel} p-6`}>Add your first device to track payback.</p>}
    {draft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setDraft(null); }}><form onSubmit={save} role="dialog" aria-modal="true" aria-label={draft.id ? "Edit hardware" : "Add hardware"} className={`${panel} w-full max-w-md space-y-4 p-6 shadow-2xl`}><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{draft.id ? "Edit hardware" : "Add hardware"}</h2><button type="button" onClick={() => setDraft(null)} aria-label="Close" className="p-1 text-[#91a4b8]"><X className="h-5 w-5"/></button></div><label className="block text-sm">Name<input required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="RTX 5070" className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/></label><div className="grid grid-cols-2 gap-3"><label className="block text-sm">Purchase cost<input required type="number" min="0.01" step="0.01" value={draft.cost} onChange={e => setDraft({ ...draft, cost: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/></label><label className="block text-sm">Power cost / month<input type="number" min="0" step="0.01" value={draft.power} onChange={e => setDraft({ ...draft, power: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/></label></div><label className="block text-sm">Income source<select required value={draft.source || ""} onChange={e => setDraft({ ...draft, source: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"><option value="" disabled>Select a source</option>{sourceOptions.map(source => <option key={source} value={source}>{source}</option>)}</select></label><label className="block text-sm">Purchase month<input required type="month" max={currentMonth} value={draft.startMonth} onChange={e => setDraft({ ...draft, startMonth: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/></label>{error && <p role="alert" className="text-sm text-rose-400">{error}</p>}<div className="flex gap-2">{draft.id && <button type="button" disabled={!historyReady} onClick={() => remove(draft.id)} aria-label="Delete hardware" className="rounded-lg border border-rose-500/40 p-3 text-rose-400"><Trash2 className="h-4 w-4"/></button>}<button type="submit" disabled={!historyReady} className="disabled:opacity-50 flex-1 rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-[#061810]">{historyReady ? "Save" : "Loading earnings…"}</button></div></form></div>}
  </div>;
}
