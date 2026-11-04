import { useEffect, useMemo, useState } from "react";
import { Area, ComposedChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Pencil, Trash2, X, Cpu, CalendarDays, Zap } from "lucide-react";
import { api } from "@/lib/apiClient";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { useBackendMonthlyIncome } from "@/hooks/useBackendMonthlyIncome";
import { buildIncomeHistory, legacyProjectIncome, reconcileLuloIncome, shiftMonth } from "@/lib/incomeHistory";
import { mergeManualIncome } from "@/lib/manualIncomeHistory";
import { mergeBackendLoopscaleHistory } from "@/lib/mergeBackendLoopscaleHistory";
import { STOCK_DIVIDEND_PAYOUTS_KEY } from "@/lib/stockDividendPayouts";
import { buildProjectIncome, formatCurrency, getCurrentMonthKey, getEffectiveProjectIncome, loadKryptexTracker, loadLoopscaleHistory, loadMonthlyBackfills, loadMonthlySnapshots, loadRollerCoinTracker, loadSaladTracker, loadUnetworkTracker, PROJECT_QUICK_CACHE_KEY, readObject } from "@/lib/yieldFarmingAccounting";

const KEY = "hardware_payback_devices_v1";
const panel = "rounded-2xl border border-[#263342] bg-[#0b1017]";
const money = value => formatCurrency(Number(value) || 0);
const label = key => new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-15T12:00:00Z`));
const readDevices = () => { try { const rows = JSON.parse(remoteStorage.getItem(KEY) || "[]"); return Array.isArray(rows) ? rows : []; } catch { return []; } };
function readHistory() {
  let legacyProjects = [];
  try { const saved = JSON.parse(remoteStorage.getItem("networth_projects") || "[]"); if (Array.isArray(saved)) legacyProjects = saved; } catch {}
  return { legacyProjects, luloProjects: (readObject(PROJECT_QUICK_CACHE_KEY).projects || []).filter(p => p?.yield_tracking === "lulo_lending"), loopscale: loadLoopscaleHistory(), salad: loadSaladTracker(), rollercoin: loadRollerCoinTracker(), unetwork: loadUnetworkTracker(), kryptex: loadKryptexTracker(), backfills: loadMonthlyBackfills(), snapshots: loadMonthlySnapshots(), payouts: readObject(STOCK_DIVIDEND_PAYOUTS_KEY), manualIncome: {}, luloBackfills: {} };
}
function buildTimeline(devices, months, currentMonth) {
  if (!devices.length) return { points: [], cost: 0, earned: 0, remaining: 0, halfway: null, breakEven: null, pace: 0 };
  const byMonth = new Map(months.map(row => [row.monthKey, Number(row.projectTotal) || 0]));
  const cost = devices.reduce((sum, d) => sum + Number(d.cost || 0), 0);
  const start = devices.map(d => d.startMonth).sort()[0];
  const day = Number(new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "America/Los_Angeles" }).format(new Date()));
  const days = new Date(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)), 0).getDate();
  const points = [{ month: `${start}-start`, label: "Purchase", actual: 0, forecast: null }]; let cumulative = 0;
  for (let month = start, count = 0; month <= currentMonth && count < 240; month = shiftMonth(month, 1), count++) {
    const fraction = month === currentMonth ? day / days : 1;
    cumulative += (byMonth.get(month) || 0) - devices.reduce((sum, d) => month >= d.startMonth ? sum + (Number(d.power) || 0) * fraction : sum, 0);
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
export default function HardwarePaybackPage() {
  const [devices, setDevices] = useState(readDevices);
  const [history, setHistory] = useState(readHistory);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [chartMode, setChartMode] = useState("cumulative");
  useEffect(() => subscribe(() => { setDevices(readDevices()); setHistory(current => ({ ...readHistory(), manualIncome: current.manualIncome, luloBackfills: current.luloBackfills })); }), []);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let active = true;
    const refresh = async () => { try { const result = await api.get("/api/yield-sources/earnings"); if (active && result) setHistory(current => ({ ...current, loopscale: mergeBackendLoopscaleHistory(current.loopscale, result.loopscaleHistory), manualIncome: result.manualIncomeHistory || current.manualIncome, luloBackfills: result.luloBackfills || current.luloBackfills })); } catch {} };
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
  const stats = useMemo(() => buildTimeline(devices, months, currentMonth), [devices, months, currentMonth]);
  const chartPoints = useMemo(() => chartMode === "cumulative" ? stats.points : stats.points.map((point, index) => ({ ...point, actual: point.actual == null ? null : point.actual - (stats.points[index - 1]?.actual ?? 0), forecast: point.forecast == null ? null : point.forecast - (stats.points[index - 1]?.forecast ?? stats.points[index - 1]?.actual ?? 0) })), [stats.points, chartMode]);
  const save = event => {
    event.preventDefault();
    const name = draft.name.trim(), cost = Number(draft.cost), power = Number(draft.power || 0);
    if (!name || !/^\d{4}-\d{2}$/.test(draft.startMonth) || draft.startMonth > currentMonth || !Number.isFinite(cost) || cost <= 0 || !Number.isFinite(power) || power < 0) { setError("Enter a name, purchase month, and valid cost."); return; }
    const { source, ...device } = draft;
    const next = draft.id ? devices.map(row => row.id === draft.id ? { ...device, name, cost, power } : row) : [...devices, { ...device, id: crypto.randomUUID(), name, cost, power }];
    remoteStorage.setItem(KEY, JSON.stringify(next)); setDevices(next); setDraft(null); setError("");
  };
  const remove = id => { const next = devices.filter(row => row.id !== id); remoteStorage.setItem(KEY, JSON.stringify(next)); setDevices(next); setDraft(null); };
  return <div className="min-w-0 space-y-4 pb-8 text-white" data-testid="hardware-payback-page">
    <header className="flex flex-wrap items-center justify-between gap-3 px-1"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#91a4b8]">Hardware Payback</p><h1 className="mt-1 text-[32px] font-semibold tracking-tight sm:text-[40px]">Milestone Timeline</h1></div><button type="button" onClick={() => { setError(""); setDraft({ name: "", cost: "", power: "", startMonth: currentMonth }); }} className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"><Plus className="h-4 w-4"/>Add hardware</button></header>
    <div className="grid gap-3 sm:grid-cols-3">{[["Hardware cost", stats.cost], ["Net project earnings", stats.earned], ["Left to recover", stats.remaining]].map(([title, value], i) => <section key={title} className={`${panel} border-t-2 p-5 sm:p-6 ${i === 0 ? "border-t-sky-500" : i === 1 ? "border-t-emerald-400" : "border-t-indigo-400"}`}><p className="text-sm font-semibold text-[#c4d1de]">{title}</p><strong className={`mt-3 block text-4xl tabular-nums ${i === 1 ? "text-emerald-400" : ""}`}>{devices.length ? money(value) : "—"}</strong></section>)}</div>
    <section className={`${panel} p-5 sm:p-7`} aria-label="Hardware payback milestones"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex rounded-lg border border-[#30465b] bg-[#0e1825] p-1 text-sm"><button type="button" aria-pressed={chartMode === "cumulative"} onClick={() => setChartMode("cumulative")} className={`rounded-md px-4 py-2 ${chartMode === "cumulative" ? "bg-emerald-400 font-semibold text-[#071910]" : "text-[#b8c7d7]"}`}>Cumulative earnings</button><button type="button" aria-pressed={chartMode === "monthly"} onClick={() => setChartMode("monthly")} className={`rounded-md px-4 py-2 ${chartMode === "monthly" ? "bg-emerald-400 font-semibold text-[#071910]" : "text-[#b8c7d7]"}`}>Monthly earnings</button></div><div className="flex items-center gap-4 text-xs text-[#a9bbcb]"><span><i className="mr-2 inline-block h-0.5 w-5 align-middle bg-emerald-400"/>Recorded</span><span><i className="mr-2 inline-block w-5 border-t-2 border-dashed border-cyan-300 align-middle"/>Forecast</span></div></div>
      {devices.length ? <div className="mt-6 w-full"><div className="h-[350px] sm:h-[470px]"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartPoints} margin={{ top: 28, right: 18, bottom: 0, left: 8 }}><defs><linearGradient id="hardwarePaybackFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2ee6ab" stopOpacity={0.23}/><stop offset="100%" stopColor="#2ee6ab" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#2a394a" strokeDasharray="3 5"/><XAxis dataKey="label" tick={{ fill: "#91a4b8", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28}/><YAxis tickFormatter={money} tick={{ fill: "#91a4b8", fontSize: 11 }} tickLine={false} axisLine={false} width={76} domain={chartMode === "cumulative" ? [value => Math.min(0, value), value => Math.max(stats.cost * 1.15, value * 1.12)] : [value => Math.min(0, value), "auto"]}/><Tooltip contentStyle={{ background: "#101b27", border: "1px solid #385166", borderRadius: 10 }} formatter={(value, name) => [money(value), `${name === "actual" ? "Recorded" : "Forecast"} ${chartMode === "monthly" ? "monthly" : "cumulative"} net earnings`]}/><ReferenceLine x="Purchase" stroke="#607388" strokeDasharray="3 5" label={{ value: "Purchase", position: "top", fill: "#a4b4c5", fontSize: 11 }}/>{chartMode === "cumulative" && <ReferenceLine y={stats.cost} stroke="#d0dce7" strokeDasharray="6 5" label={{ value: `Cost ${money(stats.cost)}`, fill: "#d0dce7", position: "insideTopLeft", fontSize: 11 }}/>}<Area type="monotone" dataKey="actual" stroke="#31e7a6" strokeWidth={3} fill="url(#hardwarePaybackFill)" dot={{ r: 2 }} isAnimationActive={false}/><Line type="monotone" dataKey="forecast" stroke="#66d9ef" strokeWidth={2.5} strokeDasharray="7 5" dot={false} isAnimationActive={false}/>{chartMode === "cumulative" && stats.halfway && <ReferenceLine x={label(stats.halfway)} stroke="#45c5ae" strokeDasharray="3 5" label={{ value: "Halfway", position: "top", fill: "#71e1c4", fontSize: 11 }}/ >}{chartMode === "cumulative" && stats.breakEven && <ReferenceLine x={label(stats.breakEven)} stroke="#61d8ed" strokeDasharray="3 5" label={{ value: "Break-even", position: "top", fill: "#8de4f3", fontSize: 11 }}/>}</ComposedChart></ResponsiveContainer></div><div className="mt-4 grid overflow-hidden rounded-lg border border-[#30465b] text-center text-xs font-semibold sm:grid-cols-2"><div className="bg-emerald-500/10 px-4 py-3 text-emerald-200">History · Recorded through {label(currentMonth)}</div><div className="bg-sky-500/10 px-4 py-3 text-sky-200">Forecast · {stats.breakEven && stats.earned < stats.cost ? `Estimated break-even ${label(stats.breakEven)}` : stats.earned >= stats.cost ? "Cost recovered" : "Awaiting a positive earnings pace"}</div></div></div> : <div className="mt-6 flex h-[350px] items-center justify-center rounded-xl border border-dashed border-[#324356] text-sm text-[#91a4b8]">Add hardware to see your payback timeline.</div>}</section>
    {devices.length > 0 && <section className={`${panel} p-5`}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Your hardware</h2><span className="text-sm text-[#91a4b8]">{stats.breakEven ? `${stats.earned >= stats.cost ? "Recovered" : "Estimated break-even"}: ${label(stats.breakEven)}` : stats.pace <= 0 ? "No positive earnings pace yet" : "Beyond the 36-month forecast"}</span></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{devices.map(d => (
          <article key={d.id} className="rounded-xl border border-[#304252] bg-gradient-to-br from-[#132330] to-[#101720] p-4">
            <div className="flex items-center gap-3">
              <span className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-2.5 text-emerald-300"><Cpu size={20}/></span>
              <h3 className="min-w-0 flex-1 truncate text-lg font-semibold">{d.name}</h3>
              <button type="button" aria-label={`Edit ${d.name}`} onClick={() => { setError(""); setDraft({ ...d }); }} className="rounded-lg border border-[#344657] p-2 text-[#aabac8] hover:text-white"><Pencil size={15}/></button>
            </div>
            <div className="my-4"><span className="text-xs text-[#9eb0bf]">Purchase cost</span><strong className="block text-2xl tabular-nums">{money(d.cost)}</strong></div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-[#304252] pt-3 text-sm text-[#b1c2d0]">
              <span className="inline-flex items-center gap-2"><CalendarDays size={15}/>{label(d.startMonth)}</span>
              <span className="inline-flex items-center gap-2"><Zap size={15} className="text-amber-300"/>{money(d.power)}/mo power</span>
            </div>
          </article>
        ))}</div></section>}
    {draft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setDraft(null); }}><form onSubmit={save} role="dialog" aria-modal="true" aria-label={draft.id ? "Edit hardware" : "Add hardware"} className={`${panel} w-full max-w-md space-y-4 p-6 shadow-2xl`}><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{draft.id ? "Edit hardware" : "Add hardware"}</h2><button type="button" onClick={() => setDraft(null)} aria-label="Close" className="p-1 text-[#91a4b8]"><X className="h-5 w-5"/></button></div><label className="block text-sm">Name<input required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="RTX 5070" className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/></label><div className="grid grid-cols-2 gap-3"><label className="block text-sm">Purchase cost<input required type="number" min="0.01" step="0.01" value={draft.cost} onChange={e => setDraft({ ...draft, cost: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/></label><label className="block text-sm">Power cost / month<input type="number" min="0" step="0.01" value={draft.power} onChange={e => setDraft({ ...draft, power: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/></label></div><label className="block text-sm">Purchase month<input required type="month" max={currentMonth} value={draft.startMonth} onChange={e => setDraft({ ...draft, startMonth: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] p-3"/></label>{error && <p role="alert" className="text-sm text-rose-400">{error}</p>}<div className="flex gap-2">{draft.id && <button type="button" onClick={() => remove(draft.id)} aria-label="Delete hardware" className="rounded-lg border border-rose-500/40 p-3 text-rose-400"><Trash2 className="h-4 w-4"/></button>}<button type="submit" className="flex-1 rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-[#061810]">Save</button></div></form></div>}
  </div>;
}
