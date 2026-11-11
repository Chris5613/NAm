import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Coins, CreditCard, TrendingUp, Plus, Pencil, Trash2, X } from "lucide-react";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { api } from "@/lib/apiClient";
import { useBackendMonthlyIncome } from "@/hooks/useBackendMonthlyIncome";
import { mergeBackendLoopscaleHistory } from "@/lib/mergeBackendLoopscaleHistory";
import { mergeManualIncome } from "@/lib/manualIncomeHistory";
import { buildIncomeHistory, legacyProjectIncome, reconcileLuloIncome } from "@/lib/incomeHistory";
import {
  formatCurrency, getCurrentMonthKey, getTodayKey, getEffectiveProjectIncome,
  buildProjectIncome, loadKryptexTracker, loadLoopscaleHistory, loadMonthlyBackfills,
  loadMonthlySnapshots, loadRollerCoinTracker, loadSaladTracker, loadUnetworkTracker,
  PROJECT_QUICK_CACHE_KEY, readObject,
} from "@/lib/yieldFarmingAccounting";
import { getStoredProjectCryptoPortfolio } from "@/lib/projectCryptoPortfolio";
import { STOCK_DIVIDEND_PAYOUTS_KEY } from "@/lib/stockDividendPayouts";
import { localStorage as appStorage } from "@/lib/localStorage";

const KEY = "monthly_business_changes_v1";
// USD daily closing prices for BTC-USD on Yahoo Finance (UTC daily candles).
// These price anchors do not establish how much BTC was held on each date.
const BTC_CLOSE_USD = Object.freeze({
  "2026-08-31": 78548.63,
  "2026-09-30": 83553.85,
  "2026-10-31": 77434.75,
});
// Track each existing investment/project individually; Bitcoin holdings have their own row.
function readIncomeSources() {
  let legacyProjects = [];
  try {
    const stored = JSON.parse(remoteStorage.getItem("networth_projects") || "[]");
    if (Array.isArray(stored)) legacyProjects = stored;
  } catch { /* Other income history remains available. */ }
  const quick = readObject(PROJECT_QUICK_CACHE_KEY);
  return {
    luloProjects: (quick.projects || []).filter(p => p?.yield_tracking === "lulo_lending"),
    loopscale: loadLoopscaleHistory(), salad: loadSaladTracker(),
    rollercoin: loadRollerCoinTracker(), unetwork: loadUnetworkTracker(), kryptex: loadKryptexTracker(),
    backfills: loadMonthlyBackfills(), snapshots: loadMonthlySnapshots(),
    legacyProjects, payouts: readObject(STOCK_DIVIDEND_PAYOUTS_KEY), manualIncome: {}, luloBackfills: {},
  };
}
function portfolioBalances() {
  const portfolio = getStoredProjectCryptoPortfolio();
  const balances = new Map();
  for (const project of portfolio?.projectEntries || []) {
    const name = String(project?.platform || "").trim();
    const value = Number(project?.balance);
    // Do not treat unavailable or zero-valued balances as historical proof.
    if (name && Number.isFinite(value) && value > 0) balances.set(name.toLowerCase(), value);
  }
  return balances;
}
// Match the Bitcoin holding displayed on Home rather than including project balances.
function readHomeBitcoin() {
  const home = appStorage.getCryptoCache()?.projectPortfolio?.bitcoin;
  const homeValue = home?.value ?? home?.balance;
  if (homeValue !== undefined && homeValue !== null && Number.isFinite(Number(homeValue))) {
    return Number(homeValue);
  }
  const portfolio = getStoredProjectCryptoPortfolio();
  const balance = portfolio?.bitcoin?.value;
  return balance !== undefined && balance !== null && Number.isFinite(Number(balance))
    ? Number(balance) : null;
}
function readHomeBitcoinAmount() {
  const home = appStorage.getCryptoCache()?.projectPortfolio?.bitcoin;
  const portfolio = getStoredProjectCryptoPortfolio()?.bitcoin;
  // Prefer the same aggregated Bitcoin holding displayed in Home / Crypto Breakdown.
  for (const entry of [home, portfolio]) {
    const quantity = Number(entry?.amount);
    if (Number.isFinite(quantity) && quantity > 0) return quantity;
    const wallets = Array.isArray(entry?.wallets) ? entry.wallets : [];
    const walletTotal = wallets.reduce((sum, wallet) => sum + (Number(wallet?.amount) || 0), 0);
    if (walletTotal > 0) return walletTotal;
  }
  return null;
}
function readPortfolioItems() {
  const portfolio = getStoredProjectCryptoPortfolio();
  const quick = readObject(PROJECT_QUICK_CACHE_KEY);
  const entries = Array.isArray(portfolio?.projectEntries) ? portfolio.projectEntries : [];
  const quickProjects = Array.isArray(quick?.projects) ? quick.projects : [];
  const names = [...entries.map(entry => entry.platform), ...quickProjects
    .filter(project => project?.inactive !== true && project?.is_inactive !== true)
    .map(project => project.name)];
  const seen = new Set();
  return [...names, "BTC"].map(name => String(name || "").trim())
    .filter(name => {
      if (!name) return false;
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
const formatMoney = value => formatCurrency(Number(value) || 0);
const signedMoney = value => (value > 0 ? "+" : value < 0 ? "−" : "") + formatMoney(Math.abs(value));
const round = n => Math.round((Number(n) || 0) * 100) / 100;
const parseAmount = value => {
  const n = Number(value);
  return value !== "" && value !== null && value !== undefined && Number.isFinite(n) ? n : null;
};
const prevMonth = month => {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 2, 15));
  return date.toISOString().slice(0, 7);
};
const nextMonth = month => {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 15)).toISOString().slice(0, 7);
};
const monthLabel = month => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
  .format(new Date(month + "-15T12:00:00Z"));
function readRecords() {
  try {
    const value = JSON.parse(remoteStorage.getItem(KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
const box = "rounded-2xl border border-[#263342] bg-[#0b1017]";
const input = "mt-1 w-full rounded-lg border border-[#3c5267] bg-[#111b25] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400";

export default function MonthlyChangesPage() {
  const [records, setRecords] = useState(readRecords);
  const [portfolioItems, setPortfolioItems] = useState(readPortfolioItems);
  const [liveBitcoin, setLiveBitcoin] = useState(readHomeBitcoin);
  const [bitcoinAmount, setBitcoinAmount] = useState(readHomeBitcoinAmount);
  const [bitcoinPrice, setBitcoinPrice] = useState(() => Number(getStoredProjectCryptoPortfolio()?.bitcoin?.price) || null);
  const [incomeSources, setIncomeSources] = useState(readIncomeSources);
  const [backendReady, setBackendReady] = useState(false);
  const [month, setMonth] = useState(getCurrentMonthKey);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ name: "", start: "", end: "" });
  const [error, setError] = useState("");
  const [expenseEditorOpen, setExpenseEditorOpen] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState("");
  const [expenseError, setExpenseError] = useState("");
  useEffect(() => subscribe(() => {
    setRecords(readRecords());
    setPortfolioItems(readPortfolioItems());
    setLiveBitcoin(readHomeBitcoin());
    setBitcoinAmount(readHomeBitcoinAmount());
    setBitcoinPrice(Number(getStoredProjectCryptoPortfolio()?.bitcoin?.price) || null);
    setIncomeSources(current => ({ ...readIncomeSources(), manualIncome: current.manualIncome, luloBackfills: current.luloBackfills }));
  }), []);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.get("/api/yield-sources/earnings");
        if (!active || !result) return;
        setIncomeSources(current => ({
          ...current,
          loopscale: mergeBackendLoopscaleHistory(current.loopscale, result.loopscaleHistory),
          manualIncome: result.manualIncomeHistory || current.manualIncome,
          luloBackfills: result.luloBackfills || current.luloBackfills,
        }));
        setBackendReady(true);
      } catch { /* Existing saved records remain editable offline. */ }
    };
    refresh();
    const interval = window.setInterval(refresh, 90000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  const trackers = useMemo(() => ({
    salad: incomeSources.salad, rollercoin: incomeSources.rollercoin,
    unetwork: incomeSources.unetwork, kryptex: incomeSources.kryptex,
  }), [incomeSources.salad, incomeSources.rollercoin, incomeSources.unetwork, incomeSources.kryptex]);
  const localMonths = useMemo(() => buildProjectIncome(
    incomeSources.luloProjects, incomeSources.loopscale, incomeSources.salad,
    incomeSources.backfills, incomeSources.rollercoin, incomeSources.unetwork, incomeSources.kryptex,
  ), [incomeSources]);
  const backendMonths = useBackendMonthlyIncome(trackers, localMonths);
  const monthEarnings = useMemo(() => {
    const effective = reconcileLuloIncome(
      getEffectiveProjectIncome(backendMonths, incomeSources.snapshots),
      incomeSources.backfills, incomeSources.luloBackfills, getCurrentMonthKey(),
      incomeSources.luloProjects, getTodayKey(),
    );
    const recorded = buildIncomeHistory(effective, incomeSources.payouts, getCurrentMonthKey(),
      legacyProjectIncome(incomeSources.legacyProjects));
    return mergeManualIncome(recorded, incomeSources.manualIncome?.monthly || {}, getCurrentMonthKey());
  }, [backendMonths, incomeSources]);

  useEffect(() => {
    const refresh = () => {
      setLiveBitcoin(readHomeBitcoin());
      setBitcoinAmount(readHomeBitcoinAmount());
      setBitcoinPrice(Number(getStoredProjectCryptoPortfolio()?.bitcoin?.price) || null);
    };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("project-crypto-updated", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("project-crypto-updated", refresh);
    };
  }, []);

  // Seal past months once, using the values already saved. Future live syncs and
  // changes in project lists cannot rewrite those months. Existing entries stay intact.
  useEffect(() => {
    if (!backendReady) return;
    const saved = readRecords();
    const currentKey = getCurrentMonthKey();
    let changed = false;
    const next = { ...saved };
    for (const [key, entry] of Object.entries(saved)) {
      if (key >= currentKey || !Array.isArray(entry?.items) || !entry.items.length) continue;
      if (entry.locked && entry.revenueSnapshot !== undefined) continue;
      const monthIncome = monthEarnings.find(row => row.monthKey === key);
      next[key] = {
        ...entry,
        locked: true,
        // Capture historical income once, not on every subsequent sync.
        revenueSnapshot: entry.revenueSnapshot !== undefined
          ? entry.revenueSnapshot : monthIncome?.total ?? null,
        // Lock the row set already saved for the completed month.
        items: entry.items.map(row => ({ ...row })),
      };
      changed = true;
    }
    if (changed) {
      remoteStorage.setItem(KEY, JSON.stringify(next));
      setRecords(next);
    }
  }, [backendReady, monthEarnings]);

  const selectableMonths = useMemo(() => {
    const current = getCurrentMonthKey();
    const earliestSaved = Object.keys(records).filter(key => /^\\d{4}-\\d{2}$/.test(key)).sort()[0];
    const earliest = earliestSaved && earliestSaved < "2026-09" ? earliestSaved : "2026-09";
    const list = [];
    for (let key = current, count = 0; key >= earliest && count < 240; key = prevMonth(key), count += 1) {
      list.push(key);
    }
    if (!list.includes(month)) list.push(month);
    return list.sort((a, b) => b.localeCompare(a));
  }, [records, month]);
  const record = records[month] || {};
  const previous = records[prevMonth(month)] || {};
  const items = useMemo(() => {
    const own = Array.isArray(record.items) ? record.items : [];
    const prior = Array.isArray(previous.items) ? previous.items : [];
    const names = record.locked ? [...new Set(own.map(r => r.name))] : [...new Set([...portfolioItems, ...prior.map(r => r.name), ...own.map(r => r.name)])];
    return names.filter(Boolean).map(name => {
      const current = own.find(row => row.name === name);
      const earlier = prior.find(row => row.name === name);
      const inferredStart = parseAmount(earlier?.end);
      const start = parseAmount(current?.start) ?? (record.locked ? null : inferredStart);
      // Current month shows the live BTC USD holding from Home; historical months stay saved.
      const nowMonth = month === getCurrentMonthKey();
      const kryptexLive = incomeSources.kryptex?.reachable && incomeSources.kryptex?.lastSyncedAt
        ? Number(incomeSources.kryptex.currentBalance) : null;
      const end = name.toLowerCase() === "btc" && nowMonth && liveBitcoin !== null
        ? liveBitcoin
        : name.toLowerCase() === "kryptex" && nowMonth && Number.isFinite(kryptexLive)
          ? kryptexLive : parseAmount(current?.end);
      return { name, start, end, estimated: Boolean(current?.estimated), change: start === null || end === null ? null : round(end - start) };
    });
  }, [portfolioItems, record.items, record.locked, previous.items, month, liveBitcoin, incomeSources.kryptex]);
  const lastNet = Array.isArray(previous.items)
    ? round(previous.items.reduce((sum, row) => sum + (parseAmount(row.end) || 0), 0))
    : null;
  const yearStart = Object.entries(records)
    .filter(([key]) => key.startsWith(month.slice(0, 4) + "-") && key <= month)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value)
    .find(value => Array.isArray(value.items) && value.items.some(row => parseAmount(row.start) !== null));
  const ytdStart = yearStart ? round(yearStart.items.reduce((n, row) => n + (parseAmount(row.start) || 0), 0)) : null;
  // Revenue is sourced from Income History's reconciled recorded monthly earnings.
  // Do not add this to balance-sheet net worth: project balances already include earnings.
  const revenue = record.locked ? parseAmount(record.revenueSnapshot) : parseAmount(monthEarnings.find(row => row.monthKey === month)?.total);
  const expenses = parseAmount(record.expenses) ?? 0;
  const profit = revenue === null ? null : round(revenue - expenses);
  const previousRevenue = previous.locked ? parseAmount(previous.revenueSnapshot) : parseAmount(monthEarnings.find(row => row.monthKey === prevMonth(month))?.total);
  const previousExpenses = parseAmount(previous.expenses) ?? 0;
  const previousProfit = previousRevenue === null ? null : round(previousRevenue - previousExpenses);
  const compare = (value, prior) => value !== null && prior !== null && prior !== 0
    ? (value - prior) / Math.abs(prior) * 100 : null;

  const save = next => {
    const updated = { ...records, [month]: next };
    remoteStorage.setItem(KEY, JSON.stringify(updated));
    setRecords(updated);
  };
  const openExpenseEditor = () => {
    setExpenseDraft(record.expenses == null ? "" : String(record.expenses));
    setExpenseError("");
    setExpenseEditorOpen(true);
  };
  const saveExpenses = event => {
    event.preventDefault();
    const value = expenseDraft.trim() === "" ? 0 : Number(expenseDraft);
    if (!Number.isFinite(value) || value < 0) {
      setExpenseError("Enter an expense amount of $0 or more.");
      return;
    }
    save({ ...record, expenses: String(round(value)) });
    setExpenseEditorOpen(false);
    setExpenseError("");
  };
  const showEdit = item => {
    setError("");
    setDraft(item ? {
      name: item.name,
      start: item.start === null ? "" : String(item.start),
      end: item.end === null ? "" : String(item.end),
    } : { name: "", start: "", end: "" });
    setEditing(item ? item.name : "new");
  };
  const saveItem = event => {
    event.preventDefault();
    const name = draft.name.trim();
    const start = parseAmount(draft.start), end = parseAmount(draft.end);
    if (!name || (draft.start !== "" && start === null) || (draft.end !== "" && end === null)) {
      setError("Enter a valid item name and dollar amounts."); return;
    }
    if (editing === "new" && items.some(item => item.name.toLowerCase() === name.toLowerCase())) {
      setError("This item already exists. Edit it instead."); return;
    }
    const existing = Array.isArray(record.items) ? record.items : [];
    const updated = existing.filter(item => item.name !== editing && item.name !== name);
    updated.push({ name, start: draft.start, end: draft.end });
    save({ ...record, items: updated, excluded: (record.excluded || []).filter(item => item !== name) });
    setEditing(null);
  };
  const deleteItem = () => {
    if (!editing || editing === "new") return;
    const existing = Array.isArray(record.items) ? record.items : [];
    const excluded = new Set([...(record.excluded || []), editing]);
    save({ ...record, items: existing.filter(item => item.name !== editing), excluded: [...excluded] });
    setEditing(null);
  };
  const visibleItems = items.filter(item => !(record.excluded || []).includes(item.name))
    .sort((a, b) => (b.end ?? b.start ?? -Infinity) - (a.end ?? a.start ?? -Infinity));
  const netStart = round(visibleItems.reduce((n, row) => n + (row.start || 0), 0));
  const netEnd = round(visibleItems.reduce((n, row) => n + (row.end || 0), 0));
  const netChange = round(netEnd - netStart);
  const netReady = visibleItems.some(row => row.end !== null) && visibleItems.every(row => row.end !== null || row.start === null);
  const moM = netStart !== 0 ? netChange / Math.abs(netStart) * 100 : null;
  const hasValues = visibleItems.some(row => row.start !== null || row.end !== null);
  const stat = (title, value, prior, Icon, tone) => {
    const diff = compare(value, prior);
    return <section className={`${box} relative min-w-0 overflow-hidden border-t-2 p-4 ${tone.border}`}>
      <div className="relative flex gap-3">
        <Icon className={`mt-1 h-6 w-6 shrink-0 ${tone.text}`}/>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#a6b7c8]">{title}</p>
          <strong className="mt-1 block text-2xl font-bold tabular-nums text-white">{value === null ? "—" : formatMoney(value)}</strong>
          <p className={`mt-2 text-xs ${diff === null ? "text-[#8da0b2]" : diff >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{diff === null ? "No prior month comparison" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}% vs. last month`}</p>
        </div>
        <svg viewBox="0 0 100 42" className={`mt-5 h-11 w-24 shrink-0 opacity-75 ${tone.text}`} aria-hidden="true">
          <polyline fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points="2,38 22,32 36,24 51,26 70,11 82,13 98,3"/>
        </svg>
      </div>
    </section>;
  };

  return <div className="min-w-0 space-y-3 pb-8 text-white" data-testid="monthly-changes-page">
    <div className="flex justify-end">
      <div className="inline-flex items-center gap-1 rounded-xl border border-[#344657] bg-[#101821] p-1.5 shadow-sm" aria-label="Monthly Changes month navigation">
        <button type="button" aria-label="Previous month" title="Previous month"
          disabled={month === selectableMonths[selectableMonths.length - 1]}
          onClick={() => setMonth(prev => prevMonth(prev))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[#c7d6e5] transition hover:bg-[#253548] hover:text-white disabled:cursor-not-allowed disabled:opacity-30">
          <ChevronLeft size={19}/>
        </button>
        <div className="flex items-center gap-2 px-1">
          <CalendarDays size={16} className="shrink-0 text-cyan-400"/>
          <label className="sr-only" htmlFor="monthly-changes-month">Select month</label>
          <select id="monthly-changes-month" value={month} onChange={event => setMonth(event.target.value)}
            className="min-w-[145px] cursor-pointer bg-[#101821] py-2 text-center text-sm font-semibold text-white outline-none [color-scheme:dark] sm:min-w-[165px]">
            {selectableMonths.map(key => <option key={key} value={key}>{monthLabel(key)}</option>)}
          </select>
        </div>
        <button type="button" aria-label="Next month" title="Next month"
          disabled={month >= getCurrentMonthKey()}
          onClick={() => setMonth(prev => nextMonth(prev))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[#c7d6e5] transition hover:bg-[#253548] hover:text-white disabled:cursor-not-allowed disabled:opacity-30">
          <ChevronRight size={19}/>
        </button>
      </div>
    </div>

    <section className={`${box} border-t-2 border-t-cyan-500 px-5 py-5 sm:px-7`}>
      <div className="grid gap-5 md:grid-cols-[1fr_1fr] md:items-center">
        <div>
          <h2 className="text-lg font-semibold">Net Worth</h2>
          <strong className="mt-2 block text-4xl font-bold tracking-tight tabular-nums text-emerald-400 sm:text-5xl">{netReady ? formatMoney(netEnd) : "—"}</strong>
          <div className="mt-3 inline-flex rounded-full bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300">
            {netReady && moM !== null ? `${signedMoney(netChange)} (${moM > 0 ? "+" : ""}${moM.toFixed(1)}% MoM)` : "Enter balances to track changes"}
          </div>
        </div>
        <dl className="space-y-0 border-[#263342] md:border-l md:pl-7">
          {[
            ["Previous Month", lastNet !== null ? formatMoney(lastNet) : hasValues ? formatMoney(netStart) : "—"],
            ["Monthly Change", netReady ? signedMoney(netChange) : "—"],
            ["YTD Change", netReady && ytdStart !== null ? signedMoney(round(netEnd - ytdStart)) : "—"],
          ].map(([name, value]) => <div key={name} className="flex justify-between gap-4 border-b border-[#263342] py-2.5 last:border-0">
            <dt className="text-sm text-[#a4b4c4]">{name}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>)}
        </dl>
      </div>
    </section>

    <div className="grid gap-3 md:grid-cols-3">
      {stat("Revenue (MTD)", revenue, previousRevenue, Coins, {border:"border-t-sky-500",text:"text-sky-400"})}
      <div className="relative min-w-0">
        {stat("Expenses (MTD)", expenses, previousExpenses, CreditCard, {border:"border-t-purple-500",text:"text-purple-400"})}
        <button type="button" onClick={openExpenseEditor} aria-label="Add or edit monthly expenses"
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg border border-purple-500/35 bg-purple-500/10 px-2 py-1 text-[11px] font-semibold text-purple-300 hover:bg-purple-500/20">
          <Plus size={13}/> {record.expenses == null ? "Add" : "Edit"}
        </button>
      </div>
      {stat("Profit (MTD)", profit, previousProfit, TrendingUp, {border:"border-t-teal-400",text:"text-teal-400"})}
    </div>

    <section className={`${box} overflow-hidden px-4 pb-4 pt-4 sm:px-6`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold uppercase tracking-wide"><CalendarDays className="text-cyan-400"/> {monthLabel(month)} Update</h2>
        <button type="button" onClick={() => showEdit(null)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300"><Plus size={14}/> Add item</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[580px] border-collapse text-sm">
          <thead><tr className="border-b border-[#314454] text-left text-[11px] uppercase tracking-widest text-[#9bafc1]"><th className="pb-2">Item</th><th className="pb-2 text-right">Start</th><th className="pb-2 text-right">Change</th><th className="pb-2 text-right">End</th><th className="w-9"/></tr></thead>
          <tbody>
            {visibleItems.map(row => <tr key={row.name} className="group border-b border-[#1e2b38] odd:bg-white/[0.025]">
              <td className="py-2 pl-1 font-medium">{row.name}</td>
              <td className="py-2 text-right tabular-nums">{row.start === null ? "—" : formatMoney(row.start)}</td>
              <td className={`py-2 text-right font-semibold tabular-nums ${row.change === null ? "text-[#8495a7]" : row.change > 0 ? "text-emerald-400" : row.change < 0 ? "text-rose-400" : "text-[#8495a7]"}`}>{row.change === null ? "—" : signedMoney(row.change)}</td>
              <td className="py-2 text-right font-semibold tabular-nums">{row.end === null ? "—" : formatMoney(row.end)}</td>
              <td className="py-2 text-right"><button type="button" aria-label={`Edit ${row.name}`} onClick={() => showEdit(row)} className="rounded p-1.5 text-[#8fa4b6] hover:text-white"><Pencil size={14}/></button></td>
            </tr>)}
            <tr className="border-t-2 border-cyan-500 text-base font-bold">
              <td className="py-3 uppercase tracking-[0.15em] text-cyan-400">Net Worth</td>
              <td className="py-3 text-right tabular-nums">{hasValues ? formatMoney(netStart) : "—"}</td>
              <td className={`py-3 text-right tabular-nums ${netChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{netReady ? signedMoney(netChange) : "—"}</td>
              <td className="py-3 text-right tabular-nums text-emerald-400">{netReady ? formatMoney(netEnd) : "—"}</td>
              <td/>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    {expenseEditorOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onMouseDown={event => { if (event.target === event.currentTarget) setExpenseEditorOpen(false); }}>
      <form role="dialog" aria-modal="true" aria-label="Monthly expenses" onSubmit={saveExpenses}
        className={`${box} w-full max-w-md space-y-4 p-6 shadow-2xl`}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Expenses — {monthLabel(month)}</h2>
          <button type="button" onClick={() => setExpenseEditorOpen(false)} aria-label="Close"><X size={20}/></button>
        </div>
        <label className="block text-sm">Total expenses ($)
          <input autoFocus type="number" required min="0" step="0.01" value={expenseDraft}
            onChange={event => setExpenseDraft(event.target.value)}
            placeholder="0.00" className={input}/>
        </label>
        <p className="text-xs text-[#93a5b5]">Saved separately for each month. Profit is calculated as recorded revenue minus these expenses.</p>
        {expenseError && <p role="alert" className="text-sm text-rose-400">{expenseError}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setExpenseEditorOpen(false)}
            className="rounded-lg border border-[#3c5267] px-4 py-2">Cancel</button>
          <button type="submit" className="flex-1 rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-[#061810]">Save expenses</button>
        </div>
      </form>
    </div>}

    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(null); }}>
      <form onSubmit={saveItem} role="dialog" aria-modal="true" aria-label={editing === "new" ? "Add financial item" : "Edit financial item"} className={`${box} w-full max-w-md space-y-4 p-6 shadow-2xl`}>
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{editing === "new" ? "Add item" : "Edit item"}</h2><button type="button" aria-label="Close" onClick={() => setEditing(null)}><X size={20}/></button></div>
        <label className="block text-sm">Item name<input required value={draft.name} onChange={event => setDraft(old => ({...old, name:event.target.value}))} className={input} placeholder="e.g. Cash"/></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Start value ($)<input type="number" step="0.01" value={draft.start} onChange={event => setDraft(old => ({...old,start:event.target.value}))} className={input}/></label>
          <label className="block text-sm">End value ($)<input type="number" step="0.01" value={draft.end} onChange={event => setDraft(old => ({...old,end:event.target.value}))} className={input}/></label>
        </div>
        <p className="text-xs text-[#93a5b5]">Use negative values for debt, such as loans. Change is calculated automatically.</p>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <div className="flex gap-2">
          {editing !== "new" && <button type="button" onClick={deleteItem} className="rounded-lg border border-rose-500/30 px-3 py-2 text-rose-400" title="Remove this item"><Trash2 size={17}/></button>}
          <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-[#3c5267] px-3 py-2">Cancel</button>
          <button type="submit" className="flex-1 rounded-lg bg-emerald-400 px-3 py-2 font-semibold text-[#061810]">Save item</button>
        </div>
      </form>
    </div>}
  </div>;
}
