import { withUnetworkDatedEarnings } from "./unetworkDailyIncome";

test("counts a Unetwork credit on its posted day without repeating the prior work day", () => {
  const tracker = { daily: {
    "2026-10-31": { usd: 0.633436, count: 5 },
    "2026-11-01": { usd: 0.757652, count: 5 },
  } };
  expect(withUnetworkDatedEarnings({ Salad: 1.19 }, tracker, "2026-11-01"))
    .toEqual({ Salad: 1.19, Unetwork: 0.757652 });
  expect(withUnetworkDatedEarnings({}, tracker, "2026-10-31"))
    .toEqual({ Unetwork: 0.633436 });
  expect(withUnetworkDatedEarnings({ Unetwork: 2 }, tracker, "2026-11-01").Unetwork)
    .toBe(0.757652);
  expect(withUnetworkDatedEarnings({ Salad: 1.19 }, tracker, "2026-11-02"))
    .toEqual({ Salad: 1.19 });
});
