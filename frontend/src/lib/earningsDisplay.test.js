import {
  buildSelectedEarningsBreakdown,
  buildAnnualEarningsBreakdown,
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

test("current month popup uses chart daily sources rather than stale monthly snapshots", () => {
  const result = buildSelectedEarningsBreakdown({
    selection: { range: "yearly", key: "2026-11" },
    earningsChartRange: "yearly",
    projectIncome: [{
      monthKey: "2026-11",
      platforms: [{ platform: "Kryptex", amount: 40.4 }],
    }],
    currentMonthSources: {
      Kryptex: 43.19,
      Loopscale: 12.67,
      Unetwork: 9.16,
      RollerCoin: 7.02,
      Lulo: 4.58,
      Salad: 4.24,
    },
    stockPayouts: {},
    todayKey: "2026-11-14",
    luloUtcDay: "2026-11-14",
    hasLuloProjects: false,
    sourceTotalsForDay: () => ({}),
  });
  expect(result.total).toBeCloseTo(80.86);
  expect(result.entries.find(row => row.name === "Kryptex").amount).toBe(43.19);
  expect(result.note).toMatch(/daily earnings/);
});

test("clicking All Years shows a yearly per-project popup matching the plotted total", () => {
  const projectIncome = [
    {monthKey: "2025-12", platforms: [{platform: "Older project", amount: 4}]},
    {monthKey: "2026-01", platforms: [
      {platform: "Kryptex", amount: 5}, {platform: "Salad", amount: 2},
    ]},
    {monthKey: "2026-11", platforms: [
      {platform: "Kryptex", amount: 3}, {platform: "Bixberry", amount: 1},
    ]},
  ];
  const annualUndated = [{year: "2026", sources: {
    "Kryptex": 30, "Prior-year-only mining": 7,
  }}];
  const props = {
    year: "2026", projectIncome, annualUndated, todayKey: "2026-11-23",
  };
  const chartBreakdown = buildAnnualEarningsBreakdown(props);
  const popup = buildSelectedEarningsBreakdown({
    selection: {range: "allYears", key: "2026"},
    earningsChartRange: "allYears",
    ...props, stockPayouts: {}, sourceTotalsForDay: () => ({}),
  });
  expect(chartBreakdown.total).toBe(18);
  expect(popup).toEqual(chartBreakdown);
  expect(popup.label).toBe("2026");
  expect(popup.entries).toEqual([
    {name: "Kryptex", amount: 8},
    {name: "Prior-year-only mining", amount: 7},
    {name: "Salad", amount: 2},
    {name: "Bixberry", amount: 1},
  ]);
  expect(buildAnnualEarningsBreakdown({...props, year: "2027"})).toBeNull();
});

test("annual-only 2025 amount displays in popup without inventing a monthly date", () => {
  const result = buildAnnualEarningsBreakdown({
    year: "2025", todayKey: "2026-11-23", projectIncome: [],
    annualUndated: [{year: "2025", sources: {"Historical earnings": 95}}],
  });
  expect(result).toMatchObject({
    label: "2025", total: 95, includesAnnualOnly: true,
    entries: [{name: "Historical earnings", amount: 95}],
  });
});

test("All Years merges every GoMining product into one annual project for 2025 and 2026", () => {
  const months = [
    {monthKey: "2025-04", platforms: [
      {platform: "GoMining Mining", amount: 4},
      {platform: "GoMining Bounty", amount: 1},
    ]},
    {monthKey: "2026-07", platforms: [
      {platform: "GoMining Mining", amount: 30},
      {platform: "GoMining Bounty", amount: 20},
      {platform: "GoMining Liquidity", amount: 15},
      {platform: "GoMining Locking", amount: 5},
    ]},
  ];
  const annualUndated = [
    {year: "2025", sources: {"GoMining Locking": 3, "Other": 2}},
  ];
  const y2025 = buildAnnualEarningsBreakdown({
    year: "2025", projectIncome: months, annualUndated,
    todayKey: "2026-11-24",
  });
  const y2026 = buildAnnualEarningsBreakdown({
    year: "2026", projectIncome: months, annualUndated,
    todayKey: "2026-11-24",
  });
  expect(y2025.entries).toEqual([
    {name: "GoMining", amount: 5},
    {name: "Other", amount: 2},
  ]);
  expect(y2026.entries).toEqual([{name: "GoMining", amount: 70}]);
  expect(y2025.total).toBe(7);
  expect(y2026.total).toBe(70);
});

test("RollerCoin lifetime reconciliation tops up same row without inventing a month", () => {
  const breakdown = buildAnnualEarningsBreakdown({
    year: "2026", todayKey: "2026-11-24",
    projectIncome: [{monthKey:"2026-11", platforms:[
      {platform:"RollerCoin", amount: 59.93},
    ]}],
    annualReconciliations: [{
      year:"2026", basis:"project-break-even-lifetime-less-dated-rewards",
      sources: {"RollerCoin": 112.47}, total:112.47,
    }],
  });
  expect(breakdown.entries).toEqual([{name:"RollerCoin", amount:172.4}]);
  expect(breakdown.total).toBeCloseTo(172.4);
  expect(breakdown.includesReconciliation).toBe(true);
});
