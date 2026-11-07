import {
  cumulativeByDay,
  daysInMonth,
  isExpense,
  isIncome,
  shiftMonth,
} from "./spendingMetrics";

test("Spending month helpers handle leap years and year boundaries", () => {
  expect(daysInMonth("2028-02")).toBe(29);
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  expect(shiftMonth("2026-12", 1)).toBe("2027-01");
});

test("Spending income and expense classification excludes transfers and payments", () => {
  expect(isIncome({ category: "Income" })).toBe(true);
  expect(isExpense({ category: "Dining" })).toBe(true);
  expect(isExpense({ category: "Transfers" })).toBe(false);
  expect(isExpense({ category: "Payments" })).toBe(false);
});

test("Spending cumulative totals are monotonic by calendar day", () => {
  const values = cumulativeByDay([
    { date: "2026-11-01", category: "Dining", amount: 10 },
    { date: "2026-11-03", category: "Shopping", amount: 5 },
  ], "2026-11", 4);
  expect(values).toEqual([10, 10, 15, 15]);
});
