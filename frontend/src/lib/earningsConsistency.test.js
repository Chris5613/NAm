import { buildEarningsConsistency } from "./earningsConsistency";

test("keeps missing days blank and excludes the live day from completed-day stats", () => {
  const sources = {
    "2026-10-29": { Loopscale: -0.25 },
    "2026-10-30": { Lulo: 0 },
    "2026-10-31": { Lulo: 1.28 },
    "2026-11-01": { Lulo: 2.5 },
  };
  const result = buildEarningsConsistency("2026-11-01", day => sources[day], 2.5);
  expect(result.days).toHaveLength(30);
  expect(result.days[0].key).toBe("2026-10-03");
  expect(result.days.find(day => day.key === "2026-10-28").value).toBeNull();
  expect(result.days.at(-1)).toMatchObject({ key: "2026-11-01", value: 2.5, complete: false });
  expect(result.recordedDays).toBe(3);
  expect(result.earningDays).toBe(1);
  expect(result.best).toMatchObject({ key: "2026-10-31", value: 1.28 });
  expect(result.average).toBeCloseTo((1.28 - 0.25) / 3);
});
