import { applyJupiterInfLoopSnapshot, parseFluidPnl } from "./jupiterInfLoopSync";

const START = new Date("2026-08-28T00:00:00Z");
const NEXT_DAY = new Date("2026-08-29T00:00:00Z");

function makeProject(overrides = {}) {
  return {
    yield_tracking: "jupiter_inf_loop",
    invested: 400,
    jupiter_initial_earned: 10,
    earned: 10,
    transactions: [],
    jupiter_last_rate: 1.4,
    jupiter_last_synced_at: START.toISOString(),
    ...overrides,
  };
}

const snapshot = {
  collateralInf: 10,
  borrowedSol: 10,
  infUsd: 141,
  solUsd: 100,
  infSolRate: 1.41,
  supplyApy: 5.75,
  borrowApy: 5,
  netEquityUsd: 410,
  netApy: 7.56,
  pnlUsd: 10.126892,
  pnlPercentage: 1.8,
};

describe("Jupiter INF loop reconciliation", () => {
  it("converts Fluid P&L from SOL lamports and basis points", () => {
    const pnl = parseFluidPnl(
      { amount: "10126892", percentage: "18" },
      { decimals: 9, price: "104.018116767138" }
    );

    expect(pnl.pnlUsd).toBeCloseTo(1.05338, 5);
    expect(pnl.pnlPercentage).toBe(0.18);
  });

  it("uses Jupiter's flow-adjusted P&L as APY earned", () => {
    const project = applyJupiterInfLoopSnapshot(makeProject(), snapshot, NEXT_DAY);

    expect(project.transactions).toHaveLength(1);
    expect(project.transactions[0].amount).toBe(10.126892);
    expect(project.earned).toBe(10.126892);
    expect(project.jupiter_apy_earned_usd).toBe(10.126892);
    expect(project.jupiter_apy_earned_percentage).toBe(1.8);
    expect(project.jupiter_position_pnl_usd).toBe(10);
    expect(project.jupiter_position_pnl_percentage).toBe(2.5);
    expect(project.jupiter_pnl_source).toBe("fluid_position_stats");
  });

  it("does not add the same snapshot twice", () => {
    const first = applyJupiterInfLoopSnapshot(makeProject(), snapshot, NEXT_DAY);
    const second = applyJupiterInfLoopSnapshot(first, snapshot, NEXT_DAY);

    expect(second.transactions).toHaveLength(1);
    expect(second.transactions[0].amount).toBe(first.transactions[0].amount);
    expect(second.earned).toBe(first.earned);
  });

  it("replaces legacy estimated accruals on the first Fluid P&L sync", () => {
    const project = applyJupiterInfLoopSnapshot(
      makeProject({
        jupiter_initial_earned: 0,
        earned: -0.0001,
        jupiter_last_synced_at: "2026-08-28T12:00:00Z",
        transactions: [{
          source: "jupiter_inf_loop",
          source_date: "2026-08-28",
          amount: -0.0001,
          gross_yield_usd: 0,
          borrow_cost_usd: 0.0001,
        }],
      }),
      snapshot,
      new Date("2026-08-28T12:01:00Z")
    );

    expect(project.transactions).toHaveLength(1);
    expect(project.transactions[0].accrual_model).toBe("fluid_pnl_v1");
    expect(project.transactions[0].amount).toBeGreaterThan(0);
    expect(project.earned).toBeGreaterThan(0);
  });

  it("initializes a new position with Jupiter's authoritative existing P&L", () => {
    const project = applyJupiterInfLoopSnapshot(
      makeProject({ jupiter_last_rate: null, jupiter_last_synced_at: null }),
      snapshot,
      START
    );

    expect(project.transactions).toHaveLength(1);
    expect(project.transactions[0].amount).toBe(10.126892);
    expect(project.jupiter_collateral_inf).toBe(10);
    expect(project.jupiter_borrowed_sol).toBe(10);
    expect(project.earned).toBe(10.126892);
  });

  it("keeps APY earned separate from combined position P&L", () => {
    const project = applyJupiterInfLoopSnapshot(makeProject(), snapshot, NEXT_DAY);

    expect(project.earned).toBe(10.126892);
    expect(project.jupiter_position_pnl_usd).toBe(10);
    expect(project.earned).not.toBe(project.jupiter_position_pnl_usd);
  });

  it("replaces a legacy combined earned value with the APY ledger total", () => {
    const project = applyJupiterInfLoopSnapshot(
      makeProject({
        earned: 33,
        jupiter_initial_earned: null,
        transactions: [{ source: "jupiter_inf_loop", source_date: "2026-08-28", amount: 1.03 }],
      }),
      { ...snapshot, pnlUsd: null, infSolRate: 1.4 },
      START
    );

    expect(project.earned).toBe(1.03);
    expect(project.jupiter_position_pnl_usd).toBe(10);
  });
});