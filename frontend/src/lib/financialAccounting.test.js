import {
  buildFinancialBalanceRows, buildStatementRows, buildFinancialProfit, classifyCashFlows, splitFinancialRevenue,
  equipmentSchedule, deriveCashOpening, derivePayableOpening,
  includeJournalEquipment, unmatchedEquipmentPurchases,
  reclassifyPersonalPcContribution, journalAccountActivity,
} from "./financialAccounting";

const month="2026-11";
const postedPurchase={id:"pc-purchase",date:"2026-11-05",
  description:"Paid $500 for RTX 2080 Super PC Nov 5th",
  lines:[{account:"equipment",debit:500,credit:0},
    {account:"cash",debit:0,credit:500}]};
const purchase = () => [postedPurchase];

test("existing PC appears once even when Monthly Changes has two representations",()=>{
  const records={[month]:{
    items:[{name:"RTX 2080 Super PC",start:500,end:491.67}],
    balanceSheetItems:[{id:"hardware:rtx2080super-pc",name:"RTX 2080 Super PC",
      category:"equipment",historicalCost:500,usefulLifeMonths:60,placedInServiceMonth:month}],
  }};
  const rows=buildFinancialBalanceRows(month,records,{},[],month);
  expect(rows.filter(item=>item.name==="RTX 2080 Super PC")).toHaveLength(1);
  expect(rows.find(item=>item.name==="RTX 2080 Super PC").start).toBe(0);
  expect(rows.find(item=>item.name==="RTX 2080 Super PC").end).toBe(491.67);
});

test("separate physical GPUs with identical names retain unique device IDs",()=>{
  const devices=[
    {id:"gpu-a",name:"RTX 2080 Super PC",cost:500,startMonth:month},
    {id:"gpu-b",name:"RTX 2080 Super PC",cost:700,startMonth:month},
  ];
  const rows=buildFinancialBalanceRows(month,{}, {},devices,month);
  expect(rows.filter(row=>row.name==="RTX 2080 Super PC")).toHaveLength(2);
  expect(rows.find(row=>row.id==="device:gpu-a").end).toBe(491.67);
  expect(rows.find(row=>row.id==="device:gpu-b").end).toBe(688.33);
});

test("locked historical months are not overwritten by later equipment additions",()=>{
  const records={[month]:{locked:true,balanceSheetItems:[{id:"saved",name:"Saved PC",category:"equipment",start:500,end:491.67}]}};
  const devices=[{id:"late",name:"Additional GPU",cost:1000,startMonth:month}];
  expect(buildFinancialBalanceRows(month,records,{},devices,month).map(item=>item.id)).toEqual(["saved"]);
});

test("equipment depreciation reaches exactly zero after 60 months",()=>{
  const device={id:"pc",name:"RTX 2080 Super PC",cost:500,startMonth:month};
  const months=Array.from({length:60},(_,i)=>{
    const d=new Date(Date.UTC(2026,10+i,15));
    return equipmentSchedule(device,d.toISOString().slice(0,7));
  });
  expect(months[0].start).toBe(0);
  expect(months[0].end).toBe(491.67);
  expect(months[59].end).toBe(0);
  expect(Math.round(months.reduce((sum,row)=>sum+row.depreciation,0)*100)/100).toBe(500);
  expect(equipmentSchedule(device,"2031-11").depreciation).toBe(0);
});

test("$500 PC purchase debits equipment, credits bank, and is investing cash flow",()=>{
  const rows=buildStatementRows(buildFinancialBalanceRows(month,{}, {},[],month),purchase(),{cashOpening:600});
  const bank=rows.find(row=>row.id==="ledger:cash");
  expect(bank.start).toBe(600);
  expect(bank.end).toBe(100);
  expect(bank.journalChange).toBe(-500);
  const flow=classifyCashFlows(purchase());
  expect(flow.totals.investing).toBe(-500);
  expect(flow.totals.operating).toBe(0);
  expect(buildFinancialProfit(purchase(),null).expenses).toBe(0);
});

test("unknown bank opening does not manufacture a negative ending balance",()=>{
  const rows=buildStatementRows([],purchase(),{});
  const bank=rows.find(row=>row.id==="ledger:cash");
  expect(bank.start).toBeNull();
  expect(bank.end).toBeNull();
  expect(bank.journalChange).toBe(-500);
  expect(bank.unverifiedOpening).toBe(true);
});

test("bank opening carries forward without counting transaction twice",()=>{
  const past=[{date:"2026-11-05",debitAccount:"equipment",creditAccount:"cash",amount:500}];
  expect(deriveCashOpening("2026-12",{"2026-11":600},past,[])).toBe(100);
  expect(deriveCashOpening("2027-01",{"2026-11":600},past,[])).toBe(100);
  expect(deriveCashOpening("2026-12",{"2026-11":600,"2026-12":200},past,[])).toBe(200);
});

test("manual revenue that was not in tracked source is recognized",()=>{
  const entries=[{lines:[{account:"platform",debit:20,credit:0},{account:"revenue",debit:0,credit:20}]}];
  const report=buildFinancialProfit(entries,0);
  expect(report.revenue).toBe(20);
  expect(report.profit).toBe(20);
});

test("saved expenses and separate transaction fee are both recognized",()=>{
  const entries=[{lines:[{account:"fees",debit:10,credit:0},{account:"cash",debit:0,credit:10}]}];
  const result=buildFinancialProfit(entries,100);
  expect(result.operating).toBe(100);
  expect(result.fees).toBe(10);
  expect(result.expenses).toBe(110);
  expect(result.profit).toBe(-110);
});

test("ordinary journal expense that overlaps saved monthly total is not counted twice",()=>{
  const entries=[{lines:[{account:"expense",debit:60,credit:0},{account:"cash",debit:0,credit:60}]}];
  const result=buildFinancialProfit(entries,100);
  expect(result.operating).toBe(100);
  expect(result.expenses).toBe(100);
  expect(result.unitemizedExpenseOverlap).toBe(true);
});

test("income earned on platform is not counted as cash received",()=>{
  const accrual=[{id:"auto",lines:[{account:"platform:kryptex",debit:25,credit:0},{account:"revenue",debit:0,credit:25}]}];
  const flow=classifyCashFlows(accrual);
  expect(flow.total).toBe(0);
  expect(journalAccountActivity(accrual,"platform:kryptex")).toBe(25);
});

test("bank transfer to BTC is not new income",()=>{
  const entries=[{id:"transfer",lines:[{account:"crypto",debit:25,credit:0},{account:"cash",debit:0,credit:25}]}];
  expect(buildFinancialProfit(entries,0).revenue).toBe(0);
  expect(classifyCashFlows(entries).totals.transfers).toBe(-25);
});


test("existing $500 PC journal matches one owned asset, and 5070 still needs funding confirmation",()=>{
  const purchase={id:"pc",date:"2026-11-05",description:"Paid $500 for RTX 2080 Super PC Nov 5th",
    debitAccount:"equipment",creditAccount:"cash",amount:500};
  const rows=includeJournalEquipment(buildFinancialBalanceRows(month,{}, {},[],month),[purchase],month);
  expect(rows.filter(row=>row.name==="RTX 2080 Super PC")).toHaveLength(1);
  expect(unmatchedEquipmentPurchases(rows,[purchase],month).map(row=>row.name)).toEqual(["RTX 5070 GPU"]);
});

test("ledger-only equipment purchases appear as assets exactly once",()=>{
  const journal=[{id:"extra",date:"2026-11-10",description:"Bought $200 extra GPU board",
    debitAccount:"equipment",creditAccount:"cash",amount:200}];
  const first=includeJournalEquipment(buildFinancialBalanceRows(month,{}, {},[],month),journal,month);
  expect(first.filter(row=>row.source==="journal-purchase")).toHaveLength(1);
  const next=includeJournalEquipment(first,journal,month);
  expect(next.filter(row=>row.source==="journal-purchase")).toHaveLength(1);
});

test("unpaid bill carries into following month and closes when paid",()=>{
  const past=[{date:"2026-11-10",amount:75,debitAccount:"expense",creditAccount:"payable"}];
  expect(derivePayableOpening("2026-12",past)).toBe(75);
  const billSettlement={id:"settlement",date:"2026-12-05",lines:[
    {account:"payable",debit:75,credit:0},{account:"cash",debit:0,credit:75}]};
  const rows=buildStatementRows([], [billSettlement],{payableOpening:derivePayableOpening("2026-12",past)});
  const payable=rows.find(row=>row.id==="ledger:payable");
  expect(payable.start).toBe(75);
  expect(payable.end).toBe(0);
});

test("locked January can carry forward November-purchased hardware without importing new trackers",()=>{
  const records={
    "2026-11":{balanceSheetItems:[{id:"old-pc",name:"RTX 2080 Super PC",category:"equipment",
      historicalCost:500,placedInServiceMonth:"2026-11",usefulLifeMonths:60,start:0,end:491.67}]},
    "2026-12":{locked:true,items:[]},
    "2027-01":{locked:true,items:[]},
  };
  const devices=[{id:"late-5070",name:"Late GPU",startMonth:"2026-11",cost:900}];
  const rows=buildFinancialBalanceRows("2027-01",records,{},devices,"2027-04");
  expect(rows.map(row=>row.id)).toEqual(["old-pc"]);
  expect(rows[0].end).toBe(475);
});


test("personally funded 2080 PC is reclassified in the same entry, not duplicated", () => {
  const existing = {id:"pc-purchase",date:"2026-11-05",
    description:"Paid $500 for RTX 2080 Super PC Nov 5th",amount:500,
    debitAccount:"equipment",creditAccount:"cash"};
  const result = reclassifyPersonalPcContribution([existing]);
  expect(result.changed).toBe(true);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0].id).toBe("pc-purchase");
  expect(result.entries[0].creditAccount).toBe("equity");
  expect(result.entries[0].debitAccount).toBe("equipment");
  expect(result.entries[0].fundingSource).toBe("personal-owner-contribution");
  const balanced = [{...result.entries[0],lines:[
    {account:"equipment",debit:500,credit:0},{account:"equity",debit:0,credit:500},
  ]}];
  expect(journalAccountActivity(balanced,"cash")).toBe(0);
  expect(journalAccountActivity(balanced,"equity")).toBe(-500);
  expect(classifyCashFlows(balanced).total).toBe(0);
  expect(buildFinancialProfit(balanced,0).expenses).toBe(0);
});

test("PC owner investment correction is idempotent across store hydration", () => {
  const original=[{id:"pc",date:"2026-11-05",description:"RTX 2080 Super PC",
    debitAccount:"equipment",creditAccount:"cash",amount:500}];
  const updated=reclassifyPersonalPcContribution(original);
  const second=reclassifyPersonalPcContribution(updated.entries);
  expect(updated.changed).toBe(true);
  expect(second.changed).toBe(false);
  expect(second.entries).toHaveLength(1);
});

test("correction leaves other bank equipment purchases untouched", () => {
  const other = {id:"other",date:"2026-11-12",
    description:"Purchased RTX 5070 GPU with business cash",amount:500,
    debitAccount:"equipment",creditAccount:"cash"};
  const output=reclassifyPersonalPcContribution([other]);
  expect(output.changed).toBe(false);
  expect(output.entries[0].creditAccount).toBe("cash");
});

test("ambiguous duplicate 2080 purchase entries are not silently changed", () => {
  const same={date:"2026-11-05",description:"Paid 500 for RTX 2080 Super PC",
    amount:500,debitAccount:"equipment",creditAccount:"cash"};
  const output=reclassifyPersonalPcContribution([{...same,id:"a"},{...same,id:"b"}]);
  expect(output.changed).toBe(false);
  expect(output.matchCount).toBe(2);
  expect(output.entries[0].creditAccount).toBe("cash");
});


test("RTX 2080 PC legacy label and RTX 2080 Super PC saved asset display only once",()=>{
  const records={"2026-11":{
    items:[{name:"RTX 2080 PC",start:500,end:491.67}],
    balanceSheetItems:[{id:"hardware:rtx2080super-pc",name:"RTX 2080 Super PC",
      category:"equipment",historicalCost:500,usefulLifeMonths:60,placedInServiceMonth:"2026-11"}],
  }};
  const rows=buildFinancialBalanceRows("2026-11",records,{},[],"2026-11");
  expect(rows.filter(row=>/RTX 2080/i.test(row.name))).toHaveLength(1);
  expect(rows.find(row=>/RTX 2080/i.test(row.name)).name).toBe("RTX 2080 Super PC");
  expect(rows.find(row=>/RTX 2080/i.test(row.name)).end).toBe(491.67);
});

test("RTX 2080 PC legacy alias does not create a second tracked PC",()=>{
  const records={"2026-11":{items:[{name:"RTX 2080 PC",start:500,end:491.67}]}};
  const devices=[{id:"pc-one",name:"RTX 2080 Super PC",cost:500,startMonth:"2026-11"}];
  const rows=buildFinancialBalanceRows("2026-11",records,{},devices,"2026-11");
  expect(rows.filter(row=>/RTX 2080/i.test(row.name))).toHaveLength(1);
  expect(rows.find(row=>/RTX 2080/i.test(row.name)).id).toBe("device:pc-one");
});

test("a legacy RTX 2080 PC alone is normalized to the confirmed hardware name",()=>{
  const records={"2026-11":{items:[{name:"RTX 2080 PC",start:500,end:491.67}]}};
  const rows=buildFinancialBalanceRows("2026-11",records,{},[],"2026-11");
  expect(rows.filter(row=>/RTX 2080/i.test(row.name))).toHaveLength(1);
  expect(rows.find(row=>/RTX 2080/i.test(row.name)).name).toBe("RTX 2080 Super PC");
});

test("two physical RTX 2080 devices with different Hardware Payback IDs remain separate",()=>{
  const devices=[
    {id:"pc-1",name:"RTX 2080 PC",cost:500,startMonth:"2026-11"},
    {id:"pc-2",name:"RTX 2080 Super PC",cost:700,startMonth:"2026-11"},
  ];
  const rows=buildFinancialBalanceRows("2026-11",{}, {},devices,"2026-11");
  expect(rows.filter(row=>/RTX 2080/i.test(row.name))).toHaveLength(2);
});


test("RTX 2080 PC and RTX 2080 Super PC aliases appear as one asset", () => {
  const devices=[
    {id:"older",name:"RTX 2080 PC",cost:500,startMonth:"2026-11"},
    {id:"newer",name:"RTX 2080 Super PC",cost:500,startMonth:"2026-11"},
  ];
  const rows=buildFinancialBalanceRows("2026-11",{}, {},devices,"2026-11");
  const pc=rows.filter(row=>/RTX 2080/i.test(row.name));
  expect(pc).toHaveLength(1);
  expect(pc[0].name).toBe("RTX 2080 Super PC");
  expect(pc[0].end).toBe(491.67);
});

test("separately owned same-name 2080 machines are not merged", () => {
  const devices=[
    {id:"one",name:"RTX 2080 Super PC",cost:500,startMonth:"2026-11"},
    {id:"two",name:"RTX 2080 Super PC",cost:500,startMonth:"2026-11"},
  ];
  const rows=buildFinancialBalanceRows("2026-11",{}, {},devices,"2026-11");
  expect(rows.filter(row=>row.name==="RTX 2080 Super PC")).toHaveLength(2);
});

test("2080 variants with different acquisition costs are preserved separately", () => {
  const devices=[
    {id:"one",name:"RTX 2080 PC",cost:500,startMonth:"2026-11"},
    {id:"two",name:"RTX 2080 Super PC",cost:900,startMonth:"2026-11"},
  ];
  const rows=buildFinancialBalanceRows("2026-11",{}, {},devices,"2026-11");
  expect(rows.filter(row=>/RTX 2080/i.test(row.name))).toHaveLength(2);
});

test("multi-line RTX 5080 cash purchase creates one balance sheet asset and investing cash outflow",()=>{
  const entry={id:"5080-purchase",date:"2026-11-12",description:"Purchased RTX 5080 GPU for cash",lines:[
    {account:"equipment",debit:1950,credit:0},
    {account:"cash",debit:0,credit:1950},
  ]};
  const first=includeJournalEquipment([], [entry], "2026-11");
  expect(first).toHaveLength(1);
  expect(first[0].historicalCost).toBe(1950);
  expect(first[0].end).toBe(1917.5);
  expect(includeJournalEquipment(first,[entry],"2026-11")).toHaveLength(1);
  expect(classifyCashFlows([entry]).totals.investing).toBe(-1950);
  expect(buildStatementRows(first,[entry],{cashOpening:2000})
    .find(row=>row.id==="ledger:cash").end).toBe(50);
});

test("existing equipment subaccount cash transaction is classified as investing without duplicating a new asset",()=>{
  const entry={id:"existing",date:"2026-11-12",description:"Payment for existing equipment",lines:[
    {account:"equipment:hardware:rtx5070",debit:200,credit:0},
    {account:"cash",debit:0,credit:200},
  ]};
  expect(includeJournalEquipment([], [entry], "2026-11")).toEqual([]);
  expect(classifyCashFlows([entry]).totals.investing).toBe(-200);
});

test("owner-funded equipment acquisition has no business cash flow",()=>{
  const entry={id:"owner",date:"2026-11-12",description:"Purchased RTX 5080 from personal funds",lines:[
    {account:"equipment",debit:1950,credit:0},
    {account:"equity",debit:0,credit:1950},
  ]};
  expect(includeJournalEquipment([], [entry], "2026-11")).toHaveLength(1);
  expect(classifyCashFlows([entry]).total).toBe(0);
});

test("income statement separates synced mining, yield and dividend revenue without changing totals",()=>{
  const entries=[
    {id:"synced-income:2026-11:kryptex",description:"Synced Kryptex income",
      lines:[{account:"platform:kryptex",debit:10,credit:0},{account:"revenue",debit:0,credit:10}]},
    {id:"synced-income:2026-11:rollercoin",description:"Synced RollerCoin income",
      lines:[{account:"platform:rollercoin",debit:5,credit:0},{account:"revenue",debit:0,credit:5}]},
    {id:"synced-income:2026-11:lulo",description:"Synced Lulo income",
      lines:[{account:"luloCash",debit:8,credit:0},{account:"revenue",debit:0,credit:8}]},
    {id:"synced-income:2026-11:loopscale",description:"Synced Loopscale income",
      lines:[{account:"defi",debit:7,credit:0},{account:"revenue",debit:0,credit:7}]},
    {id:"synced-income:2026-11:stocks",description:"Synced Stocks income",
      lines:[{account:"brokerage",debit:3,credit:0},{account:"dividendRevenue",debit:0,credit:3}]},
    {id:"journal:manual",description:"Miscellaneous income",
      lines:[{account:"cash",debit:2,credit:0},{account:"revenue",debit:0,credit:2}]},
  ];
  const split=splitFinancialRevenue(entries);
  expect(split).toEqual({mining:15,yield:15,dividends:3,unclassified:2});
  expect(split.mining+split.yield+split.dividends+split.unclassified)
    .toBe(buildFinancialProfit(entries,null).revenue);
});

test("cash withdrawals are excluded from yield revenue",()=>{
  const withdrawal={id:"journal:withdrawal",description:"Withdrawal from Lulo",
    lines:[{account:"cash",debit:1500,credit:0},{account:"luloCash",debit:0,credit:1500}]};
  expect(splitFinancialRevenue([withdrawal])).toEqual({
    mining:0,yield:0,dividends:0,unclassified:0,
  });
});
