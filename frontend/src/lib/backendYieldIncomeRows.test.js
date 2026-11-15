import { backendYieldIncomeRows } from "./backendYieldIncomeRows";
import { buildYearlyEarningsChart } from "./monthlyEarningsChart";
import { buildSelectedEarningsBreakdown } from "./earningsDisplay";

test("server monthly history includes dividends exactly once", () => {
  const source = [{
    monthKey: "2026-10", total: 12.5, projectTotal: 10.5, stocks: 2,
    sources: { Kryptex: 9, Lulo: 1.5, Stocks: 2 },
  }];
  const original = JSON.parse(JSON.stringify(source));
  const mapped = backendYieldIncomeRows(source);
  const chart = buildYearlyEarningsChart(mapped, {}, "2026", "2026-11-15");
  expect(chart[9].value).toBeCloseTo(12.5, 8);
  const selected = buildSelectedEarningsBreakdown({
    selection: { range: "yearly", key: "2026-10" },
    earningsChartRange: "yearly",
    projectIncome: mapped,
    stockPayouts: {},
    todayKey: "2026-11-15",
    currentMonthSources: {},
    sourceTotalsForDay: () => ({}),
  });
  expect(selected.entries).toEqual(expect.arrayContaining([
    { name: "Stocks", amount: 2 },
    { name: "Lulo", amount: 1.5 },
  ]));
  expect(selected.total).toBeCloseTo(12.5, 8);
  expect(source).toEqual(original);
});

test("historical income never comes from browser balances or estimates", () => {
  const projected = backendYieldIncomeRows([
    { monthKey: "2026-09", total: 7.76,
      sources: { Lulo: 7.76 }, walletBalanceUsd: 999999 },
    { monthKey: "2026-11", total: 4.2,
      sources: { Kryptex: 4.2 }, apy: 1000 },
  ]);
  expect(projected.map(row => row.total)).toEqual([7.76, 4.2]);
  expect(projected[0].platforms).toEqual([{ platform: "Lulo", amount: 7.76 }]);
  expect(projected[0].walletBalanceUsd).toBeUndefined();
});

test("rejects incomplete or non-finite backend rows instead of inventing income", () => {
  expect(backendYieldIncomeRows(null)).toEqual([]);
  expect(backendYieldIncomeRows([
    { monthKey: "2026-11", total: NaN, sources: { Kryptex: 100 } },
    { monthKey: "2026-13", total: 10, sources: {} },
    { monthKey: "2026-10", total: 6, sources: { Salad: 6, Broken: Infinity } },
  ])).toEqual([{
    monthKey: "2026-10", total: 6,
    platforms: [{ platform: "Salad", amount: 6 }],
  }]);
});
