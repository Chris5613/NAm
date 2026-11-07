import { buildWeeklyEarningsChart } from "./weeklyEarningsChart";

test("weekly chart covers Monday through Sunday and totals available days", () => {
  const totals = {
    "2026-11-02": { Salad: 1 },
    "2026-11-03": { Kryptex: 2 },
    "2026-11-06": { RollerCoin: 3 },
  };
  const result = buildWeeklyEarningsChart({
    todayKey: "2026-11-06",
    luloUtcDay: "2026-11-07",
    sourceTotalsForDay: day => totals[day] || {},
    earningsClock: Date.parse("2026-11-06T20:30:00Z"),
  });

  expect(result.weekDays).toHaveLength(7);
  expect(result.weekDays[0].key).toBe("2026-11-02");
  expect(result.weekDays[6].key).toBe("2026-11-08");
  expect(result.weekEarnings).toBe(6);
  expect(result.observedWeekMaximum).toBe(3);
  expect(result.weekDays.find(day => day.key === "2026-11-08").value).toBeNull();
});

test("new Lulo UTC day can be live even when it is tomorrow in Pacific time", () => {
  const result = buildWeeklyEarningsChart({
    todayKey: "2026-11-06",
    luloUtcDay: "2026-11-07",
    sourceTotalsForDay: day => day === "2026-11-07" ? { Lulo: 0.4 } : {},
    earningsClock: Date.parse("2026-11-07T01:00:00Z"),
  });

  const luloDay = result.weekDays.find(day => day.key === "2026-11-07");
  expect(luloDay.live).toBe(true);
  expect(luloDay.value).toBe(0.4);
});
