// Shared asset valuation for Home and Financials: same stored balances,
// equipment register, journal and bank-opening logic. A missing bank balance
// is unknown (null), not a fabricated $0.
import { remoteStorage } from "@/lib/serverStore";
import { getStoredProjectCryptoPortfolio } from "@/lib/projectCryptoPortfolio";
import { localStorage as appStorage } from "@/lib/localStorage";
import {
  getCurrentMonthKey, loadKryptexTracker, loadRollerCoinTracker,
  getRollerCoinTrackerStats, loadSaladTracker, loadUnetworkTracker,
  readObject, PROJECT_QUICK_CACHE_KEY,
} from "@/lib/yieldFarmingAccounting";
import {
  buildFinancialBalanceRows, includeJournalEquipment, buildStatementRows,
  deriveCashOpening, derivePayableOpening, moneyRound,
} from "@/lib/financialAccounting";
import { movementJournal } from "@/lib/financialMovements";
import { readUnetworkPhones, phoneAssetRows } from "@/lib/unetworkPhonesAccounting";

export const FINANCIAL_ASSET_KEYS = {
  records:"monthly_business_changes_v1",
  journal:"financials_journal_v1",
  hardware:"hardware_payback_devices_v1",
  confirmed:"financials_confirmed_movements_v1",
  closed:"financials_month_closes_v1",
  bank:"financials_bank_openings_v1",
};

function stored(key, fallback) {
  try { return JSON.parse(remoteStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

export function financialLiveBalances() {
  const values = {};
  const portfolio=getStoredProjectCryptoPortfolio();
  for(const item of portfolio?.projectEntries || []) {
    if(item?.platform && Number.isFinite(Number(item.balance))) values[item.platform.toLowerCase()]=Number(item.balance);
  }
  const cache=readObject(PROJECT_QUICK_CACHE_KEY);
  const lulo=(cache.projects||[]).filter(item=>item?.yield_tracking==="lulo_lending");
  if(lulo.length) values.lulo=lulo.reduce((sum,item)=>sum+(Number(item.lulo_total_balance_usd)||0),0);
  if(Number.isFinite(Number(cache.loopscaleSnapshot?.positionValueUsd))) values.loopscale=Number(cache.loopscaleSnapshot.positionValueUsd);
  const salad=loadSaladTracker();
  if(salad.initialized||salad.lastSyncedAt) values.salad=Number(salad.currentBalance)||0;
  const unetwork=loadUnetworkTracker();
  if(unetwork.initialized||unetwork.lastSyncedAt) values.unetwork=Number(unetwork.currentBalance)||0;
  const kryptex=loadKryptexTracker();
  if(kryptex.initialized&&kryptex.lastSyncedAt) values.kryptex=Number(kryptex.currentBalance)||0;
  const roller=loadRollerCoinTracker();
  if(roller.lastSyncedAt) {
    const value=Number(getRollerCoinTrackerStats(roller).currentBalanceUsd);
    if(value>0||(roller.currentTrxBalance===0&&roller.lastTrxPrice>0)) values.rollercoin=value;
  }
  const home=appStorage.getCryptoCache()?.projectPortfolio?.bitcoin;
  const btc=Number(home?.value??home?.balance??portfolio?.bitcoin?.value);
  if(Number.isFinite(btc))values.btc=btc;
  return values;
}

function postedLine(account,debit,credit) {
  return {account,debit:moneyRound(debit),credit:moneyRound(credit)};
}

export function getFinancialTotalAssets(month=getCurrentMonthKey(), live=financialLiveBalances()) {
  const records=stored(FINANCIAL_ASSET_KEYS.records,{});
  const journal=stored(FINANCIAL_ASSET_KEYS.journal,[]);
  const registered=stored(FINANCIAL_ASSET_KEYS.hardware,[]);
  const hardware=Array.isArray(registered) ? registered.filter(row=>
    Number(row?.cost)>0 && /^\d{4}-\d{2}$/.test(String(row.startMonth))) : [];
  const confirmed=Object.values(stored(FINANCIAL_ASSET_KEYS.confirmed,{}));
  const closed=stored(FINANCIAL_ASSET_KEYS.closed,{})[month];
  if(closed?.rows) return sumFinancialBusiness(closed.rows);

  const base=includeJournalEquipment(
    [
      ...buildFinancialBalanceRows(month,records,live,hardware,getCurrentMonthKey()),
      ...(records[month]?.locked ? [] : phoneAssetRows(readUnetworkPhones(),month)),
    ],
    journal,month,Boolean(records[month]?.locked),
  );
  const manual=journal.filter(entry=>String(entry.date||"").startsWith(month));
  const manualEntries=manual.map(entry=>({
    ...entry,lines:[postedLine(entry.debitAccount,entry.amount,0),postedLine(entry.creditAccount,0,entry.amount)],
  }));
  const alreadyPosted=new Set(manual.filter(row=>row.movementSourceId).map(row=>row.movementSourceId));
  const movements=movementJournal(confirmed.filter(row=>String(row?.date||"").startsWith(month)),month,alreadyPosted)
    .filter(entry=>!manual.some(item=>item.date===entry.date &&
      Math.abs(Number(item.amount)-Number(entry.lines[0]?.debit))<=.005 &&
      item.debitAccount===entry.lines[0]?.account &&
      item.creditAccount===entry.lines[1]?.account));
  const openings=stored(FINANCIAL_ASSET_KEYS.bank,{});
  const rows=buildStatementRows(base,[...manualEntries,...movements],{
    cashOpening:deriveCashOpening(month,openings,journal,confirmed),
    payableOpening:derivePayableOpening(month,journal),
  });
  return sumFinancialBusiness(rows);
}

export function sumFinancialAssets(rows) {
  const assets=(rows || []).filter(row=>row.category!=="liabilities");
  const incomplete=assets.some(row=>row.end===null);
  return {
    value:incomplete ? null : moneyRound(assets.reduce((sum,row)=>sum+Number(row.end||0),0)),
    knownSubtotal:moneyRound(assets.filter(row=>row.end!==null)
      .reduce((sum,row)=>sum+Number(row.end||0),0)),
    incomplete, count:assets.length,
  };
}

// Business net worth is business assets less liabilities, not gross assets.
// The home page and Balance Sheet share the same rows and unknown-balance rule.
export function sumFinancialBusiness(rows) {
  const assets = sumFinancialAssets(rows);
  const liabilities = (rows || []).filter(row => row.category === "liabilities");
  const liabilitiesIncomplete = liabilities.some(row => row.end == null);
  const liabilityValue = liabilitiesIncomplete ? null : moneyRound(
    liabilities.reduce((sum, row) => sum + Number(row.end || 0), 0)
  );
  return {
    ...assets,
    liabilityValue,
    netValue: assets.value === null || liabilityValue === null
      ? null : moneyRound(assets.value - liabilityValue),
    liabilitiesIncomplete,
  };
}
