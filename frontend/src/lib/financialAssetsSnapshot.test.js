import { sumFinancialAssets, sumFinancialBusiness } from "./financialAssetsSnapshot";

test("Home asset balance sums the same asset rows as Balance Sheet, including BTC once", () => {
  const rows = [
    {name:"BTC",category:"digital",end:100},
    {name:"Kryptex",category:"digital",end:25},
    {name:"RTX 2080 Super PC",category:"equipment",end:491.67},
    {name:"RTX 5070 GPU",category:"equipment",end:491.67},
    {name:"Accounts Payable",category:"liabilities",end:40},
  ];
  expect(sumFinancialAssets(rows)).toEqual({
    value:1108.34,knownSubtotal:1108.34,incomplete:false,count:4,
  });
});

test("unverified bank balance is not silently replaced with zero", () => {
  const rows=[
    {name:"BTC",category:"digital",end:100},
    {name:"Cash / Bank",category:"cash",end:null},
  ];
  expect(sumFinancialAssets(rows)).toEqual({
    value:null,knownSubtotal:100,incomplete:true,count:2,
  });
});

test("total asset sum counts no liabilities or owner equity as an asset", () => {
  const rows=[
    {name:"Mining Rig",category:"equipment",end:500},
    {name:"Accounts Payable",category:"liabilities",end:200},
  ];
  expect(sumFinancialAssets(rows).value).toBe(500);
});

test("business net worth subtracts liabilities exactly once", () => {
  expect(sumFinancialBusiness([
    {category:"digital",end:750},
    {category:"equipment",end:250},
    {category:"liabilities",end:300},
  ])).toMatchObject({value:1000,liabilityValue:300,netValue:700,incomplete:false});
});

test("unknown business liability prevents a verified net worth", () => {
  expect(sumFinancialBusiness([
    {category:"digital",end:100},
    {category:"liabilities",end:null},
  ])).toMatchObject({value:100,liabilityValue:null,netValue:null,liabilitiesIncomplete:true});
});

test("business bank cash is marked as overlap without deleting it from business assets",()=>{
  const result=sumFinancialBusiness([
    {id:"ledger:cash",name:"Cash / Bank",category:"cash",end:1238.14},
    {id:"project:lulo",name:"Lulo",category:"cash",end:0},
    {id:"device:5080",name:"RTX 5080",category:"equipment",end:1250},
    {id:"platform:kryptex",name:"Kryptex receivable",category:"cash",end:20},
  ]);
  expect(result).toMatchObject({
    bankCashValue:1238.14,
    value:2508.14,
    netValue:2508.14,
    incomplete:false,
  });
});

test("bank overlap ignores unknown, receivable, and Lulo asset rows",()=>{
  const result=sumFinancialBusiness([
    {name:"Cash / Bank",category:"cash",end:null},
    {name:"Lulo",category:"cash",end:1500},
    {name:"Mining Rewards Receivable",category:"cash",end:10},
  ]);
  expect(result.bankCashValue).toBe(0);
  expect(result.incomplete).toBe(true);
});
