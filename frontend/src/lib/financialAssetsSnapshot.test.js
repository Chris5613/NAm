import { sumFinancialAssets } from "./financialAssetsSnapshot";

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
