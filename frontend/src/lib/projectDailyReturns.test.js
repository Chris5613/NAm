import { applyApyTransactionAccruals } from "./projectDailyReturns";

const NOW = new Date("2026-08-28T12:00:00");

function makeProject(overrides = {}) {
  return {
    id: "project-1",
    invested: 3650,
    apy: 10,
    earned: 25,
    transactions: [],
    last_accrued_at: "2026-08-26T12:00:00",
    ...overrides,
  };
}

describe("APY transaction accruals", () => {
  it("creates one transaction per missed day and increments earned once", () => {
    const [project] = applyApyTransactionAccruals([makeProject()], NOW);

    expect(project.transactions).toHaveLength(2);
    expect(project.transactions.map((transaction) => transaction.source_date)).toEqual([
      "2026-08-27",
      "2026-08-28",
    ]);
    expect(project.transactions[0]).toMatchObject({ source: "apy", amount: 1 });
    expect(project.earned).toBe(27);
  });

  it("does not duplicate transactions or earned value when run again", () => {
    const [firstRun] = applyApyTransactionAccruals([makeProject()], NOW);
    const [secondRun] = applyApyTransactionAccruals([firstRun], NOW);

    expect(secondRun.transactions).toHaveLength(2);
    expect(secondRun.earned).toBe(27);
  });

  it("does not increment earned for an existing APY transaction", () => {
    const project = makeProject({
      transactions: [{ source: "apy", source_date: "2026-08-27", amount: 1 }],
    });
    const [accrued] = applyApyTransactionAccruals([project], new Date("2026-08-27T12:00:00"));

    expect(accrued.transactions).toHaveLength(1);
    expect(accrued.earned).toBe(25);
  });

  it("does not apply generic APY accruals to an INF-tracked project", () => {
    const project = makeProject({ yield_tracking: "sanctum_inf", inf_amount: 10 });
    const [accrued] = applyApyTransactionAccruals([project], NOW);

    expect(accrued.transactions).toHaveLength(0);
    expect(accrued.earned).toBe(25);
  });
});