import {
  buildFinancialBalanceRows, buildStatementRows,
  equipmentSchedule,
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

test("unknown bank opening does not manufacture a negative ending balance",()=>{
  const rows=buildStatementRows([],purchase(),{});
  const bank=rows.find(row=>row.id==="ledger:cash");
  expect(bank.start).toBeNull();
  expect(bank.end).toBeNull();
  expect(bank.journalChange).toBe(-500);
  expect(bank.unverifiedOpening).toBe(true);
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
  const billSettlement={id:"settlement",date:"2026-12-05",lines:[
    {account:"payable",debit:75,credit:0},{account:"cash",debit:0,credit:75}]};
  const rows=buildStatementRows([], [billSettlement],{payableOpening:75});
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

test("crediting the RTX 5070 individual account retires it from the balance sheet",()=>{
  const asset={id:"hardware:rtx5070",name:"RTX 5070 GPU",category:"equipment",
    historicalCost:500,acquisitionMonth:"2026-11",start:0,end:491.67,
    depreciation:8.33,source:"confirmed-fallback"};
  const dispose={id:"trade-5070",date:"2026-11-12",description:"Trade RTX 5070 for RTX 5080",lines:[
    {account:"equipment:hardware:rtx5070",debit:0,credit:491.67},
    {account:"equipment",debit:1950,credit:0},
    {account:"equity",debit:0,credit:1250},
    {account:"gainDisposal",debit:0,credit:208.33},
  ]};
  const rows=includeJournalEquipment([asset],[dispose],"2026-11");
  const old=rows.find(row=>row.id===asset.id);
  expect(old.retired).toBe(true);
  expect(old.end).toBe(0);
  expect(old.depreciation).toBe(0);
  expect(rows.some(row=>row.source==="journal-purchase")).toBe(true);
  const withoutDisposal=includeJournalEquipment([asset],[],"2026-11");
  expect(withoutDisposal[0].retired).toBeUndefined();
});

test("partial equipment credit does not retire an asset",()=>{
  const asset={id:"hardware:rtx5070",name:"RTX 5070 GPU",category:"equipment",
    historicalCost:500,acquisitionMonth:"2026-11",start:0,end:491.67,depreciation:8.33};
  const partial={id:"adjustment",date:"2026-11-12",lines:[
    {account:"equipment:hardware:rtx5070",debit:0,credit:100},
    {account:"cash",debit:100,credit:0},
  ]};
  const [row]=includeJournalEquipment([asset],[partial],"2026-11");
  expect(row.retired).toBeUndefined();
  expect(row.end).toBe(491.67);
});

test("equipment disposal stays retired next month without rewriting prior month",()=>{
  const asset={id:"hardware:rtx5070",name:"RTX 5070 GPU",category:"equipment",
    historicalCost:500,acquisitionMonth:"2026-11",start:491.67,end:483.33,depreciation:8.34};
  const disposal={id:"trade",date:"2026-11-12",lines:[
    {account:"equipment:hardware:rtx5070",debit:0,credit:491.67},
    {account:"cash",debit:491.67,credit:0},
  ]};
  const future=includeJournalEquipment([asset],[disposal],"2026-12")[0];
  expect(future.retired).toBe(true);
  expect(future.start).toBe(0);
  expect(future.end).toBe(0);
  expect(includeJournalEquipment([asset],[disposal],"2026-10")[0].retired).toBeUndefined();
});

test("Review purchase recognizes RTX 5080 trade-in even when hardware register tracks only cash paid",()=>{
  const rows=[
    {id:"hardware:rtx5080",name:"RTX 5080",category:"equipment",
      acquisitionMonth:"2026-11",historicalCost:1250,source:"saved-balance-sheet"},
  ];
  const recordedTrade={id:"trade-5080",date:"2026-11-13",description:"RTX 5080",
    lines:[
      {account:"equipment",debit:1950,credit:0},
      {account:"cash",debit:0,credit:1250},
      {account:"equipment:hardware:rtx5070",debit:0,credit:491.67},
      {account:"gainDisposal",debit:0,credit:208.33},
    ],
  };
  expect(unmatchedEquipmentPurchases(rows,[recordedTrade],"2026-11")).toEqual([]);
  expect(unmatchedEquipmentPurchases(rows,[],"2026-11")).toHaveLength(1);
});

test("Review purchase does not suppress a different GPU or a partial acquisition",()=>{
  const rows=[
    {id:"hardware:rtx5080",name:"RTX 5080",category:"equipment",
      acquisitionMonth:"2026-11",historicalCost:1250},
    {id:"hardware:rtx2080",name:"RTX 2080 Super PC",category:"equipment",
      acquisitionMonth:"2026-11",historicalCost:500},
  ];
  const partial={id:"partial",date:"2026-11-13",description:"RTX 5080",lines:[
    {account:"equipment",debit:500,credit:0},
    {account:"cash",debit:0,credit:500},
  ]};
  expect(unmatchedEquipmentPurchases(rows,[partial],"2026-11")).toHaveLength(2);
});

test("RTX 5080 trade-in upgrades cash-only registered equipment rather than doubling assets",()=>{
  const asset={
    id:"hardware:rtx5080",name:"RTX 5080",category:"equipment",
    historicalCost:1250,acquisitionMonth:"2026-11",
    ...equipmentSchedule({cost:1250,startMonth:"2026-11"},"2026-11"),
    source:"saved-balance-sheet",
  };
  const trade={id:"trade",date:"2026-11-13",description:"RTX 5080",lines:[
    {account:"equipment",debit:1950,credit:0},
    {account:"cash",debit:0,credit:1250},
    {account:"equipment:hardware:rtx5070",debit:0,credit:491.67},
    {account:"gainDisposal",debit:0,credit:208.33},
  ]};
  const rows=includeJournalEquipment([asset],[trade],"2026-11");
  expect(rows).toHaveLength(1);
  expect(rows[0].historicalCost).toBe(1950);
  expect(rows[0].end).toBe(1917.5);
  expect(rows[0].depreciation).toBe(32.5);
  expect(includeJournalEquipment(rows,[trade],"2026-11")).toHaveLength(1);
  const future=includeJournalEquipment([{
    ...asset,...equipmentSchedule({cost:1250,startMonth:"2026-11"},"2026-12")
  }],[trade],"2026-12");
  expect(future).toHaveLength(1);
  expect(future[0].historicalCost).toBe(1950);
});

test("distinct registered GPUs of the same model are never merged by purchase amount",()=>{
  const base=[
    {id:"device:a",name:"RTX 5080",category:"equipment",acquisitionMonth:"2026-11",historicalCost:1250},
    {id:"device:b",name:"RTX 5080",category:"equipment",acquisitionMonth:"2026-11",historicalCost:1250},
  ];
  const purchase={id:"third",date:"2026-11-15",description:"RTX 5080",lines:[
    {account:"equipment",debit:1950,credit:0},{account:"cash",debit:0,credit:1950},
  ]};
  expect(includeJournalEquipment(base,[purchase],"2026-11")).toHaveLength(3);
});
