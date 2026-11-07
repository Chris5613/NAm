import { buildMonthlyEarningsChart } from "./monthlyEarningsChart";

test("monthly chart combines income and expenses without mutating inputs", () => {
  const income = [{ monthKey: "2026-11", total: 4.25 }];
  const expenses = { "2026-11": 1.5 };
  const payouts = {};
  const result = buildMonthlyEarningsChart(income, payouts, expenses);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ monthKey: "2026-11", value: 4.25, expenses: 1.5 });
  expect(income).toEqual([{ monthKey: "2026-11", total: 4.25 }]);
  expect(expenses).toEqual({ "2026-11": 1.5 });
});
