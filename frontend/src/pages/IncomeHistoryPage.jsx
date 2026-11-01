import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
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
  const [range, setRange] = useState(12);
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
  const oldest = months[0]?.monthKey;
  const firstMonth = range === "all" ? (oldest || currentMonth) : shiftMonth(currentMonth, 1 - range);
  const visibleMonths = [];
  for (let key = firstMonth; key <= currentMonth; key = shiftMonth(key, 1)) {
    visibleMonths.push(monthMap.get(key) || { monthKey: key, total: null, sources: {}, stocks: 0 });
  }
  const selected = monthMap.get(selectedMonth) && selectedMonth >= firstMonth
    ? monthMap.get(selectedMonth) : monthMap.get(currentMonth) || [...visibleMonths].reverse().find(month => month.total != null);
  const current = monthMap.get(currentMonth);
  const prior = monthMap.get(shiftMonth(currentMonth, -1));
  const trailingTotal = months.filter(month => month.monthKey >= shiftMonth(currentMonth, -11))
    .reduce((sum, month) => sum + month.total, 0);
  const sources = Object.entries(selected?.sources || {}).sort((a, b) => b[1] - a[1]);
  const topSource = Object.entries(current?.sources || {}).sort((a, b) => b[1] - a[1])[0];
  const chartData = visibleMonths.map(month => ({ ...month, label: shortMonth(month.monthKey), value: month.total }));
  const chartMax = Math.max(1, ...chartData.map(month => month.value || 0));
  const visiblePeak = Math.max(0.01, ...visibleMonths.map(month => month.total || 0));
  const compared = current && prior && prior.total > 0 ? (current.total / prior.total - 1) * 100 : null;

  return <div className="min-w-0 space-y-3 pb-7" data-testid="income-history-page">
    <header className="flex flex-wrap items-start justify-between gap-3 px-1">
      <div><h1 className="text-[22px] font-semibold tracking-tight">Income History</h1>
        <p className="mt-1 text-xs text-muted-foreground">Monthly earnings and payouts from your recorded sources</p></div>
      <div className="flex items-center rounded-lg border border-[#304051] bg-[#101925] p-0.5" role="group" aria-label="History range">
        {[[3, "3M"], [6, "6M"], [12, "1Y"], ["all", "All"]].map(([value, label]) => (
          <button key={value} type="button" aria-pressed={range === value}
            onClick={() => { setRange(value); setSelectedMonth(null); }}
            className={`min-w-10 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${range === value ? "bg-[#293747] text-white" : "text-muted-foreground hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>
    </header>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "This month", value: current ? formatCurrency(current.total) : "—", detail: compared == null ? "No comparable prior month" : `${compared >= 0 ? "+" : ""}${compared.toFixed(1)}% vs last month` },
        { label: "Last month", value: prior ? formatCurrency(prior.total) : "—", detail: monthLabel(shiftMonth(currentMonth, -1)) },
        { label: "12-month total", value: months.length ? formatCurrency(trailingTotal) : "—", detail: "Recorded income, including dated past projects" },
        { label: "Top source this month", value: topSource?.[0] || "—", detail: topSource ? formatCurrency(topSource[1]) : "No source recorded yet" },
      ].map(card => <section key={card.label} className={`${panel} min-h-[104px] p-4`}>
        <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#829bb5]">{card.label}</h2>
        <p className="mt-3 truncate text-[24px] font-semibold tabular-nums" title={card.value}>{card.value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{card.detail}</p>
      </section>)}
    </div>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
      <section className={`${panel} p-4`}>
        <h2 className="text-base font-semibold">Monthly income</h2>
        <p className="text-[11px] text-muted-foreground">Select a recorded month for its sources</p>
        <div className="mt-4 h-[285px] w-full">
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
      <section className={`${panel} p-4`}>
        <h2 className="text-base font-semibold">{selected ? `${monthLabel(selected.monthKey)} by source` : "Income by source"}</h2>
        <p className="text-[11px] text-muted-foreground">Recorded project earnings and stock payouts</p>
        {sources.length ? <div className="mt-5 space-y-5">{sources.map(([name, amount]) => <div key={name}>
          <div className="flex justify-between gap-3 text-xs"><span className="truncate">{name}</span><strong className="tabular-nums">{formatCurrency(amount)}</strong></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#233341]"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(1, Math.min(100, amount / Math.max(selected.total, 0.01) * 100))}%` }}/></div>
        </div>)}<div className="flex justify-between border-t border-white/10 pt-3 text-sm font-semibold"><span>Total</span><span className="tabular-nums text-emerald-400">{formatCurrency(selected.total)}</span></div></div>
          : <p className="mt-8 text-sm text-muted-foreground">No income recorded for this period yet.</p>}
      </section>
    </div>
    <section className={`${panel} p-4`}>
      <h2 className="text-base font-semibold">Month by month</h2>
      <p className="mt-1 text-[11px] text-muted-foreground">Select a month to see its sources above</p>
      {visibleMonths.some(month => month.total != null) ? <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {[...visibleMonths].reverse().filter(month => month.total != null).map(month => {
          const top = Object.entries(month.sources).sort((a, b) => b[1] - a[1])[0];
          const active = selected?.monthKey === month.monthKey;
          return <button key={month.monthKey} type="button" aria-pressed={active} onClick={() => setSelectedMonth(month.monthKey)}
            className={`min-w-0 rounded-xl border p-4 text-left transition-colors ${active ? "border-emerald-500/60 bg-emerald-500/[0.07]" : "border-[#2b3848] bg-[#0e141c] hover:border-[#446174] hover:bg-[#131e29]"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">{monthLabel(month.monthKey)}</span>
              <span className="flex shrink-0 items-center gap-1 text-[10px] text-[#8aa4c3]">{month.monthKey === currentMonth ? "In progress" : "View sources"}<ChevronRight className="h-3.5 w-3.5"/></span>
            </div>
            <div className="mt-3 text-[25px] font-semibold leading-none tabular-nums text-emerald-400">{formatCurrency(month.total)}</div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#263545]"><div className="h-full rounded-full bg-emerald-400" style={{width:`${Math.max(1, Math.min(100, month.total / visiblePeak * 100))}%`}}/></div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-[11px]">
              <span className="min-w-0 truncate text-muted-foreground">Top source <span className="font-medium text-white">{top?.[0] || "—"}</span></span>
              {month.stocks > 0 && <span className="shrink-0 text-[#a8c2d4]">Stocks {formatCurrency(month.stocks)}</span>}
            </div>
          </button>;
        })}
      </div> : <p className="mt-4 text-sm text-muted-foreground">No monthly income has been recorded yet.</p>}
      {visibleMonths.some(month => month.stocks > 0) && <p className="mt-4 text-[10px] text-muted-foreground">Stock payouts use announced distributions and saved share counts; check your brokerage for actual cash received.</p>}
      {legacy.undated.length > 0 && <p className="mt-1 text-[10px] text-amber-300">
        {formatCurrency(legacy.undated.reduce((sum, row) => sum + row.amount, 0))} in older project earnings has no transaction date and cannot be assigned to the 12-month total ({[...new Set(legacy.undated.map(row => row.name))].join(", ")}).
      </p>}
    </section>
  </div>;
}
