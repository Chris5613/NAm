import { applyInfYieldSnapshot } from "./infYieldSync";

const NOW = new Date("2026-08-28T12:00:00");
const SNAPSHOT = { infSolRate: 1.21, solUsd: 150, source: "test" };

function makeProject(overrides = {}) {
  return {
    id: "inf-project",
    yield_tracking: "sanctum_inf",
    inf_amount: 10,
    inf_last_rate: 1.2,
    earned: 5,
    transactions: [],
    ...overrides,
  };
}

describe("INF yield reconciliation", () => {
  it("creates one daily transaction from INF/SOL rate growth", () => {
    const [project] = applyInfYieldSnapshot([makeProject()], SNAPSHOT, NOW);

    expect(project.transactions).toHaveLength(1);
    expect(project.transactions[0]).toMatchObject({
      source: "inf_yield",
      source_date: "2026-08-28",
      amount: 15,
      earned_sol: 0.1,
    });
    expect(project.earned).toBe(20);
  });

  it("updates today's transaction without creating a duplicate", () => {
    const [first] = applyInfYieldSnapshot([makeProject()], SNAPSHOT, NOW);
    const [second] = applyInfYieldSnapshot(
      [first],
      { ...SNAPSHOT, infSolRate: 1.22 },
      NOW
    );

    expect(second.transactions).toHaveLength(1);
    expect(second.transactions[0].amount).toBe(30);
    expect(second.earned).toBe(35);
  });

  it("does not double count an identical snapshot or stale cursor", () => {
    const [first] = applyInfYieldSnapshot([makeProject()], SNAPSHOT, NOW);
    const staleCursor = { ...first, inf_last_rate: 1.2 };
    const [second] = applyInfYieldSnapshot([staleCursor], SNAPSHOT, NOW);

    expect(second.transactions).toHaveLength(1);
    expect(second.transactions[0].amount).toBe(15);
    expect(second.earned).toBe(20);
  });
});