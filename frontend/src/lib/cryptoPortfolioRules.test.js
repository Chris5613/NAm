import {
  currentProjectBalance, uniqueProjectSources, currentRollerCoinBalance,
  canonicalProjectBitcoinTotal,
} from "./cryptoPortfolioRules";

test("investment cost never becomes a current holding", () => {
  expect(currentProjectBalance({ invested: 914.95, earned: 151 })).toBe(0);
  expect(currentProjectBalance({ invested: 363.68, currentBalance: 259.34 })).toBe(259.34);
  expect(currentProjectBalance({ currentBalance: 0, invested: 1000 })).toBe(0);
});
test("canonical provider replaces duplicate legacy project", () => {
  const projects = [
    { name: "RollerCoin", invested: 914.95 },
    { name: "Lulo", lulo_total_balance_usd: 1500.64 },
    { name: "Kryptex", invested: 363.68 },
    { name: "Unity Network", invested: 0, balance: 44.90 },
  ];
  const external = [
    { platform: "RollerCoin", balance: 18.14 },
    { platform: "Kryptex", balance: 259.34 },
    { platform: "Unetwork", balance: 44.90 },
  ];
  expect(uniqueProjectSources(projects, external).map(row => row.name)).toEqual(["Lulo"]);
});
test("RollerCoin holdings use current TRX, not lifetime mined TRX", () => {
  const tracker = { currentTrxBalance: 59.52, lastTrxPrice: 0.305, daily: {
    "2026-11-14": { trx: 300 },
  } };
  expect(currentRollerCoinBalance(tracker).balanceUsd).toBeCloseTo(18.1536, 5);
  expect(currentRollerCoinBalance({ lastTrxPrice: 0.3 })).toBeNull();
});
test("one project plus bitcoin total; absent summaries cannot overwrite cache", () => {
  expect(canonicalProjectBitcoinTotal({ portfolioBalance: 3934.75 }, 1062.40)).toBeCloseTo(4997.15, 2);
  expect(canonicalProjectBitcoinTotal(null, 1062.40)).toBeNull();
});
