// Financials calculation helpers. Account balances observed from trackers
// are NOT incremented again by the income journal; those trackers already
// include the mining earnings. Bank and payable accounts are only projected
// from journal movements if their opening balance is known.
export const moneyRound = value => Math.round((Number(value) || 0) * 100) / 100;
export const valueOrNull = value => value == null || value === "" || !Number.isFinite(Number(value))
  ? null : Number(value);
export const assetKey = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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
  return {start, end, depreciation:moneyRound(
    cost * (Math.min(life, months+1) - Math.min(life, months)) / life), cost};
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
  const allExtra = current.locked ? extra : [
    ...extra, ...priorExtra.filter(row=>!extra.some(item=>item.id===row.id)),
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
    const oldIndex = legacyHardware.findIndex((row,i)=>!usedLegacy.has(i) && assetKey(row.name)===key);
    const extraIndex = allExtra.findIndex((row,i)=>!usedExtra.has(i) && assetKey(row.name)===key);
    if(oldIndex>=0) usedLegacy.add(oldIndex);
    if(extraIndex>=0) usedExtra.add(extraIndex);
    equipment.push({
      id:"device:"+String(device.id || key),name:String(device.name),category:"equipment",
      start:schedule.start,end:schedule.end,depreciation:schedule.depreciation,
      historicalCost:schedule.cost,source:"hardware-payback",
    });
  }
  // Include unmatched historical equipment and custom recorded fixed assets.
  legacyHardware.forEach((row,i)=>{if(!usedLegacy.has(i)) equipment.push(row);});
  allExtra.forEach((row,i)=>{
    if(usedExtra.has(i) || excludedEquipment.has(row.id)) return;
    const key = assetKey(row.name);
    if(equipment.some(item=>assetKey(item.name)===key && item.source==="monthly-changes")) return;
    let schedule = null;
    if(row.category==="equipment" && row.placedInServiceMonth && Number(row.historicalCost)>0)
      schedule = equipmentSchedule({cost:row.historicalCost,startMonth:row.placedInServiceMonth,
        usefulLifeMonths:row.usefulLifeMonths},month);
    const older = priorExtra.find(item=>item.id===row.id);
    equipment.push({
      id:row.id,name:row.name,category:row.category || balanceCategory(row.name),
      start:schedule?.start ?? (valueOrNull(row.start) ?? (current.locked?null:valueOrNull(older?.end))),
      end:schedule?.end ?? (valueOrNull(row.end) ?? (current.locked?null:valueOrNull(row.start))),
      ...(schedule ? {depreciation:schedule.depreciation,historicalCost:schedule.cost} : {}),
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
      const model = fallback.id.includes("2080") ? "2080" : "5070";
      if(excludedEquipment.has(fallback.id) ||
        equipment.some(row=>new RegExp(model).test(row.name))) continue;
      const schedule = equipmentSchedule(fallback,month);
      if(schedule) equipment.push({id:fallback.id,name:fallback.name,category:"equipment",
        ...schedule,historicalCost:fallback.cost,source:"confirmed-fallback"});
    }
  }
  // A saved custom liability is not a fixed asset.
  return [...ordinary,...equipment];
}

export function journalAccountActivity(entries, account) {
  return moneyRound((entries||[]).reduce((sum,entry)=>sum+
    (entry.lines || []).reduce((value,line)=>line.account===account
      ? value + Number(line.debit||0)-Number(line.credit||0) : value,0),0));
}

export function buildStatementRows(baseRows, ledgerEntries, opts={}) {
  const rows = (baseRows||[]).map(row=>({...row}));
  const cashDelta = journalAccountActivity(ledgerEntries,"cash");
  const payableDelta = -journalAccountActivity(ledgerEntries,"payable");
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
    const start = payable.start;
    payable.end = payable.end ?? (start === null ? null : moneyRound(start+payableDelta));
    payable.journalChange = payableDelta;
  } else if(payableDelta!==0) {
    rows.push({id:"ledger:payable",name:"Accounts Payable",category:"liabilities",
      start:0,end:payableDelta,journalChange:payableDelta,source:"ledger"});
  }
  return rows;
}

export function buildFinancialProfit(entries, savedExpenses) {
  const balances = account => journalAccountActivity(entries,account);
  const revenue = moneyRound(-balances("revenue")-balances("dividendRevenue"));
  const fees = Math.max(0,balances("fees"));
  const ordinaryJournal = Math.max(0,moneyRound(balances("expense")+balances("electric")));
  const depreciation = Math.max(0,balances("depreciation"));
  const saved = valueOrNull(savedExpenses);
  // The legacy Monthly Changes expense snapshot is an unitemized estimate.
  // Do not add the same ordinary expenses again; separately identified fees
  // are posted on top of that unitemized snapshot.
  const operating = Math.max(saved||0,ordinaryJournal);
  const expenses = moneyRound(operating+fees);
  return {revenue,operating,fees,depreciation,expenses,
    profit:moneyRound(revenue-expenses-depreciation),
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
    const category = other.some(a=>a==="equipment") ? "investing" :
      other.some(a=>a==="equity") ? "financing" :
      other.some(a=>["revenue","dividendRevenue","expense","fees","electric"].includes(a))
        ? "operating" : "transfers";
    sections[category].push({id:entry.id,date:entry.date,description:entry.description,delta:moneyRound(cash)});
  }
  const totals = Object.fromEntries(Object.entries(sections)
    .map(([key,items])=>[key,moneyRound(items.reduce((sum,item)=>sum+item.delta,0))]));
  return {sections,totals,total:moneyRound(Object.values(totals).reduce((sum,value)=>sum+value,0))};
}
