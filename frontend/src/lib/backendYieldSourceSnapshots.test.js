import { selectFreshSourceSnapshot } from "./backendYieldSourceSnapshots";

const wallet = "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM";
const now = Date.parse("2026-10-30T21:00:00Z");
const at = "2026-10-30T20:59:30Z";
const payload = {
  lulo: {
    [wallet]: {
      walletAddress: wallet, syncedAt: at, totalBalanceUsd: 200,
      totalInterestEarnedUsd: 12.5, dailyPerformance: [],
    },
  },
  loopscale: {
    walletAddress: wallet, syncedAt: at, positionValueUsd: 40,
    pnlUsd: -0.26, dailyNetYieldUsd: 0.05,
  },
};

describe("fresh backend Lulo and Loopscale snapshots", () => {
  it("accepts a newer valid Lulo snapshot without changing earnings", () => {
    expect(selectFreshSourceSnapshot(
      payload, "lulo", wallet, "2026-10-30T20:58:00Z", now
    )).toEqual(payload.lulo[wallet]);
  });

  it("preserves newer extension readings and rejects repeated sync times", () => {
    expect(selectFreshSourceSnapshot(
      payload, "lulo", wallet, "2026-10-30T21:00:00Z", now
    )).toBeNull();
    expect(selectFreshSourceSnapshot(
      payload, "lulo", wallet, at, now
    )).toBeNull();
  });

  it("rejects expired snapshots and future timestamps", () => {
    expect(selectFreshSourceSnapshot(
      payload, "lulo", wallet, null, now + 121000
    )).toBeNull();
    expect(selectFreshSourceSnapshot(
      payload, "lulo", wallet, null, now - 45000
    )).toBeNull();
  });

  it("rejects wrong wallet addresses and incomplete provider balances", () => {
    expect(selectFreshSourceSnapshot(payload, "lulo", "another", null, now)).toBeNull();
    const invalid = {
      ...payload, lulo: {
        [wallet]: { ...payload.lulo[wallet], totalBalanceUsd: 0 }
      }
    };
    expect(selectFreshSourceSnapshot(invalid, "lulo", wallet, null, now)).toBeNull();
  });

  it("accepts signed Loopscale P/L, including negative values", () => {
    const result = selectFreshSourceSnapshot(
      payload, "loopscale", wallet, null, now
    );
    expect(result.pnlUsd).toBe(-0.26);
  });

  it("requires a confirmed positive Loopscale equity value", () => {
    const invalid = { ...payload, loopscale: {
      ...payload.loopscale, positionValueUsd: 0,
    }};
    expect(selectFreshSourceSnapshot(
      invalid, "loopscale", wallet, null, now
    )).toBeNull();
  });
});
