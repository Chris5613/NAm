import {
  buildMonthlyDailyEarningsChart,
  sumMonthlyChartSources,
  buildMonthlyEarningsChart,
  buildYearlyEarningsChart,
} from "./monthlyEarningsChart";

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

test("monthly daily chart includes every calendar day and stops after today", () => {
  const result = buildMonthlyDailyEarningsChart({
    todayKey: "2026-11-07",
    sourceTotalsForDay: key => ({
      Kryptex: key === "2026-11-01" ? 1.25 : key === "2026-11-07" ? 2.5 : 0,
    }),
  });

  expect(result).toHaveLength(30);
  expect(result[0]).toMatchObject({
    key: "2026-11-01",
    day: "1",
    value: 1.25,
    future: false,
  });
  expect(result[6]).toMatchObject({
    key: "2026-11-07",
    day: "7",
    value: 2.5,
    future: false,
  });
  expect(result[7]).toMatchObject({
    key: "2026-11-08",
    day: "8",
    value: null,
    future: true,
  });
  expect(result[29].key).toBe("2026-11-30");
});

test("yearly chart always shows Jan-Dec and leaves future months empty", () => {
  const result = buildYearlyEarningsChart(
    [
      { monthKey: "2026-01", total: 10 },
      { monthKey: "2026-11", total: 25 },
    ],
    {},
    "2026",
    "2026-11-07"
  );

  expect(result).toHaveLength(12);
  expect(result[0]).toMatchObject({ monthKey: "2026-01", label: "Jan", value: 10 });
  expect(result[10]).toMatchObject({ monthKey: "2026-11", label: "Nov", value: 25 });
  expect(result[11]).toMatchObject({ monthKey: "2026-12", label: "Dec", value: null, future: true });
});


test("historical yearly chart shows all twelve months for 2025", () => {
  const result = buildYearlyEarningsChart(
    [
      { monthKey: "2025-01", total: 4 },
      { monthKey: "2025-12", total: 9 },
    ],
    {},
    "2025",
    "2026-11-07"
  );

  expect(result).toHaveLength(12);
  expect(result[0]).toMatchObject({ monthKey: "2025-01", value: 4, future: false });
  expect(result[11]).toMatchObject({ monthKey: "2025-12", value: 9, future: false });
});

test("current-month project breakdown adds up to exact daily chart earnings", () => {
  const chart = buildMonthlyDailyEarningsChart({
    todayKey: "2026-11-14",
    sourceTotalsForDay: day => {
      if (day === "2026-11-04") return { Kryptex: 2.79, Loopscale: 1.21 };
      if (day === "2026-11-14") return { Kryptex: 1.5, RollerCoin: 0.5 };
      return {};
    },
  });
  const sources = sumMonthlyChartSources(chart);
  const chartTotal = chart.reduce((sum, day) => sum + (day.value || 0), 0);
  expect(sources).toEqual({ Kryptex: 4.29, Loopscale: 1.21, RollerCoin: 0.5 });
  expect(Object.values(sources).reduce((sum, value) => sum + value, 0))
    .toBeCloseTo(chartTotal, 8);
  expect(chart[14].future).toBe(true);
  expect(chart[14].sources).toEqual({});
});
