import { Fragment, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Coins, Pencil, Plus, Send, Sparkles, Trash2, TrendingUp, Wallet, X } from "lucide-react";
import { remoteStorage, subscribe } from "@/lib/serverStore";
import { financialLiveBalances as liveBalances } from "@/lib/financialAssetsSnapshot";
import {
  readUnetworkPhones, readPhoneInventory, makePhoneAsset, phoneJournal, phoneAssetRows,
  UNETWORK_PHONES_KEY,
} from "@/lib/unetworkPhonesAccounting";
import { api, settingsApi } from "@/lib/apiClient";
import { useBackendMonthlyIncome } from "@/hooks/useBackendMonthlyIncome";
import { mergeBackendLoopscaleHistory } from "@/lib/mergeBackendLoopscaleHistory";
import { mergeManualIncome } from "@/lib/manualIncomeHistory";
import { buildIncomeHistory, legacyProjectIncome, reconcileLuloIncome } from "@/lib/incomeHistory";
import { STOCK_DIVIDEND_PAYOUTS_KEY } from "@/lib/stockDividendPayouts";
import { buildAutoIncomeJournal } from "@/lib/financialAutoJournal";
import { movementJournal, resolveFinancialAccount } from "@/lib/financialMovements";
import {
  balanceAliasKey, balanceAccountId, balanceDisplayName, chartDisplayName,
  cleanAccountLabels, equipmentEntryDisplayName, journalDisplayDescription,
} from "@/lib/financialAccountNames";
import {
  buildFinancialBalanceRows, includeJournalEquipment, unmatchedEquipmentPurchases,
  buildStatementRows, buildFinancialProfit,
  classifyCashFlows, journalAccountActivity, deriveCashOpening, derivePayableOpening,
  moneyRound, valueOrNull, reclassifyPersonalPcContribution,
} from "@/lib/financialAccounting";
import { hasFreeMiningPower, outOfPocketMiningPowerCost } from "@/lib/powerOutOfPocket";

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
const MONTH_CLOSE_KEY = "financials_month_closes_v1";
const BANK_OPENINGS_KEY = "financials_bank_openings_v1";
const FINANCIAL_LABELS_KEY = "financials_account_labels_v1";
const DEFAULT_POWER_SETTINGS = { basicRate: 0.1691, offPeakRate: 0.0893, midPeakRate: 0.1670, peakRate: 0.4313 };
function readHardwareRegister() {
  const rows = readJson(HARDWARE_KEY, []);
  return Array.isArray(rows) ? rows.filter(row => Number(row?.cost) > 0 && /^\d{4}-\d{2}$/.test(String(row.startMonth))) : [];
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
function readJson(key, fallback) {
  try { const value = JSON.parse(remoteStorage.getItem(key) || "null"); return value ?? fallback; }
  catch { return fallback; }
}
const rounded = value => Math.round((Number(value) || 0) * 100) / 100;
const money = value => value === null ? "—" : formatCurrency(value);
const signed = value => value === null ? "—" : (value > 0 ? "+" : value < 0 ? "−" : "") + money(Math.abs(value));
function shift(month, delta) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 15)).toISOString().slice(0, 7);
}
function monthTitle(month) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(month + "-15T12:00:00Z"));
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
const emptyDraft = () => ({ date: getTodayKey(), description: "", debitAccount: "cash", creditAccount: "revenue", amount: "" });
const line = (account, debit, credit) => ({ account, debit: rounded(debit), credit: rounded(credit) });
const validLedgerDate = raw => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return false;
  const value = new Date(String(raw) + "T12:00:00Z");
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === raw;
};

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
  let date = month === getCurrentMonthKey()
    ? getTodayKey()
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
  const personallyFunded = /\b(?:personal(?:ly)?|my own|own money|owner(?:'s)?)\b/.test(phrase);
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
    creditAccount = unpaid ? "payable" : personallyFunded ? "equity" : fromCrypto ? "crypto" : "cash";
    explanation = personallyFunded
      ? "Personally funded equipment is an owner contribution, not a business bank withdrawal."
      : "Record a capital equipment purchase, not an operating expense.";
  } else if (/transaction fee|network fee|processing fee|bank fee/.test(phrase) && paid) {
    debitAccount = "fees";
    creditAccount = unpaid ? "payable" : fromCrypto ? "crypto" : "cash";
    explanation = "Record a transaction or network fee.";
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
  const [businessPhones, setBusinessPhones] = useState(readUnetworkPhones);
  const [phoneInventory, setPhoneInventory] = useState(readPhoneInventory);
  const [phoneModal, setPhoneModal] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [phoneDraft, setPhoneDraft] = useState({
    inventoryId:"",name:"",purchaseDate:"",
    businessDate:"",businessValue:"",fundingAccount:"equity",
  });
  const [powerEstimates, setPowerEstimates] = useState(() => readJson(POWER_ESTIMATE_KEY, {}));
  const [confirmedMovements, setConfirmedMovements] = useState(() => readJson(CONFIRMED_MOVEMENTS_KEY, {}));
  const [closedMonths, setClosedMonths] = useState(() => readJson(MONTH_CLOSE_KEY, {}));
  const [bankOpenings, setBankOpenings] = useState(() => readJson(BANK_OPENINGS_KEY, {}));
  const [bankOpeningDraft, setBankOpeningDraft] = useState("");
  const [accountLabels, setAccountLabels] = useState(() =>
    cleanAccountLabels(readJson(FINANCIAL_LABELS_KEY, {})));
  const [renaming, setRenaming] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState("");
  const [showOtherLabels, setShowOtherLabels] = useState(false);
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
    setBusinessPhones(readUnetworkPhones());
    setPhoneInventory(readPhoneInventory());
    setPowerEstimates(readJson(POWER_ESTIMATE_KEY, {}));
    setConfirmedMovements(readJson(CONFIRMED_MOVEMENTS_KEY, {}));
    setClosedMonths(readJson(MONTH_CLOSE_KEY, {}));
    setBankOpenings(readJson(BANK_OPENINGS_KEY, {}));
    setAccountLabels(cleanAccountLabels(readJson(FINANCIAL_LABELS_KEY, {})));
    setCryptoIncome(current => ({
      ...readCryptoIncomeSources(), manualIncome: current.manualIncome,
      luloBackfills: current.luloBackfills,
    }));
  }), []);
  useEffect(() => {
    const correctOwnerFundedPc = () => {
      const current = readJson(JOURNAL_KEY, []);
      const result = reclassifyPersonalPcContribution(current);
      if (!result.changed) return;
      // Same ID, amount and date: only change the original credit account.
      remoteStorage.setItem(JOURNAL_KEY, JSON.stringify(result.entries));
      setJournal(result.entries);
    };
    correctOwnerFundedPc();
    // Also apply after the server store hydrates, if it was initially empty.
    return subscribe(correctOwnerFundedPc);
  }, []);
  useEffect(() => {
    const direct = valueOrNull(bankOpenings[month]);
    setBankOpeningDraft(direct === null ? "" : String(direct));
  }, [month, bankOpenings]);
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
  // Captured/observed balances must be kept separate from income journal
  // movements or mining revenue would be added to assets twice.
  const baseRows = useMemo(() => includeJournalEquipment(
    [
      ...buildFinancialBalanceRows(month,records,live,hardwareDevices,getCurrentMonthKey()),
      ...(records[month]?.locked ? [] : phoneAssetRows(businessPhones,month)),
    ],
    journal,month,Boolean(records[month]?.locked),
  ),[month,records,live,hardwareDevices,journal,businessPhones]);
  const recorded = records[month] || {};
  const syncedRevenue = closeSnapshot?.incomeMonth || incomeMonths.find(entry => entry.monthKey === month);
  const savedExpenses = valueOrNull(recorded.expenses);
  const ledgerEntries = closeSnapshot?.manualEntries ||
    journal.filter(entry => String(entry.date).slice(0, 7) === month);
  // Previously confirmed transfers remain intact, but new transfers are
  // recorded only when the user explicitly enters them in General Ledger.
  const matchedMovements = Object.values(confirmedMovements)
    .filter(row => String(row?.date || "").startsWith(month));
  const alreadyPostedIds = new Set(ledgerEntries.filter(entry => entry.movementSourceId)
    .map(entry => entry.movementSourceId));
  const syncedMovementEntries = movementJournal(matchedMovements, month, alreadyPostedIds)
    .filter(entry => !ledgerEntries.some(manual =>
      manual.date === entry.date &&
      Math.abs(Number(manual.amount) - Number(entry.lines[0]?.debit)) <= 0.005 &&
      manual.debitAccount === entry.lines[0]?.account &&
      manual.creditAccount === entry.lines[1]?.account));
  const unpostedEquipment = unmatchedEquipmentPurchases(baseRows,ledgerEntries,month);
  const syncedIncomeJournal = useMemo(() => buildAutoIncomeJournal(
    month, syncedRevenue, ledgerEntries, getCurrentMonthKey(), getTodayKey(),
  ), [month, syncedRevenue, ledgerEntries]);
  const electricityCovered = hasFreeMiningPower(month);
  const estimatedPower = valueOrNull(powerEstimates[month]?.cost);
  const hasActualPower = ledgerEntries.some(entry => entry.debitAccount === "electric");
  // No automatic electricity expense is generated while power is supplied free.
  const autoPower = closeSnapshot ? closeSnapshot.autoPower :
    electricityCovered || hasActualPower || (savedExpenses !== null && savedExpenses > 0) ||
      estimatedPower === null ? 0 : outOfPocketMiningPowerCost(estimatedPower, month);
  const manualEntries = ledgerEntries.map(entry => ({
    ...entry, lines: [line(entry.debitAccount, entry.amount, 0), line(entry.creditAccount, 0, entry.amount)],
  }));
  const scheduledDepreciation = moneyRound(baseRows.filter(row=>row.category==="equipment")
    .reduce((sum,row)=>sum+Number(row.depreciation||0),0));
  const manualDepreciation = moneyRound(ledgerEntries.filter(entry=>entry.debitAccount==="depreciation")
    .reduce((sum,entry)=>sum+Number(entry.amount||0),0));
  const autoDepreciation = Math.max(0,moneyRound(scheduledDepreciation-manualDepreciation));
  const generatedEntries = [
    ...syncedIncomeJournal.entries,
    ...syncedMovementEntries,
    ...(autoDepreciation > 0 ? [{
      id: "auto-depreciation:" + month, date: month + "-28",
      description: "Monthly equipment depreciation",
      lines: [line("depreciation", autoDepreciation, 0), line("accDep", 0, autoDepreciation)],
      automatic: true,
    }] : []),
    ...(autoPower > 0 ? [{
      id: "auto-power-estimate:" + month, date: month + "-28",
      description: "Estimated mining electricity — not a confirmed payment",
      lines: [line("electric",autoPower,0),line("payable",0,autoPower)],
      automatic:true,estimated:true,
    }] : []),
  ];
  const entries = closeSnapshot?.entries ||
    [...manualEntries, ...generatedEntries].sort((a,b)=>a.date.localeCompare(b.date));
  const report = buildFinancialProfit(entries,savedExpenses);
  const incomeKnown = Boolean(syncedRevenue) ||
    ledgerEntries.some(entry=>["revenue","dividendRevenue"].includes(entry.creditAccount));
  const pnlRevenue = closeSnapshot ? closeSnapshot.revenue : incomeKnown ? report.revenue : null;
  const expenses = closeSnapshot ? closeSnapshot.expenses : report.expenses;
  const operatingExpense = closeSnapshot ? Math.max(0,moneyRound(expenses-report.fees-autoPower)) : report.operating;
  const feeExpense = report.fees;
  const fixedDep = closeSnapshot ? closeSnapshot.fixedDep : report.depreciation;
  const pnlProfit = closeSnapshot ? closeSnapshot.pnlProfit :
    pnlRevenue === null ? null : moneyRound(pnlRevenue - expenses - fixedDep);

  // A bank payment really reduces Cash / Bank. If no opening bank balance
  // was provided, display its journal movement without fabricating an ending.
  const cashOpening = deriveCashOpening(month,bankOpenings,journal,Object.values(confirmedMovements));
  const rows = closeSnapshot?.rows || buildStatementRows(baseRows,entries,
    {cashOpening,payableOpening:derivePayableOpening(month,journal)});
  const sections = categories.map(category => ({
    ...category,rows:rows.filter(row=>row.category===category.id),
  }));
  const total = (field,type) => {
    const relevant = rows.filter(row =>
      type==="assets" ? row.category!=="liabilities" : row.category==="liabilities");
    return relevant.some(row=>row[field]===null) ? null :
      moneyRound(relevant.reduce((sum,row)=>sum+Number(row[field]||0),0));
  };
  const assetsStart = total("start","assets");
  const assetsEnd = total("end","assets");
  const debtStart = total("start","debts");
  const debtEnd = total("end","debts");
  const netStart = assetsStart===null || debtStart===null ? null : moneyRound(assetsStart-debtStart);
  const netEnd = assetsEnd===null || debtEnd===null ? null : moneyRound(assetsEnd-debtEnd);
  const netChange = netStart===null || netEnd===null ? null : moneyRound(netEnd-netStart);
  const missingAssetCount = rows.filter(row=>row.category!=="liabilities" && row.end===null).length;
  const knownAssetsSubtotal = moneyRound(rows.filter(row=>row.category!=="liabilities" && row.end!==null)
    .reduce((sum,row)=>sum+Number(row.end||0),0));
  const bankRow = rows.find(row=>row.id==="ledger:cash" || /^(cash\s*\/?\s*bank|bank|checking|business\s+cash|cash)$/i.test(row.name));
  const debitTotal = moneyRound(entries.reduce((sum,entry)=>sum+
    (entry.lines||[]).reduce((n,part)=>n+Number(part.debit||0),0),0));
  const creditTotal = moneyRound(entries.reduce((sum,entry)=>sum+
    (entry.lines||[]).reduce((n,part)=>n+Number(part.credit||0),0),0));
  // Roll forward recorded journal activity from the start of tracking.
  // This includes previous earning accruals and depreciation, but opening
  // external account balances are still not invented.
  const cumulativeEntries = useMemo(() => {
    const all=[];
    const phoneStart=businessPhones.map(item=>item.startMonth).filter(Boolean).sort()[0];
    const journalStart=journal.map(item=>String(item.date||"").slice(0,7)).filter(item=>/^\d{4}-\d{2}$/.test(item)).sort()[0];
    const firstMonth=[phoneStart,journalStart,"2026-09"].filter(Boolean).sort()[0];
    for(let key=firstMonth, n=0; key<=month && n<240; key=shift(key,1),n++) {
      if(key===month) {all.push(...entries);continue;}
      if(closedMonths[key]?.entries) {all.push(...closedMonths[key].entries);continue;}
      const periodManual=journal.filter(item=>String(item.date||"").startsWith(key));
      const manualLines=periodManual.map(item=>({
        ...item,lines:[line(item.debitAccount,item.amount,0),line(item.creditAccount,0,item.amount)],
      }));
      const recordedIncome=incomeMonths.find(item=>item.monthKey===key);
      const income=buildAutoIncomeJournal(key,recordedIncome,periodManual,getCurrentMonthKey(),getTodayKey());
      const historicalHardware=includeJournalEquipment(
        [
          ...buildFinancialBalanceRows(key,records,{},hardwareDevices,getCurrentMonthKey()),
          ...(records[key]?.locked ? [] : phoneAssetRows(businessPhones,key)),
        ],
        journal,key,Boolean(records[key]?.locked));
      const scheduled=moneyRound(historicalHardware.filter(item=>item.category==="equipment")
        .reduce((sum,item)=>sum+Number(item.depreciation||0),0));
      const previouslyPostedDep=moneyRound(periodManual.filter(item=>item.debitAccount==="depreciation")
        .reduce((sum,item)=>sum+Number(item.amount||0),0));
      const extraDep=Math.max(0,moneyRound(scheduled-previouslyPostedDep));
      const already=new Set(periodManual.filter(item=>item.movementSourceId).map(item=>item.movementSourceId));
      const knownMovements=movementJournal(Object.values(confirmedMovements)
        .filter(item=>String(item.date||"").startsWith(key)),key,already)
        .filter(item=>!periodManual.some(manual=>manual.date===item.date &&
          Math.abs(Number(manual.amount)-Number(item.lines[0]?.debit))<.005 &&
          manual.debitAccount===item.lines[0]?.account &&
          manual.creditAccount===item.lines[1]?.account));
      all.push(...manualLines,...income.entries,...knownMovements);
      if(extraDep) all.push({id:"auto-depreciation:"+key,date:key+"-28",
        description:"Monthly equipment depreciation",automatic:true,
        lines:[line("depreciation",extraDep,0),line("accDep",0,extraDep)]});
    }
    return all;
  },[month,entries,closedMonths,journal,incomeMonths,hardwareDevices,businessPhones,records,confirmedMovements]);
  const trial = accounts.map(account=>{
    const activity = journalAccountActivity(cumulativeEntries,account.id);
    return {...account,debit:Math.max(0,activity),credit:Math.max(0,-activity)};
  }).filter(account=>account.debit||account.credit);
  const trialDebit = moneyRound(trial.reduce((sum,row)=>sum+row.debit,0));
  const trialCredit = moneyRound(trial.reduce((sum,row)=>sum+row.credit,0));
  const cashFlow = classifyCashFlows(entries);
  const cashEvents = Object.values(cashFlow.sections).flat();
  const cashIn = moneyRound(cashEvents.filter(entry=>entry.delta>0)
    .reduce((sum,entry)=>sum+entry.delta,0));
  const cashOut = moneyRound(-cashEvents.filter(entry=>entry.delta<0)
    .reduce((sum,entry)=>sum+entry.delta,0));
  const openPhoneEditor = () => {
    setPhoneError("");
    setPhoneDraft({inventoryId:"",name:"",purchaseDate:"",
      businessDate:"",businessValue:"",fundingAccount:"equity"});
    setPhoneModal(true);
  };
  const setPhoneInventoryChoice = id => {
    const original=phoneInventory.find(item=>String(item.id)===String(id));
    setPhoneDraft(current=>({
      ...current,inventoryId:id,
      name:original ? String(original.model||original.name||"").trim() : current.name,
    }));
  };
  const addPhoneToFinancials = event => {
    event.preventDefault();
    const id=typeof crypto!=="undefined" && typeof crypto.randomUUID==="function"
      ? crypto.randomUUID() : "phone-"+Date.now();
    try {
      const phone=makePhoneAsset(phoneDraft,id);
      const monthKey=phone.startMonth;
      if (records[monthKey]?.locked || closedMonths[monthKey]) {
        setPhoneError("The business-use month is locked or closed. Reopen it before adding equipment.");
        return;
      }
      if(phone.inventoryId && businessPhones.some(item=>item.inventoryId===phone.inventoryId)) {
        setPhoneError("This inventory phone is already recorded as business equipment.");
        return;
      }
      const updated=[...businessPhones,phone];
      const updatedJournal=[...journal,phoneJournal(phone)];
      remoteStorage.setItem(UNETWORK_PHONES_KEY,JSON.stringify(updated));
      remoteStorage.setItem(JOURNAL_KEY,JSON.stringify(updatedJournal));
      setBusinessPhones(updated);
      setJournal(updatedJournal);
      setPhoneModal(false);
      setMonth(getCurrentMonthKey());
    } catch (err) {
      setPhoneError(err.message||"Unable to add phone.");
    }
  };
  const removeBusinessPhone = phone => {
    if(records[phone.startMonth]?.locked || closedMonths[phone.startMonth]) {
      setPhoneError("Reopen the business-use month before deleting this phone.");
      return;
    }
    const updated=businessPhones.filter(item=>item.id!==phone.id);
    const updatedJournal=journal.filter(entry=>entry.id!==phone.journalId);
    remoteStorage.setItem(UNETWORK_PHONES_KEY,JSON.stringify(updated));
    remoteStorage.setItem(JOURNAL_KEY,JSON.stringify(updatedJournal));
    setBusinessPhones(updated);
    setJournal(updatedJournal);
    setPhoneError("");
  };
  const saveBankOpening = event => {
    event.preventDefault();
    if (closeSnapshot) return;
    const value = valueOrNull(bankOpeningDraft);
    if (value === null || value < 0) {
      setError("Enter a valid non-negative starting bank balance.");
      return;
    }
    const updated = {...bankOpenings,[month]:moneyRound(value)};
    remoteStorage.setItem(BANK_OPENINGS_KEY,JSON.stringify(updated));
    setBankOpenings(updated);
    setError("");
  };
  const saveEntry = event => {
    event.preventDefault();
    if (closedMonths[String(draft.date).slice(0, 7)]) {
      setError("This reporting month is closed. Reopen it from General Ledger before editing.");
      return;
    }
    const value = Number(draft.amount);
    if (!draft.description.trim() || !validLedgerDate(draft.date) ||
      !Number.isFinite(value) || value <= 0 ||
      !accounts.some(row=>row.id===draft.debitAccount) ||
      !accounts.some(row=>row.id===draft.creditAccount) ||
      draft.debitAccount === draft.creditAccount) {
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
    if (!quickEntry.description.trim() || !validLedgerDate(quickEntry.date) ||
      !Number.isFinite(quickEntry.amount) || quickEntry.amount <= 0 ||
      !accounts.some(row=>row.id===quickEntry.debitAccount) ||
      !accounts.some(row=>row.id===quickEntry.creditAccount) ||
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
      creditAccount: "",
      amount: String(device.historicalCost || device.cost),
    });
    setTab("ledger");
    setError("");
    setModal(true);
  };
  const deleteEntry = id => {
    const original = journal.find(entry => entry.id === id);
    if (original && closedMonths[String(original.date).slice(0, 7)]) {
      setTab("ledger");
      return;
    }
    const updated = journal.filter(entry => entry.id !== id);
    remoteStorage.setItem(JOURNAL_KEY, JSON.stringify(updated));
    setJournal(updated);
  };
  const reopenSelectedMonth = () => {
    if (!closedMonths[month]) return;
    const updated = {...closedMonths};
    delete updated[month];
    remoteStorage.setItem(MONTH_CLOSE_KEY, JSON.stringify(updated));
    setClosedMonths(updated);
  };
  const editRowName = row => {
    const aliasKey=balanceAliasKey(row);
    if (!aliasKey) return;
    setRenameError("");
    setRenameDraft(balanceDisplayName(row,accountLabels));
    setRenaming({ key:aliasKey, original:row.name, accountId:balanceAccountId(row),
      isEquipment:row.category==="equipment" });
  };
  const editChartName = account => {
    setRenameError("");
    setRenameDraft(chartDisplayName(account,accountLabels));
    setRenaming({key:"account:"+account.id,original:account.name,accountId:account.id});
  };
  const saveAccountName = event => {
    event.preventDefault();
    if (!renaming) return;
    const name=renameDraft.trim().replace(/\s+/g," ");
    if (!name || name.length>80) {
      setRenameError("Enter a name between 1 and 80 characters.");
      return;
    }
    const updated={...accountLabels,[renaming.key]:name};
    if (name === renaming.original) delete updated[renaming.key];
    const cleaned=cleanAccountLabels(updated);
    remoteStorage.setItem(FINANCIAL_LABELS_KEY,JSON.stringify(cleaned));
    setAccountLabels(cleaned);
    setRenaming(null);
    setRenameError("");
  };
  const tabs = [
    { id: "balance", name: "Balance Sheet", Icon: Wallet },
    { id: "ledger", name: "General Ledger", Icon: BookOpen },
    { id: "trial", name: "Trial Balance", Icon: ClipboardList },
    { id: "income", name: "Income Statement", Icon: TrendingUp },
    { id: "cash", name: "Cash Flow", Icon: Coins },
  ];
  const accountName = account => chartDisplayName(account,accountLabels);
  const accountNameById = id => {
    const account=accounts.find(row=>row.id===id);
    return account ? accountName(account) : id;
  };
  const ledgerAccountName = (entry,item) => {
    if(item.account==="equipment") {
      const specific=equipmentEntryDisplayName(entry,rows,accountLabels);
      if(specific) return specific;
    }
    const account=accounts.find(row=>row.id===item.account);
    return account ? accountName(account) : item.account;
  };
  const transactionTitle = entry => journalDisplayDescription(entry,rows,accountLabels);
  const metric = (title, value, note, color = "text-white") => <section className={card + " min-w-0 p-4"}>
    <p className="text-xs text-[#9db0c1]">{title}</p>
    <strong className={"mt-2 block text-2xl font-bold tabular-nums " + color}>{money(value)}</strong>
    {note && <p className="mt-2 text-xs text-[#7f94a8]">{note}</p>}
  </section>;
  const tableHeader = <thead><tr className="border-b border-[#314454] text-left text-[11px] uppercase tracking-wider text-[#9bafc1]">
    <th className="pb-3">Account</th><th className="pb-3 text-right">Start</th><th className="pb-3 text-right">Change</th><th className="pb-3 text-right">End</th>
  </tr></thead>;
  return <div className="min-w-0 space-y-4 pb-8 text-white" data-testid="financials-page">
    <div className="flex min-w-0 items-center gap-3">
      <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-2xl border border-[#242b33] bg-[#0d1014] p-2 [scrollbar-width:none]"
        aria-label="Financials sections">
        {tabs.map(({ id, name, Icon }) => <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
          className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs transition-colors ${tab === id ? "border border-sky-400/70 bg-[#182633] font-semibold text-white" : "border border-transparent text-[#9dafc0] hover:bg-white/[0.04] hover:text-white"}`}>
          <Icon size={15}/>{name}
        </button>)}
      </nav>
      <div className="flex shrink-0 items-center gap-1 rounded-xl border border-[#344657] bg-[#101821] p-1">
        <button type="button" disabled={month <= "2026-01"} onClick={() => setMonth(current => shift(current, -1))}
          className="rounded-lg p-2 text-[#cedbe7] disabled:opacity-30" aria-label="Previous month"><ChevronLeft size={18}/></button>
        <CalendarDays size={15} className="hidden text-sky-400 sm:block"/>
        <select aria-label="Report month" value={month} onChange={event => setMonth(event.target.value)}
          className="max-w-[112px] bg-[#101821] px-1 py-2 text-xs font-semibold text-white [color-scheme:dark] sm:max-w-none sm:text-sm">
          {Array.from({length: (Number(getCurrentMonthKey().slice(0, 4)) - 2026) * 12 + Number(getCurrentMonthKey().slice(5))}, (_, index) =>
            shift(getCurrentMonthKey(), -index)).map(key => <option key={key} value={key}>{monthTitle(key)}</option>)}
        </select>
        <button type="button" disabled={month >= getCurrentMonthKey()} onClick={() => setMonth(current => shift(current, 1))}
          className="rounded-lg p-2 text-[#cedbe7] disabled:opacity-30" aria-label="Next month"><ChevronRight size={18}/></button>
      </div>
    </div>
    {tab === "balance" && <>
      <div className="grid gap-3 sm:grid-cols-3">
        {metric("Total Assets", assetsEnd, assetsEnd===null?"Some account balances are unverified":null, "text-sky-300")}
        {metric("Total Liabilities", debtEnd)}
        {metric("Owner's Equity / Net Worth", netEnd, netEnd===null?"Incomplete until missing balances are supplied":null, "text-emerald-400")}
      </div>
      {missingAssetCount > 0 && <p className="text-xs text-amber-300">
        Known asset subtotal: {money(knownAssetsSubtotal)}. {missingAssetCount} account(s) have unknown ending balances and are excluded from this partial subtotal.
      </p>}
      {bankRow && <section className={card + " space-y-3 p-4"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{accountNameById("cash")}</p>
            <p className="mt-1 text-xs text-[#91a7b9]">
              Recorded bank movement this month: <strong className="text-white">{signed(bankRow.journalChange ?? journalAccountActivity(entries,"cash"))}</strong>.
              {bankRow.unverifiedOpening ? " Opening balance not provided; ending cash and total net worth remain incomplete." :
                bankRow.end !== null && bankRow.end < 0 ? " Negative computed bank balance—verify the opening cash or overdraft." :
                bankRow.unreconciledCash ? " The saved ending balance differs from recorded bank transactions; verify it." :
                " Bank transactions are included in the displayed balance."}
            </p>
          </div>
          <div className="text-right text-xs text-[#9db2c6]">Ending bank balance
            <p className="mt-1 text-base font-semibold text-white">{money(bankRow.end)}</p>
          </div>
        </div>
        {!closeSnapshot && <form onSubmit={saveBankOpening} className="flex flex-wrap items-end gap-2">
          <label className="min-w-[180px] flex-1 space-y-1 text-xs text-[#a3b8c9]">
            Opening bank balance for {monthTitle(month)}
            <input className={field} type="number" min="0" step="0.01" value={bankOpeningDraft}
              placeholder="Enter opening balance"
              onChange={event=>setBankOpeningDraft(event.target.value)}/>
          </label>
          <button type="submit" className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-300">Save opening balance</button>
        </form>}
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        {valueOrNull(bankOpenings[month]) === null && cashOpening !== null &&
          <p className="text-xs text-sky-300">Starting balance carried forward from an earlier month: {money(cashOpening)}. Enter an amount above only to override it.</p>}
        <p className="text-[11px] text-[#8299aa]">This is a manually tracked bank ledger, not a bank connection. Only business-related transactions recorded here are reflected. Do not enter a personal account's entire balance unless you intend to track that account.</p>
      </section>}
      <section className={card + " overflow-hidden p-4 sm:p-6"}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{monthTitle(month)} Balance Sheet</h2>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[540px] border-collapse text-sm">
          {tableHeader}<tbody>
            {sections.map(section => <Fragment key={section.id}>
              <tr className="bg-[#142333]"><th colSpan={4} className="px-2 py-2 text-left text-xs uppercase tracking-wider text-sky-300">{section.name}</th></tr>
              {section.rows.map(row => <tr key={row.id} className="border-b border-[#202f3c]">
                <td className="py-2.5 pl-2">
                  <div className="flex items-center gap-2">
                    <span>{balanceDisplayName(row,accountLabels)}</span>
                    <button type="button" aria-label={"Rename "+balanceDisplayName(row,accountLabels)}
                      title="Rename account throughout Financials"
                      onClick={()=>editRowName(row)} className="rounded p-1 text-[#738b9d] hover:bg-sky-400/10 hover:text-sky-300">
                      <Pencil size={13}/>
                    </button>
                  </div>{row.unverifiedOpening ? <span className="ml-2 text-xs text-amber-300">(opening unknown)</span> : null}</td>
                <td className="py-2.5 text-right tabular-nums">{money(row.start)}</td>
                <td className={`py-2.5 text-right tabular-nums ${row.start !== null && row.end !== null && row.end < row.start ? "text-rose-400" : "text-emerald-400"}`}>{row.start === null || row.end === null ? (row.journalChange != null ? signed(row.journalChange) : "—") : signed(rounded(row.end-row.start))}</td>
                <td className="py-2.5 text-right font-semibold tabular-nums">{money(row.end)}</td>
              </tr>)}
              {!section.rows.length && <tr><td colSpan={4} className="px-2 py-2 text-xs text-[#72889a]">No accounts</td></tr>}
            </Fragment>)}
            <tr className="border-t-2 border-sky-500 font-bold"><td className="py-3">NET WORTH</td><td className="text-right">{money(netStart)}</td>
              <td className="text-right">{signed(netChange)}</td><td className="text-right text-emerald-400">{money(netEnd)}</td></tr>
          </tbody>
        </table></div>
      </section>
      {businessPhones.length > 0 && <section className={card + " space-y-3 p-4 sm:p-5"}>
        <div>
          <h3 className="text-sm font-semibold">Unetwork earning phones</h3>
          <p className="mt-1 text-xs text-[#879fb1]">Business equipment, not resale inventory. Recorded from the business-use start date; earnings stay in Unetwork revenue.</p>
        </div>
        <div className="space-y-2">
          {businessPhones.map(phone => <div key={phone.id}
            className="flex items-center justify-between gap-3 border-b border-[#263746] py-2 text-sm">
            <div>
              <p>{phone.name} <span className="text-xs text-[#839aaf]">· {phone.businessDate}</span></p>
              <p className="text-xs text-[#839aaf]">Business value {money(phone.businessValue)} · {phone.fundingAccount === "equity" ? "Owner's Equity" : phone.fundingAccount === "cash" ? "Business Cash" : "Accounts Payable"} · 120-month depreciation</p>
            </div>
            <button type="button" aria-label={"Remove "+phone.name} onClick={()=>removeBusinessPhone(phone)}
              className="rounded p-2 text-[#9dafc0] hover:text-rose-400"><Trash2 size={15}/></button>
          </div>)}
        </div>
        {phoneError && <p role="alert" className="text-sm text-rose-300">{phoneError}</p>}
      </section>}
      {showOtherLabels && <section className={card + " space-y-3 p-4 sm:p-5"}>
        <h3 className="text-sm font-semibold">Other Financials account names</h3>
        <p className="text-xs text-[#879fb1]">Change shared ledger account labels here. Saved names appear in journal entries, account selectors, and the Trial Balance. Accounting IDs and totals don't change.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {accounts.map(account=><div key={account.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[#263746] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm">{accountName(account)}</p>
              {accountLabels["account:"+account.id] && <p className="truncate text-[11px] text-[#7b91a2]">{account.name}</p>}
            </div>
            <button type="button" aria-label={"Rename "+accountName(account)}
              onClick={()=>editChartName(account)}
              className="shrink-0 rounded p-1.5 text-[#90aabe] hover:bg-sky-400/10 hover:text-sky-300">
              <Pencil size={14}/>
            </button>
          </div>)}
        </div>
      </section>}
    </>}
    {tab === "income" && <>
      <div className="grid gap-3 sm:grid-cols-3">
        {metric(accountNameById("revenue"), pnlRevenue, "Synced from Crypto Dashboard", "text-sky-300")}
        {metric("Operating Expenses", expenses, autoPower ? "Includes Mining Power estimate" : "Saved or journaled expenses")}
        {metric("Net Income (Estimated)", pnlProfit, "After depreciation", "text-emerald-400")}
      </div>
      <section className={card + " p-5"}>
        <h2 className="mb-4 text-lg font-semibold">Income Statement — {monthTitle(month)}</h2>
        {[
          [accountNameById("revenue") + " / " + accountNameById("dividendRevenue"), pnlRevenue],
          [accountNameById("expense"), Math.max(0,moneyRound(operatingExpense-autoPower))],
          ...(autoPower ? [[accountNameById("electric") + " (estimated)", autoPower]] : []),
          ...(feeExpense ? [[accountNameById("fees"), feeExpense]] : []),
          [accountNameById("depreciation"), fixedDep],
          ["Net income", pnlProfit],
        ].map(([label, value]) => <div key={label} className={`flex justify-between gap-3 border-b border-[#273746] py-3 text-sm ${label === "Net income" ? "font-bold text-emerald-400" : ""}`}>
          <span>{label}</span><span className="tabular-nums">{money(value)}</span>
        </div>)}
        
      </section>
    </>}
    {tab === "cash" && <>
      <div className="grid gap-3 sm:grid-cols-3">{metric("Recorded Cash Inflows", cashIn)}{metric("Recorded Cash Outflows", cashOut)}{metric("Recorded Net Cash Flow", rounded(cashIn-cashOut), null, "text-emerald-400")}</div>
      <section className={card + " p-5"}>
        <h2 className="text-lg font-semibold">Cash Flow Statement — {monthTitle(month)}</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {Object.entries(cashFlow.totals).map(([category,value])=>
            <div key={category} className="rounded-lg border border-[#293e4d] p-3">
              <p className="text-xs capitalize text-[#92adbf]">{category}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{signed(value)}</p>
            </div>)}
        </div>
        
        <div className="mt-4 space-y-2">{cashEvents.length ? cashEvents.map(entry => <div key={entry.id} className="flex items-center justify-between gap-3 border-b border-[#273746] py-2 text-sm">
          <div><p>{transactionTitle(entry)}</p><p className="text-xs text-[#8197a9]">{entry.date}</p></div>
          <span className={entry.delta >= 0 ? "text-emerald-400" : "text-rose-400"}>{signed(entry.delta)}</span>
        </div>) : <p className="text-sm text-[#94a7b8]">No cash transactions recorded for this month. Add journal entries to build the cash flow statement.</p>}</div>
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
      {closeSnapshot && <div className="flex flex-wrap items-center gap-3 text-xs text-amber-300">
        <span>This month is closed and frozen.</span>
        <button type="button" onClick={reopenSelectedMonth}
          className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-300">Reopen month</button>
      </div>}
      {quickStatus && <p role="status" className="text-sm text-emerald-400">{quickStatus}</p>}
      {syncedIncomeJournal.unexplainedManualRevenue > 0 && <p role="status" className="text-sm text-amber-300">
        Manual revenue exceeds Crypto Income by {money(syncedIncomeJournal.unexplainedManualRevenue)} this month. Review for duplicates or missing earnings.
      </p>}
      <section className={card + " overflow-hidden p-4"}><div className="overflow-x-auto"><table className="w-full min-w-[550px] text-sm">
        <thead><tr className="border-b border-[#314454] text-left text-xs text-[#9db0c1]"><th className="pb-3">Date / Description</th><th className="pb-3">Account</th><th className="pb-3 text-right">Debit</th><th className="pb-3 text-right">Credit</th><th/></tr></thead>
        <tbody>{entries.map((entry, entryIndex) => <Fragment key={entry.id}>
          {entry.lines.map((item, index) => <tr key={index} className="border-b border-[#20303d]">
            <td className="py-2 align-top">{index===0 ? <><p>{transactionTitle(entry)}</p><p className="text-xs text-[#8195a8]">{entry.date}{entry.automatic ? " · Auto" : ""}</p></> : null}</td>
            <td className="py-2 text-[#c3d2df]">{ledgerAccountName(entry,item)}</td>
            <td className="py-2 text-right tabular-nums">{item.debit ? money(item.debit) : "—"}</td>
            <td className="py-2 text-right tabular-nums">{item.credit ? money(item.credit) : "—"}</td>
            <td className="py-2 text-right">{index===0 && !entry.automatic && <button aria-label={"Delete "+entry.description} onClick={() => deleteEntry(entry.id)} className="text-[#9dafc0] hover:text-rose-400"><Trash2 size={15}/></button>}</td>
          </tr>)}
          {entryIndex < entries.length - 1 && <tr aria-hidden="true" className="h-10 border-y border-[#2b3d4d] bg-[#101923]/60">
            <td className="h-10">&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
          </tr>}
        </Fragment>)}
          <tr className="font-bold"><td colSpan={2} className="py-3">Total</td><td className="text-right">{money(debitTotal)}</td><td className="text-right">{money(creditTotal)}</td><td/></tr>
        </tbody></table></div>{!entries.length && <p className="py-5 text-sm text-[#8397a9]">No journal entries yet.</p>}</section>
    </>}
    {tab === "trial" && <>
      <div className="grid gap-3 sm:grid-cols-3">{metric("Debits", trialDebit)}{metric("Credits", trialCredit)}{metric("Difference", rounded(trialDebit-trialCredit), "Journal entries only", "text-emerald-400")}</div>
      <section className={card + " p-4 sm:p-6"}><h2 className="text-lg font-semibold">Trial Balance — {monthTitle(month)}</h2>

        
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[360px] text-sm"><thead><tr className="border-b border-[#314454] text-xs text-[#9db0c1]"><th className="pb-2 text-left">Account</th><th className="pb-2 text-right">Debit</th><th className="pb-2 text-right">Credit</th></tr></thead>
          <tbody>{trial.map(row => <tr key={row.id} className="border-b border-[#243340]"><td className="py-2">{accountName(row)}</td><td className="text-right">{row.debit ? money(row.debit) : "—"}</td><td className="text-right">{row.credit ? money(row.credit) : "—"}</td></tr>)}
            <tr className="font-bold"><td className="py-3">Total</td><td className="text-right">{money(trialDebit)}</td><td className="text-right">{money(trialCredit)}</td></tr>
          </tbody></table></div></section>
    </>}
    {phoneModal && <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-black/80 p-4"
      onMouseDown={event=>{if(event.target===event.currentTarget)setPhoneModal(false);}}>
      <form onSubmit={addPhoneToFinancials} role="dialog" aria-modal="true"
        aria-label="Add Unetwork business phone"
        className={card+" w-full max-w-lg space-y-4 p-5 shadow-2xl"}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Add Unetwork earning phone</h3>
          <button type="button" aria-label="Close" onClick={()=>setPhoneModal(false)}><X size={18}/></button>
        </div>
        <p className="text-xs text-[#93acbc]">Track a phone used to earn Unetwork income as business equipment. The date you bought it can differ from when you began using it for the business.</p>
        {phoneInventory.length > 0 && <label className="block space-y-1 text-xs text-[#a8bdce]">
          Choose from phone inventory (optional)
          <select className={field} value={phoneDraft.inventoryId} onChange={event=>setPhoneInventoryChoice(event.target.value)}>
            <option value="">Enter a new phone</option>
            {phoneInventory.map(item=><option key={item.id} value={item.id}>{item.model||item.name||"Phone"} {item.id}</option>)}
          </select>
        </label>}
        <label className="block space-y-1 text-xs text-[#a8bdce]">Phone model or label
          <input className={field} required maxLength={90} value={phoneDraft.name}
            onChange={event=>setPhoneDraft({...phoneDraft,name:event.target.value})} placeholder="iPhone 13 — Unetwork #1"/>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-xs text-[#a8bdce]">Original purchase date
            <input type="date" className={field} required value={phoneDraft.purchaseDate}
              onChange={event=>setPhoneDraft({...phoneDraft,purchaseDate:event.target.value})}/>
          </label>
          <label className="block space-y-1 text-xs text-[#a8bdce]">Started business use
            <input type="date" className={field} required value={phoneDraft.businessDate}
              onChange={event=>setPhoneDraft({...phoneDraft,businessDate:event.target.value})}/>
          </label>
          <label className="block space-y-1 text-xs text-[#a8bdce]">Business equipment value (USD)
            <input type="number" step="0.01" min="0.01" className={field} required value={phoneDraft.businessValue}
              onChange={event=>setPhoneDraft({...phoneDraft,businessValue:event.target.value})}
              placeholder="Value when contributed"/>
          </label>
          <label className="block space-y-1 text-xs text-[#a8bdce]">How business acquired it
            <select className={field} value={phoneDraft.fundingAccount}
              onChange={event=>setPhoneDraft({...phoneDraft,fundingAccount:event.target.value})}>
              <option value="equity">My personal contribution</option>
              <option value="cash">Paid using business cash</option>
              <option value="payable">Business owes for phone</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-[#8ba4b5]">This creates one equipment asset and one matching acquisition journal entry on the business-use date. No November purchase is invented for an earlier acquisition. A 120-month straight-line book-depreciation estimate with $0 salvage value is used; tax treatment may differ.</p>
        {phoneError && <p role="alert" className="text-sm text-rose-300">{phoneError}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-[#405468] px-3 py-2 text-sm" onClick={()=>setPhoneModal(false)}>Cancel</button>
          <button type="submit" className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-[#071710]">Add to Balance Sheet</button>
        </div>
      </form>
    </div>}
    {renaming && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4"
      onMouseDown={event=>{if(event.target===event.currentTarget)setRenaming(null);}}>
      <form onSubmit={saveAccountName} className={card + " w-full max-w-md space-y-4 p-5 shadow-2xl"}
        role="dialog" aria-modal="true" aria-label="Rename financial account">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">Rename account</h3>
          <button type="button" onClick={()=>setRenaming(null)} aria-label="Close"><X size={18}/></button>
        </div>
        <p className="text-xs text-[#93a9ba]">Original name: {renaming.original}</p>
        <label className="block space-y-1.5 text-sm">Display name
          <input className={field} autoFocus maxLength={80} value={renameDraft}
            onChange={event=>{setRenameDraft(event.target.value);setRenameError("");}}
            placeholder="My account name"/>
        </label>
        {renameError && <p role="alert" className="text-sm text-rose-400">{renameError}</p>}
        <p className="text-xs text-[#8da4b5]">The new name follows this account throughout Financials without changing transaction amounts, accounting IDs, or mining tracker data.
          {renaming.isEquipment && " The Trial Balance groups all equipment into one account; you can rename that group separately using Edit other account names."}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={()=>setRenaming(null)} className="rounded-lg border border-[#3b5062] px-3 py-2 text-sm">Cancel</button>
          <button type="button" onClick={()=>{
            const next={...accountLabels};
            delete next[renaming.key];
            remoteStorage.setItem(FINANCIAL_LABELS_KEY,JSON.stringify(next));
            setAccountLabels(next);
            setRenaming(null);
          }} className="rounded-lg border border-[#3b5062] px-3 py-2 text-sm text-[#b8c9d7]">Reset name</button>
          <button type="submit" className="rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-[#071824]">Save name</button>
        </div>
      </form>
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
            placeholder="Transferred $25 from Kryptex to BTC"
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
                  {accounts.map(account => <option key={account.id} value={account.id}>{accountName(account)}</option>)}
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
        <p className="text-[11px] text-[#718b9e]">Recognizes common expenses, equipment purchases, transfers, owner contributions, and income. It drafts accounting entries only; it never moves funds or calls an AI service.</p>
      </section>
    </div>}
    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={event=>{if(event.target===event.currentTarget)setModal(false);}}>
      <form onSubmit={saveEntry} className={card + " w-full max-w-md space-y-4 p-5 shadow-2xl"} role="dialog" aria-modal="true" aria-label="Add journal entry">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">New Journal Entry</h2><button type="button" onClick={()=>setModal(false)} aria-label="Close"><X size={19}/></button></div>
        <label className="block space-y-1 text-sm">Date<input required type="date" value={draft.date} onChange={event=>setDraft(old=>({...old,date:event.target.value}))} className={field}/></label>
        <label className="block space-y-1 text-sm">Description<input required value={draft.description} onChange={event=>setDraft(old=>({...old,description:event.target.value}))} className={field} placeholder="e.g. Mining payout"/></label>
        {["debitAccount","creditAccount"].map(key=><label key={key} className="block space-y-1 text-sm">{key==="debitAccount"?"Debit account":"Credit account"}
          <select value={draft[key]} onChange={event=>setDraft(old=>({...old,[key]:event.target.value}))} className={field}>
            <option value="">Select account</option>
            {accounts.map(account=><option key={account.id} value={account.id}>{accountName(account)}</option>)}
          </select></label>)}
        <label className="block space-y-1 text-sm">Amount ($)<input required min="0.01" step="0.01" type="number" value={draft.amount} onChange={event=>setDraft(old=>({...old,amount:event.target.value}))} className={field}/></label>
        <p className="text-xs text-[#91a7b9]">Confirm the purchase date and funding source (Cash/Bank, Owner's Equity, Crypto, or Accounts Payable). No new bank payment is assumed.</p>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <div className="flex gap-2"><button type="button" onClick={()=>setModal(false)} className="rounded-lg border border-[#384d5d] px-4 py-2">Cancel</button>
          <button type="submit" className="flex-1 rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-[#071710]">Post entry</button></div>
      </form>
    </div>}
  </div>;
}
