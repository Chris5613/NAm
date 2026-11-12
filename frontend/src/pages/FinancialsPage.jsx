import { Fragment, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Coins, CreditCard, FileSpreadsheet, LayoutDashboard, Plus, Send, Sparkles, Trash2, TrendingUp, Wallet, X } from "lucide-react";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { getStoredProjectCryptoPortfolio } from "@/lib/projectCryptoPortfolio";
import { localStorage as appStorage } from "@/lib/localStorage";
import { formatCurrency, getCurrentMonthKey, loadKryptexTracker, loadRollerCoinTracker, getRollerCoinTrackerStats, loadSaladTracker, loadUnetworkTracker, readObject, PROJECT_QUICK_CACHE_KEY } from "@/lib/yieldFarmingAccounting";

const RECORDS_KEY = "monthly_business_changes_v1";
const JOURNAL_KEY = "financials_journal_v1";
const card = "rounded-2xl border border-[#263342] bg-[#0b1017]";
const field = "w-full rounded-lg border border-[#3c5267] bg-[#101923] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400";
const categories = [
  { id: "digital", name: "Digital Assets & Platform Balances" },
  { id: "defi", name: "DeFi & Investments" },
  { id: "cash", name: "Cash & Receivables" },
  { id: "equipment", name: "Equipment & Fixed Assets" },
  { id: "liabilities", name: "Liabilities" },
];
const accounts = [
  { id: "cash", name: "Cash / Bank", type: "asset" },
  { id: "crypto", name: "Cryptocurrency", type: "asset" },
  { id: "platform", name: "Platform Receivables", type: "asset" },
  { id: "defi", name: "DeFi / Investments", type: "asset" },
  { id: "equipment", name: "Mining Equipment", type: "asset" },
  { id: "accDep", name: "Accumulated Depreciation", type: "contra" },
  { id: "payable", name: "Accounts Payable", type: "liability" },
  { id: "equity", name: "Owner's Equity", type: "equity" },
  { id: "revenue", name: "Mining / Yield Revenue", type: "revenue" },
  { id: "electric", name: "Electricity Expense", type: "expense" },
  { id: "expense", name: "Operating Expense", type: "expense" },
  { id: "depreciation", name: "Depreciation Expense", type: "expense" },
];
const cashLike = name => /lulo|cash|bank|checking|savings|receivable|pending payout/i.test(name);
function categoryFor(name) {
  if (/debt|loan|payable|credit card|liabilit/i.test(name)) return "liabilities";
  if (cashLike(name)) return "cash";
  if (/loopscale|defi|lending|invest|stock/i.test(name)) return "defi";
  if (/rtx|gpu|computer|equipment|hardware|pc/i.test(name)) return "equipment";
  return "digital";
}
function readJson(key, fallback) {
  try { const value = JSON.parse(remoteStorage.getItem(key) || "null"); return value ?? fallback; }
  catch { return fallback; }
}
const rounded = value => Math.round((Number(value) || 0) * 100) / 100;
const amount = value => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const money = value => value === null ? "—" : formatCurrency(value);
const signed = value => value === null ? "—" : (value > 0 ? "+" : value < 0 ? "−" : "") + money(Math.abs(value));
function shift(month, delta) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 15)).toISOString().slice(0, 7);
}
function monthTitle(month) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(month + "-15T12:00:00Z"));
}
function equipmentValue(month, cost = 500) {
  const [year, number] = month.split("-").map(Number);
  const elapsed = Math.max(0, (year - 2026) * 12 + number - 11);
  return rounded(Math.max(0, cost * (1 - Math.min(60, elapsed) / 60)));
}
function liveBalances() {
  const values = {};
  const portfolio = getStoredProjectCryptoPortfolio();
  for (const item of portfolio?.projectEntries || []) {
    if (item?.platform && Number.isFinite(Number(item.balance))) values[item.platform.toLowerCase()] = Number(item.balance);
  }
  const cache = readObject(PROJECT_QUICK_CACHE_KEY);
  const lulo = (cache.projects || []).filter(item => item?.yield_tracking === "lulo_lending");
  if (lulo.length) values.lulo = lulo.reduce((sum, item) => sum + (Number(item.lulo_total_balance_usd) || 0), 0);
  if (Number.isFinite(Number(cache.loopscaleSnapshot?.positionValueUsd))) values.loopscale = Number(cache.loopscaleSnapshot.positionValueUsd);
  const salad = loadSaladTracker();
  if (salad.initialized || salad.lastSyncedAt) values.salad = Number(salad.currentBalance) || 0;
  const unetwork = loadUnetworkTracker();
  if (unetwork.initialized || unetwork.lastSyncedAt) values.unetwork = Number(unetwork.currentBalance) || 0;
  const kryptex = loadKryptexTracker();
  if (kryptex.initialized && kryptex.lastSyncedAt) values.kryptex = Number(kryptex.currentBalance) || 0;
  const roller = loadRollerCoinTracker();
  if (roller.lastSyncedAt) {
    const value = Number(getRollerCoinTrackerStats(roller).currentBalanceUsd);
    if (value > 0 || (roller.currentTrxBalance === 0 && roller.lastTrxPrice > 0)) values.rollercoin = value;
  }
  const home = appStorage.getCryptoCache()?.projectPortfolio?.bitcoin;
  const btc = Number(home?.value ?? home?.balance ?? portfolio?.bitcoin?.value);
  if (Number.isFinite(btc)) values.btc = btc;
  return values;
}
function makeRows(month, records, live) {
  const current = records[month] || {};
  const previous = records[shift(month, -1)] || {};
  const saved = Array.isArray(current.items) ? current.items : [];
  const prior = Array.isArray(previous.items) ? previous.items : [];
  const names = current.locked ? saved.map(row => row.name) : [...new Set([
    ...saved.map(row => row.name), ...prior.map(row => row.name),
    ...Object.keys(live).map(name => name === "btc" ? "BTC" : name),
  ])];
  const rows = names.filter(Boolean).filter(name => !(current.excluded || []).includes(name)).map(name => {
    const row = saved.find(item => String(item.name).toLowerCase() === String(name).toLowerCase()) || {};
    const old = prior.find(item => String(item.name).toLowerCase() === String(name).toLowerCase()) || {};
    const start = amount(row.start) ?? (current.locked ? null : amount(old.end));
    const observed = live[String(name).toLowerCase()];
    const end = month === getCurrentMonthKey() && Number.isFinite(observed) ? observed : amount(row.end);
    return { id: "project:" + name.toLowerCase(), name, category: categoryFor(name),
      start, end };
  });
  const extra = Array.isArray(current.balanceSheetItems) ? current.balanceSheetItems : [];
  const priorExtra = Array.isArray(previous.balanceSheetItems) ? previous.balanceSheetItems : [];
  const allExtra = current.locked ? extra : [
    ...priorExtra.filter(row => !extra.some(other => other.id === row.id) && !(current.balanceExcluded || []).includes(row.id)),
    ...extra,
  ];
  if (!current.locked && month >= "2026-11") {
    for (const [id, name] of [["hardware:rtx2080super-pc", "RTX 2080 Super PC"], ["hardware:rtx5070", "RTX 5070 GPU"]]) {
      if (!allExtra.some(row => row.id === id || new RegExp(id.includes("2080") ? "2080" : "5070", "i").test(row.name || "")) &&
          !(current.balanceExcluded || []).includes(id)) {
        allExtra.push({ id, name, category: "equipment", historicalCost: 500 });
      }
    }
  }
  for (const row of allExtra) {
    const isFixed = /^(hardware:rtx2080super-pc|hardware:rtx5070)$/.test(row.id) &&
      !row.disabledAutomaticDepreciation && month >= "2026-11";
    const older = priorExtra.find(item => item.id === row.id);
    const start = isFixed ? equipmentValue(month, 500) :
      amount(row.start) ?? (current.locked ? null : amount(older?.end));
    const end = isFixed ? equipmentValue(shift(month, 1), 500) :
      amount(row.end) ?? (current.locked ? null : start);
    rows.push({ id: row.id, name: row.name, category: row.category || categoryFor(row.name), start, end });
  }
  return rows;
}
const emptyDraft = () => ({ date: new Date().toISOString().slice(0, 10), description: "", debitAccount: "cash", creditAccount: "revenue", amount: "" });
const line = (account, debit, credit) => ({ account, debit: rounded(debit), credit: rounded(credit) });

// A conservative local interpreter: only recognize supported, explicit
// transaction patterns. Unclear text never posts directly to the ledger.
function parseTransaction(text, month) {
  const input = String(text || "").trim();
  if (!input) return { error: "Describe a transaction first." };
  const amounts = [...input.matchAll(/(?:\\$\\s*|\\bUSD\\s*)([\\d,]+(?:\\.\\d{1,2})?)/gi)];
  if (amounts.length !== 1) {
    return { error: "Include exactly one amount with $ or USD, for example: paid $500 for electricity this month." };
  }
  const value = Number(amounts[0][1].replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0 || rounded(value) <= 0)
    return { error: "Enter a valid amount greater than $0." };
  const phrase = input.toLowerCase();
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const today = new Date();
  const date = month === getCurrentMonthKey()
    ? today.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" })
    : month + "-" + String(lastDay).padStart(2, "0");
  let debitAccount = "", creditAccount = "";
  let explanation = "";
  const expense = /electric|power (?:bill|cost|expense)|utility|utilities|energy bill|electricity bill/.test(phrase);
  const paid = /paid|spent|purchased|bought|payment|purchase/.test(phrase);
  const unpaid = /unpaid|owe|owed|on credit|not yet paid|bill due/.test(phrase);
  const fromCash = /cash|bank|checking|debit card|from (?:my )?account/.test(phrase);
  const fromCrypto = /bitcoin|\\bbtc\\b|crypto wallet/.test(phrase);
  if (expense && (paid || unpaid)) {
    debitAccount = "electric";
    creditAccount = unpaid ? "payable" : fromCrypto ? "crypto" : "cash";
    explanation = unpaid ? "Record an electricity bill owed." : "Record a paid electricity expense.";
  } else if (/gpu|graphics card|computer|\\bpc\\b|mining equipment|hardware/.test(phrase) && paid) {
    debitAccount = "equipment";
    creditAccount = unpaid ? "payable" : fromCrypto ? "crypto" : "cash";
    explanation = "Record a capital equipment purchase, not an operating expense.";
  } else if (/rent|internet|subscription|repair|fee|operating expense|supplies/.test(phrase) && paid) {
    debitAccount = "expense";
    creditAccount = unpaid ? "payable" : fromCrypto ? "crypto" : "cash";
    explanation = "Record an operating expense.";
  } else if (/received|earned|income|revenue|payout/.test(phrase) && /mining|kryptex|rollercoin|salad|unetwork|yield|lulo|loopscale|payment|payout/.test(phrase)) {
    debitAccount = fromCash ? "cash" : fromCrypto ? "crypto" : "platform";
    creditAccount = "revenue";
    explanation = "Record earned revenue; ensure the provider has not already been recorded.";
  } else if (/contribut|deposited|put.*into (?:the )?business/.test(phrase) && /owner|personal|business/.test(phrase)) {
    debitAccount = "cash"; creditAccount = "equity";
    explanation = "Record an owner contribution, not business income.";
  }
  if (!debitAccount || !creditAccount) {
    return { error: "I couldn't classify this safely. Use Add entry for transfers, withdrawals, debt payments, or anything unusual." };
  }
  return {
    date, description: input, amount: rounded(value), debitAccount, creditAccount, explanation,
  };
}

export default function FinancialsPage() {
  const [tab, setTab] = useState("overview");
  const [month, setMonth] = useState(getCurrentMonthKey);
  const [records, setRecords] = useState(() => readJson(RECORDS_KEY, {}));
  const [journal, setJournal] = useState(() => readJson(JOURNAL_KEY, []));
  const [live, setLive] = useState(liveBalances);
  const [modal, setModal] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState("");
  const [quickText, setQuickText] = useState("");
  const [quickEntry, setQuickEntry] = useState(null);
  const [quickError, setQuickError] = useState("");
  const [quickStatus, setQuickStatus] = useState("");
  useEffect(() => subscribe(() => {
    setRecords(readJson(RECORDS_KEY, {}));
    setJournal(readJson(JOURNAL_KEY, []));
    setLive(liveBalances());
  }), []);
  useEffect(() => {
    const refresh = () => setLive(liveBalances());
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("project-crypto-updated", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("project-crypto-updated", refresh); };
  }, []);
  const rows = useMemo(() => makeRows(month, records, live), [month, records, live]);
  const sections = categories.map(category => ({ ...category, rows: rows.filter(row => row.category === category.id) }));
  const total = (field, type) => {
    const relevant = rows.filter(row => type === "assets" ? row.category !== "liabilities" : row.category === "liabilities");
    return relevant.some(row => row[field] === null) ? null : rounded(relevant.reduce((sum, row) => sum + row[field], 0));
  };
  const assetsStart = total("start", "assets");
  const assetsEnd = total("end", "assets");
  const debtStart = total("start", "debts");
  const debtEnd = total("end", "debts");
  const netStart = assetsStart === null || debtStart === null ? null : rounded(assetsStart - debtStart);
  const netEnd = assetsEnd === null || debtEnd === null ? null : rounded(assetsEnd - debtEnd);
  const netChange = netStart === null || netEnd === null ? null : rounded(netEnd - netStart);
  const recorded = records[month] || {};
  const revenue = amount(recorded.revenueSnapshot);
  const savedExpenses = amount(recorded.expenses);
  const elapsed = month >= "2026-11" ? Math.max(0, (Number(month.slice(0, 4)) - 2026) * 12 + Number(month.slice(5)) - 11) : -1;
  const fixedDep = elapsed >= 0 && elapsed < 60 ? rounded(equipmentValue(month, 1000) - equipmentValue(shift(month, 1), 1000)) : 0;
  const ledgerEntries = journal.filter(entry => String(entry.date).slice(0, 7) === month);
  const journalExpense = ledgerEntries.filter(entry => entry.debitAccount === "expense" || entry.debitAccount === "electric")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const journalRevenue = ledgerEntries.filter(entry => entry.creditAccount === "revenue")
    .reduce((sum, entry) => sum + entry.amount, 0);
  // Use posted expenses when no authoritative monthly expense total was saved.
  // If a total exists, keep it authoritative rather than adding possibly
  // overlapping journal entries a second time.
  const expenses = savedExpenses === null ? rounded(journalExpense) : savedExpenses;
  const pnlRevenue = revenue === null ? (journalRevenue || null) : revenue;
  // Monthly expense card may already include electricity and other manually entered costs.
  // Display ledger amounts separately instead of counting them twice.
  const pnlProfit = pnlRevenue === null ? null : rounded(pnlRevenue - expenses - fixedDep);
  const generatedEntries = fixedDep ? [{
    id: "auto-depreciation:" + month, date: month + "-28",
    description: "Monthly depreciation — RTX 2080 Super PC + RTX 5070 GPU",
    lines: [line("depreciation", fixedDep, 0), line("accDep", 0, fixedDep)], automatic: true,
  }] : [];
  const manualEntries = ledgerEntries.map(entry => ({
    ...entry, lines: [line(entry.debitAccount, entry.amount, 0), line(entry.creditAccount, 0, entry.amount)],
  }));
  const entries = [...manualEntries, ...generatedEntries].sort((a, b) => a.date.localeCompare(b.date));
  const debitTotal = rounded(entries.reduce((sum, entry) => sum + entry.lines.reduce((n, part) => n + part.debit, 0), 0));
  const creditTotal = rounded(entries.reduce((sum, entry) => sum + entry.lines.reduce((n, part) => n + part.credit, 0), 0));
  const trial = accounts.map(account => {
    const debit = rounded(entries.reduce((sum, entry) => sum + entry.lines.filter(line => line.account === account.id).reduce((n, line) => n + line.debit, 0), 0));
    const credit = rounded(entries.reduce((sum, entry) => sum + entry.lines.filter(line => line.account === account.id).reduce((n, line) => n + line.credit, 0), 0));
    return { ...account, debit: Math.max(0, rounded(debit - credit)), credit: Math.max(0, rounded(credit - debit)) };
  }).filter(account => account.debit || account.credit);
  const trialDebit = rounded(trial.reduce((sum, account) => sum + account.debit, 0));
  const trialCredit = rounded(trial.reduce((sum, account) => sum + account.credit, 0));
  const cashEvents = ledgerEntries.filter(entry => entry.debitAccount === "cash" || entry.creditAccount === "cash");
  const cashIn = rounded(cashEvents.filter(entry => entry.debitAccount === "cash").reduce((sum, entry) => sum + entry.amount, 0));
  const cashOut = rounded(cashEvents.filter(entry => entry.creditAccount === "cash").reduce((sum, entry) => sum + entry.amount, 0));
  const saveEntry = event => {
    event.preventDefault();
    const value = Number(draft.amount);
    if (!draft.description.trim() || !/^\\d{4}-\\d{2}-\\d{2}$/.test(draft.date) ||
      !Number.isFinite(value) || value <= 0 || draft.debitAccount === draft.creditAccount) {
      setError("Enter a valid date, description, positive amount, and two different accounts.");
      return;
    }
    const updated = [...journal, { id: "journal:" + Date.now() + ":" + Math.random().toString(36).slice(2, 7),
      date: draft.date, description: draft.description.trim(), amount: rounded(value),
      debitAccount: draft.debitAccount, creditAccount: draft.creditAccount }];
    remoteStorage.setItem(JOURNAL_KEY, JSON.stringify(updated));
    setJournal(updated);
    setMonth(draft.date.slice(0, 7));
    setDraft(emptyDraft());
    setModal(false);
  };
  const prepareQuickEntry = event => {
    event.preventDefault();
    setQuickStatus("");
    const result = parseTransaction(quickText, month);
    if (result.error) {
      setQuickEntry(null);
      setQuickError(result.error);
    } else {
      setQuickError("");
      setQuickEntry(result);
    }
  };
  const confirmQuickEntry = () => {
    if (!quickEntry) return;
    if (!quickEntry.description.trim() || !/^\\d{4}-\\d{2}-\\d{2}$/.test(quickEntry.date) ||
      !Number.isFinite(quickEntry.amount) || quickEntry.amount <= 0 ||
      quickEntry.debitAccount === quickEntry.creditAccount) {
      setQuickError("Check the date, amount, and accounts before posting.");
      return;
    }
    const updated = [...journal, {
      id: "journal:" + Date.now() + ":" + Math.random().toString(36).slice(2, 7),
      date: quickEntry.date, description: quickEntry.description,
      amount: quickEntry.amount, debitAccount: quickEntry.debitAccount, creditAccount: quickEntry.creditAccount,
      source: "quick-entry",
    }];
    remoteStorage.setItem(JOURNAL_KEY, JSON.stringify(updated));
    setJournal(updated);
    setMonth(quickEntry.date.slice(0, 7));
    setQuickEntry(null);
    setQuickText("");
    setQuickError("");
    setQuickStatus("Entry posted to your General Ledger and Trial Balance.");
  };
  const deleteEntry = id => {
    const updated = journal.filter(entry => entry.id !== id);
    remoteStorage.setItem(JOURNAL_KEY, JSON.stringify(updated));
    setJournal(updated);
  };
  const tabs = [
    { id: "overview", name: "Overview", Icon: LayoutDashboard },
    { id: "balance", name: "Balance Sheet", Icon: Wallet },
    { id: "income", name: "Income Statement", Icon: TrendingUp },
    { id: "cash", name: "Cash Flow", Icon: Coins },
    { id: "ledger", name: "General Ledger", Icon: BookOpen },
    { id: "trial", name: "Trial Balance", Icon: ClipboardList },
  ];
  const metric = (title, value, note, color = "text-white") => <section className={card + " min-w-0 p-4"}>
    <p className="text-xs text-[#9db0c1]">{title}</p>
    <strong className={"mt-2 block text-2xl font-bold tabular-nums " + color}>{money(value)}</strong>
    {note && <p className="mt-2 text-xs text-[#7f94a8]">{note}</p>}
  </section>;
  const tableHeader = <thead><tr className="border-b border-[#314454] text-left text-[11px] uppercase tracking-wider text-[#9bafc1]">
    <th className="pb-3">Account</th><th className="pb-3 text-right">Start</th><th className="pb-3 text-right">Change</th><th className="pb-3 text-right">End</th>
  </tr></thead>;
  return <div className="min-w-0 space-y-4 pb-8 text-white" data-testid="financials-page">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs uppercase tracking-[0.18em] text-[#8197a9]">Accounting & reports</p>
        <h1 className="text-3xl font-semibold tracking-tight">Financials</h1></div>
      <div className="flex items-center gap-1 rounded-xl border border-[#344657] bg-[#101821] p-1">
        <button type="button" disabled={month <= "2026-09"} onClick={() => setMonth(current => shift(current, -1))}
          className="rounded-lg p-2 text-[#cedbe7] disabled:opacity-30" aria-label="Previous month"><ChevronLeft size={18}/></button>
        <CalendarDays size={15} className="text-sky-400"/>
        <select aria-label="Report month" value={month} onChange={event => setMonth(event.target.value)}
          className="bg-[#101821] px-1 py-2 text-sm font-semibold text-white [color-scheme:dark]">
          {Array.from({length: (Number(getCurrentMonthKey().slice(0, 4)) - 2026) * 12 + Number(getCurrentMonthKey().slice(5)) - 8}, (_, index) =>
            shift(getCurrentMonthKey(), -index)).map(key => <option key={key} value={key}>{monthTitle(key)}</option>)}
        </select>
        <button type="button" disabled={month >= getCurrentMonthKey()} onClick={() => setMonth(current => shift(current, 1))}
          className="rounded-lg p-2 text-[#cedbe7] disabled:opacity-30" aria-label="Next month"><ChevronRight size={18}/></button>
      </div>
    </div>
    <nav className="flex min-w-0 gap-1 overflow-x-auto rounded-2xl border border-[#242b33] bg-[#0d1014] p-2 [scrollbar-width:none]"
      aria-label="Financials sections">
      {tabs.map(({ id, name, Icon }) => <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
        className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs transition-colors ${tab === id ? "border border-sky-400/70 bg-[#182633] font-semibold text-white" : "border border-transparent text-[#9dafc0] hover:bg-white/[0.04] hover:text-white"}`}>
        <Icon size={15}/>{name}
      </button>)}
    </nav>
    {tab === "overview" && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metric("Assets", assetsEnd, "Current or saved balances", "text-sky-300")}
        {metric("Liabilities", debtEnd, "Only liabilities you have recorded")}
        {metric("Net Worth", netEnd, "Assets minus liabilities", "text-emerald-400")}
        {metric("Estimated Profit", pnlProfit, "Revenue − expenses − depreciation", "text-emerald-300")}
      </div>
      <div className={card + " p-5"}>
        <h2 className="font-semibold">Reporting status</h2>
        <div className="mt-3 grid gap-3 text-sm text-[#b0c1ce] sm:grid-cols-2">
          <div>Tracked assets: <strong className="text-white">{rows.length} accounts</strong></div>
          <div>Recorded journal entries: <strong className="text-white">{ledgerEntries.length}</strong></div>
          <div>Monthly equipment depreciation: <strong className="text-white">{money(fixedDep)}</strong></div>
          <div>Unposted historical transactions: <strong className="text-amber-300">Need reconciliation</strong></div>
        </div>
      </div>
    </>}
    {tab === "balance" && <>
      <div className="grid gap-3 sm:grid-cols-3">
        {metric("Total Assets", assetsEnd, null, "text-sky-300")}
        {metric("Total Liabilities", debtEnd)}
        {metric("Owner's Equity / Net Worth", netEnd, null, "text-emerald-400")}
      </div>
      <section className={card + " overflow-hidden p-4 sm:p-6"}>
        <h2 className="mb-1 text-lg font-semibold">{monthTitle(month)} Balance Sheet</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[540px] border-collapse text-sm">
          {tableHeader}<tbody>
            {sections.map(section => <Fragment key={section.id}>
              <tr className="bg-[#142333]"><th colSpan={4} className="px-2 py-2 text-left text-xs uppercase tracking-wider text-sky-300">{section.name}</th></tr>
              {section.rows.map(row => <tr key={row.id} className="border-b border-[#202f3c]">
                <td className="py-2.5 pl-2">{row.name}</td>
                <td className="py-2.5 text-right tabular-nums">{money(row.start)}</td>
                <td className={`py-2.5 text-right tabular-nums ${row.start !== null && row.end !== null && row.end < row.start ? "text-rose-400" : "text-emerald-400"}`}>{row.start === null || row.end === null ? "—" : signed(rounded(row.end-row.start))}</td>
                <td className="py-2.5 text-right font-semibold tabular-nums">{money(row.end)}</td>
              </tr>)}
              {!section.rows.length && <tr><td colSpan={4} className="px-2 py-2 text-xs text-[#72889a]">No accounts</td></tr>}
            </Fragment>)}
            <tr className="border-t-2 border-sky-500 font-bold"><td className="py-3">NET WORTH</td><td className="text-right">{money(netStart)}</td>
              <td className="text-right">{signed(netChange)}</td><td className="text-right text-emerald-400">{money(netEnd)}</td></tr>
          </tbody>
        </table></div>
      </section>
    </>}
    {tab === "income" && <>
      <div className="grid gap-3 sm:grid-cols-3">
        {metric("Recorded Revenue", pnlRevenue, revenue === null ? "Only posted revenue available" : "Saved month-end snapshot", "text-sky-300")}
        {metric("Saved Operating Expenses", expenses, "From Monthly Changes")}
        {metric("Net Income (Estimated)", pnlProfit, "After depreciation", "text-emerald-400")}
      </div>
      <section className={card + " p-5"}>
        <h2 className="mb-4 text-lg font-semibold">Income Statement — {monthTitle(month)}</h2>
        {[
          ["Revenue" , pnlRevenue],
          ["Operating expenses", expenses],
          ["Equipment depreciation", fixedDep],
          ["Net income", pnlProfit],
        ].map(([label, value], index) => <div key={label} className={`flex justify-between gap-3 border-b border-[#273746] py-3 text-sm ${index===3 ? "font-bold text-emerald-400" : ""}`}>
          <span>{label}</span><span className="tabular-nums">{money(value)}</span>
        </div>)}
        
      </section>
    </>}
    {tab === "cash" && <>
      <div className="grid gap-3 sm:grid-cols-3">{metric("Recorded Cash Inflows", cashIn)}{metric("Recorded Cash Outflows", cashOut)}{metric("Recorded Net Cash Flow", rounded(cashIn-cashOut), null, "text-emerald-400")}</div>
      <section className={card + " p-5"}><h2 className="text-lg font-semibold">Cash Flow Statement — {monthTitle(month)}</h2>
        
        <div className="mt-4 space-y-2">{cashEvents.length ? cashEvents.map(entry => <div key={entry.id} className="flex items-center justify-between gap-3 border-b border-[#273746] py-2 text-sm">
          <div><p>{entry.description}</p><p className="text-xs text-[#8197a9]">{entry.date}</p></div>
          <span className={entry.debitAccount==="cash"?"text-emerald-400":"text-rose-400"}>{signed((entry.debitAccount==="cash"?1:-1)*entry.amount)}</span>
        </div>) : <p className="text-sm text-[#94a7b8]">No cash transactions recorded for this month. Add journal entries to build the cash flow statement.</p>}</div>
      </section>
    </>}
    {tab === "ledger" && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">General Ledger</h2></div>
        <button onClick={() => { setDraft({ ...emptyDraft(), date: month+"-01" }); setError(""); setModal(true); }}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300"><Plus size={16}/> Add entry</button></div>
      <section className={card + " space-y-4 p-4 sm:p-5"} data-testid="transaction-chat">
        <div className="flex items-center gap-2"><Sparkles size={17} className="text-cyan-400"/>
          <h3 className="text-sm font-semibold">Describe a transaction</h3></div>
        <p className="text-xs text-[#91a6b7]">Write what happened. I'll draft a journal entry for you to review before posting.</p>
        <form onSubmit={prepareQuickEntry} className="flex flex-col gap-2 sm:flex-row">
          <input aria-label="Describe a financial transaction" value={quickText}
            onChange={event => { setQuickText(event.target.value); setQuickEntry(null); setQuickError(""); setQuickStatus(""); }}
            placeholder="Paid $500 in power costs this month"
            className={field + " min-w-0 flex-1"} />
          <button type="submit" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-[#071824] hover:bg-sky-300">
            <Send size={15}/> Create draft
          </button>
        </form>
        {quickError && <p role="alert" className="text-sm text-rose-400">{quickError}</p>}
        {quickStatus && <p role="status" className="text-sm text-emerald-400">{quickStatus}</p>}
        {quickEntry && <div className="space-y-3 rounded-xl border border-[#355368] bg-[#111f2b] p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm text-white">Review journal entry</strong>
            <span className="text-xs text-[#a1bacb]">{quickEntry.explanation}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-[#a8bdce]">Date
              <input type="date" className={field} value={quickEntry.date}
                onChange={event => setQuickEntry(old => ({ ...old, date: event.target.value }))}/>
            </label>
            <label className="space-y-1 text-xs text-[#a8bdce]">Amount ($)
              <input type="number" min="0.01" step="0.01" className={field} value={quickEntry.amount}
                onChange={event => setQuickEntry(old => ({ ...old, amount: Number(event.target.value) }))}/>
            </label>
            {["debitAccount", "creditAccount"].map(key =>
              <label key={key} className="space-y-1 text-xs text-[#a8bdce]">
                {key === "debitAccount" ? "Debit" : "Credit"}
                <select className={field} value={quickEntry[key]}
                  onChange={event => setQuickEntry(old => ({ ...old, [key]: event.target.value }))}>
                  {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>)}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-[#34485a] pt-3">
            <span className="text-xs text-[#9bb2c3]">Debits and credits both equal {money(quickEntry.amount)}.</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setQuickEntry(null)} className="rounded-lg border border-[#3b5164] px-3 py-2 text-xs">Cancel</button>
              <button type="button" onClick={confirmQuickEntry} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-[#061810]">Confirm & post</button>
            </div>
          </div>
        </div>}
        <p className="text-[11px] text-[#718b9e]">Recognizes common expenses, equipment purchases, owner contributions, and income. Unclear transactions require manual entry. No AI service or bank transfer is involved.</p>
      </section>
      <section className={card + " overflow-hidden p-4"}><div className="overflow-x-auto"><table className="w-full min-w-[550px] text-sm">
        <thead><tr className="border-b border-[#314454] text-left text-xs text-[#9db0c1]"><th className="pb-3">Date / Description</th><th className="pb-3">Account</th><th className="pb-3 text-right">Debit</th><th className="pb-3 text-right">Credit</th><th/></tr></thead>
        <tbody>{entries.map(entry => entry.lines.map((item, index) => <tr key={entry.id+":"+index} className="border-b border-[#20303d]">
          <td className="py-2 align-top">{index===0 ? <><p>{entry.description}</p><p className="text-xs text-[#8195a8]">{entry.date}{entry.automatic ? " · Auto" : ""}</p></> : null}</td>
          <td className="py-2 text-[#c3d2df]">{accounts.find(account=>account.id===item.account)?.name || item.account}</td>
          <td className="py-2 text-right tabular-nums">{item.debit ? money(item.debit) : "—"}</td>
          <td className="py-2 text-right tabular-nums">{item.credit ? money(item.credit) : "—"}</td>
          <td className="py-2 text-right">{index===0 && !entry.automatic && <button aria-label={"Delete "+entry.description} onClick={() => deleteEntry(entry.id)} className="text-[#9dafc0] hover:text-rose-400"><Trash2 size={15}/></button>}</td>
        </tr>))}
          <tr className="font-bold"><td colSpan={2} className="py-3">Total</td><td className="text-right">{money(debitTotal)}</td><td className="text-right">{money(creditTotal)}</td><td/></tr>
        </tbody></table></div>{!entries.length && <p className="py-5 text-sm text-[#8397a9]">No journal entries yet.</p>}</section>
    </>}
    {tab === "trial" && <>
      <div className="grid gap-3 sm:grid-cols-3">{metric("Debits", trialDebit)}{metric("Credits", trialCredit)}{metric("Difference", rounded(trialDebit-trialCredit), "Journal entries only", "text-emerald-400")}</div>
      <section className={card + " p-4 sm:p-6"}><h2 className="text-lg font-semibold">Trial Balance — {monthTitle(month)}</h2>
        
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[360px] text-sm"><thead><tr className="border-b border-[#314454] text-xs text-[#9db0c1]"><th className="pb-2 text-left">Account</th><th className="pb-2 text-right">Debit</th><th className="pb-2 text-right">Credit</th></tr></thead>
          <tbody>{trial.map(row => <tr key={row.id} className="border-b border-[#243340]"><td className="py-2">{row.name}</td><td className="text-right">{row.debit ? money(row.debit) : "—"}</td><td className="text-right">{row.credit ? money(row.credit) : "—"}</td></tr>)}
            <tr className="font-bold"><td className="py-3">Total</td><td className="text-right">{money(trialDebit)}</td><td className="text-right">{money(trialCredit)}</td></tr>
          </tbody></table></div></section>
    </>}
    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={event=>{if(event.target===event.currentTarget)setModal(false);}}>
      <form onSubmit={saveEntry} className={card + " w-full max-w-md space-y-4 p-5 shadow-2xl"} role="dialog" aria-modal="true" aria-label="Add journal entry">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">New Journal Entry</h2><button type="button" onClick={()=>setModal(false)} aria-label="Close"><X size={19}/></button></div>
        <label className="block space-y-1 text-sm">Date<input required type="date" value={draft.date} onChange={event=>setDraft(old=>({...old,date:event.target.value}))} className={field}/></label>
        <label className="block space-y-1 text-sm">Description<input required value={draft.description} onChange={event=>setDraft(old=>({...old,description:event.target.value}))} className={field} placeholder="e.g. Mining payout"/></label>
        {["debitAccount","creditAccount"].map(key=><label key={key} className="block space-y-1 text-sm">{key==="debitAccount"?"Debit account":"Credit account"}
          <select value={draft[key]} onChange={event=>setDraft(old=>({...old,[key]:event.target.value}))} className={field}>
            {accounts.map(account=><option key={account.id} value={account.id}>{account.name}</option>)}
          </select></label>)}
        <label className="block space-y-1 text-sm">Amount ($)<input required min="0.01" step="0.01" type="number" value={draft.amount} onChange={event=>setDraft(old=>({...old,amount:event.target.value}))} className={field}/></label>
        <p className="text-xs text-[#91a7b9]">The amount is debited to one account and credited to another. Don't re-enter transactions already recorded elsewhere without reconciling.</p>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <div className="flex gap-2"><button type="button" onClick={()=>setModal(false)} className="rounded-lg border border-[#384d5d] px-4 py-2">Cancel</button>
          <button type="submit" className="flex-1 rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-[#071710]">Post entry</button></div>
      </form>
    </div>}
  </div>;
}
