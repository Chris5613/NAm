import { mergeManualIncome } from "./manualIncomeHistory";

test("merges monthly imports once without changing saved income", () => {
  const saved = [{ monthKey: "2026-04", sources: { RollerCoin: 10, Stocks: 5 }, projectTotal: 10, stocks: 5, total: 15 }];
  const imports = {
    "2026-04": { RollerCoin: 10, Nosana: 8 },
    "2026-05": { Nosana: 7 },
    "2026-06": { Nosana: 9 },
  };
  const months = mergeManualIncome(saved, imports, "2026-05");
  expect(months.map(month => [month.monthKey, month.total])).toEqual([
    ["2026-04", 23], ["2026-05", 7],
  ]);
  expect(months[0].sources).toEqual({ RollerCoin: 10, Stocks: 5, Nosana: 8 });
  expect(saved[0].sources).toEqual({ RollerCoin: 10, Stocks: 5 });
});

test("recognizes alternate saved names and an aggregate GoMining record", () => {
  const saved = [{ monthKey: "2026-03", sources: { "Unity  Network": 12, GoMining: 8 }, projectTotal: 20, stocks: 0, total: 20 }];
  const [march] = mergeManualIncome(saved, {
    "2026-03": { "Unity Network": 12, "GoMining Mining": 6, "GoMining Bounty": 2, Nosana: 4 },
  }, "2026-03");
  expect(march.sources).toEqual({ "Unity  Network": 12, GoMining: 8, Nosana: 4 });
  expect(march.total).toBe(24);
});
