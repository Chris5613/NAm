import { buildDailyEarningsChart } from "./dailyEarningsChart";

test("chart shaping does not mutate raw observations and repairs display dips", () => {
  const observations = {
    "2026-11-06": [
      { x: 1, value: 1.25 },
      { x: 2, value: 0.9 },
      { x: 3, value: 1.4 },
    ],
  };
  const before = JSON.stringify(observations);
  const result = buildDailyEarningsChart(observations, "2026-11-06", 4, 1.4);
  expect(JSON.stringify(observations)).toBe(before);
  expect(result.dailyChartData[result.dailyChartData.length - 1].value).toBe(1.4);
  expect(result.dailyChartData.every(point => point.value >= 0)).toBe(true);
  expect(result.dailyChartTicks).toContain(0);
});

test("empty chart starts at midnight and ends at current total", () => {
  const result = buildDailyEarningsChart({}, "2026-11-06", 10.5, 0);
  expect(result.dailyChartData[0]).toMatchObject({ x: 0, value: 0, displayBaseline: true });
  expect(result.dailyChartData[result.dailyChartData.length - 1].value).toBe(0);
  expect(result.dailyChartEnd).toBe(11);
});
