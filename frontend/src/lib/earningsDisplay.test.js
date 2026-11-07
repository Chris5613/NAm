import {
  buildSelectedEarningsBreakdown,
  buildTodayEarningsDisplay,
} from "./earningsDisplay";

test("today display merges server and local high-water totals", () => {
  const result = buildTodayEarningsDisplay({
    dailySourceTotals: { Kryptex: 1.2, Salad: 0.4 },
    serverSources: { Kryptex: 1.1, RollerCoin: 0.6 },
    previouslyDisplayedTodayMax: 2.5,
    serverTotalUsd: 2.1,
  });

  expect(result.displayDailySourceTotals).toEqual({
    Kryptex: 1.2,
    Salad: 0.4,
    RollerCoin: 0.6,
  });
  expect(result.rawTodayEarnings).toBeCloseTo(2.2);
  expect(result.todayEarnings).toBe(2.5);
});

test("yearly month breakdown combines project platforms with stock payouts", () => {
  const result = buildSelectedEarningsBreakdown({
    selection: { range: "yearly", key: "2026-11" },
    earningsChartRange: "yearly",
    projectIncome: [{
      monthKey: "2026-11",
      platforms: [
        { platform: "Salad", amount: 1.5 },
        { platform: "Kryptex", amount: 2 },
      ],
    }],
    stockPayouts: {},
    todayKey: "2026-11-06",
    luloUtcDay: "2026-11-07",
    hasLuloProjects: false,
    sourceTotalsForDay: () => ({}),
  });

  expect(result.entries).toEqual([
    { name: "Kryptex", amount: 2 },
    { name: "Salad", amount: 1.5 },
  ]);
  expect(result.total).toBe(3.5);
});


test("monthly day breakdown uses recorded sources for that day", () => {
  const result = buildSelectedEarningsBreakdown({
    selection: { range: "monthly", key: "2026-11-06" },
    earningsChartRange: "monthly",
    projectIncome: [],
    stockPayouts: {},
    todayKey: "2026-11-07",
    luloUtcDay: "2026-11-07",
    hasLuloProjects: false,
    sourceTotalsForDay: key =>
      key === "2026-11-06" ? { Kryptex: 1.75, RollerCoin: 0.25 } : {},
  });

  expect(result.entries).toEqual([
    { name: "Kryptex", amount: 1.75 },
    { name: "RollerCoin", amount: 0.25 },
  ]);
  expect(result.total).toBe(2);
});
