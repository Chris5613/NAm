import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Coins, CreditCard, TrendingUp, Plus, Pencil, Trash2, X } from "lucide-react";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { formatCurrency, getCurrentMonthKey } from "@/lib/yieldFarmingAccounting";

const KEY = "monthly_business_changes_v1";
const DEFAULT_ITEMS = ["Inventory", "Cash", "Stocks / Investments", "Truck / Trailer", "Real Estate Value", "Real Estate Loan", "Forklift"];
const formatMoney = value => formatCurrency(Number(value) || 0);
const signedMoney = value => (value > 0 ? "+" : value < 0 ? "−" : "") + formatMoney(Math.abs(value));
const round = n => Math.round((Number(n) || 0) * 100) / 100;
const parseAmount = value => {
  const n = Number(value);
  return value !== "" && Number.isFinite(n) ? n : null;
};
const prevMonth = month => {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 2, 15));
  return date.toISOString().slice(0, 7);
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
  const [month, setMonth] = useState(getCurrentMonthKey);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ name: "", start: "", end: "" });
  const [error, setError] = useState("");
  useEffect(() => subscribe(() => setRecords(readRecords())), []);

  const record = records[month] || {};
  const previous = records[prevMonth(month)] || {};
  const items = useMemo(() => {
    const own = Array.isArray(record.items) ? record.items : [];
    const prior = Array.isArray(previous.items) ? previous.items : [];
    const names = [...new Set([...DEFAULT_ITEMS, ...prior.map(r => r.name), ...own.map(r => r.name)])];
    return names.filter(Boolean).map(name => {
      const current = own.find(row => row.name === name);
      const earlier = prior.find(row => row.name === name);
      const inferredStart = parseAmount(earlier?.end);
      const start = parseAmount(current?.start) ?? inferredStart;
      const end = parseAmount(current?.end);
      return { name, start, end, change: start === null || end === null ? null : round(end - start) };
    });
  }, [record.items, previous.items]);
  const lastNet = Array.isArray(previous.items)
    ? round(previous.items.reduce((sum, row) => sum + (parseAmount(row.end) || 0), 0))
    : null;
  const yearStart = Object.entries(records)
    .filter(([key]) => key.startsWith(month.slice(0, 4) + "-") && key <= month)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value)
    .find(value => Array.isArray(value.items) && value.items.some(row => parseAmount(row.start) !== null));
  const ytdStart = yearStart ? round(yearStart.items.reduce((n, row) => n + (parseAmount(row.start) || 0), 0)) : null;
  const revenue = parseAmount(record.revenue);
  const expenses = parseAmount(record.expenses);
  const profit = revenue === null || expenses === null ? null : round(revenue - expenses);
  const previousRevenue = parseAmount(previous.revenue);
  const previousExpenses = parseAmount(previous.expenses);
  const previousProfit = previousRevenue !== null && previousExpenses !== null ? round(previousRevenue - previousExpenses) : null;
  const compare = (value, prior) => value !== null && prior !== null && prior !== 0
    ? (value - prior) / Math.abs(prior) * 100 : null;

  const save = next => {
    const updated = { ...records, [month]: next };
    remoteStorage.setItem(KEY, JSON.stringify(updated));
    setRecords(updated);
  };
  const setMetric = (key, value) => save({ ...record, [key]: value });
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
  const visibleItems = items.filter(item => !(record.excluded || []).includes(item.name));
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
      <label className="inline-flex items-center gap-2 rounded-xl border border-[#344657] bg-[#101821] px-3 py-2 text-sm">
        <CalendarDays size={16} className="text-cyan-400"/>
        <span className="sr-only">Select month</span>
        <input type="month" value={month} max={getCurrentMonthKey()} onChange={event => event.target.value && setMonth(event.target.value)}
          className="bg-transparent text-white outline-none [color-scheme:dark]"/>
      </label>
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
      {stat("Expenses (MTD)", expenses, previousExpenses, CreditCard, {border:"border-t-purple-500",text:"text-purple-400"})}
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
      <div className="mt-4 grid gap-3 border-t border-[#263342] pt-4 sm:grid-cols-2">
        <label className="text-sm text-[#bdccd9]">Monthly revenue ($)
          <input type="number" step="0.01" value={record.revenue ?? ""} placeholder="Enter revenue" onChange={event => setMetric("revenue", event.target.value)} className={input}/>
        </label>
        <label className="text-sm text-[#bdccd9]">Monthly expenses ($)
          <input type="number" step="0.01" value={record.expenses ?? ""} placeholder="Enter expenses" onChange={event => setMetric("expenses", event.target.value)} className={input}/>
        </label>
      </div>
      <p className="mt-3 text-xs text-[#8396a7]">Amounts are saved for the selected month. The next month can inherit previous ending balances. Negative amounts represent liabilities.</p>
    </section>

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
