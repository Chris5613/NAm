import { buildIncomeHistory, legacyProjectIncome, shiftMonth } from "./incomeHistory";

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

test("dated past projects enter their months; current tracked sources and undated totals do not", () => {
  const legacy = legacyProjectIncome([
    { name: "COIN", earned: 100, transactions: [{ type: "earning", amount: 40, date: "2026-04-03" }, { type: "earning", amount: 60, date: "2026-05-02" }] },
    { name: "GoMining", earned: 25, transactions: [{ type: "earning", amount: 25, date: "2026-05-29" }] },
    { name: "Lulo", earned: 500, transactions: [{ type: "earning", amount: 500, date: "2026-05-01" }] },
    { name: "Old project", earned: 12, transactions: [] },
  ]);
  expect(legacy.undated).toEqual([{ name: "Old project", amount: 12 }]);
  const months = buildIncomeHistory([{ monthKey: "2026-05", total: 10, platforms: [{ platform: "Salad", amount: 10 }] }], {}, "2026-11", legacy);
  expect(months).toEqual([
    { monthKey: "2026-04", sources: { COIN: 40 }, projectTotal: 40, stocks: 0, total: 40 },
    { monthKey: "2026-05", sources: { Salad: 10, COIN: 60, GoMining: 25 }, projectTotal: 95, stocks: 0, total: 95 },
  ]);
});
