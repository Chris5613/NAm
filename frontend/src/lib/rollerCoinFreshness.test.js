import {
  latestRollerCoinTimestamp, shouldAcceptRollerCoinBalance,
} from "./rollerCoinFreshness";

test("cached earnings payload cannot rewind a newer wallet reading", () => {
  const current = {
    balanceSyncedAt: "2026-10-31T16:50:06Z",
    walletLastObservedAt: "2026-10-31T17:36:24Z",
    currentTrxBalance: 42,
  };
  expect(shouldAcceptRollerCoinBalance(current, {
    current_balance_trx: 40,
    balance_synced_at: "2026-10-31T16:50:06Z",
  })).toBe(false);
  expect(latestRollerCoinTimestamp(current.balanceSyncedAt, current.walletLastObservedAt))
    .toBe("2026-10-31T17:36:24Z");
  expect(shouldAcceptRollerCoinBalance(current, {
    current_balance_trx: 43,
    balance_synced_at: "2026-10-31T17:46:24Z",
  })).toBe(true);
});

test("missing and invalid balance readings never replace a confirmed one", () => {
  const current = { balanceSyncedAt: "2026-10-31T17:36:24Z" };
  expect(shouldAcceptRollerCoinBalance(current, { current_balance_trx: null })).toBe(false);
  expect(shouldAcceptRollerCoinBalance(current, { current_balance_trx: -1 })).toBe(false);
  expect(shouldAcceptRollerCoinBalance(current, { current_balance_trx: 0 })).toBe(false);
  expect(shouldAcceptRollerCoinBalance({}, {
    current_balance_trx: 0, balance_synced_at: "2026-10-31T17:36:24Z",
  })).toBe(true);
});
