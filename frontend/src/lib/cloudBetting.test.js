import {
  betIdentityKey,
  buildGroupStats,
  calculateProfit,
  getBetStatus,
  moveMonthKey,
} from "./cloudBetting";

test("Cloud bet identity is stable for the same persisted bet", () => {
  const bet = {
    date: "2026-11-07",
    title: "Example",
    awayTeam: "A",
    homeTeam: "B",
    odds: "+120",
    stake: 10,
  };
  expect(betIdentityKey(bet)).toBe(betIdentityKey({ ...bet }));
});

test("Cloud group stats separate record, wagered and pnl", () => {
  const rows = buildGroupStats([
    { category: "Baseball", amount: 12, status: "win" },
    { category: "Baseball", amount: -5, status: "loss" },
  ], (bet) => bet.category);
  expect(rows).toHaveLength(1);
  expect(rows[0].wins).toBe(1);
  expect(rows[0].losses).toBe(1);
  expect(rows[0].wagered).toBe(17);
  expect(rows[0].pnl).toBe(7);
});

test("Cloud month navigation handles year boundaries", () => {
  expect(moveMonthKey("2026-01", -1)).toBe("2025-12");
  expect(moveMonthKey("2026-12", 1)).toBe("2027-01");
});

test("Cloud status and profit helpers preserve existing semantics", () => {
  expect(getBetStatus({ status: "win" })).toBe("win");
  expect(calculateProfit(10, 2)).toBeGreaterThanOrEqual(0);
});
