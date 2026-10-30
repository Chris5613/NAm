import {
  statsMatch, matchingProviderMonths, mergeServerMonthlyIncome,
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

describe("backend monthly provider reconciliation", () => {
  const local = [
    { monthKey: "2026-09", total: 16.47,
      platforms: [{ platform: "Kryptex", amount: 16.47 }] },
    { monthKey: "2026-10", total: 2.55,
      platforms: [
        { platform: "Lulo", amount: 1.5 },
        { platform: "RollerCoin", amount: 0.35 },
        { platform: "Salad", amount: 0.2 },
        { platform: "Unetwork", amount: 0.5 },
      ] },
  ];
  const matchingServer = [
    { monthKey: "2026-09", platforms: [{ platform: "Kryptex", amount: 16.47 }] },
    { monthKey: "2026-10", platforms: [
      { platform: "RollerCoin", amount: 0.35 },
      { platform: "Salad", amount: 0.2 },
      { platform: "Unetwork", amount: 0.5 },
    ] },
  ];

  test("ignores Lulo and Loopscale until their adapters move", () => {
    expect(matchingProviderMonths(local, matchingServer)).toBe(true);
    const merged = mergeServerMonthlyIncome(local, matchingServer);
    expect(merged[1].total).toBe(2.55);
    expect(merged[1].platforms[0]).toEqual({ platform: "Lulo", amount: 1.5 });
  });

  test("stale or partial monthly server data never replaces local history", () => {
    const missing = matchingServer.slice(1);
    expect(matchingProviderMonths(local, missing)).toBe(false);
    expect(mergeServerMonthlyIncome(local, missing)).toBe(local);
    const changed = matchingServer.map(m => ({
      ...m, platforms: m.platforms.map(p =>
        p.platform === "RollerCoin" ? { ...p, amount: 0.36 } : p
      ),
    }));
    expect(matchingProviderMonths(local, changed)).toBe(false);
    expect(mergeServerMonthlyIncome(local, changed)).toBe(local);
  });

  test("does not treat wallet USD market repricing as mined earnings", () => {
    const changed = [{
      monthKey: "2026-10",
      platforms: [{ platform: "RollerCoin", amount: 4.5 }],
    }];
    expect(matchingProviderMonths(local, changed)).toBe(false);
  });
});
