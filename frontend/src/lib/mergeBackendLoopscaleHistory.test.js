import { mergeBackendLoopscaleHistory } from "./mergeBackendLoopscaleHistory";

const loan = "loan-1";
const snapshot = (when, pnl, options = {}) => ({
  key: loan, loanAddress: loan, lastSyncedAt: when,
  lastPnlUsd: pnl, lastValueUsd: 100, lastApy: 5.2,
  monthBaselines: { "2026-10": 1 },
  monthlyEarnings: { "2026-10": pnl - 1 },
  observedDaily: { "2026-10-30": pnl - 1 },
  observations: [{ syncedAt: when, pnlUsd: pnl }],
  ...options,
});

const old = () => ({ positions: {
  [loan]: snapshot("2026-10-30T18:00:00Z", 1.2),
}});

describe("backend Loopscale ledger compatibility", () => {
  test("adopts a newer server observation without deleting the original history", () => {
    const local = old();
    const fresh = { positions: {
      [loan]: snapshot("2026-10-30T19:00:00Z", 1.5, {
        observedDaily: { "2026-10-30": .5, "2026-10-29": .05 },
      }),
    }};
    const result = mergeBackendLoopscaleHistory(local, fresh);
    expect(result.positions[loan].lastPnlUsd).toBe(1.5);
    expect(result.positions[loan].monthlyEarnings["2026-10"]).toBe(.5);
    expect(result.positions[loan].observations).toHaveLength(2);
    expect(local.positions[loan].lastPnlUsd).toBe(1.2);
  });

  test("refuses to roll newer browser income backwards", () => {
    const local = old();
    const server = { positions: {
      [loan]: snapshot("2026-10-30T17:00:00Z", 19),
    }};
    expect(mergeBackendLoopscaleHistory(local, server)).toBe(local);
  });

  test("does not overwrite a manually corrected monthly baseline", () => {
    const local = old();
    const server = { positions: {
      [loan]: snapshot("2026-10-30T19:00:00Z", 1.5, {
        monthBaselines: { "2026-10": 10 },
      }),
    }};
    expect(mergeBackendLoopscaleHistory(local, server)).toBe(local);
  });

  test("does not accept invalid or incomplete source data", () => {
    const local = old();
    expect(mergeBackendLoopscaleHistory(local, {})).toBe(local);
    expect(mergeBackendLoopscaleHistory(local, {
      positions: { [loan]: snapshot("bad-date", 1.5) },
    })).toBe(local);
    expect(mergeBackendLoopscaleHistory(local, {
      positions: { [loan]: snapshot("2026-10-30T19:00:00Z", NaN) },
    })).toBe(local);
    expect(mergeBackendLoopscaleHistory(local, {
      positions: { [loan]: snapshot("2026-10-30T19:00:00Z", 1.5, { lastValueUsd: 0 }) },
    })).toBe(local);
  });

  test("keeps unrelated loans and non-overlapping historical months", () => {
    const local = old();
    local.positions.another = snapshot("2026-10-29T19:00:00Z", 3, {
      key: "another", loanAddress: "another",
    });
    local.positions[loan].monthlyEarnings["2026-09"] = .75;
    local.positions[loan].monthBaselines["2026-09"] = .3;
    const server = { positions: {
      [loan]: snapshot("2026-10-30T19:00:00Z", 1.5),
    }};
    const result = mergeBackendLoopscaleHistory(local, server);
    expect(result.positions.another).toEqual(local.positions.another);
    expect(result.positions[loan].monthlyEarnings["2026-09"]).toBe(.75);
    expect(result.positions[loan].monthBaselines["2026-09"]).toBe(.3);
  });

  test("repeated backend reads are idempotent", () => {
    const local = old();
    const server = { positions: {
      [loan]: snapshot("2026-10-30T19:00:00Z", 1.5),
    }};
    const next = mergeBackendLoopscaleHistory(local, server);
    expect(mergeBackendLoopscaleHistory(next, server)).toBe(next);
  });
});
