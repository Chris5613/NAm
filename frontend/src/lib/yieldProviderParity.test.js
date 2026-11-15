import {
  statsMatch,
} from "./yieldProviderParity";

describe("backend earnings parity guard", () => {
  test("adopts matching signed values including small negative earnings", () => {
    expect(statsMatch(
      { monthUsd: -0.86, estimatedDailyUsd: 0.60, lastSyncedAt: "2026-10-30T20:00:00Z" },
      { monthUsd: -0.86, estimatedDailyUsd: 0.6000000001,
        lastSyncedAt: "2026-10-30T20:00:00Z" }
    )).toBe(true);
  });

  test("rejects stale backend balances and wrong sync timestamps", () => {
    const local = { currentTrxBalance: 35.269272, lastSyncedAt: "now" };
    expect(statsMatch(local, { currentTrxBalance: 34, lastSyncedAt: "now" })).toBe(false);
    expect(statsMatch(local, {
      currentTrxBalance: 35.269272, lastSyncedAt: "earlier",
    })).toBe(false);
  });

  test("does not adopt missing, non-finite or corrected projections", () => {
    expect(statsMatch({ estimatedDailyUsd: 0.6 }, {})).toBe(false);
    expect(statsMatch({ estimatedDailyUsd: 0.6 }, { estimatedDailyUsd: NaN })).toBe(false);
    expect(statsMatch({ estimatedDailyUsd: -0.26 }, { estimatedDailyUsd: 0 })).toBe(false);
  });

  test("preserves local display-only miner objects", () => {
    expect(statsMatch(
      { dailyUsd: 1.2, miners: [{ id: "local" }] },
      { dailyUsd: 1.2, miners: [{ id: "server" }] }
    )).toBe(true);
  });
});

