import { buildIncomeHistory, shiftMonth } from "./incomeHistory";

test("combines project totals and stock payouts once while preserving unrecorded months", () => {
  const months = buildIncomeHistory([
    { monthKey: "2026-10", total: 12, platforms: [{ platform: "Lulo", amount: 10 }] },
  ], {
    "VTI:2026-10-03": { symbol: "VTI", date: "2026-10-03", amount: 3 },
    "VOO:2026-09-29": { symbol: "VOO", date: "2026-09-29", amount: 4 },
    "VTI:2026-11-02": { symbol: "VTI", date: "2026-11-02", amount: 5 },
  }, "2026-10");
  expect(months).toEqual([
    { monthKey: "2026-09", sources: { Stocks: 4 }, projectTotal: 0, stocks: 4, total: 4 },
    { monthKey: "2026-10", sources: { Lulo: 10, "Other projects": 2, Stocks: 3 }, projectTotal: 12, stocks: 3, total: 15 },
  ]);
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
});
