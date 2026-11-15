import { useBackendIncomeHistory } from "@/hooks/useBackendIncomeHistory";
import FinancialsIntegrityPanel from "@/components/FinancialsIntegrityPanel";
import { Fragment, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Coins, Pencil, Plus, Send, Sparkles, Trash2, TrendingUp, Wallet, X } from "lucide-react";
import { remoteStorage, subscribe, refreshSetting } from "@/lib/serverStore";
import { preSeptemberLedgerEntries, LEGACY_LEDGER_CUTOFF } from "@/lib/legacyLedgerCleanup";
import { useBackendFinancialLiveBalances } from "@/hooks/useBackendFinancialLiveBalances";
import { readUnetworkPhones, readPhoneInventory, makePhoneAsset, phoneJournal, UNETWORK_PHONES_KEY } from "@/lib/unetworkPhonesAccounting";
import { api } from "@/lib/apiClient";

import { useBackendFinancialCore } from "@/hooks/useBackendFinancialCore";
import { useBackendCurrentLedger } from "@/hooks/useBackendCurrentLedger";
import { useBackendFinancialBalanceRows } from "@/hooks/useBackendFinancialBalanceRows";
import { useBackendTrialBalance } from "@/hooks/useBackendTrialBalance";
import { useFinancialFastQuery } from "@/hooks/useFinancialFastQuery";
import { financialCacheKey, readFinancialCache, requestFinancialCache } from "@/lib/financialFastCache";


import { visibleLedgerEntries } from "@/lib/financialAutoJournal";
import { resolveFinancialAccount } from "@/lib/financialMovements";
import { balanceAliasKey, balanceAccountId, balanceDisplayName, chartDisplayName, cleanAccountLabels, equipmentEntryDisplayName, journalDisplayDescription, showBalanceSheetRow } from "@/lib/financialAccountNames";
import { unmatchedEquipmentPurchases, moneyRound, valueOrNull } from "@/lib/financialAccounting";
import { hasFreeMiningPower } from "@/lib/powerOutOfPocket";
import { isFinancialMonthProtected } from "@/lib/financialMonthWriteGuard";
import { validateCompoundEntry, journalActivity } from "@/lib/compoundJournal";

import { formatCurrency, getCurrentMonthKey, getTodayKey } from "@/lib/yieldFarmingAccounting";

const RECORDS_KEY = "monthly_business_changes_v1";
const JOURNAL_KEY = "financials_journal_v1";
const HARDWARE_KEY = "hardware_payback_devices_v1";
const POWER_ESTIMATE_KEY = "financials_power_estimates_v1";
const MONTH_CLOSE_KEY = "financials_month_closes_v1";
const FINANCIAL_LABELS_KEY = "financials_account_labels_v1";
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
  { id: "gainDisposal", name: "Gain on Equipment Disposal", type: "revenue" },
  { id: "electric", name: "Electricity Expense", type: "expense" },
  { id: "expense", name: "Operating Expense", type: "expense" },
  { id: "depreciation", name: "Depreciation Expense", type: "expense" },
  { id: "fees", name: "Transaction & Network Fees", type: "expense" },
];
function readJson(key, fallback) {
  try { const value = JSON.parse(remoteStorage.getItem(key) || "null"); return value ?? fallback; }
  catch { return fallback; }
}
// Read the persisted equipment register without altering existing asset values.
function readHardwareRegister() {
  const devices = readJson(HARDWARE_KEY, []);
  return Array.isArray(devices) ? devices : [];
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
const emptyDraft = () => ({ date: getTodayKey(), description: "", lines:[{account:"cash",debit:"",credit:""},{account:"revenue",debit:"",credit:""}] });
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
  const { live, error: liveError } = useBackendFinancialLiveBalances();
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
  const [closedMonths, setClosedMonths] = useState(() => readJson(MONTH_CLOSE_KEY, {}));
  const [accountLabels, setAccountLabels] = useState(() =>
    cleanAccountLabels(readJson(FINANCIAL_LABELS_KEY, {})));
  const [renaming, setRenaming] = useState(null);
  const [inlineRenameRowId, setInlineRenameRowId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState("");
  const [showOtherLabels, setShowOtherLabels] = useState(false);
  const [modal, setModal] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState(null);
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
    setHardwareDevices(readHardwareRegister());
    setBusinessPhones(readUnetworkPhones());
    setPhoneInventory(readPhoneInventory());
    setPowerEstimates(readJson(POWER_ESTIMATE_KEY, {}));
    setClosedMonths(readJson(MONTH_CLOSE_KEY, {}));
    setAccountLabels(cleanAccountLabels(readJson(FINANCIAL_LABELS_KEY, {})));
  }), []);
  // Server-owned source history is the sole income attribution input.
  const incomeMonths = useBackendIncomeHistory({
    currentMonth: getCurrentMonthKey(),
  });
  useEffect(() => {
    let active = true;
    // Backend tariff calculations are display-only; never publish locally
    // computed financials_power_estimates_v1 or a phantom utility payable.
    const refreshPower = async () => {
      try {
        const path = "/api/power/month-cost/" + month;
        const cacheKey = financialCacheKey(path);
        const valid = result => result?.sourceOfCalculation ===
          "backend-power-meter-tariffs" && result.month === month;
        const cached = readFinancialCache(cacheKey, 15000);
        if (active && cached && valid(cached)) {
          setPowerEstimates(previous => ({...previous, [month]: {
            cost: cached.complete ? cached.nominalUsd : null,
            outOfPocketUsd: cached.complete ? cached.outOfPocketUsd : null,
            kwh: cached.measuredKwh ?? null,
            updatedAt: cached.calculatedAt,
            estimated: true,
            source: cached.sourceOfCalculation,
          }}));
        }
        const result = await requestFinancialCache(
          cacheKey, () => api.get(path), valid, { force: true });
        if (!active || result?.sourceOfCalculation !== "backend-power-meter-tariffs" ||
            result.month !== month) return;
        setPowerEstimates(previous => ({...previous, [month]: {
          cost: result.complete ? result.nominalUsd : null,
          outOfPocketUsd: result.complete ? result.outOfPocketUsd : null,
          kwh: result.measuredKwh ?? null,
          updatedAt: result.calculatedAt,
          estimated: true,
          source: result.sourceOfCalculation,
        }}));
      } catch {
        if (active) setPowerEstimates(previous => ({...previous, [month]: {
          cost:null, outOfPocketUsd:null, kwh:null,
          source:"backend-unavailable", estimated:true,
        }}));
      }
    };
    refreshPower();
    const timer = window.setInterval(refreshPower, 90000);
    return () => { active=false; window.clearInterval(timer); };
  }, [month]);
  const closeReadinessState = useFinancialFastQuery({
    path: "/api/project-tracking/financial-core/close-readiness/" + month,
    enabled: month < getCurrentMonthKey(), maxAgeMs: 30000,
    intervalMs: 90000,
    validator: result => result?.sourceOfCalculation ===
      "backend-financial-close-readiness-v1" &&
      result.month === month && result.readOnly === true &&
      Array.isArray(result.missingEvidence),
  });
  const historicalCloseReadiness = closeReadinessState.data ||
    (closeReadinessState.error ? { unavailable: true } : null);
  const closeSnapshot = closedMonths[month] || null;
  const protectedMonth = key => isFinancialMonthProtected(key, closedMonths, records);
  // The backend owns balance rows, business phone PPE, hardware trades,
  // journal equipment and depreciation. Never substitute browser arithmetic.
  const backendBalanceRows = useBackendFinancialBalanceRows({
    month, currentMonth:getCurrentMonthKey(), records, live, hardwareDevices,
    phones:businessPhones, journal,
  });
  const baseRows = useMemo(
    () => backendBalanceRows.rows || [], [backendBalanceRows.rows],
  );
  // Each existing fixed asset is selectable as its own ledger subaccount.
  // Keep the generic equipment account for acquisitions not yet in the register.
  const equipmentAccounts = useMemo(() => baseRows
    .filter(row => row.category === "equipment" && row.id)
    .map(row => ({ id:"equipment:"+row.id, name:balanceDisplayName(row,accountLabels), type:"asset" }))
    .filter((row,index,array)=>array.findIndex(other=>other.id===row.id)===index),
    [baseRows,accountLabels]);
  const availableAccounts = [...accounts, ...equipmentAccounts];
  const recorded = records[month] || {};
  const syncedRevenue = closeSnapshot?.incomeMonth || incomeMonths.find(entry => entry.monthKey === month);
  const savedExpenses = valueOrNull(recorded.expenses);
  const ledgerEntries = preSeptemberLedgerEntries(
    closeSnapshot?.manualEntries || journal.filter(entry => String(entry.date).slice(0, 7) === month),
    month, businessPhones
  );
  const unpostedEquipment = unmatchedEquipmentPurchases(baseRows,ledgerEntries,month);
  const electricityCovered = hasFreeMiningPower(month);
  const estimatedPower = powerEstimates[month]?.source === "backend-power-meter-tariffs"
    ? valueOrNull(powerEstimates[month]?.outOfPocketUsd) : null;
  const hasActualPower = ledgerEntries.some(entry => journalActivity(entry,"electric")>0);
  // No automatic electricity expense is generated while power is supplied free.
  const autoPower = closeSnapshot ? closeSnapshot.autoPower :
    electricityCovered || hasActualPower || (savedExpenses !== null && savedExpenses > 0) ||
      estimatedPower === null ? 0 : estimatedPower;
  // Income accruals, approved transfers, automatic expenses and iPhone
  // opening adjustment are assembled by one read-only backend projection.
  const currentLedgerState = useBackendCurrentLedger({
    month, journalPreview: journal,
    baseRows: backendBalanceRows.rows || null, autoPower,
    // Revision hints trigger a fresh source read after journal edits, a
    // month reopen, or updates to the authenticated income-history hook.
    closeRevision: closedMonths, incomeRevision: syncedRevenue,
  });
  const entries = currentLedgerState.data?.entries || [];
  const syncedIncomeJournal = currentLedgerState.data?.income || { entries: [] };
  // Filter only visible General Ledger rows. All underlying accruals
  // remain live and all accounting reports use unfiltered entries.
  const displayedLedgerEntries=visibleLedgerEntries(entries,month,getCurrentMonthKey());
  const hiddenSyncedIncomeCount=entries.length-displayedLedgerEntries.length;
  const ledgerVisibleDebit=moneyRound(displayedLedgerEntries.reduce((sum,entry)=>sum+
    (entry.lines||[]).reduce((n,part)=>n+Number(part.debit||0),0),0));
  const ledgerVisibleCredit=moneyRound(displayedLedgerEntries.reduce((sum,entry)=>sum+
    (entry.lines||[]).reduce((n,part)=>n+Number(part.credit||0),0),0));
  // Compute server-side; keep the proven browser view only when the backend
  // response is stale or fails strict parity. This is read-only: it never
  // generates new posted transactions or adjusts a locked month.
  const serverFinancialState = useBackendFinancialCore(
    month, entries, backendBalanceRows.rows || null, hardwareDevices,
    savedExpenses);
  const serverFinancial = serverFinancialState?.data;
  const cachedFinancialWarning = Boolean(
    (liveError && live) ||
    (backendBalanceRows.error && backendBalanceRows.rows) ||
    (currentLedgerState.error && currentLedgerState.data) ||
    (serverFinancialState.error && serverFinancialState.data)
  );
  const report = serverFinancial?.profit || {
    revenue: 0, disposalGain: 0, operating: 0, fees: 0,
    depreciation: 0, expenses: 0, profit: 0,
  };
  const incomeKnown = Number.isFinite(syncedIncomeJournal.syncedTotal) ||
    ledgerEntries.some(entry=>["revenue","dividendRevenue"].some(account=>journalActivity(entry,account)<0));
  const pnlRevenue = closeSnapshot ? closeSnapshot.revenue : incomeKnown ? report.revenue : null;
  const expenses = closeSnapshot ? closeSnapshot.expenses : report.expenses;
  const operatingExpense = closeSnapshot ? Math.max(0,moneyRound(expenses-report.fees-autoPower)) : report.operating;
  const feeExpense = report.fees;
  // Present the existing combined revenue as separately posted income streams.
  // Any frozen historical total not explained by the posted lines is shown
  // explicitly rather than being assigned to mining or dividends incorrectly.
  const revenueSources = serverFinancial?.revenueSources || {
    mining: 0, yield: 0, dividends: 0, unclassified: 0,
  };
  const {mining:miningIncome,yield:yieldIncome,dividends:dividendIncome} = revenueSources;
  // Keep unidentified manual revenue separate instead of attributing it
  // to mining or yield without evidence.
  const otherRecognizedRevenue = pnlRevenue === null ? null :
    moneyRound(revenueSources.unclassified+pnlRevenue-report.revenue);
  const operatingExpenseWithoutPower = Math.max(0,moneyRound(operatingExpense-autoPower));
  const fixedDep = closeSnapshot ? closeSnapshot.fixedDep : report.depreciation;
  const totalStatementExpenses = moneyRound(operatingExpenseWithoutPower+autoPower+feeExpense+fixedDep);

  const pnlProfit = closeSnapshot ? closeSnapshot.pnlProfit :
    pnlRevenue === null ? null : moneyRound(pnlRevenue + report.disposalGain - expenses - fixedDep);

  // A bank payment really reduces Cash / Bank. If no opening bank balance
  // was provided, display its journal movement without fabricating an ending.
  const rows = closeSnapshot?.rows || serverFinancial?.statementRows || [];
  // Only presentation rows are filtered. Financial totals still use 'rows'.
  // Closed/past reporting months retain their Lulo historical reference.
  const reportingMonth = getCurrentMonthKey();
  const sections = categories.map(category => ({
    ...category,
    // Alphabetize account names only inside each section; keep section
    // order and accounting totals unchanged. Use visible renamed labels.
    rows: rows.filter(row => row.category === category.id && !row.retired &&
      showBalanceSheetRow(row, month, reportingMonth, accountLabels))
      .sort((a,b) => balanceDisplayName(a,accountLabels).localeCompare(
        balanceDisplayName(b,accountLabels), undefined, {sensitivity:"base",numeric:true})),
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
  // Roll forward recorded journal activity from the start of tracking.
  // This includes previous earning accruals and depreciation, but opening
  // external account balances are still not invented.
  // Previous-month journal assembly, income and fixed-asset adjustments
  // now run in the backend, including the opening phone adjustment.
  const trialState = useBackendTrialBalance({
    month, currentEntries: entries, accounts: availableAccounts,
  });
  const trial = trialState.result?.rows || [];
  const trialDebit = trialState.result?.debitsUsd ?? 0;
  const trialCredit = trialState.result?.creditsUsd ?? 0;
  const cashFlow = serverFinancial?.cashFlow || {
    sections: { operating: [], investing: [], financing: [], transfers: [] },
    totals: { operating: 0, investing: 0, financing: 0, transfers: 0 },
    total: 0,
  };
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
  const saveEntry = event => {
    event.preventDefault();
    const original = editingEntryId ? journal.find(entry=>entry.id===editingEntryId) : null;
    if(editingEntryId && !original) {setError("This entry could not be found. Close and reopen the editor.");return;}
    if((original && protectedMonth(String(original.date).slice(0,7))) ||
       protectedMonth(String(draft.date).slice(0,7))) {
      setError("This month is locked in Monthly Changes or closed in Financials. Unlock the applicable month before editing."); return;
    }
    if(!draft.description.trim() || !validLedgerDate(draft.date)) {
      setError("Enter a valid date and description."); return;
    }
    const checked=validateCompoundEntry(draft.lines,availableAccounts.map(account=>account.id));
    if(checked.error) {setError(checked.error); return;}
    const updatedEntry=original
      ? {...original,date:draft.date,description:draft.description.trim(),lines:checked.lines,
          amount:undefined,debitAccount:undefined,creditAccount:undefined}
      : {id:"journal:"+Date.now()+":"+Math.random().toString(36).slice(2,7),
          date:draft.date,description:draft.description.trim(),lines:checked.lines,source:"compound-journal"};
    const updated=original ? journal.map(entry=>entry.id===original.id ? updatedEntry : entry)
      : [...journal,updatedEntry];
    remoteStorage.setItem(JOURNAL_KEY,JSON.stringify(updated));
    setJournal(updated); setMonth(draft.date.slice(0,7));setDraft(emptyDraft());setEditingEntryId(null);setError("");setModal(false);
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
    if (protectedMonth(String(quickEntry.date).slice(0, 7))) {
      setQuickError("This month is locked or closed. Unlock it before posting.");
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
    const amount=String(device.historicalCost || device.cost);
    setEditingEntryId(null);
    setDraft({date:"",description:"Purchase: "+device.name,lines:[
      {account:"equipment",debit:amount,credit:""},{account:"",debit:"",credit:amount},
    ]});
    setTab("ledger");
    setError("");
    setModal(true);
  };
  const deleteEntry = id => {
    const original = journal.find(entry => entry.id === id);
    if (original && protectedMonth(String(original.date).slice(0, 7))) {
      setTab("ledger");
      return;
    }
    const updated = journal.filter(entry => entry.id !== id);
    remoteStorage.setItem(JOURNAL_KEY, JSON.stringify(updated));
    setJournal(updated);
  };
  const reopenSelectedMonth = async () => {
    if (!closedMonths[month]) return;
    setQuickError("");
    try {
      const result = await api.post(
        "/api/financial-core/reopen-month/" + encodeURIComponent(month), {});
      if (result?.sourceOfCalculation !== "backend-explicit-financial-reopen" ||
          result.month !== month || !result.closedMonths) {
        throw Error("Unexpected response from Financials backend.");
      }
      setClosedMonths(result.closedMonths);
      await refreshSetting(MONTH_CLOSE_KEY);
      setQuickStatus("Financial month reopened on the backend.");
    } catch (error) {
      setQuickError(
        "Could not complete the Financials reopen: " +
        (error?.message || "Server unavailable.")
      );
    }
  };
  const editRowName = row => {
    const aliasKey=balanceAliasKey(row);
    if (!aliasKey) return;
    setRenameError("");
    setRenameDraft(balanceDisplayName(row,accountLabels));
    setRenaming({ key:aliasKey, original:row.name, accountId:balanceAccountId(row),
      isEquipment:row.category==="equipment" });
    setInlineRenameRowId(row.id);
  };
  const editChartName = account => {
    setInlineRenameRowId(null);
    setRenameError("");
    setRenameDraft(chartDisplayName(account,accountLabels));
    setRenaming({key:"account:"+account.id,original:account.name,accountId:account.id});
  };
  const saveAccountName = event => {
    event?.preventDefault();
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
    setInlineRenameRowId(null);
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
    const account=availableAccounts.find(row=>row.id===id);
    return account ? accountName(account) : id;
  };
  const ledgerAccountName = (entry,item) => {
    if(item.account==="equipment") {
      const specific=equipmentEntryDisplayName(entry,rows,accountLabels);
      if(specific) return specific;
    }
    const account=availableAccounts.find(row=>row.id===item.account);
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
  if (!live || !serverFinancial || !currentLedgerState.data ||
      !trialState.result) return <div className="min-w-0 space-y-4 pb-8 text-white" data-testid="financials-page">
    <h1 className="text-2xl font-semibold">Financials</h1>
    <FinancialsIntegrityPanel/>
    <p role="status" className="rounded-xl border border-[#293e4d] p-5 text-sm text-[#a9c4d2]">
      {liveError
        ? "Backend provider balances unavailable. Previous saved financial records remain untouched."
        : backendBalanceRows.error
        ? "Backend asset rows unavailable. Saved equipment, journal records, and balances were not changed."
        : trialState.error
        ? "Backend trial balance unavailable. Saved ledger entries remain unchanged."
        : currentLedgerState.error
        ? "Backend General Ledger assembly unavailable. Saved journal entries and month closes were not changed."
        : serverFinancialState?.error
        ? "Backend financial statements unavailable. Saved journal entries, month closes, and account balances were not changed."
        : "Loading backend financial statements…"}
    </p>
  </div>;
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
    <FinancialsIntegrityPanel/>
    {recorded.locked && !closeSnapshot && month < getCurrentMonthKey() && <p
      role="status" className="rounded-xl border border-amber-500/40 px-4 py-3 text-xs text-amber-200">
      This historical month is protected from journal edits by its Monthly Changes lock.
      A separate certified Financials closing statement has not been recorded.
      {historicalCloseReadiness?.missingEvidence?.length > 0 &&
        <> Evidence still needed: {historicalCloseReadiness.missingEvidence.join("; ")}.</>}
      {historicalCloseReadiness?.unavailable &&
        <> The backend close-readiness report is currently unavailable.</>}
    </p>}
    {recorded.locked && !closeSnapshot &&
      month < getCurrentMonthKey() &&
      (historicalCloseReadiness?.assetEvidenceRows?.length > 0 ||
       historicalCloseReadiness?.bankOpeningEvidence) &&
      <details className="rounded-xl border border-amber-500/25 bg-[#111a21] p-4 text-xs text-[#d6e1e9]">
        <summary className="cursor-pointer font-semibold text-amber-200">
          Historical closing evidence needed — {monthTitle(month)}
        </summary>
        <p className="mt-3 text-[#9fb4c6]">
          Recorded estimates are preserved, but they are not certified
          closing values. No bank balance or journal entry has been changed.
        </p>
        {historicalCloseReadiness.bankOpeningEvidence?.status === "missing" &&
          <p className="mt-3 text-amber-200">
            Bank opening: {historicalCloseReadiness.bankOpeningEvidence.requiredEvidence}.
          </p>}
        <ul className="mt-3 space-y-2">
          {(historicalCloseReadiness.assetEvidenceRows || []).map((asset, index) =>
            <li key={asset.name + index} className="flex flex-wrap justify-between gap-2 rounded-lg border border-[#263342] px-3 py-2">
              <span>{asset.name}</span>
              <span className="text-[#a9bac8]">
                {asset.reportedEndingUsd == null
                  ? "Unknown"
                  : formatCurrency(asset.reportedEndingUsd)}
                {" · "}
                {asset.status === "estimated-needs-document"
                  ? "Needs month-end evidence"
                  : asset.status === "unknown"
                  ? "Missing ending value" : "Saved value (not independently audited)"}
              </span>
            </li>)}
        </ul>
        <p className="mt-3 text-[#9fb4c6]">
          To certify this period, supply original dated statements for the
          estimated rows and the beginning bank cash. These documents are
          reviewed before any formal close; missing values are never set to zero.
        </p>
      </details>}
    {cachedFinancialWarning && <p role="status"
      className="rounded-xl border border-amber-500/30 px-4 py-3 text-xs text-amber-200">
      Showing the most recently verified in-session Financials data while
      the backend refresh is unavailable. These amounts have not been
      revalidated yet; saved accounting records were not modified.
    </p>}
    {tab === "balance" && <>
      <div className="grid gap-3 sm:grid-cols-3">
        {metric("Business Assets", assetsEnd, assetsEnd===null?"Some account balances are unverified":null, "text-sky-300")}
        {metric("Business Liabilities", debtEnd)}
        {metric("Business Net Worth", netEnd, netEnd===null?"Incomplete until missing balances are supplied":null, "text-emerald-400")}
      </div>
      {missingAssetCount > 0 && <p className="text-xs text-amber-300">
        Known asset subtotal: {money(knownAssetsSubtotal)}. {missingAssetCount} account(s) have unknown ending balances and are excluded from this partial subtotal.
      </p>}
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
                  {inlineRenameRowId === row.id ? (
                    <form onSubmit={saveAccountName} className="inline-flex w-[min(520px,75vw)] flex-col gap-1">
                      <input
                        autoFocus
                        aria-label={"Rename "+balanceDisplayName(row,accountLabels)}
                        className="w-full rounded-md border border-sky-400/60 bg-[#101923] px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-sky-400"
                        maxLength={80}
                        value={renameDraft}
                        onChange={event=>{setRenameDraft(event.target.value);setRenameError("");}}
                        onKeyDown={event=>{
                          if(event.key==="Escape") {
                            event.preventDefault();
                            setInlineRenameRowId(null);
                            setRenaming(null);
                            setRenameError("");
                          }
                        }}
                        onBlur={()=>{
                          if(renameDraft.trim()) saveAccountName();
                          else {
                            setInlineRenameRowId(null);
                            setRenaming(null);
                            setRenameError("");
                          }
                        }}
                      />
                      {renameError && <span role="alert" className="text-xs text-rose-300">{renameError}</span>}
                    </form>
                  ) : (
                    <button type="button" aria-label={"Rename "+balanceDisplayName(row,accountLabels)}
                      title="Click to rename account throughout Financials"
                      onClick={()=>editRowName(row)}
                      className="max-w-full text-left text-inherit hover:text-sky-300 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
                      {balanceDisplayName(row,accountLabels)}
                    </button>
                  )}{row.unverifiedOpening ? <span className="ml-2 text-xs text-amber-300">(opening unknown)</span> : null}</td>
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
        {metric("Total Revenue", pnlRevenue, "Mining, yield and dividends", "text-sky-300")}
        {metric("Operating Expenses", expenses, autoPower ? "Includes Mining Power estimate" : "Saved or journaled expenses")}
        {metric("Net Income (Estimated)", pnlProfit, "After depreciation", "text-emerald-400")}
      </div>
      <section className={card + " overflow-hidden p-4 sm:p-6"}>
        <h2 className="mb-4 text-lg font-semibold">Income Statement — {monthTitle(month)}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] border-collapse text-sm">
            <thead><tr className="border-b border-[#314454] text-left text-[11px] uppercase tracking-wider text-[#9bafc1]">
              <th className="pb-3">Account</th><th className="pb-3 text-right">Amount</th>
            </tr></thead>
            <tbody>
              <tr className="bg-[#142333]"><th colSpan={2} className="px-2 py-2 text-left text-xs uppercase tracking-wider text-sky-300">Revenue</th></tr>
              <tr className="border-b border-[#202f3c]"><td className="py-2.5 pl-2">Mining Revenue</td><td className="py-2.5 text-right tabular-nums">{money(miningIncome)}</td></tr>
              <tr className="border-b border-[#202f3c]"><td className="py-2.5 pl-2">Yield Revenue</td><td className="py-2.5 text-right tabular-nums">{money(yieldIncome)}</td></tr>
              <tr className="border-b border-[#202f3c]"><td className="py-2.5 pl-2">{accountNameById("dividendRevenue")}</td><td className="py-2.5 text-right tabular-nums">{money(dividendIncome)}</td></tr>
              {otherRecognizedRevenue !== null && Math.abs(otherRecognizedRevenue) >= .005 && <tr className="border-b border-[#202f3c]">
                <td className="py-2.5 pl-2">Other / previously recognized revenue</td>
                <td className="py-2.5 text-right tabular-nums">{money(otherRecognizedRevenue)}</td>
              </tr>}
              <tr className="border-b border-[#314454] font-semibold"><td className="py-3 pl-2">Total Revenue</td><td className="py-3 text-right tabular-nums">{money(pnlRevenue)}</td></tr>
              <tr className="bg-[#142333]"><th colSpan={2} className="px-2 py-2 text-left text-xs uppercase tracking-wider text-sky-300">Operating Expenses</th></tr>
              <tr className="border-b border-[#202f3c]"><td className="py-2.5 pl-2">{accountNameById("expense")}</td><td className="py-2.5 text-right tabular-nums">{money(operatingExpenseWithoutPower)}</td></tr>
              {autoPower > 0 && <tr className="border-b border-[#202f3c]"><td className="py-2.5 pl-2">{accountNameById("electric")} (estimated)</td><td className="py-2.5 text-right tabular-nums">{money(autoPower)}</td></tr>}
              {feeExpense > 0 && <tr className="border-b border-[#202f3c]"><td className="py-2.5 pl-2">{accountNameById("fees")}</td><td className="py-2.5 text-right tabular-nums">{money(feeExpense)}</td></tr>}
              <tr className="border-b border-[#202f3c]"><td className="py-2.5 pl-2">{accountNameById("depreciation")}</td><td className="py-2.5 text-right tabular-nums">{money(fixedDep)}</td></tr>
              <tr className="border-b border-[#314454] font-semibold"><td className="py-3 pl-2">Total Expenses</td><td className="py-3 text-right tabular-nums">{money(totalStatementExpenses)}</td></tr>
              {report.disposalGain !== 0 && <>
                <tr className="bg-[#142333]"><th colSpan={2} className="px-2 py-2 text-left text-xs uppercase tracking-wider text-sky-300">Other Income</th></tr>
                <tr className="border-b border-[#202f3c]"><td className="py-2.5 pl-2">{accountNameById("gainDisposal")}</td><td className="py-2.5 text-right tabular-nums">{money(report.disposalGain)}</td></tr>
              </>}
              <tr className="border-t border-[#3c5d66] font-bold text-emerald-400">
                <td className="py-3 pl-2">Net Income</td><td className="py-3 text-right tabular-nums">{money(pnlProfit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
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
        <button disabled={Boolean(closeSnapshot)} onClick={() => { setEditingEntryId(null); setDraft({ ...emptyDraft(), date: month+"-01" }); setError(""); setModal(true); }}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300 disabled:opacity-40"><Plus size={16}/> Add entry</button>
      </div></div>
      {closeSnapshot && <div className="flex flex-wrap items-center gap-3 text-xs text-amber-300">
        <span>This month is closed and frozen.</span>
        <button type="button" onClick={reopenSelectedMonth}
          className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-300">Reopen month</button>
      </div>}
      {quickStatus && <p role="status" className="text-sm text-emerald-400">{quickStatus}</p>}
      {syncedIncomeJournal.pendingReviewTotal > 0 && month >= LEGACY_LEDGER_CUTOFF && <div role="status" className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-sm text-amber-300">
        <strong>{money(syncedIncomeJournal.pendingReviewTotal)} of tracked income needs reconciliation.</strong>
        <span className="block text-xs">Unallocated or unknown providers have not been posted as Other Platform Receivables or revenue. Verify their provider and account before recording them.</span>
        {syncedIncomeJournal.pendingReview.map((row,index)=><p key={index} className="mt-1 text-xs">{row.source}: {money(row.amount)}</p>)}
      </div>}
      {syncedIncomeJournal.unexplainedManualRevenue > 0 && <p role="status" className="text-sm text-amber-300">
        Manual revenue exceeds Crypto Income by {money(syncedIncomeJournal.unexplainedManualRevenue)} this month. Review for duplicates or missing earnings.
      </p>}
      {hiddenSyncedIncomeCount > 0 && <p className="text-xs text-[#8fa7b9]">
         {hiddenSyncedIncomeCount} automatically synced income {hiddenSyncedIncomeCount === 1 ? "entry is" : "entries are"} hidden until this month ends. Earnings continue updating and remain included in your financial reports.
       </p>}
       <section className={card + " overflow-hidden p-4"}><div className="overflow-x-auto"><table className="w-full min-w-[550px] text-sm">
        <thead><tr className="border-b border-[#314454] text-left text-xs text-[#9db0c1]"><th className="pb-3">Date / Description</th><th className="pb-3">Account</th><th className="pb-3 text-right">Debit</th><th className="pb-3 text-right">Credit</th><th/></tr></thead>
        <tbody>{displayedLedgerEntries.map((entry, entryIndex) => <Fragment key={entry.id}>
          {entry.lines.map((item, index) => <tr key={index} className="border-b border-[#20303d]">
            <td className="py-2 align-top">{index===0 ? <>{!entry.automatic && journal.some(item=>item.id===entry.id) && !protectedMonth(String(entry.date).slice(0,7)) ? (
              <button type="button" onClick={()=>editEntry(entry)} title="Edit journal entry"
                className="text-left hover:text-sky-300 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
                {transactionTitle(entry)}
              </button>
            ) : <p>{transactionTitle(entry)}</p>}
            <p className="text-xs text-[#8195a8]">{entry.date}{entry.automatic ? " · Auto" : ""}</p></> : null}</td>
            <td className="py-2 text-[#c3d2df]">{ledgerAccountName(entry,item)}</td>
            <td className="py-2 text-right tabular-nums">{item.debit ? money(item.debit) : "—"}</td>
            <td className="py-2 text-right tabular-nums">{item.credit ? money(item.credit) : "—"}</td>
            <td className="py-2 text-right">{index===0 && !entry.automatic && !protectedMonth(String(entry.date).slice(0,7)) && <button aria-label={"Delete "+entry.description} onClick={() => deleteEntry(entry.id)} className="text-[#9dafc0] hover:text-rose-400"><Trash2 size={15}/></button>}</td>
          </tr>)}
          {entryIndex < displayedLedgerEntries.length - 1 && <tr aria-hidden="true" className="h-10 border-y border-[#2b3d4d] bg-[#101923]/60">
            <td className="h-10">&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
          </tr>}
        </Fragment>)}
          <tr className="font-bold"><td colSpan={2} className="py-3">{hiddenSyncedIncomeCount ? "Visible total" : "Total"}</td><td className="text-right">{money(ledgerVisibleDebit)}</td><td className="text-right">{money(ledgerVisibleCredit)}</td><td/></tr>
        </tbody></table></div>{!displayedLedgerEntries.length && <p className="py-5 text-sm text-[#8397a9]">No journal entries visible this month.</p>}</section>
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
    {renaming && !inlineRenameRowId && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4"
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
      <form onSubmit={saveEntry} className={card + " w-full max-w-2xl max-h-[90vh] space-y-4 overflow-y-auto p-5 shadow-2xl"} role="dialog" aria-modal="true" aria-label={editingEntryId ? "Edit journal entry" : "Add journal entry"}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{editingEntryId ? "Edit Journal Entry" : "New Journal Entry"}</h2><button type="button" onClick={()=>setModal(false)} aria-label="Close"><X size={19}/></button></div>
        <label className="block space-y-1 text-sm">Date<input required type="date" value={draft.date} onChange={event=>setDraft(old=>({...old,date:event.target.value}))} className={field}/></label>
        <label className="block space-y-1 text-sm">Description<input required value={draft.description} onChange={event=>setDraft(old=>({...old,description:event.target.value}))} className={field} placeholder="e.g. Mining payout"/></label>
        <div className="space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_90px_90px_24px] gap-2 text-xs text-[#9db0c1]">
            <span>Account</span><span>Debit ($)</span><span>Credit ($)</span><span/>
          </div>
          {draft.lines.map((item,index)=><div key={index} className="grid grid-cols-[minmax(0,1fr)_90px_90px_24px] items-center gap-2">
            <select aria-label={`Account line ${index+1}`} value={item.account}
              onChange={event=>setDraft(old=>({...old,lines:old.lines.map((row,i)=>i===index?{...row,account:event.target.value}:row)}))}
              className={field+" min-w-0 px-1"}>
              <option value="">Select account</option>
              {availableAccounts.map(account=><option key={account.id} value={account.id}>{accountName(account)}</option>)}
            </select>
            <input aria-label={`Debit line ${index+1}`} type="number" min="0" step="0.01" value={item.debit}
              onChange={event=>setDraft(old=>({...old,lines:old.lines.map((row,i)=>i===index?{...row,debit:event.target.value,credit:""}:row)}))}
              className={field+" min-w-0 px-1"}/>
            <input aria-label={`Credit line ${index+1}`} type="number" min="0" step="0.01" value={item.credit}
              onChange={event=>setDraft(old=>({...old,lines:old.lines.map((row,i)=>i===index?{...row,credit:event.target.value,debit:""}:row)}))}
              className={field+" min-w-0 px-1"}/>
            <button type="button" disabled={draft.lines.length<=2} aria-label={`Remove line ${index+1}`}
              onClick={()=>setDraft(old=>({...old,lines:old.lines.filter((_,i)=>i!==index)}))}
              className="text-[#9db0c1] disabled:opacity-30"><X size={16}/></button>
          </div>)}
          <button type="button" onClick={()=>setDraft(old=>({...old,lines:[...old.lines,{account:"",debit:"",credit:""}]}))}
            className="inline-flex items-center gap-1 text-xs text-sky-300"><Plus size={14}/> Add account line</button>
          <div className="flex justify-end gap-4 text-xs text-[#9db0c1]">
            <span>Debits: {money(draft.lines.reduce((sum,row)=>sum+(Number(row.debit)||0),0))}</span>
            <span>Credits: {money(draft.lines.reduce((sum,row)=>sum+(Number(row.credit)||0),0))}</span>
          </div>
        </div>
        <p className="text-xs text-[#91a7b9]">Debits must equal credits. Existing equipment items can be selected individually. A full book-value credit to an individual equipment account retires it from the Balance Sheet; generic equipment debits add new purchases.</p>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <div className="flex gap-2"><button type="button" onClick={()=>setModal(false)} className="rounded-lg border border-[#384d5d] px-4 py-2">Cancel</button>
          <button type="submit" className="flex-1 rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-[#071710]">{editingEntryId ? "Save changes" : "Post entry"}</button></div>
      </form>
    </div>}
  </div>;
}
