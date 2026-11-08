import { buildIncomeHistory, legacyProjectIncome, reconcileLuloIncome, shiftMonth } from "./incomeHistory";

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

test("restores backend Lulo interest without adding the same local earnings twice", () => {
  const months = reconcileLuloIncome([
    { monthKey: "2026-10", total: 25, platforms: [
      { platform: "Kryptex", amount: 20 }, { platform: "Lulo", amount: 5 },
    ] },
  ], { "lulo-a": { "2026-10": 5, "2026-11": 0.2 } }, {
    "lulo-a": { "2026-10": 6, "2026-11": 0.1 },
    "lulo-b": { "2026-10": 2, "2026-12": 4 },
  }, "2026-11");

  expect(months).toEqual([
    { monthKey: "2026-10", total: 28, platforms: [
      { platform: "Kryptex", amount: 20 }, { platform: "Lulo", amount: 8 },
    ] },
    { monthKey: "2026-11", total: 0.2, platforms: [{ platform: "Lulo", amount: 0.2 }] },
  ]);
  expect(buildIncomeHistory(months, {}, "2026-11")[0].sources.Lulo).toBe(8);
});

test("a locked total with unlabelled income does not count Lulo a second time", () => {
  const months = reconcileLuloIncome([
    { monthKey: "2026-09", total: 19, platforms: [{ platform: "Kryptex", amount: 10 }] },
  ], {}, { "lulo-a": { "2026-09": 9 } }, "2026-11");
  expect(months[0].total).toBe(19);
  expect(months[0].platforms).toEqual([
    { platform: "Kryptex", amount: 10 }, { platform: "Lulo", amount: 9 },
  ]);
});


test("uses completed Lulo daily rows when the current monthly ledger has not caught up", () => {
  const months = reconcileLuloIncome([
    { monthKey: "2026-11", total: 29.98, platforms: [
      { platform: "Kryptex", amount: 14.63 },
      { platform: "Loopscale", amount: 6.39 },
      { platform: "Unetwork", amount: 4.79 },
      { platform: "Salad", amount: 4.17 },
    ] },
  ], {}, {}, "2026-11", [{
    id: "lulo-a",
    lulo_daily_performance: [
      { date: "2026-11-01", amount: 1.5 },
      { date: "2026-11-02", amount: 2 },
      { date: "2026-11-07", amount: 2.16 },
      { date: "2026-11-07", amount: 2.1 },
      { date: "2026-11-08", amount: 1.25 },
    ],
  }], "2026-11-07");

  expect(months[0].platforms.find(row => row.platform === "Lulo").amount).toBeCloseTo(5.66, 6);
  expect(months[0].total).toBeCloseTo(35.64, 6);
  expect(buildIncomeHistory(months, {}, "2026-11")[0].sources.Lulo).toBeCloseTo(5.66, 6);
});
