import {
  rollerCoinAffectedMonths,
  updateRollerCoinTracker,
} from "./useRollerCoinExtension";

test("RollerCoin partial range sync never reduces a confirmed daily TRX total", () => {
  const current = {
    daily: {
      "2026-11-05": {
        trx: 2,
        usd: 0.5,
        trxPrice: 0.25,
        syncedAt: "2026-11-05T20:00:00Z",
      },
    },
    lastTrxPrice: 0.25,
  };

  const next = updateRollerCoinTracker(current, {
    rows: [{ date: "2026-11-05", trx: 1 }],
    trx_usd_price: 0.25,
    synced_at: "2026-11-06T20:00:00Z",
    from: "2026-11-05",
    to: "2026-11-05",
  });

  expect(next.daily["2026-11-05"].trx).toBe(2);
  expect(next.daily["2026-11-05"].usd).toBe(0.5);
});

test("RollerCoin fresh wallet observation records only the balance delta", () => {
  const current = {
    currentTrxBalance: 10,
    balanceSyncedAt: "2026-11-06T18:00:00Z",
    walletLastObservedTrx: 10,
    walletLastObservedAt: "2026-11-06T18:00:00Z",
    walletDaily: {},
    lastTrxPrice: 0.25,
  };

  const next = updateRollerCoinTracker(current, {
    current_balance_trx: 12,
    balance_synced_at: "2026-11-06T20:00:00Z",
    trx_usd_price: 0.25,
  });

  expect(next.currentTrxBalance).toBe(12);
  expect(next.walletLastObservedTrx).toBe(12);
  const day = Object.keys(next.walletDaily)[0];
  expect(next.walletDaily[day].trx).toBe(2);
  expect(next.walletDaily[day].usd).toBe(0.5);
});

test("RollerCoin affected months only includes valid dated rows", () => {
  expect([
    ...rollerCoinAffectedMonths([
      { date: "2026-11-05" },
      { date: "2026-11-06T10:00:00Z" },
      { date: "bad-date" },
    ]),
  ]).toEqual(["2026-11"]);
});
