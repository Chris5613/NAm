import { calculateNetWorth, getCryptoBusinessValue } from "./dashboardMetrics";

test("calculateNetWorth keeps debts separate and subtracts them once", () => {
  const result = calculateNetWorth([
    { category: "stocks", quantity: 2, current_price: 10 },
    { category: "cash", manual_value: 50 },
    { category: "other", manual_value: 5 },
    { category: "debts", manual_value: 12 },
  ], 7);

  expect(result.breakdown).toEqual({
    stocks: 20,
    crypto: 7,
    cash: 50,
    other: 5,
    debts: 12,
  });
  expect(result.total_net_worth).toBe(70);
  expect(result.asset_count).toBe(4);
});

test("calculateNetWorth does not fabricate missing numeric values", () => {
  const result = calculateNetWorth([
    { category: "stocks", quantity: "bad", current_price: 10 },
    { category: "cash", manual_value: null, quantity: 3, current_price: 4 },
  ]);
  expect(result.breakdown.stocks).toBe(0);
  expect(result.breakdown.cash).toBe(12);
});

test("business assets replace crypto in net worth without duplicating portfolio", () => {
  const snapshot={value:900,liabilityValue:0,netValue:900,incomplete:false,count:4};
  expect(getCryptoBusinessValue(snapshot,600)).toBe(900);
  expect(calculateNetWorth([{category:"stocks",quantity:2,current_price:100}],getCryptoBusinessValue(snapshot,600)).total_net_worth).toBe(1100);
});

test("missing balance-sheet information keeps the known crypto subtotal", () => {
  expect(getCryptoBusinessValue({value:null,incomplete:true,count:3},600)).toBe(600);
  expect(getCryptoBusinessValue({value:0,incomplete:false,count:0},600)).toBe(600);
  expect(getCryptoBusinessValue({value:0,netValue:0,incomplete:false,count:2},600)).toBe(0);
});

test("home net worth uses net business assets after liabilities, not gross assets",()=>{
  expect(getCryptoBusinessValue({value:1000,liabilityValue:300,netValue:700,incomplete:false,count:3},500)).toBe(700);
  expect(getCryptoBusinessValue({value:1000,liabilityValue:null,netValue:null,incomplete:false,liabilitiesIncomplete:true,count:3},500)).toBe(500);
});

test("Lulo withdrawal bank cash is counted once across Home and business",()=>{
  const assets=[
    {category:"stocks",manual_value:9564.02},
    {category:"cash",manual_value:9533.86},
    {category:"other",manual_value:3000},
    {category:"debts",manual_value:7275.48},
  ];
  const business={netValue:7736.52,bankCashValue:1238.14,
    incomplete:false,liabilitiesIncomplete:false,count:8};
  const net=calculateNetWorth(assets,
    getCryptoBusinessValue(business,7700,9533.86));
  expect(net.breakdown.cash).toBe(9533.86);
  expect(net.breakdown.crypto).toBe(6498.38);
  expect(net.total_net_worth).toBeCloseTo(21320.78,2);
});
test("no personal cash means no bank overlap is removed",()=>{
  const business={netValue:7736.52,bankCashValue:1238.14,
    incomplete:false,liabilitiesIncomplete:false,count:8};
  expect(getCryptoBusinessValue(business,7000,0)).toBe(7736.52);
  expect(getCryptoBusinessValue(business,7000,500)).toBe(7236.52);
});
test("incomplete business falls back to crypto without an unverified cash deduction",()=>{
  expect(getCryptoBusinessValue({netValue:null,bankCashValue:1238.14,incomplete:true,count:8},7000,9533.86)).toBe(7000);
});
