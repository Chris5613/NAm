import {
  getUnetworkBalance,
  updateUnetworkTracker,
} from "./useUnetworkExtension";

test("U Network balance combines available and pending rewards", () => {
  expect(getUnetworkBalance({
    balance_micros: 1_500_000,
    pending_balance_micros: 250_000,
  })).toEqual({
    availableBalance: 1.5,
    pendingBalance: 0.25,
    currentBalance: 1.75,
  });
});

test("first U Network balance is an opening baseline, not today's income", () => {
  const next = updateUnetworkTracker({}, {
    balance_usd: 1.99,
    pending_balance_usd: 0,
    synced_at: "2026-11-06T20:00:00Z",
    rows: [],
  });

  expect(next.openingEarnedUsd).toBe(1.99);
  expect(next.currentBalance).toBe(1.99);
  expect(next.balanceHighWater).toBe(1.99);
  expect(next.daily).toEqual({});
});

test("balance recovery below the prior high-water is not counted as new earnings", () => {
  const current = {
    initialized: true,
    baselineInitialized: true,
    openingEarnedUsd: 1.99,
    allocationsBaselineUsd: 0,
    openingMonth: "2026-11",
    openingMonthRowsBaselineUsd: 0,
    currentBalance: 1.5,
    lastBalance: 1.5,
    balanceHighWater: 2,
    withdrawals: 0.5,
    daily: {},
  };

  const next = updateUnetworkTracker(current, {
    balance_usd: 1.9,
    pending_balance_usd: 0,
    synced_at: "2026-11-06T20:00:00Z",
    rows: [],
  });

  expect(next.balanceHighWater).toBe(2);
  expect(next.daily).toEqual({});
});
