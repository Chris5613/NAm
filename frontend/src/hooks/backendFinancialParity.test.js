import { incomeHistoryMatches } from "./useBackendIncomeHistory";

test("income history parity checks source-by-source, not just headline totals", () => {
  const local = [{
    monthKey: "2026-11", projectTotal: 8, total: 8,
    sources: { Kryptex: 3, Loopscale: 5 },
  }];
  expect(incomeHistoryMatches(local, [{
    ...local[0], sources: { Loopscale: 5, Kryptex: 3 },
  }])).toBe(true);
  expect(incomeHistoryMatches(local, [{
    ...local[0], sources: { Kryptex: 5, Loopscale: 3 },
  }])).toBe(false);
});
