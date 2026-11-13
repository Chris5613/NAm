import { journalActivity } from "./compoundJournal";
// Financials calculation helpers. Account balances observed from trackers
// are NOT incremented again by the income journal; those trackers already
// include the mining earnings. Bank and payable accounts are only projected
// from journal movements if their opening balance is known.
export const moneyRound = value => Math.round((Number(value) || 0) * 100) / 100;
export const valueOrNull = value => value == null || value === "" || !Number.isFinite(Number(value))
  ? null : Number(value);
export const assetKey = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// These two historical labels refer to the same confirmed $500 PC.
// Do not merge two separately registered physical devices merely because
// their model numbers match.
export const equipmentAliasKey = value => {
  const key = assetKey(value);
  return key === "rtx2080pc" || key === "rtx2080superpc"
    ? "rtx2080superpc" : key;
};
const isEquipment = name => /rtx|gpu|computer|equipment|hardware|\bpc\b/i.test(String(name || ""));
const isBank = name => /^(cash\s*\/?\s*bank|bank|checking|business\s+cash|cash)$/i.test(String(name || "").trim());
const cashLike = name => /lulo|cash|bank|checking|savings|receivable|pending payout/i.test(String(name || ""));
export function balanceCategory(name) {
  if (/debt|loan|payable|credit card|liabilit/i.test(name)) return "liabilities";
  if (cashLike(name)) return "cash";
  if (/loopscale|defi|lending|invest|stock/i.test(name)) return "defi";
  if (isEquipment(name)) return "equipment";
  return "digital";
}
export function shiftAccountingMonth(month, offset) {
  const [year, number] = String(month).split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 15)).toISOString().slice(0, 7);
}
export function equipmentSchedule(device, month) {
  const cost = Number(device?.cost);
  const startMonth = String(device?.startMonth || "");
  const life = Math.max(1, Number(device?.usefulLifeMonths) || 60);
  if (!(cost > 0) || !/^\d{4}-\d{2}$/.test(startMonth) || month < startMonth) return null;
  const months = (Number(month.slice(0,4)) - Number(startMonth.slice(0,4))) * 12
    + Number(month.slice(5,7)) - Number(startMonth.slice(5,7));
  // Before the purchase the asset was not owned. During its first month,
  // acquisition increases assets; only monthly depreciation reduces its value.
  const start = months === 0 ? 0 : moneyRound(cost * (1 - Math.min(life, months) / life));
  const end = moneyRound(cost * (1 - Math.min(life, months + 1) / life));
  const beforeDep = moneyRound(cost * (1 - Math.min(life, months) / life));
  return {start, end, depreciation:moneyRound(beforeDep - end), cost};
}

function uniqueCandidates(saved, prior, live, current, currentMonth) {
  const result = new Map();
  const names = current.locked ? saved.map(row=>row.name)
    : [...saved.map(row=>row.name),...prior.map(row=>row.name),...Object.keys(live).map(name=>name==="btc"?"BTC":name)];
  for (const name of names) {
    const text = String(name || "").trim();
    const key = assetKey(text);
    if (key && !result.has(key)) result.set(key, text);
  }
  return result;
}

export function buildFinancialBalanceRows(month, records, live, hardwareDevices = [], currentMonth = month) {
  const current = records?.[month] || {}, previous = records?.[shiftAccountingMonth(month,-1)] || {};
  const saved = Array.isArray(current.items) ? current.items : [];
  const prior = Array.isArray(previous.items) ? previous.items : [];
  const extra = Array.isArray(current.balanceSheetItems) ? current.balanceSheetItems : [];
  const priorExtra = Array.isArray(previous.balanceSheetItems) ? previous.balanceSheetItems : [];
  const excludeNames = new Set((current.excluded || []).map(assetKey));
  const excludedEquipment = new Set(current.balanceExcluded || []);
  const ordinary = [], legacyHardware = [];
  for(const [key,name] of uniqueCandidates(saved,prior,live,current,currentMonth)) {
    if(excludeNames.has(key)) continue;
    const row = saved.find(item=>assetKey(item.name)===key) || {};
    const old = prior.find(item=>assetKey(item.name)===key) || {};
    const value = {
      id:"project:"+key, name, category:balanceCategory(name),
      start:valueOrNull(row.start) ?? (current.locked ? null : valueOrNull(old.end)),
      end:month===currentMonth && Number.isFinite(live[key])
        ? Number(live[key]) : valueOrNull(row.end),
      source:"monthly-changes",
    };
    if(value.category === "equipment") legacyHardware.push(value);
    else ordinary.push(value);
  }
  const equipment = [], usedLegacy = new Set(), usedExtra = new Set();
  // Carry forward saved fixed assets even when Monthly Changes has sealed a
  // historical month. Only persisted historical rows can flow forward into
  // a locked month; a newer Hardware Payback edit cannot rewrite it.
  const historicalExtraById = new Map();
  for(const [key,record] of Object.entries(records||{}).sort(([a],[b])=>a.localeCompare(b))) {
    if(key>=month || !Array.isArray(record?.balanceSheetItems)) continue;
    for(const row of record.balanceSheetItems) if(row?.id) historicalExtraById.set(row.id,row);
    for(const id of record.balanceExcluded||[]) historicalExtraById.delete(id);
  }
  const allExtra = [
    ...extra, ...[...historicalExtraById.values()].filter(row=>!extra.some(item=>item.id===row.id)),
  ];
  // Locked historical months are stored snapshots. Do not add recently edited
  // Hardware Payback items into them.
  const devices = current.locked ? [] : (Array.isArray(hardwareDevices) ? hardwareDevices : [])
    .filter(device=>Number(device?.cost)>0 && /^\d{4}-\d{2}$/.test(String(device.startMonth)));
  const seenIds = new Set();
  const deviceRows = devices.filter(device=>{
    const id = String(device.id || "");
    const key = id || assetKey(device.name)+":"+device.startMonth+":"+device.cost;
    if(seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  });
  for(const device of deviceRows) {
    const schedule = equipmentSchedule(device,month);
    if(!schedule) continue;
    const key = assetKey(device.name);
    // Exact name is used only for identifying an old seeded record, NEVER to
    // merge two physical Hardware Payback devices that happen to have the
    // same GPU model number.
    const oldIndex = legacyHardware.findIndex((row,i)=>!usedLegacy.has(i) && equipmentAliasKey(row.name)===equipmentAliasKey(device.name));
    const extraIndex = allExtra.findIndex((row,i)=>!usedExtra.has(i) && equipmentAliasKey(row.name)===equipmentAliasKey(device.name));
    if(oldIndex>=0) usedLegacy.add(oldIndex);
    if(extraIndex>=0) usedExtra.add(extraIndex);
    equipment.push({
      id:"device:"+String(device.id || key),name:String(device.name),category:"equipment",
      start:schedule.start,end:schedule.end,depreciation:schedule.depreciation,
      historicalCost:schedule.cost,acquisitionMonth:device.startMonth,source:"hardware-payback",
    });
  }
  // Include unmatched historical equipment and custom recorded fixed assets.
  legacyHardware.forEach((row,i)=>{
    if(usedLegacy.has(i)) return;
    const key=equipmentAliasKey(row.name);
    if(equipment.some(item=>equipmentAliasKey(item.name)===key && item.source!=="hardware-payback")) return;
    // A saved historical asset row takes precedence over its older alias
    // in the general project list.
    const aliasInSavedExtra = allExtra.some((asset,j)=>!usedExtra.has(j) &&
      equipmentAliasKey(asset.name)===key && asset.category==="equipment");
    if(aliasInSavedExtra) return;
    const canonical = key==="rtx2080superpc" || key==="rtx5070gpu";
    if(canonical && !current.locked && month>="2026-11") {
      const schedule=equipmentSchedule({cost:500,startMonth:"2026-11"},month);
      if(schedule) {equipment.push({...row,name:key==="rtx2080superpc"?"RTX 2080 Super PC":row.name,
        ...schedule,historicalCost:500,acquisitionMonth:"2026-11"});return;}
    }
    equipment.push(row);
  });
  allExtra.forEach((row,i)=>{
    if(usedExtra.has(i) || excludedEquipment.has(row.id)) return;
    const key = assetKey(row.name);
    if(equipment.some(item=>equipmentAliasKey(item.name)===equipmentAliasKey(row.name) &&
      item.source!=="hardware-payback")) return;
    let schedule = null;
    const savedThisMonth = extra.some(item=>item.id===row.id);
    if(row.category==="equipment" && row.placedInServiceMonth && Number(row.historicalCost)>0 &&
      !(current.locked && savedThisMonth))
      schedule = equipmentSchedule({cost:row.historicalCost,startMonth:row.placedInServiceMonth,
        usefulLifeMonths:row.usefulLifeMonths},month);
    const older = priorExtra.find(item=>item.id===row.id);
    equipment.push({
      id:row.id,name:row.name,category:row.category || balanceCategory(row.name),
      start:schedule?.start ?? (valueOrNull(row.start) ?? (current.locked?null:valueOrNull(older?.end))),
      end:schedule?.end ?? (valueOrNull(row.end) ?? (current.locked?null:valueOrNull(row.start))),
      ...(schedule ? {depreciation:schedule.depreciation,historicalCost:schedule.cost,acquisitionMonth:row.placedInServiceMonth} : {}),
      source:"saved-balance-sheet",
    });
  });
  // Two previously confirmed purchases are retained as fallback assets, but
  // only when that exact equipment isn't represented elsewhere. No extra
  // phantom unit is created for a differently named device of that model.
  if(!current.locked && month>="2026-11") {
    for(const fallback of [
      {id:"hardware:rtx2080super-pc",name:"RTX 2080 Super PC",cost:500,startMonth:"2026-11"},
      {id:"hardware:rtx5070",name:"RTX 5070 GPU",cost:500,startMonth:"2026-11"},
    ]) {
      if(excludedEquipment.has(fallback.id) ||
        equipment.some(row=>equipmentAliasKey(row.name)===equipmentAliasKey(fallback.name))) continue;
      const schedule = equipmentSchedule(fallback,month);
      if(schedule) equipment.push({id:fallback.id,name:fallback.name,category:"equipment",
        ...schedule,historicalCost:fallback.cost,acquisitionMonth:fallback.startMonth,source:"confirmed-fallback"});
    }
  }
  // An older record calls this one confirmed PC "RTX 2080 PC" while
  // newer records call it "RTX 2080 Super PC". Treat those labels as one
  // acquisition when the cost and service month agree. This merges only
  // the alias pair, not two separately registered PCs with identical names.
  const aliasNames = new Set(["rtx2080pc", "rtx2080superpc"]);
  const deduplicated = [];
  for (const row of equipment) {
    const key = assetKey(row.name);
    if (!aliasNames.has(key)) {
      deduplicated.push(row);
      continue;
    }
    const partnerIndex = deduplicated.findIndex(other =>
      aliasNames.has(assetKey(other.name)) &&
      assetKey(other.name) !== key &&
      Number.isFinite(Number(other.historicalCost)) &&
      Number.isFinite(Number(row.historicalCost)) &&
      Math.abs(Number(other.historicalCost) - Number(row.historicalCost)) < 0.005 &&
      String(other.acquisitionMonth || "") === String(row.acquisitionMonth || ""));
    if (partnerIndex < 0) {
      deduplicated.push(row);
      continue;
    }
    const priorRow = deduplicated[partnerIndex];
    const preferred = [row, priorRow].sort((a, b) =>
      Number(b.source === "hardware-payback") - Number(a.source === "hardware-payback") ||
      Number(assetKey(b.name) === "rtx2080superpc") - Number(assetKey(a.name) === "rtx2080superpc"))[0];
    deduplicated[partnerIndex] = { ...preferred, name: "RTX 2080 Super PC" };
  }
  // A saved custom liability is not a fixed asset.
  return [...ordinary,...deduplicated];
}

// Equipment purchases entered directly in the General Ledger also need an
// asset even when Hardware Payback has not yet been configured. Match known
// equipment by its name AND price so a second purchase isn't silently lost.
export function includeJournalEquipment(baseRows, journal, month, locked = false) {
  const rows = (baseRows || []).map(row=>({...row}));
  if(locked) return rows;
  for(const entry of journal || []) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date||"")) ||
      String(entry.date).slice(0,7)>month) continue;
    // Compound entries have a lines array; older purchases have debitAccount/amount.
    // Only a debit to the generic equipment account creates a NEW asset. A
    // debit to an existing equipment subaccount must not fabricate another GPU.
    const amount = moneyRound(journalActivity(entry,"equipment"));
    if(!(amount>0)) continue;
    const description = String(entry.description||"");
    const cleaned = assetKey(description);
    const matched = rows.some(row => row.category==="equipment" &&
      equipmentAliasKey(row.name).length>=5 &&
      (cleaned.includes(assetKey(row.name)) || cleaned.includes(equipmentAliasKey(row.name)) ||
        (equipmentAliasKey(row.name)==="rtx2080superpc" && cleaned.includes("rtx2080pc"))) &&
      Math.abs(Number(row.historicalCost ?? amount)-amount)<=.005);
    if(matched || rows.some(row=>row.id==="journal-equipment:"+entry.id)) continue;
    const schedule = equipmentSchedule({cost:amount,startMonth:entry.date.slice(0,7)},month);
    if(schedule) rows.push({
      id:"journal-equipment:"+String(entry.id || cleaned+entry.date),
      name:"Equipment — "+(description.length>55?description.slice(0,55)+"…":description),
      category:"equipment",...schedule,historicalCost:amount,
      acquisitionMonth:entry.date.slice(0,7),source:"journal-purchase",
    });
  }
  return rows;
}

export function unmatchedEquipmentPurchases(rows, journal, month) {
  const acquired=(rows||[]).filter(row=>
    row.category==="equipment" && row.acquisitionMonth===month &&
    row.source!=="journal-purchase" && Number(row.historicalCost)>0);
  const spentIds=new Set();
  return acquired.filter(asset=>{
    const cost=Number(asset.historicalCost);
    const name=assetKey(asset.name);
    const match=(journal||[]).find(entry=>{
      if(spentIds.has(entry.id) ||
        String(entry.date||"").slice(0,7)!==month ||
        Math.abs(journalActivity(entry,"equipment")-cost)>.005) return false;
      const description=assetKey(entry.description);
      return description.includes(name) ||
        (equipmentAliasKey(asset.name)==="rtx2080superpc" &&
          (description.includes("rtx2080pc") || description.includes("rtx2080superpc")));
    });
    if(match){spentIds.add(match.id);return false;}
    return true;
  });
}

export function journalAccountActivity(entries, account) {
  return moneyRound((entries||[]).reduce((sum,entry)=>sum+
    (entry.lines || []).reduce((value,line)=>line.account===account
      ? value + Number(line.debit||0)-Number(line.credit||0) : value,0),0));
}

export function derivePayableOpening(month, manualJournal = []) {
  return moneyRound((manualJournal || []).reduce((sum,entry)=>{
    if(String(entry.date || "").slice(0,7)>=month) return sum;
    return sum - journalActivity(entry,"payable");
  },0));
}

export function buildStatementRows(baseRows, ledgerEntries, opts={}) {
  const rows = (baseRows||[]).map(row=>({...row}));
  const cashDelta = journalAccountActivity(ledgerEntries,"cash");
  const payableDelta = -journalAccountActivity(ledgerEntries,"payable");
  const payableOpening = valueOrNull(opts.payableOpening) ?? 0;
  const explicitCash = rows.find(row=>isBank(row.name) && row.category==="cash");
  const cashOpening = valueOrNull(opts.cashOpening);
  if(explicitCash) {
    const start = cashOpening ?? explicitCash.start;
    const end = explicitCash.end ?? (start === null ? null : moneyRound(start+cashDelta));
    explicitCash.start = start;
    explicitCash.end = end;
    explicitCash.journalChange = cashDelta;
    explicitCash.unverifiedOpening = start === null;
    explicitCash.explicitEnd = valueOrNull((baseRows||[]).find(row=>row.id===explicitCash.id)?.end) !== null;
    if(explicitCash.explicitEnd && start!==null)
      explicitCash.unreconciledCash = moneyRound(end-start-cashDelta);
  } else if(cashDelta!==0 || cashOpening!==null) {
    rows.push({id:"ledger:cash",name:"Cash / Bank",category:"cash",
      start:cashOpening,end:cashOpening === null ? null : moneyRound(cashOpening+cashDelta),
      journalChange:cashDelta,unverifiedOpening:cashOpening===null,
      source:"ledger"});
  }
  const payable = rows.find(row=>/^(accounts\s+payable|payable)$/i.test(row.name));
  if(payable) {
    const start = payable.start ?? payableOpening;
    payable.start = start;
    payable.end = payable.end ?? moneyRound(start+payableDelta);
    payable.journalChange = payableDelta;
  } else if(payableDelta!==0 || payableOpening!==0) {
    rows.push({id:"ledger:payable",name:"Accounts Payable",category:"liabilities",
      start:payableOpening,end:moneyRound(payableOpening+payableDelta),
      journalChange:payableDelta,source:"ledger"});
  }
  return rows;
}

// User-confirmed correction: the $500 RTX 2080 Super PC was purchased
// with personal funds and contributed to the mining business. Update the
// ORIGINAL entry instead of posting a second purchase or adjusting business cash.
// Restrict migration to one unambiguous November 2026 PC purchase.
export function reclassifyPersonalPcContribution(journal) {
  if (!Array.isArray(journal)) return { entries: [], changed: false, matchCount: 0 };
  const candidates = journal.filter(entry => {
    const description = String(entry?.description || "");
    return String(entry?.date || "").startsWith("2026-11") &&
      entry?.debitAccount === "equipment" &&
      entry?.creditAccount === "cash" &&
      Math.abs(Number(entry?.amount) - 500) < 0.005 &&
      /\b2080\b/i.test(description) &&
      /\b(?:pc|computer)\b/i.test(description);
  });
  // Never silently rewrite multiple similar entries or another purchase.
  if (candidates.length !== 1) return { entries: journal, changed: false, matchCount: candidates.length };
  const target = candidates[0];
  return {
    entries: journal.map(entry => entry === target ? {
      ...entry, creditAccount: "equity", fundingSource: "personal-owner-contribution",
      originalCreditAccount: "cash",
    } : entry),
    changed: true, matchCount: 1,
  };
}

export function deriveCashOpening(month, openings, manualJournal = [], confirmedMovements = []) {
  const direct = valueOrNull(openings?.[month]);
  if(direct!==null) return direct;
  const olderMonths=Object.keys(openings||{})
    .filter(key=>/^\d{4}-\d{2}$/.test(key) && key < month && valueOrNull(openings[key])!==null)
    .sort();
  if(!olderMonths.length) return null;
  const baseline = olderMonths[olderMonths.length-1];
  let opening=valueOrNull(openings[baseline]);
  for(const entry of manualJournal) {
    const date=String(entry.date||"");
    if(date.slice(0,7)<baseline || date.slice(0,7)>=month) continue;
    opening += journalActivity(entry,"cash");
  }
  // Previously confirmed transfers count only if they weren't also posted
  // manually. This avoids double-deducting an old cash withdrawal.
  for(const movement of confirmedMovements||[]) {
    const date=String(movement.date||"");
    if(date.slice(0,7)<baseline || date.slice(0,7)>=month) continue;
    const feeTypes=["fee","transaction_fee","network_fee"];
    const isFee=feeTypes.includes(movement.type);
    const alreadyManual = manualJournal.some(entry=>entry.date===date &&
      Math.abs((Number(entry.amount)||0)-(Number(movement.amount)||0))<.005 &&
      entry.creditAccount===movement.from &&
      entry.debitAccount===(isFee?"fees":movement.to));
    if(alreadyManual) continue;
    if(movement.from==="cash") opening -= Number(movement.amount)||0;
    if(!isFee && movement.to==="cash") opening += Number(movement.amount)||0;
    if(movement.from==="cash" && !isFee) opening -= Number(movement.feeUsd)||0;
  }
  return moneyRound(opening);
}

export function buildFinancialProfit(entries, savedExpenses) {
  const balances = account => journalAccountActivity(entries,account);
  const revenue = moneyRound(-balances("revenue")-balances("dividendRevenue"));
  const disposalGain = moneyRound(-balances("gainDisposal"));
  const fees = Math.max(0,balances("fees"));
  const ordinaryJournal = Math.max(0,moneyRound(balances("expense")+balances("electric")));
  const depreciation = Math.max(0,balances("depreciation"));
  const saved = valueOrNull(savedExpenses);
  // The legacy Monthly Changes expense snapshot is an unitemized estimate.
  // Do not add the same ordinary expenses again; separately identified fees
  // are posted on top of that unitemized snapshot.
  const operating = Math.max(saved||0,ordinaryJournal);
  const expenses = moneyRound(operating+fees);
  return {revenue,disposalGain,operating,fees,depreciation,expenses,
    profit:moneyRound(revenue+disposalGain-expenses-depreciation),
    unitemizedExpenseOverlap:saved!==null && ordinaryJournal>0,
    savedExpenses:saved};
}

export function classifyCashFlows(entries) {
  const sections={operating:[],investing:[],financing:[],transfers:[]};
  for(const entry of entries||[]) {
    const cash = (entry.lines||[]).filter(line=>line.account==="cash")
      .reduce((n,line)=>n+Number(line.debit||0)-Number(line.credit||0),0);
    if(Math.abs(cash)<.005)continue;
    const other = (entry.lines||[]).filter(line=>line.account!=="cash").map(line=>line.account);
    const category = other.some(a=>a==="equipment" || a.startsWith("equipment:")) ? "investing" :
      other.some(a=>a==="equity") ? "financing" :
      other.some(a=>["revenue","dividendRevenue","expense","fees","electric"].includes(a))
        ? "operating" : "transfers";
    sections[category].push({id:entry.id,date:entry.date,description:entry.description,delta:moneyRound(cash)});
  }
  const totals = Object.fromEntries(Object.entries(sections)
    .map(([key,items])=>[key,moneyRound(items.reduce((sum,item)=>sum+item.delta,0))]));
  return {sections,totals,total:moneyRound(Object.values(totals).reduce((sum,value)=>sum+value,0))};
}
