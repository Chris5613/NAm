import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { api } from "@/lib/apiClient";
import { useBackendMonthlyIncome } from "@/hooks/useBackendMonthlyIncome";
import { mergeBackendLoopscaleHistory } from "@/lib/mergeBackendLoopscaleHistory";
import { STOCK_DIVIDEND_PAYOUTS_KEY } from "@/lib/stockDividendPayouts";
import { buildIncomeHistory, legacyProjectIncome, shiftMonth } from "@/lib/incomeHistory";
import {
  buildProjectIncome, formatCurrency, getCurrentMonthKey, getEffectiveProjectIncome,
  loadKryptexTracker, loadLoopscaleHistory, loadMonthlyBackfills, loadMonthlySnapshots,
  loadRollerCoinTracker, loadSaladTracker, loadUnetworkTracker, PROJECT_QUICK_CACHE_KEY,
  readObject,
} from "@/lib/yieldFarmingAccounting";

const panel = "min-w-0 rounded-2xl border border-[#263342] bg-[#0b1017]";
const monthLabel = key => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
  .format(new Date(`${key}-15T12:00:00Z`));
const shortMonth = key => new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
  .format(new Date(`${key}-15T12:00:00Z`));
const sourceColors = {
  Lulo: "#a3e635",
  Loopscale: "#60a5fa",
  Kryptex: "#fbbf24",
  Salad: "#34d399",
  Unetwork: "#a78bfa",
  RollerCoin: "#fb7185",
  Stocks: "#38bdf8",
  COIN: "#2dd4bf",
  GoMining: "#fb923c",
};
const fallbackColors = ["#e879f9", "#f472b6", "#facc15", "#818cf8", "#22d3ee"];
const sourceColor = name => sourceColors[name] || fallbackColors[
  [...name].reduce((hash, character) => hash + character.charCodeAt(0), 0) % fallbackColors.length
];

function readHistory() {
  let legacyProjects = [];
  try {
    const saved = JSON.parse(remoteStorage.getItem("networth_projects") || "[]");
    if (Array.isArray(saved)) legacyProjects = saved;
  } catch { /* The rest of the saved income remains available. */ }
  return {
    legacyProjects,
    luloProjects: (readObject(PROJECT_QUICK_CACHE_KEY).projects || []).filter(project => project?.yield_tracking === "lulo_lending"),
    loopscale: loadLoopscaleHistory(), salad: loadSaladTracker(), rollercoin: loadRollerCoinTracker(),
    unetwork: loadUnetworkTracker(), kryptex: loadKryptexTracker(),
    backfills: loadMonthlyBackfills(), snapshots: loadMonthlySnapshots(),
    payouts: readObject(STOCK_DIVIDEND_PAYOUTS_KEY),
  };
}

export default function IncomeHistoryPage() {
  const [history, setHistory] = useState(readHistory);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => subscribe(() => setHistory(readHistory())), []);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.get("/api/yield-sources/earnings");
        if (active && result?.loopscaleHistory) setHistory(current => ({
          ...current, loopscale: mergeBackendLoopscaleHistory(current.loopscale, result.loopscaleHistory),
        }));
      } catch { /* Retain saved history if the provider is unavailable. */ }
    };
    refresh();
    const timer = window.setInterval(refresh, 90000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const currentMonth = useMemo(getCurrentMonthKey, [clock]);
  const trackers = useMemo(() => ({
    salad: history.salad, rollercoin: history.rollercoin,
    unetwork: history.unetwork, kryptex: history.kryptex,
  }), [history.salad, history.rollercoin, history.unetwork, history.kryptex]);
  const localMonths = useMemo(() => buildProjectIncome(
    history.luloProjects, history.loopscale, history.salad, history.backfills,
    history.rollercoin, history.unetwork, history.kryptex,
  ), [history]);
  const liveMonths = useBackendMonthlyIncome(trackers, localMonths);
  const projectMonths = useMemo(() => getEffectiveProjectIncome(liveMonths, history.snapshots), [liveMonths, history.snapshots]);
  const legacy = useMemo(() => legacyProjectIncome(history.legacyProjects), [history.legacyProjects]);
  const months = useMemo(() => buildIncomeHistory(projectMonths, history.payouts, currentMonth, legacy), [projectMonths, history.payouts, currentMonth, legacy]);
  const monthMap = new Map(months.map(month => [month.monthKey, month]));
  const ytdMonths = [];
  for (let key = `${currentMonth.slice(0, 4)}-01`; key <= currentMonth; key = shiftMonth(key, 1)) {
    ytdMonths.push(monthMap.get(key) || { monthKey: key, total: null, sources: {}, stocks: 0 });
  }
  const selected = monthMap.get(selectedMonth) || monthMap.get(currentMonth) || months.at(-1);
  const recordedVisible = months;
  const selectedIndex = recordedVisible.findIndex(month => month.monthKey === selected?.monthKey);
  const trailingTotal = months.filter(month => month.monthKey >= shiftMonth(currentMonth, -11))
    .reduce((sum, month) => sum + month.total, 0);
  const ytdTotal = ytdMonths.reduce((sum, month) => sum + (month.total || 0), 0);
  const sources = Object.entries(selected?.sources || {}).sort((a, b) => b[1] - a[1]);
  const topSource = sources[0];
  const chartData = ytdMonths.map(month => ({ ...month, label: shortMonth(month.monthKey), value: month.total }));
  const chartMax = Math.max(1, ...chartData.map(month => month.value || 0));
  const lastTwelveMonths = Array.from({length: 12}, (_, index) => {
    const monthKey = shiftMonth(currentMonth, index - 11);
    return monthMap.get(monthKey) || {monthKey, total: null};
  });
  return <div className="min-w-0 space-y-3 pb-7" data-testid="income-history-page">
    <header className="px-1">
      <div><h1 className="text-[22px] font-semibold tracking-tight">Income History</h1>
        <p className="mt-1 text-xs text-muted-foreground">Monthly earnings and payouts from your recorded sources</p></div>
    </header>
    <section className={`${panel} p-4`} aria-label="Last 12 months of income">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Choose a month</h2>
        <span className="text-[11px] text-muted-foreground">Select a recorded month to see its sources</span>
      </div>
      <div className="grid grid-flow-col auto-cols-[minmax(112px,1fr)] gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {lastTwelveMonths.map(month => {
          const recorded = month.total != null;
          const active = selected?.monthKey === month.monthKey;
          return <button key={month.monthKey} type="button" disabled={!recorded} aria-pressed={recorded ? active : undefined}
            aria-label={`${monthLabel(month.monthKey)}: ${recorded ? formatCurrency(month.total) : "no recorded income"}`}
            onClick={() => setSelectedMonth(month.monthKey)}
            className={`min-w-0 rounded-xl border px-3 py-3 text-left transition-colors ${active
              ? "border-emerald-500/60 bg-emerald-500/[0.08]"
              : recorded ? "border-[#2b3848] bg-[#0e141c] hover:border-[#4a6674] hover:bg-[#14202a]"
                : "border-[#25313d] bg-[#0c1219] opacity-60"}`}>
            <span className="block text-[11px] font-medium text-[#a7bbcf]">{shortMonth(month.monthKey)} '{month.monthKey.slice(2, 4)}</span>
            <span className={`mt-3 block text-[18px] font-semibold leading-none tabular-nums ${recorded ? "text-white" : "text-[#677b90]"}`}>
              {recorded ? formatCurrency(month.total) : "—"}
            </span>
            <span className={`mt-2 block text-[10px] ${active ? "text-emerald-400" : "text-muted-foreground"}`}>
              {active ? "Selected" : recorded ? month.monthKey === currentMonth ? "This month" : "View sources" : "No record"}
            </span>
          </button>;
        })}
      </div>
    </section>
    <div className="grid gap-3 lg:grid-cols-[minmax(320px,5fr)_minmax(0,7fr)]">
      <section className={`${panel} min-h-[360px] p-5 sm:p-6`} aria-label="Selected month income">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-[#91a6ba]">{selected ? monthLabel(selected.monthKey) : "No recorded month"}</h2>
          <div className="flex shrink-0 gap-1">
            <button type="button" aria-label="Previous recorded month" disabled={selectedIndex <= 0}
              onClick={() => setSelectedMonth(recordedVisible[selectedIndex - 1].monthKey)}
              className="rounded-md border border-[#2b3848] p-1.5 text-muted-foreground hover:text-white disabled:opacity-30"><ChevronLeft className="h-4 w-4"/></button>
            <button type="button" aria-label="Next recorded month" disabled={selectedIndex < 0 || selectedIndex >= recordedVisible.length - 1}
              onClick={() => setSelectedMonth(recordedVisible[selectedIndex + 1].monthKey)}
              className="rounded-md border border-[#2b3848] p-1.5 text-muted-foreground hover:text-white disabled:opacity-30"><ChevronRight className="h-4 w-4"/></button>
          </div>
        </div>
        <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums sm:text-[40px]">{selected ? formatCurrency(selected.total) : "—"}</p>
        <p className="mt-1 text-xs text-muted-foreground">Recorded income</p>
        <div className="my-5 border-t border-[#263747]"/>
        {sources.length ? <>
          <h3 className="text-sm font-semibold">{sources.length} income {sources.length === 1 ? "source" : "sources"}</h3>
          {topSource?.[1] > 0 && <p className="mt-1 text-xs text-muted-foreground">{topSource[0]} contributes the most this month.</p>}
          <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-[#233341]" aria-hidden="true">
            {sources.map(([name, amount]) => <span key={name} style={{ width: `${selected.total > 0 ? Math.max(0, amount) / selected.total * 100 : 0}%`, backgroundColor: sourceColor(name) }}/>) }
          </div>
          <div className="mt-5 space-y-3">
            {sources.map(([name, amount]) => <div key={name} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: sourceColor(name) }}/><span className="truncate">{name}</span></span>
              <strong className="tabular-nums">{formatCurrency(amount)}</strong>
            </div>)}
          </div>
        </> : <p className="text-sm text-muted-foreground">No income recorded for this period yet.</p>}
      </section>
      <section className={`${panel} min-h-[360px] p-5 sm:p-6`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Income over time</h2>
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold tracking-wide text-emerald-300">YTD</span>
        </div>
        <p className="text-[11px] text-muted-foreground">{currentMonth.slice(0, 4)} YTD {formatCurrency(ytdTotal)} · Last 12 months {formatCurrency(trailingTotal)}</p>
        <div className="mt-5 h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 15, right: 12, bottom: 0, left: -6 }}
              onClick={event => { const month = event?.activePayload?.[0]?.payload; if (month?.value != null) setSelectedMonth(month.monthKey); }}>
              <defs><linearGradient id="incomeHistoryFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#30d991" stopOpacity={0.27}/><stop offset="100%" stopColor="#30d991" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#344454" opacity={0.35} strokeDasharray="3 4"/>
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#91a1b2" }} minTickGap={16}/>
              <YAxis axisLine={false} tickLine={false} width={52} tick={{ fontSize: 10, fill: "#91a1b2" }} domain={[0, chartMax * 1.15]} tickFormatter={value => `$${value.toFixed(0)}`}/>
              <Tooltip contentStyle={{ background: "#111b27", border: "1px solid #33465a", borderRadius: 10, fontSize: 12 }}
                labelFormatter={(_, items) => items?.[0]?.payload?.monthKey ? monthLabel(items[0].payload.monthKey) : ""}
                formatter={value => [formatCurrency(value), "Recorded income"]}/>
              <Area type="monotone" dataKey="value" stroke="#30e69b" strokeWidth={2.75} fill="url(#incomeHistoryFill)" connectNulls={false}
                dot={point => point?.payload?.value == null ? null : <circle cx={point.cx} cy={point.cy} r={3} fill="#30e69b"/>}
                activeDot={{ r: 5 }} isAnimationActive={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
    {(ytdMonths.some(month => month.stocks > 0) || selected?.stocks > 0 || legacy.undated.length > 0) && <div className="space-y-1 px-1 text-[10px] text-muted-foreground">
      {(ytdMonths.some(month => month.stocks > 0) || selected?.stocks > 0) && <p>Stock payouts use announced distributions and saved share counts; check your brokerage for actual cash received.</p>}
      {legacy.undated.length > 0 && <p className="text-amber-300">
        {formatCurrency(legacy.undated.reduce((sum, row) => sum + row.amount, 0))} in older project earnings has no transaction date and cannot be assigned to the 12-month total ({[...new Set(legacy.undated.map(row => row.name))].join(", ")}).
      </p>}
    </div>}
  </div>;
}
