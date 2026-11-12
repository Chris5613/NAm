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
  const snapshot={value:900,incomplete:false,count:4};
  expect(getCryptoBusinessValue(snapshot,600)).toBe(900);
  expect(calculateNetWorth([{category:"stocks",quantity:2,current_price:100}],getCryptoBusinessValue(snapshot,600)).total_net_worth).toBe(1100);
});

test("missing balance-sheet information keeps the known crypto subtotal", () => {
  expect(getCryptoBusinessValue({value:null,incomplete:true,count:3},600)).toBe(600);
  expect(getCryptoBusinessValue({value:0,incomplete:false,count:0},600)).toBe(600);
  expect(getCryptoBusinessValue({value:0,incomplete:false,count:2},600)).toBe(0);
});
