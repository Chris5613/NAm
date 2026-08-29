import { applyLuloYieldSnapshot } from "./luloYieldSync";

const START = new Date("2026-08-28T12:00:00Z");
const LATER = new Date("2026-08-28T13:00:00Z");

const snapshot = {
  totalBalanceUsd: 2340.60527,
  regularBalanceUsd: 1038.933027,
  protectedBalanceUsd: 0,
  usdcBalanceUsd: 1038.933027,
  usdsBalanceUsd: 1301.672243,
  usdsApy: 9.22,
  totalInterestEarnedUsd: 72.019051,
  regularApy: 7.4133,
  protectedApy: 4.2364,
  weightedApy: 8.4177,
};

function makeProject(overrides = {}) {
  return {
    yield_tracking: "lulo_lending",
    invested: 1000,
    earned: 0,
    transactions: [],
    ...overrides,
  };
}

describe("Lulo yield reconciliation", () => {
  it("initializes APY earned from authoritative lifetime interest", () => {
    const project = applyLuloYieldSnapshot(makeProject(), snapshot, START);

    expect(project.transactions).toHaveLength(0);
    expect(project.earned).toBe(72.019051);
    expect(project.lulo_last_interest_usd).toBe(72.019051);
    expect(project.lulo_total_balance_usd).toBe(2340.60527);
    expect(project.lulo_usdc_balance_usd).toBe(1038.933027);
    expect(project.lulo_usds_balance_usd).toBe(1301.672243);
    expect(project.invested).toBeCloseTo(2268.586219, 6);
    expect(project.lulo_balance_model).toBe("multi_token_v2");
  });

  it("records only the exact lifetime-interest increase", () => {
    const project = applyLuloYieldSnapshot(
      makeProject({
        lulo_initial_earned: 72.019051,
        lulo_last_interest_usd: 72.019051,
        lulo_last_synced_at: START.toISOString(),
      }),
      { ...snapshot, totalBalanceUsd: 2340.62527, totalInterestEarnedUsd: 72.039051 },
      LATER
    );

    expect(project.transactions).toHaveLength(1);
    expect(project.transactions[0].amount).toBe(0.02);
    expect(project.earned).toBe(72.039051);
  });

  it("does not duplicate an unchanged snapshot", () => {
    const first = applyLuloYieldSnapshot(
      makeProject({ lulo_last_interest_usd: 20 }),
      snapshot,
      START
    );
    const second = applyLuloYieldSnapshot(first, snapshot, LATER);

    expect(second.transactions).toHaveLength(1);
    expect(second.earned).toBe(first.earned);
  });
});