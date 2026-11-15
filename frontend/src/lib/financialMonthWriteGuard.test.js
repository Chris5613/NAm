import { isFinancialMonthProtected } from "./financialMonthWriteGuard";

test("historically locked business month blocks editing even without Financials close", () => {
  const business = {
    "2026-09": { locked: true, revenueSnapshot: 330.062266 },
    "2026-10": { locked: true, revenueSnapshot: 202.769111 },
    "2026-11": { locked: false },
  };
  expect(isFinancialMonthProtected("2026-09", {}, business)).toBe(true);
  expect(isFinancialMonthProtected("2026-10", {}, business)).toBe(true);
  expect(isFinancialMonthProtected("2026-11", {}, business)).toBe(false);
});

test("Financials close independently blocks journal writes", () => {
  expect(isFinancialMonthProtected(
    "2026-11", { "2026-11": { entries: [] } }, {}
  )).toBe(true);
});

test("invalid dates cannot bypass month lock validation", () => {
  expect(isFinancialMonthProtected("2026-13", {}, {})).toBe(true);
  expect(isFinancialMonthProtected("", {}, {})).toBe(true);
  expect(isFinancialMonthProtected("2026-11", null, null)).toBe(false);
});
