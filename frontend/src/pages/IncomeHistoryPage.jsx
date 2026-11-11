import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { api } from "@/lib/apiClient";
import { useBackendMonthlyIncome } from "@/hooks/useBackendMonthlyIncome";
import { mergeBackendLoopscaleHistory } from "@/lib/mergeBackendLoopscaleHistory";
import { mergeManualIncome } from "@/lib/manualIncomeHistory";
import { STOCK_DIVIDEND_PAYOUTS_KEY } from "@/lib/stockDividendPayouts";
import { buildIncomeHistory, legacyProjectIncome, reconcileLuloIncome, shiftMonth } from "@/lib/incomeHistory";
import {
  buildProjectIncome, formatCurrency, getCurrentMonthKey, getTodayKey, getEffectiveProjectIncome,
  loadKryptexTracker, loadLoopscaleHistory, loadMonthlyBackfills, loadMonthlySnapshots,
  loadRollerCoinTracker, loadSaladTracker, loadUnetworkTracker, PROJECT_QUICK_CACHE_KEY,
  readObject,
} from "@/lib/yieldFarmingAccounting";

const panel = "min-w-0 rounded-2xl border border-[#242b33] bg-[#0d1014]";
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
  "GoMining Mining": "#fb923c",
  "GoMining Bounty": "#fbbf24",
  "GoMining Liquidity": "#f59e0b",
  "GoMining Locking": "#f97316",
  Nosana: "#e879f9",
  "Unity Network": "#a78bfa",
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
    manualIncome: {},
    luloBackfills: {},
  };
}

export default function IncomeHistoryPage() {
  const [history, setHistory] = useState(readHistory);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => subscribe(() => setHistory(current => ({
    ...readHistory(), manualIncome: current.manualIncome, luloBackfills: current.luloBackfills,
  }))), []);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.get("/api/yield-sources/earnings");
        if (active && result) setHistory(current => ({
          ...current, loopscale: mergeBackendLoopscaleHistory(current.loopscale, result.loopscaleHistory),
          manualIncome: result.manualIncomeHistory || current.manualIncome,
          luloBackfills: result.luloBackfills && typeof result.luloBackfills === "object"
            ? result.luloBackfills : current.luloBackfills,
        }));
      } catch { /* Retain saved history if the provider is unavailable. */ }
    };
    refresh();
    const timer = window.setInterval(refresh, 90000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const currentMonth = useMemo(getCurrentMonthKey, [clock]);
  const currentDay = useMemo(getTodayKey, [clock]);
  const trackers = useMemo(() => ({
    salad: history.salad, rollercoin: history.rollercoin,
    unetwork: history.unetwork, kryptex: history.kryptex,
  }), [history.salad, history.rollercoin, history.unetwork, history.kryptex]);
  const localMonths = useMemo(() => buildProjectIncome(
    history.luloProjects, history.loopscale, history.salad, history.backfills,
    history.rollercoin, history.unetwork, history.kryptex,
  ), [history]);
  const liveMonths = useBackendMonthlyIncome(trackers, localMonths);
  const projectMonths = useMemo(() => reconcileLuloIncome(
    getEffectiveProjectIncome(liveMonths, history.snapshots),
    history.backfills, history.luloBackfills, currentMonth, history.luloProjects, currentDay,
  ), [liveMonths, history.snapshots, history.backfills, history.luloBackfills, history.luloProjects, currentMonth, currentDay]);
  const legacy = useMemo(() => legacyProjectIncome(history.legacyProjects), [history.legacyProjects]);
  const manualMonths = history.manualIncome?.monthly;
  const months = useMemo(() => {
    const recorded = buildIncomeHistory(projectMonths, history.payouts, currentMonth, legacy);
    return mergeManualIncome(recorded, manualMonths || {}, currentMonth);
  }, [projectMonths, history.payouts, currentMonth, legacy, manualMonths]);
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
  const detailPanelHeight = Math.max(300, Math.min(520, 270 + sources.length * 42));
  const chartPanelHeight = Math.max(190, detailPanelHeight - 115);
  const chartData = ytdMonths.map(month => ({ ...month, label: shortMonth(month.monthKey), value: month.total }));
  const chartMax = Math.max(1, ...chartData.map(month => month.value || 0));
  const lastTwelveMonths = Array.from({length: 12}, (_, index) => {
    const monthKey = shiftMonth(currentMonth, index - 11);
    return monthMap.get(monthKey) || {monthKey, total: null};
  });
  return <div className="min-w-0 space-y-3 pb-7" data-testid="income-history-page">
    <header className="px-1">
      <h1 className="text-[22px] font-semibold tracking-tight">Income History</h1>
    </header>
    <section className={`${panel} p-3`} aria-label="Last 12 months of income">
      <div className="mb-2.5 flex items-center justify-between gap-3 px-0.5">
        <div>
          <h2 className="text-[14px] font-semibold">Choose a month</h2>
          <p className="mt-0.5 text-[9px] text-muted-foreground">Last 12 months</p>
        </div>
        <span className="text-[10px] text-muted-foreground">Select a month to view its income sources</span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {lastTwelveMonths.map(month => {
          const recorded = month.total != null;
          const active = selected?.monthKey === month.monthKey;
          const monthYear = month.monthKey.slice(0, 4) === currentMonth.slice(0, 4)
            ? shortMonth(month.monthKey)
            : `${shortMonth(month.monthKey)} '${month.monthKey.slice(2, 4)}`;

          return <button
            key={month.monthKey}
            type="button"
            disabled={!recorded}
            aria-pressed={recorded ? active : undefined}
            aria-label={`${monthLabel(month.monthKey)}: ${recorded ? formatCurrency(month.total) : "no recorded income"}`}
            onClick={() => setSelectedMonth(month.monthKey)}
            className={`group relative h-[58px] w-[96px] shrink-0 rounded-xl border px-2.5 py-2 text-left transition-all duration-150 ${active
              ? "w-[104px] border-emerald-400/80 bg-emerald-500/[0.10] shadow-[0_0_0_1px_rgba(52,211,153,0.08),0_0_18px_rgba(16,185,129,0.08)]"
              : recorded
                ? "border-[#303842] bg-[#13181e] hover:border-[#3b4650] hover:bg-[#13181e]"
                : "cursor-not-allowed border-[#202a33] bg-[#0a0e12] opacity-45"}`}
          >
            <span className={`block text-[10px] font-medium ${active ? "text-emerald-300" : "text-[#9fb0c1]"}`}>{monthYear}</span>
            <span className={`mt-1.5 block truncate text-[14px] font-semibold leading-none tabular-nums ${recorded ? "text-white" : "text-[#617487]"}`}>
              {recorded ? formatCurrency(month.total) : "—"}
            </span>
            {active && <span className="absolute inset-x-2 bottom-0 h-px rounded-full bg-emerald-400"/>}
          </button>;
        })}
      </div>
    </section>
    <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(320px,5fr)_minmax(0,7fr)]">
      <section className={`${panel} p-5 sm:p-6`} style={{ minHeight: detailPanelHeight }} aria-label="Selected month income">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-[#91a6ba]">{selected ? monthLabel(selected.monthKey) : "No recorded month"}</h2>
          <div className="flex shrink-0 gap-1">
            <button type="button" aria-label="Previous recorded month" disabled={selectedIndex <= 0}
              onClick={() => setSelectedMonth(recordedVisible[selectedIndex - 1].monthKey)}
              className="rounded-md border border-[#303842] p-1.5 text-muted-foreground hover:text-white disabled:opacity-30"><ChevronLeft className="h-4 w-4"/></button>
            <button type="button" aria-label="Next recorded month" disabled={selectedIndex < 0 || selectedIndex >= recordedVisible.length - 1}
              onClick={() => setSelectedMonth(recordedVisible[selectedIndex + 1].monthKey)}
              className="rounded-md border border-[#303842] p-1.5 text-muted-foreground hover:text-white disabled:opacity-30"><ChevronRight className="h-4 w-4"/></button>
          </div>
        </div>
        <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums sm:text-[40px]">{selected ? formatCurrency(selected.total) : "—"}</p>
        <p className="mt-1 text-xs text-muted-foreground">Recorded income</p>
        <div className="my-5 border-t border-[#242d35]"/>
        {sources.length ? <>
          <h3 className="text-sm font-semibold">{sources.length} income {sources.length === 1 ? "source" : "sources"}</h3>
          <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-[#2a333c]" aria-hidden="true">
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
      <section className={`${panel} p-5 sm:p-6`} style={{ minHeight: detailPanelHeight }}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Income over time</h2>
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold tracking-wide text-emerald-300">YTD</span>
        </div>
        <p className="text-[11px] text-muted-foreground">{currentMonth.slice(0, 4)} YTD {formatCurrency(ytdTotal)} · Last 12 months {formatCurrency(trailingTotal)}</p>
        <div className="mt-5 w-full" style={{ height: chartPanelHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 15, right: 12, bottom: 0, left: -6 }}
              onClick={event => { const month = event?.activePayload?.[0]?.payload; if (month?.value != null) setSelectedMonth(month.monthKey); }}>
              <defs><linearGradient id="incomeHistoryFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#30d991" stopOpacity={0.27}/><stop offset="100%" stopColor="#30d991" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#26313b" opacity={0.35} strokeDasharray="3 4"/>
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#91a1b2" }} minTickGap={16}/>
              <YAxis axisLine={false} tickLine={false} width={52} tick={{ fontSize: 10, fill: "#91a1b2" }} domain={[0, chartMax * 1.15]} tickFormatter={value => `$${value.toFixed(0)}`}/>
              <Tooltip contentStyle={{ background: "#13181e", border: "1px solid #303842", borderRadius: 10, fontSize: 12 }}
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
