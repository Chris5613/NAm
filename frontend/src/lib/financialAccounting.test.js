import {
  buildFinancialBalanceRows, buildStatementRows, buildFinancialProfit, classifyCashFlows,
  equipmentSchedule, deriveCashOpening, derivePayableOpening,
  includeJournalEquipment, unmatchedEquipmentPurchases, journalAccountActivity,
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
