import { Fragment, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Coins, CreditCard, FileSpreadsheet, LayoutDashboard, Plus, Send, Sparkles, Trash2, TrendingUp, Wallet, X } from "lucide-react";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { getStoredProjectCryptoPortfolio } from "@/lib/projectCryptoPortfolio";
import { api, settingsApi, spendingApi } from "@/lib/apiClient";
import { useBackendMonthlyIncome } from "@/hooks/useBackendMonthlyIncome";
import { mergeBackendLoopscaleHistory } from "@/lib/mergeBackendLoopscaleHistory";
import { mergeManualIncome } from "@/lib/manualIncomeHistory";
import { buildIncomeHistory, legacyProjectIncome, reconcileLuloIncome } from "@/lib/incomeHistory";
import { STOCK_DIVIDEND_PAYOUTS_KEY } from "@/lib/stockDividendPayouts";
import { buildAutoIncomeJournal } from "@/lib/financialAutoJournal";
import {
  ACCOUNT_OPTIONS, collectMovementCandidates, collectBankMovementCandidates,
  movementFromReview, movementJournal, reconcileBalances, resolveFinancialAccount,
} from "@/lib/financialMovements";
import { hasFreeMiningPower, outOfPocketMiningPowerCost } from "@/lib/powerOutOfPocket";
import { localStorage as appStorage } from "@/lib/localStorage";
import {
 formatCurrency, getCurrentMonthKey, getTodayKey, getEffectiveProjectIncome, buildProjectIncome,
 loadMonthlyBackfills, loadMonthlySnapshots, loadLoopscaleHistory,
 loadKryptexTracker, loadRollerCoinTracker, getRollerCoinTrackerStats,
 loadSaladTracker, loadUnetworkTracker, readObject, PROJECT_QUICK_CACHE_KEY,
} from "@/lib/yieldFarmingAccounting";

const RECORDS_KEY = "monthly_business_changes_v1";
const JOURNAL_KEY = "financials_journal_v1";
const HARDWARE_KEY = "hardware_payback_devices_v1";
const POWER_SETTINGS_KEY = "mining_power_dashboard_v1";
const POWER_ESTIMATE_KEY = "financials_power_estimates_v1";
const CONFIRMED_MOVEMENTS_KEY = "financials_confirmed_movements_v1";
const IGNORED_MOVEMENTS_KEY = "financials_ignored_movements_v1";
const MONTH_CLOSE_KEY = "financials_month_closes_v1";
const DEFAULT_POWER_SETTINGS = { basicRate: 0.1691, offPeakRate: 0.0893, midPeakRate: 0.1670, peakRate: 0.4313 };
function readHardwareRegister() {
  const rows = readJson(HARDWARE_KEY, []);
  return Array.isArray(rows) ? rows.filter(row => Number(row?.cost) > 0 && /^\d{4}-\d{2}$/.test(String(row.startMonth))) : [];
}
function monthsBetween(from, to) {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + m2 - m1;
}
function hardwareSchedule(row, month) {
  const cost = Number(row.cost) || 0;
  const startMonth = row.startMonth || "2026-11";
  if (month < startMonth) return null;
  const elapsed = Math.max(0, monthsBetween(startMonth, month));
  return {
    start: rounded(Math.max(0, cost * (1 - Math.min(60, elapsed) / 60))),
    end: rounded(Math.max(0, cost * (1 - Math.min(60, elapsed + 1) / 60))),
  };
}
function estimatePowerCost(usage, settings) {
  if (!usage || !/^\d{4}-\d{2}$/.test(String(usage.month))) return null;
  const kwh = Number(usage.totalKwh ?? usage.kwh);
  if (!Number.isFinite(kwh) || kwh < 0) return null;
  const basic = Number(settings?.basicRate ?? DEFAULT_POWER_SETTINGS.basicRate);
  if (usage.month < "2026-12") return rounded(kwh * basic);
  const rates = { basic, offPeak: Number(settings?.offPeakRate ?? DEFAULT_POWER_SETTINGS.offPeakRate),
    midPeak: Number(settings?.midPeakRate ?? DEFAULT_POWER_SETTINGS.midPeakRate),
    peak: Number(settings?.peakRate ?? DEFAULT_POWER_SETTINGS.peakRate) };
  const tiers = usage.tiers || {};
  const totalTierKwh = Object.keys(rates).reduce((sum, key) => sum + (Number(tiers[key]) || 0), 0);
  if (totalTierKwh <= 0) return null;
  return rounded(Object.keys(rates).reduce((sum, key) => sum + (Number(tiers[key]) || 0) * rates[key], 0));
}
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
  { id: "luloCash", name: "Lulo Yield Savings", type: "asset" },
  { id: "brokerage", name: "Brokerage Holdings / Receivable", type: "asset" },
  { id: "crypto", name: "Cryptocurrency", type: "asset" },
  { id: "platform", name: "Other Platform Receivables", type: "asset" },
  { id: "platform:kryptex", name: "Kryptex Receivables", type: "asset" },
  { id: "platform:rollercoin", name: "RollerCoin Receivables", type: "asset" },
  { id: "platform:salad", name: "Salad Receivables", type: "asset" },
  { id: "platform:unetwork", name: "Unetwork Receivables", type: "asset" },
  { id: "defi", name: "DeFi / Investments", type: "asset" },
  { id: "equipment", name: "Mining Equipment", type: "asset" },
  { id: "accDep", name: "Accumulated Depreciation", type: "contra" },
  { id: "payable", name: "Accounts Payable", type: "liability" },
  { id: "equity", name: "Owner's Equity", type: "equity" },
  { id: "revenue", name: "Mining / Yield Revenue", type: "revenue" },
  { id: "dividendRevenue", name: "Dividend Revenue", type: "revenue" },
  { id: "electric", name: "Electricity Expense", type: "expense" },
  { id: "expense", name: "Operating Expense", type: "expense" },
  { id: "depreciation", name: "Depreciation Expense", type: "expense" },
  { id: "fees", name: "Transaction & Network Fees", type: "expense" },
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
function readCryptoIncomeSources() {
 const quick = readObject(PROJECT_QUICK_CACHE_KEY);
 const projects = readJson("networth_projects", []);
 return {
  legacyProjects: Array.isArray(projects) ? projects : [],
  luloProjects: (quick.projects || []).filter(item => item?.yield_tracking === "lulo_lending"),
  loopscale: loadLoopscaleHistory(), salad: loadSaladTracker(),
  rollercoin: loadRollerCoinTracker(), unetwork: loadUnetworkTracker(),
  kryptex: loadKryptexTracker(), backfills: loadMonthlyBackfills(),
  snapshots: loadMonthlySnapshots(), payouts: readObject(STOCK_DIVIDEND_PAYOUTS_KEY),
  manualIncome: {}, luloBackfills: {},
 };
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
function makeRows(month, records, live, hardwareDevices = []) {
  const current = records[month] || {};
  const previous = records[shift(month, -1)] || {};
  const saved = Array.isArray(current.items) ? current.items : [];
  const prior = Array.isArray(previous.items) ? previous.items : [];
  // Names from live trackers are lowercase while saved accounts retain
  // their display capitalization. Deduplicate by normalized account identity,
  // preferring the saved (capitalized) name over generated live names.
  const candidates = current.locked ? saved.map(row => row.name) : [
    ...saved.map(row => row.name),
    ...prior.map(row => row.name),
    ...Object.keys(live).map(name => name === "btc" ? "BTC" : name),
  ];
  const namesByKey = new Map();
  for (const candidate of candidates) {
    const name = String(candidate || "").trim();
    const key = name.toLowerCase();
    if (!key || namesByKey.has(key)) continue;
    namesByKey.set(key, name);
  }
  const excludedKeys = new Set((current.excluded || []).map(name => String(name).trim().toLowerCase()));
  const names = [...namesByKey.values()];
  const rows = names.filter(name => !excludedKeys.has(name.toLowerCase())).map(name => {
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
  // Hardware Payback is the shared equipment register. Keep the two known
  // $500 purchases as a fallback if Hardware Payback hasn't been populated.
  if (!current.locked && month >= "2026-11") {
    for (const [id, name] of [["hardware:rtx2080super-pc", "RTX 2080 Super PC"], ["hardware:rtx5070", "RTX 5070 GPU"]]) {
      if (!allExtra.some(row => row.id === id || new RegExp(id.includes("2080") ? "2080" : "5070", "i").test(row.name || "")) &&
          !(current.balanceExcluded || []).includes(id)) {
        allExtra.push({ id, name, category: "equipment", historicalCost: 500 });
      }
    }
  }
  const trackedHardwareKeys = new Set();
  for (const device of hardwareDevices) {
    const name = String(device.name || "").trim();
    const key = /2080/i.test(name) ? "2080" : /5070/i.test(name) ? "5070" : name.toLowerCase();
    if (!name || trackedHardwareKeys.has(key)) continue;
    trackedHardwareKeys.add(key);
    const schedule = hardwareSchedule(device, month);
    if (!schedule) continue;
    const existing = allExtra.find(row => {
      const other = String(row.name || "").toLowerCase();
      return key === "2080" ? /2080/.test(other) : key === "5070" ? /5070/.test(other) : other === key;
    });
    if (existing) {
      existing.syncedHardware = { ...device, ...schedule };
    } else {
      allExtra.push({ id: "payback:" + String(device.id || key), name, category: "equipment", syncedHardware: { ...device, ...schedule } });
    }
  }
  for (const row of allExtra) {
    const isFixed = /^(hardware:rtx2080super-pc|hardware:rtx5070)$/.test(row.id) &&
      !row.disabledAutomaticDepreciation && month >= "2026-11";
    const older = priorExtra.find(item => item.id === row.id);
    const start = row.syncedHardware ? row.syncedHardware.start : isFixed ? equipmentValue(month, 500) :
      amount(row.start) ?? (current.locked ? null : amount(older?.end));
    const end = row.syncedHardware ? row.syncedHardware.end : isFixed ? equipmentValue(shift(month, 1), 500) :
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
  const phrase = input.toLowerCase();

  // Accept "$500", "500 USD", or an amount after an action ("paid 500").
  // Never mistake model numbers like "RTX 2080" or a date like "Nov 5th"
  // for a transaction amount.
  const explicitAmounts = [...input.matchAll(/(?:\$\s*([\d,]+(?:\.\d{1,2})?)|\b([\d,]+(?:\.\d{1,2})?)\s*USD\b)/gi)];
  const actionAmounts = [...input.matchAll(/\b(?:paid|spent|bought|purchased|received|earned|deposited|contributed|transferred|withdrew|withdrawn|moved|sent)\s+(?:about\s+|approximately\s+)?([\d,]+(?:\.\d{1,2})?)\b/gi)];
  const values = explicitAmounts.length
    ? explicitAmounts.map(match => match[1] || match[2])
    : actionAmounts.map(match => match[1]);
  if (values.length !== 1) {
    return { error: "Include one purchase or payment amount, such as 'Paid 500 for RTX 2080 Super PC Nov 5th'." };
  }
  const value = Number(values[0].replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0 || rounded(value) <= 0)
    return { error: "Enter a valid amount greater than $0." };

  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const today = new Date();
  let date = month === getCurrentMonthKey()
    ? today.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" })
    : month + "-" + String(lastDay).padStart(2, "0");

  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const namedDate = input.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i);
  const isoDate = input.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (namedDate || isoDate) {
    const year = namedDate ? Number(namedDate[3] || month.slice(0, 4)) : Number(isoDate[1]);
    const monthNumber = namedDate ? monthNames.indexOf(namedDate[1].slice(0, 3).toLowerCase()) + 1 : Number(isoDate[2]);
    const day = Number(namedDate ? namedDate[2] : isoDate[3]);
    const candidate = new Date(Date.UTC(year, monthNumber - 1, day));
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() + 1 !== monthNumber || candidate.getUTCDate() !== day) {
      return { error: "That transaction date is invalid. Please check the day and month." };
    }
    date = candidate.toISOString().slice(0, 10);
  }

  let debitAccount = "", creditAccount = "";
  let explanation = "";
  const expense = /electric|power (?:bill|cost|expense)|utility|utilities|energy bill|electricity bill/.test(phrase);
  const paid = /\b(?:paid|spent|purchased|bought|payment|purchase)\b/.test(phrase);
  const unpaid = /\b(?:unpaid|owe|owed|on credit|not yet paid|bill due)\b/.test(phrase);
  const fromCash = /\b(?:cash|bank|checking|debit card)\b|from (?:my )?account/.test(phrase);
  const fromCrypto = /bitcoin|\bbtc\b|crypto wallet/.test(phrase);
  const transfer = /\b(?:transferred|transfer|withdrew|withdrawn|withdrawal|moved|sent)\b/.test(phrase);
  if (transfer) {
    // Internal transfers move assets and are never additional revenue.
    const from = phrase.match(/\bfrom\s+(?:my\s+)?(roller\s?coin|kryptex|salad|unetwork|unity network|lulo|loopscale|bitcoin|btc|crypto wallet|cash|checking|bank)\b/);
    const to = phrase.match(/\b(?:to|into)\s+(?:my\s+)?(roller\s?coin|kryptex|salad|unetwork|unity network|lulo|loopscale|bitcoin|btc|crypto wallet|cash|checking|bank)\b/);
    const assetAccount = match => resolveFinancialAccount(match?.[1]) || "";
    debitAccount = assetAccount(to);
    creditAccount = assetAccount(from);
    if (!debitAccount || !creditAccount || debitAccount === creditAccount) {
      return { error: "Specify different transfer accounts, e.g. 'Transferred $10 from RollerCoin to BTC'. Transfers within one pooled account require manual details." };
    }
    explanation = "Internal asset transfer — not revenue or an expense.";
  } else if (expense && (paid || unpaid)) {
    debitAccount = "electric";
    creditAccount = unpaid ? "payable" : fromCrypto ? "crypto" : "cash";
    explanation = unpaid ? "Record an electricity bill owed." : "Record a paid electricity expense.";
  } else if (/gpu|graphics card|computer|\bpc\b|mining equipment|hardware/.test(phrase) && paid) {
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
  return { date, description: input, amount: rounded(value), debitAccount, creditAccount, explanation };
}

export default function FinancialsPage() {
  const [tab, setTab] = useState("balance");
  const [month, setMonth] = useState(getCurrentMonthKey);
  const [records, setRecords] = useState(() => readJson(RECORDS_KEY, {}));
  const [journal, setJournal] = useState(() => readJson(JOURNAL_KEY, []));
  const [live, setLive] = useState(liveBalances);
  const [cryptoIncome, setCryptoIncome] = useState(readCryptoIncomeSources);
  const [hardwareDevices, setHardwareDevices] = useState(readHardwareRegister);
  const [powerEstimates, setPowerEstimates] = useState(() => readJson(POWER_ESTIMATE_KEY, {}));
  const [confirmedMovements, setConfirmedMovements] = useState(() => readJson(CONFIRMED_MOVEMENTS_KEY, {}));
  const [ignoredMovements, setIgnoredMovements] = useState(() => readJson(IGNORED_MOVEMENTS_KEY, {}));
  const [closedMonths, setClosedMonths] = useState(() => readJson(MONTH_CLOSE_KEY, {}));
  const [bankMovements, setBankMovements] = useState([]);
  const [movementReview, setMovementReview] = useState(null);
  const [movementReviewError, setMovementReviewError] = useState("");
  const [reconciliationStatus, setReconciliationStatus] = useState("");
  const [monthClosePrompt, setMonthClosePrompt] = useState(null);
  const [monthCloseAcknowledged, setMonthCloseAcknowledged] = useState(false);
  const [modal, setModal] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState("");
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [quickEntry, setQuickEntry] = useState(null);
  const [quickError, setQuickError] = useState("");
  const [quickStatus, setQuickStatus] = useState("");
  useEffect(() => subscribe(() => {
    setRecords(readJson(RECORDS_KEY, {}));
    setJournal(readJson(JOURNAL_KEY, []));
    setLive(liveBalances());
    setHardwareDevices(readHardwareRegister());
    setPowerEstimates(readJson(POWER_ESTIMATE_KEY, {}));
    setConfirmedMovements(readJson(CONFIRMED_MOVEMENTS_KEY, {}));
    setIgnoredMovements(readJson(IGNORED_MOVEMENTS_KEY, {}));
    setClosedMonths(readJson(MONTH_CLOSE_KEY, {}));
    setCryptoIncome(current => ({
      ...readCryptoIncomeSources(), manualIncome: current.manualIncome,
      luloBackfills: current.luloBackfills,
    }));
  }), []);
  useEffect(() => {
    const refresh = () => setLive(liveBalances());
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("project-crypto-updated", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("project-crypto-updated", refresh); };
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.get("/api/yield-sources/earnings");
        if (!active || !result) return;
        setCryptoIncome(current => ({
          ...current,
          loopscale: mergeBackendLoopscaleHistory(current.loopscale, result.loopscaleHistory),
          manualIncome: result.manualIncomeHistory || current.manualIncome,
          luloBackfills: result.luloBackfills && typeof result.luloBackfills === "object"
            ? result.luloBackfills : current.luloBackfills,
        }));
      } catch { /* Keep local income records if the backend is offline. */ }
    };
    refresh();
    const interval = window.setInterval(refresh, 90000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  useEffect(() => {
    let active = true;
    const refreshBankTransactions = async () => {
      try {
        const transactions = await spendingApi.transactions();
        if (active && Array.isArray(transactions)) setBankMovements(collectBankMovementCandidates(transactions));
      } catch { /* Bank data can be offline. No transactions are invented. */ }
    };
    refreshBankTransactions();
    const timer = window.setInterval(refreshBankTransactions, 90000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const cryptoTrackers = useMemo(() => ({
    salad: cryptoIncome.salad, rollercoin: cryptoIncome.rollercoin,
    unetwork: cryptoIncome.unetwork, kryptex: cryptoIncome.kryptex,
  }), [cryptoIncome.salad, cryptoIncome.rollercoin, cryptoIncome.unetwork, cryptoIncome.kryptex]);
  const cryptoLocalMonths = useMemo(() => buildProjectIncome(
    cryptoIncome.luloProjects, cryptoIncome.loopscale, cryptoIncome.salad,
    cryptoIncome.backfills, cryptoIncome.rollercoin, cryptoIncome.unetwork,
    cryptoIncome.kryptex,
  ), [cryptoIncome]);
  const cryptoBackendMonths = useBackendMonthlyIncome(cryptoTrackers, cryptoLocalMonths);
  const incomeMonths = useMemo(() => {
    const current = getCurrentMonthKey();
    const reconciled = reconcileLuloIncome(
      getEffectiveProjectIncome(cryptoBackendMonths, cryptoIncome.snapshots),
      cryptoIncome.backfills, cryptoIncome.luloBackfills, current,
      cryptoIncome.luloProjects, getTodayKey(),
    );
    const recorded = buildIncomeHistory(
      reconciled, cryptoIncome.payouts, current, legacyProjectIncome(cryptoIncome.legacyProjects),
    );
    return mergeManualIncome(recorded, cryptoIncome.manualIncome?.monthly || {}, current);
  }, [cryptoBackendMonths, cryptoIncome]);
  useEffect(() => {
    let active = true;
    const refreshPower = async () => {
      try {
        const [status, settings] = await Promise.all([
          api.get("/api/power/status"),
          settingsApi.get(POWER_SETTINGS_KEY).catch(() => DEFAULT_POWER_SETTINGS),
        ]);
        if (!active) return;
        const usage = status?.currentMonth;
        const value = estimatePowerCost(usage, settings || DEFAULT_POWER_SETTINGS);
        if (usage?.month && value !== null && usage.month <= getCurrentMonthKey()) {
          const updated = { ...readJson(POWER_ESTIMATE_KEY, {}), [usage.month]: {
            cost: value, kwh: Number(usage.totalKwh ?? usage.kwh) || 0,
            updatedAt: new Date().toISOString(), estimated: true,
          } };
          remoteStorage.setItem(POWER_ESTIMATE_KEY, JSON.stringify(updated));
          setPowerEstimates(updated);
        }
      } catch { /* Keep last available electricity estimate. */ }
    };
    refreshPower();
    const timer = window.setInterval(refreshPower, 90000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const closeSnapshot = closedMonths[month] || null;
  const rows = useMemo(() => closeSnapshot?.rows ||
    makeRows(month, records, live, hardwareDevices),
    [month, records, live, hardwareDevices, closeSnapshot]);
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
  // Share the exact recorded Income History calculation with Crypto Dashboard.
  const syncedRevenue = closeSnapshot?.incomeMonth ||
    incomeMonths.find(entry => entry.monthKey === month);
  const revenue = closeSnapshot ? closeSnapshot.revenue :
    syncedRevenue ? amount(syncedRevenue.total) : null;
  const savedExpenses = amount(recorded.expenses);
  const fixedDep = closeSnapshot ? closeSnapshot.fixedDep :
    rounded(rows.filter(row => row.category === "equipment" && row.start !== null && row.end !== null)
      .reduce((sum, row) => sum + Math.max(0, row.start - row.end), 0));
  const ledgerEntries = closeSnapshot?.manualEntries ||
    journal.filter(entry => String(entry.date).slice(0, 7) === month);
  const projectMovementCandidates = useMemo(() =>
    collectMovementCandidates(cryptoIncome.legacyProjects),
    [cryptoIncome.legacyProjects]);
  const movementCandidates = [...projectMovementCandidates, ...bankMovements];
  const unresolvedMovements = movementCandidates.filter(candidate =>
    candidate.date.startsWith(month) && !candidate.matchable &&
    !confirmedMovements[candidate.id] && !ignoredMovements[candidate.id]);
  const confirmedById = new Map();
  movementCandidates.filter(row => row.matchable).forEach(row => confirmedById.set(row.id, row));
  Object.values(confirmedMovements).forEach(row => confirmedById.set(row.id, row));
  const matchedMovements = [...confirmedById.values()].filter(row => row.date.startsWith(month));
  const alreadyPostedIds = new Set(ledgerEntries.filter(entry => entry.movementSourceId)
    .map(entry => entry.movementSourceId));
  // Deduplicate each transfer leg separately from its fee: a manual transfer
  // must not suppress an otherwise unrecorded fee from the same source ID.
  const syncedMovementEntries = movementJournal(matchedMovements, month, alreadyPostedIds)
    .filter(entry => !ledgerEntries.some(manual =>
      manual.date === entry.date &&
      Math.abs(Number(manual.amount) - Number(entry.lines[0]?.debit)) <= 0.005 &&
      manual.debitAccount === entry.lines[0]?.account &&
      manual.creditAccount === entry.lines[1]?.account));
  const assetAccounts = new Set(accounts.filter(account => account.type === "asset" && account.id !== "equipment")
    .map(account => account.id));
  const manualTransferRecords = ledgerEntries.filter(entry =>
    assetAccounts.has(entry.debitAccount) && assetAccounts.has(entry.creditAccount) &&
    entry.debitAccount !== entry.creditAccount && Number(entry.amount) > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(entry.date))).map(entry => ({
      id: "manual:" + entry.id, date: entry.date, amount: entry.amount,
      from: entry.creditAccount, to: entry.debitAccount,
      type: "transfer", provider: entry.description, feeUsd: 0,
    }));
  // A manual transfer already present in the ledger supersedes an auto record
  // with the same date, amount and two asset accounts.
  const distinctAutoMovements = matchedMovements.filter(movement =>
    !manualTransferRecords.some(manual => manual.date === movement.date &&
      Math.abs(Number(manual.amount) - Number(movement.amount)) <= 0.005 &&
      manual.from === movement.from && manual.to === movement.to));
  const reconciliationMovements = [...distinctAutoMovements, ...manualTransferRecords];
  const reconciliation = closeSnapshot?.reconciliation ||
    reconcileBalances(rows, syncedRevenue, reconciliationMovements, month);
  // Hardware Payback knows the cost and month, but NOT the funding account.
  // Show an optional review instead of assuming a cash purchase.
  const unpostedEquipment = hardwareDevices.filter(device => {
    if (device.startMonth !== month || !(Number(device.cost) > 0)) return false;
    const name = String(device.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const model = name.match(/2080|5070/)?.[0];
    return !ledgerEntries.some(entry => {
      if (entry.debitAccount !== "equipment" || Math.abs(Number(entry.amount) - Number(device.cost)) > 0.01) return false;
      const description = String(entry.description || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return description.includes(name) || (model && description.includes(model));
    });
  });
  const syncedIncomeJournal = useMemo(() => buildAutoIncomeJournal(
    month, syncedRevenue, ledgerEntries, getCurrentMonthKey(), getTodayKey(),
  ), [month, syncedRevenue, ledgerEntries]);
  const journalExpense = ledgerEntries.filter(entry => entry.debitAccount === "expense" || entry.debitAccount === "electric")
    .reduce((sum, entry) => sum + entry.amount, 0);
  // Estimated power is never a cash payment. Prefer actual posted electricity
  // expenses, and never add the same expense twice through two sources.
  const actualPowerEntries = ledgerEntries.filter(entry => entry.debitAccount === "electric");
  const electricityCovered = hasFreeMiningPower(month);
  const estimatedPower = Number(powerEstimates[month]?.cost);
  const hasSavedExpenses = savedExpenses !== null && savedExpenses > 0;
  const autoPower = closeSnapshot ? closeSnapshot.autoPower :
    electricityCovered || actualPowerEntries.length || hasSavedExpenses ||
    !Number.isFinite(estimatedPower) ? 0 : outOfPocketMiningPowerCost(rounded(estimatedPower), month);
  const feeExpense = rounded((closeSnapshot?.entries || syncedMovementEntries).reduce((sum, entry) =>
    sum + entry.lines.filter(row => row.account === "fees").reduce((n, row) => n + row.debit, 0), 0));
  // A saved expense total may already contain some fees. The greater of the
  // tracked/journaled total and saved total avoids simply adding it twice.
  const expenses = closeSnapshot ? closeSnapshot.expenses :
    Math.max(savedExpenses || 0, rounded(journalExpense + feeExpense + autoPower));
  // Journaled earnings may already exist in the Crypto Income data.
  // Do not add them a second time or substitute them for a missing source.
  const pnlRevenue = revenue;
  // Monthly expense card may already include electricity and other manually entered costs.
  // Display ledger amounts separately instead of counting them twice.
  const pnlProfit = closeSnapshot ? closeSnapshot.pnlProfit :
    pnlRevenue === null ? null : rounded(pnlRevenue - expenses - fixedDep);
  const generatedEntries = [
    ...syncedIncomeJournal.entries,
    ...syncedMovementEntries,
    ...(fixedDep ? [{
      id: "auto-depreciation:" + month, date: month + "-28",
      description: "Monthly equipment depreciation — Hardware Payback",
      lines: [line("depreciation", fixedDep, 0), line("accDep", 0, fixedDep)], automatic: true,
    }] : []),
    ...(autoPower ? [{
      id: "auto-power-estimate:" + month, date: month + "-28",
      description: "Estimated mining electricity — not a confirmed payment",
      lines: [line("electric", autoPower, 0), line("payable", 0, autoPower)],
      automatic: true, estimated: true,
    }] : []),
  ];
  const manualEntries = ledgerEntries.map(entry => ({
    ...entry, lines: [line(entry.debitAccount, entry.amount, 0), line(entry.creditAccount, 0, entry.amount)],
  }));
  const entries = closeSnapshot?.entries ||
    [...manualEntries, ...generatedEntries].sort((a, b) => a.date.localeCompare(b.date));
  const debitTotal = rounded(entries.reduce((sum, entry) => sum + entry.lines.reduce((n, part) => n + part.debit, 0), 0));
  const creditTotal = rounded(entries.reduce((sum, entry) => sum + entry.lines.reduce((n, part) => n + part.credit, 0), 0));
  const trial = accounts.map(account => {
    const debit = rounded(entries.reduce((sum, entry) => sum + entry.lines.filter(line => line.account === account.id).reduce((n, line) => n + line.debit, 0), 0));
    const credit = rounded(entries.reduce((sum, entry) => sum + entry.lines.filter(line => line.account === account.id).reduce((n, line) => n + line.credit, 0), 0));
    return { ...account, debit: Math.max(0, rounded(debit - credit)), credit: Math.max(0, rounded(credit - debit)) };
  }).filter(account => account.debit || account.credit);
  const trialDebit = rounded(trial.reduce((sum, account) => sum + account.debit, 0));
  const trialCredit = rounded(trial.reduce((sum, account) => sum + account.credit, 0));
  const cashEvents = entries.flatMap(entry => {
    const row = entry.lines.find(part => part.account === "cash");
    return row && (row.debit || row.credit)
      ? [{id:entry.id, date:entry.date, description:entry.description,
          delta: rounded(row.debit - row.credit)}] : [];
  });
  const cashIn = rounded(cashEvents.filter(entry => entry.delta > 0).reduce((sum, entry) => sum + entry.delta, 0));
  const cashOut = rounded(cashEvents.filter(entry => entry.delta < 0).reduce((sum, entry) => sum - entry.delta, 0));
  const saveEntry = event => {
    event.preventDefault();
    if (closedMonths[String(draft.date).slice(0, 7)]) {
      setError("This reporting month is closed. Reopen it under Reconcile before editing.");
      return;
    }
    const value = Number(draft.amount);
    if (!draft.description.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
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
    if (closedMonths[String(quickEntry.date).slice(0, 7)]) {
      setQuickError("This reporting month is closed. Reopen it before posting.");
      return;
    }
    if (!quickEntry.description.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(quickEntry.date) ||
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
    setQuickModalOpen(false);
  };
  const reviewEquipmentPurchase = device => {
    setDraft({
      date: "",
      description: "Purchase: " + device.name,
      debitAccount: "equipment",
      creditAccount: "cash",
      amount: String(device.cost),
    });
    setTab("ledger");
    setError("");
    setModal(true);
  };
  const deleteEntry = id => {
    const original = journal.find(entry => entry.id === id);
    if (original && closedMonths[String(original.date).slice(0, 7)]) {
      setReconciliationStatus("Reopen the closed month before deleting its journal entries.");
      setTab("reconcile");
      return;
    }
    const updated = journal.filter(entry => entry.id !== id);
    remoteStorage.setItem(JOURNAL_KEY, JSON.stringify(updated));
    setJournal(updated);
  };
  const postReviewedMovement = () => {
    if (!movementReview) return;
    if (closedMonths[String(movementReview.date).slice(0, 7)]) {
      setMovementReviewError("Reopen the month before adding transfer or fee records.");
      return;
    }
    const confirmed = movementFromReview(movementReview);
    if (!confirmed) {
      setMovementReviewError("Enter a valid date, positive USD amount, and different source and destination accounts.");
      return;
    }
    // The source id remains unchanged on re-review, so no second entry is created.
    const updated = {...confirmedMovements, [confirmed.id]: confirmed};
    remoteStorage.setItem(CONFIRMED_MOVEMENTS_KEY, JSON.stringify(updated));
    setConfirmedMovements(updated);
    setMovementReview(null);
    setMovementReviewError("");
    setReconciliationStatus("Confirmed movement added to the ledger and trial balance.");
  };
  const ignoreMovement = candidate => {
    if (closedMonths[month]) return;
    const updated = {...ignoredMovements, [candidate.id]: true};
    remoteStorage.setItem(IGNORED_MOVEMENTS_KEY, JSON.stringify(updated));
    setIgnoredMovements(updated);
    setReconciliationStatus("Candidate dismissed; no financial entry was created.");
  };
  const reopenCandidate = candidate => {
    const updated = {...ignoredMovements};
    delete updated[candidate.id];
    remoteStorage.setItem(IGNORED_MOVEMENTS_KEY, JSON.stringify(updated));
    setIgnoredMovements(updated);
    setReconciliationStatus("Candidate restored to the review queue.");
  };
  const closeSelectedMonth = () => {
    if (Math.abs(trialDebit - trialCredit) > 0.005) {
      setReconciliationStatus("The trial balance is out of balance; the month cannot be closed.");
      return;
    }
    if (month >= getCurrentMonthKey()) {
      setReconciliationStatus("The current month stays open so earnings can continue syncing.");
      return;
    }
    if (closedMonths[month] || !monthCloseAcknowledged) return;
    // Immutable report snapshot; all statement calculations and posted entries
    // come from this copy until an explicit Reopen action. No tracker mutation.
    const snapshot = {
      month, closedAt: new Date().toISOString(),
      rows: JSON.parse(JSON.stringify(rows)),
      incomeMonth: syncedRevenue ? JSON.parse(JSON.stringify(syncedRevenue)) : null,
      revenue, expenses, pnlProfit, fixedDep, autoPower,
      entries: JSON.parse(JSON.stringify(entries)),
      manualEntries: JSON.parse(JSON.stringify(ledgerEntries)),
      reconciliation: JSON.parse(JSON.stringify(reconciliation)),
      exceptions: {
        pendingMovements: unresolvedMovements.length,
        balanceDifferences: reconciliation.filter(item => Math.abs(item.unexplained) >= 0.05).length,
        unpostedEquipment: unpostedEquipment.length,
        revenueDifference: syncedIncomeJournal.unexplainedManualRevenue,
      },
    };
    const updated = {...closedMonths, [month]: snapshot};
    remoteStorage.setItem(MONTH_CLOSE_KEY, JSON.stringify(updated));
    setClosedMonths(updated);
    setMonthClosePrompt(null);
    setMonthCloseAcknowledged(false);
    setReconciliationStatus(monthTitle(month) + " frozen. Reopen the month to make corrections.");
  };
  const reopenSelectedMonth = () => {
    if (!closedMonths[month]) return;
    const updated = {...closedMonths};
    delete updated[month];
    remoteStorage.setItem(MONTH_CLOSE_KEY, JSON.stringify(updated));
    setClosedMonths(updated);
    setReconciliationStatus(monthTitle(month) + " reopened; live tracker values are active again.");
  };
  const tabs = [
    { id: "ledger", name: "General Ledger", Icon: BookOpen },
    { id: "trial", name: "Trial Balance", Icon: ClipboardList },
    { id: "income", name: "Income Statement", Icon: TrendingUp },
    { id: "balance", name: "Balance Sheet", Icon: Wallet },
    { id: "cash", name: "Cash Flow", Icon: Coins },
    { id: "reconcile", name: "Reconcile", Icon: ClipboardList },
    { id: "overview", name: "Overview", Icon: LayoutDashboard },
  ];
  const metric = (title, value, note, color = "text-white", isCount = false) => <section className={card + " min-w-0 p-4"}>
    <p className="text-xs text-[#9db0c1]">{title}</p>
    <strong className={"mt-2 block text-2xl font-bold tabular-nums " + color}>{isCount ? value : money(value)}</strong>
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
          <div>Synced income entries: <strong className="text-white">{syncedIncomeJournal.entries.length} sources</strong></div>
          <div>Monthly equipment depreciation: <strong className="text-white">{money(fixedDep)}</strong></div>
          <div>Hardware Payback register: <strong className="text-white">{hardwareDevices.length} devices</strong></div>
          <div>Purchases awaiting journal confirmation: <strong className={unpostedEquipment.length ? "text-amber-300" : "text-emerald-400"}>{unpostedEquipment.length}</strong></div>
          <div>Out-of-pocket electricity: <strong className="text-white">{electricityCovered ? "$0.00 (Free power)" : powerEstimates[month] ? money(powerEstimates[month].cost) + " estimated" : "Awaiting usage data"}</strong></div>
          <div>Transfer / fee review: <strong className={unresolvedMovements.length ? "text-amber-300" : "text-emerald-400"}>{unresolvedMovements.length} candidates</strong></div>
          <div>Month status: <strong className="text-white">{closeSnapshot ? "Closed · " + new Date(closeSnapshot.closedAt).toLocaleDateString() : "Open"}</strong></div>
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
        {metric("Crypto Income Revenue", pnlRevenue, "Synced from Crypto Dashboard", "text-sky-300")}
        {metric("Operating Expenses", expenses, autoPower ? "Includes Mining Power estimate" : "Saved or journaled expenses")}
        {metric("Net Income (Estimated)", pnlProfit, "After depreciation", "text-emerald-400")}
      </div>
      <section className={card + " p-5"}>
        <h2 className="mb-4 text-lg font-semibold">Income Statement — {monthTitle(month)}</h2>
        {[
          ["Revenue — Crypto Income", pnlRevenue],
          ["Other operating expenses", rounded(Math.max(0, expenses - autoPower - feeExpense))],
          ...(autoPower ? [["Mining electricity (estimate)", autoPower]] : []),
          ...(feeExpense ? [["Transaction / network fees", feeExpense]] : []),
          ["Equipment depreciation", fixedDep],
          ["Net income", pnlProfit],
        ].map(([label, value]) => <div key={label} className={`flex justify-between gap-3 border-b border-[#273746] py-3 text-sm ${label === "Net income" ? "font-bold text-emerald-400" : ""}`}>
          <span>{label}</span><span className="tabular-nums">{money(value)}</span>
        </div>)}
        
      </section>
    </>}
    {tab === "cash" && <>
      <div className="grid gap-3 sm:grid-cols-3">{metric("Recorded Cash Inflows", cashIn)}{metric("Recorded Cash Outflows", cashOut)}{metric("Recorded Net Cash Flow", rounded(cashIn-cashOut), null, "text-emerald-400")}</div>
      <section className={card + " p-5"}><h2 className="text-lg font-semibold">Cash Flow Statement — {monthTitle(month)}</h2>
        
        <div className="mt-4 space-y-2">{cashEvents.length ? cashEvents.map(entry => <div key={entry.id} className="flex items-center justify-between gap-3 border-b border-[#273746] py-2 text-sm">
          <div><p>{entry.description}</p><p className="text-xs text-[#8197a9]">{entry.date}</p></div>
          <span className={entry.delta >= 0 ? "text-emerald-400" : "text-rose-400"}>{signed(entry.delta)}</span>
        </div>) : <p className="text-sm text-[#94a7b8]">No cash transactions recorded for this month. Add journal entries to build the cash flow statement.</p>}</div>
      </section>
    </>}
    {tab === "reconcile" && <>
      <div className="grid gap-3 sm:grid-cols-3">
        {metric("Confirmed transfers & fees", matchedMovements.length, "Source records + reviewed items", "text-white", true)}
        {metric("Transaction fees", feeExpense, "Confirmed fee entries only")}
        {metric("Unreviewed movements", unresolvedMovements.length, "Not posted to ledger", "text-white", true)}
      </div>
      {reconciliationStatus && <p role="status" className="text-sm text-sky-300">{reconciliationStatus}</p>}
      <section className={card + " space-y-4 p-4 sm:p-5"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Transfer & fee reconciliation</h2>
          <span className="text-xs text-[#9badc1]">{unresolvedMovements.length} require review</span>
        </div>
        <p className="text-xs text-[#92a8b9]">Dated provider transactions with explicit source and destination accounts post automatically. Bank transfers and unmatched withdrawals need confirmation. Balance decreases alone are never booked as transfers.</p>
        {!unresolvedMovements.length && <p className="rounded-lg border border-[#2f4855] px-3 py-3 text-sm text-[#a0bdc7]">No unresolved transfer or fee candidates in this month.</p>}
        <div className="space-y-2">
          {unresolvedMovements.slice(0, 60).map(candidate => <div key={candidate.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#293d4e] bg-[#0e1b26] p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{candidate.provider || "External transfer"} · {money(candidate.amount)}</p>
              <p className="text-xs text-[#92a8ba]">{candidate.date} · {candidate.type} · {candidate.issue}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={Boolean(closeSnapshot)} onClick={() => {
                setMovementReview({...candidate, from: candidate.from || "", to: candidate.to || ""});
                setMovementReviewError("");
                setReconciliationStatus("");
              }} className="rounded-lg border border-sky-400/30 px-3 py-2 text-xs font-semibold text-sky-300 disabled:opacity-40">Review</button>
              <button type="button" disabled={Boolean(closeSnapshot)} onClick={() => ignoreMovement(candidate)}
                className="rounded-lg border border-[#465767] px-3 py-2 text-xs text-[#bbc7d4] disabled:opacity-40">Dismiss</button>
            </div>
          </div>)}
        </div>
        {movementCandidates.some(candidate => candidate.date.startsWith(month) && ignoredMovements[candidate.id]) && <div className="space-y-2 border-t border-[#273746] pt-3">
          <p className="text-xs text-[#8ca3b8]">Dismissed candidates</p>
          {movementCandidates.filter(candidate => candidate.date.startsWith(month) && ignoredMovements[candidate.id]).map(candidate =>
            <div key={candidate.id} className="flex items-center justify-between gap-2 text-xs text-[#93a9bc]">
              <span>{candidate.provider} · {money(candidate.amount)}</span>
              <button type="button" disabled={Boolean(closeSnapshot)} onClick={() => reopenCandidate(candidate)}
                className="rounded-md border border-[#394a5b] px-2 py-1 disabled:opacity-40">Restore</button>
            </div>)}
        </div>}
        {matchedMovements.length > 0 && <div className="border-t border-[#273746] pt-3">
          <p className="mb-2 text-xs font-semibold text-[#9cb6c8]">Confirmed movements ({matchedMovements.length})</p>
          <div className="space-y-1">{matchedMovements.map(item => <div key={item.id} className="flex justify-between gap-3 text-xs text-[#aabecf]">
            <span>{item.date} · {item.provider || "Transfer"} {item.type}</span>
            <span>{money(item.amount)}{item.feeUsd ? " + " + money(item.feeUsd) + " fee" : ""}</span>
          </div>)}</div>
        </div>}
      </section>
      <section className={card + " p-4 sm:p-5"}>
        <h2 className="text-base font-semibold">Balance movement check</h2>
        <p className="mt-2 text-xs text-[#91a6b7]">Compares the observed change in each account with recorded income and confirmed movements. Differences can reflect opening balances, stale snapshots, withdrawals, transfers, fees, or changing crypto prices; they are not auto-posted.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-xs">
            <thead><tr className="border-b border-[#34495b] text-left text-[#9bb0c4]">
              <th className="pb-2">Asset</th><th className="pb-2 text-right">Balance change</th>
              <th className="pb-2 text-right">Earned</th><th className="pb-2 text-right">Transfers</th>
              <th className="pb-2 text-right">Unexplained</th>
            </tr></thead>
            <tbody>{reconciliation.map(item => <tr key={item.account} className="border-b border-[#223141]">
              <td className="py-2 font-medium">{item.name}{item.valuationSensitive ? <span className="ml-1 text-[#718fa4]">· Market priced</span> : null}</td>
              <td className="py-2 text-right tabular-nums">{signed(item.delta)}</td>
              <td className="py-2 text-right tabular-nums">{money(item.estimatedIncome)}</td>
              <td className="py-2 text-right tabular-nums">{signed(item.transfers)}</td>
              <td className={"py-2 text-right tabular-nums " + (Math.abs(item.unexplained) >= 0.05 ? "text-amber-300" : "text-emerald-300")}>{signed(item.unexplained)}</td>
            </tr>)}</tbody>
          </table>
          {!reconciliation.length && <p className="py-3 text-sm text-[#849baa]">Not enough account balances are recorded to reconcile this month.</p>}
        </div>
      </section>
      <section className={card + " space-y-3 p-4 sm:p-5"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Month-end close · {monthTitle(month)}</h2>
          {closeSnapshot ? <span className="text-xs font-semibold text-emerald-300">Closed</span> :
            <span className="text-xs text-[#9bb0c4]">Open</span>}
        </div>
        {closeSnapshot ? <>
          <p className="text-xs text-[#91acbd]">Frozen on {new Date(closeSnapshot.closedAt).toLocaleString()}. Journal entries, income, balances and report totals will not change until you reopen the month.</p>
          <p className="text-xs text-[#b7c6d4]">At close: {closeSnapshot.exceptions?.pendingMovements || 0} pending transfers · {closeSnapshot.exceptions?.balanceDifferences || 0} unexplained balance changes · {closeSnapshot.exceptions?.unpostedEquipment || 0} hardware purchases pending</p>
          <button type="button" onClick={reopenSelectedMonth} className="rounded-lg border border-amber-500/30 px-4 py-2 text-sm font-semibold text-amber-300">Reopen month</button>
        </> : <>
          <p className="text-xs text-[#91acbd]">After the month ends, review all transactions and balances, then freeze a copy of the reports. The original trackers and transactions are never deleted.</p>
          {month >= getCurrentMonthKey() ? <p className="text-sm text-[#87b9d4]">The current month stays open while mining income grows.</p> :
            <button type="button" onClick={() => { setMonthClosePrompt(month); setMonthCloseAcknowledged(false); }}
              className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-[#071710]">Review & close month</button>}
          {monthClosePrompt === month && month < getCurrentMonthKey() && <div className="space-y-3 rounded-lg border border-amber-500/25 bg-[#1a1c23] p-4">
            <p className="text-sm font-semibold">Freeze the {monthTitle(month)} reporting snapshot?</p>
            <p className="text-xs text-[#acb9c7]">Unresolved: {unresolvedMovements.length} movement candidates; {unpostedEquipment.length} hardware purchase records; {reconciliation.filter(item => Math.abs(item.unexplained) >= 0.05).length} balance differences. Closing preserves these exceptions for later review.</p>
            <label className="flex items-start gap-2 text-xs text-[#c2d0db]">
              <input type="checkbox" checked={monthCloseAcknowledged} onChange={event => setMonthCloseAcknowledged(event.target.checked)}/>
              I reviewed these exceptions and want to freeze this report.
            </label>
            <div className="flex gap-2"><button type="button" onClick={() => setMonthClosePrompt(null)}
              className="rounded-lg border border-[#445566] px-3 py-2 text-xs">Cancel</button>
              <button type="button" disabled={!monthCloseAcknowledged} onClick={closeSelectedMonth}
                className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-[#05190f] disabled:opacity-40">Close month</button></div>
          </div>}
        </>}
      </section>
    </>}
    {tab === "ledger" && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">General Ledger</h2></div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={Boolean(closeSnapshot)} onClick={() => { setQuickModalOpen(true); setQuickStatus(""); setQuickError(""); }}
          className="inline-flex items-center gap-2 rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-400/20 disabled:opacity-40">
          <Sparkles size={16}/> Describe Transaction
        </button>
        {unpostedEquipment.length > 0 && <button type="button" disabled={Boolean(closeSnapshot)} onClick={() => reviewEquipmentPurchase(unpostedEquipment[0])}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-300 disabled:opacity-40">
          Review purchase ({unpostedEquipment.length})
        </button>}
        <button disabled={Boolean(closeSnapshot)} onClick={() => { setDraft({ ...emptyDraft(), date: month+"-01" }); setError(""); setModal(true); }}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300 disabled:opacity-40"><Plus size={16}/> Add entry</button>
      </div></div>
      {closeSnapshot && <p className="text-xs text-amber-300">This month is closed and frozen. Reopen it in Reconcile to post or edit transactions.</p>}
      {quickStatus && <p role="status" className="text-sm text-emerald-400">{quickStatus}</p>}
      {syncedIncomeJournal.unexplainedManualRevenue > 0 && <p role="status" className="text-sm text-amber-300">
        Manual revenue exceeds Crypto Income by {money(syncedIncomeJournal.unexplainedManualRevenue)} this month. Review for duplicates or missing earnings.
      </p>}
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
    {movementReview && <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/75 p-3 sm:p-5"
      onMouseDown={event => { if (event.target === event.currentTarget) setMovementReview(null); }}>
      <section className={card + " w-full max-w-lg space-y-3 p-5 shadow-2xl"} role="dialog" aria-modal="true" aria-label="Review transfer or fee">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Review {["fee", "transaction_fee", "network_fee"].includes(movementReview.type) ? "fee" : "transfer"}</h2>
          <button type="button" onClick={() => setMovementReview(null)} aria-label="Close review"><X size={19}/></button>
        </div>
        <p className="text-xs text-[#9bb0c3]">{movementReview.provider} · {movementReview.issue}</p>
        {movementReview.bankSource && <p className="text-xs text-amber-300">Bank data may include personal finances. Approve only if this relates to your mining business.</p>}
        {movementReviewError && <p role="alert" className="text-sm text-rose-400">{movementReviewError}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-[#a9becf]">Date
            <input type="date" value={movementReview.date} className={field}
              onChange={event => setMovementReview(prev => ({...prev,date:event.target.value}))}/></label>
          <label className="space-y-1 text-xs text-[#a9becf]">{["fee", "transaction_fee", "network_fee"].includes(movementReview.type) ? "Fee amount (USD)" : "Transferred amount (USD)"}
            <input type="number" min="0.01" step="0.01" value={movementReview.amount} className={field}
              onChange={event => setMovementReview(prev => ({...prev,amount:event.target.value}))}/></label>
          <label className="space-y-1 text-xs text-[#a9becf]">From account / Paid by
            <select className={field} value={movementReview.from || ""}
              onChange={event => setMovementReview(prev => ({...prev,from:event.target.value}))}>
              <option value="">Choose account</option>
              {ACCOUNT_OPTIONS.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select></label>
          {!["fee", "transaction_fee", "network_fee"].includes(movementReview.type) && <>
            <label className="space-y-1 text-xs text-[#a9becf]">To account
              <select className={field} value={movementReview.to || ""}
                onChange={event => setMovementReview(prev => ({...prev,to:event.target.value}))}>
                <option value="">Choose account</option>
                {ACCOUNT_OPTIONS.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select></label>
            <label className="space-y-1 text-xs text-[#a9becf]">Additional transfer fee (USD)
              <input type="number" min="0" step="0.01" value={movementReview.feeUsd ?? 0} className={field}
                onChange={event => setMovementReview(prev => ({...prev,feeUsd:event.target.value}))}/></label>
          </>}
        </div>
        <p className="text-xs text-[#91a6b8]">Only confirmed account movements and fees are posted. The source transaction ID prevents repeat imports. This is not additional mining income.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setMovementReview(null)}
            className="rounded-lg border border-[#415367] px-3 py-2 text-xs">Cancel</button>
          <button type="button" onClick={postReviewedMovement}
            className="rounded-lg bg-emerald-400 px-4 py-2 text-xs font-semibold text-[#071a12]">Confirm & record</button>
        </div>
      </section>
    </div>}
    {quickModalOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/75 p-3 sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) setQuickModalOpen(false); }}>
      <section className={card + " w-full max-w-2xl space-y-4 overflow-y-auto p-4 shadow-2xl sm:p-6"} data-testid="transaction-chat" role="dialog" aria-modal="true" aria-label="Describe a transaction">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Sparkles size={17} className="text-cyan-400"/>
            <h3 className="text-base font-semibold">Describe a transaction</h3></div>
          <button type="button" aria-label="Close transaction popup" onClick={() => setQuickModalOpen(false)}
            className="rounded-lg border border-[#34495c] p-2 text-[#a7bacb] hover:bg-white/[0.06] hover:text-white"><X size={17}/></button>
        </div>
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
    </div>}
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
        <p className="text-xs text-[#91a7b9]">Confirm the actual transaction date and payment account. Hardware Payback doesn't record how the purchase was funded. Don't post purchases twice.</p>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <div className="flex gap-2"><button type="button" onClick={()=>setModal(false)} className="rounded-lg border border-[#384d5d] px-4 py-2">Cancel</button>
          <button type="submit" className="flex-1 rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-[#071710]">Post entry</button></div>
      </form>
    </div>}
  </div>;
}
