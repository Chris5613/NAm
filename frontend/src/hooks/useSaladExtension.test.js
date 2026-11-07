import { updateSaladTracker } from "./useSaladExtension";
import { getCurrentMonthKey } from "@/lib/yieldFarmingAccounting";

test("Salad tracker rejects an older cached payload", () => {
  const current = {
    lastSyncedAt: "2026-11-06T20:00:00Z",
    currentBalance: 5,
    lifetimeBalance: 10,
  };
  const next = updateSaladTracker(current, {
    syncedAt: "2026-11-06T19:00:00Z",
    currentBalance: 4,
    lifetimeBalance: 9,
  });
  expect(next).toBe(current);
});

test("Salad tracker merges dated earnings and preserves monthly lifetime baseline", () => {
  const monthKey = getCurrentMonthKey();
  const current = {
    lastSyncedAt: "2026-11-06T18:00:00Z",
    lastLifetimeBalance: 12,
    monthBaselineMonth: monthKey,
    monthBaselineLifetimeBalance: 10,
    monthlyEarnings: {},
    daily: {},
    earningSnapshots: [],
  };
  const next = updateSaladTracker(current, {
    syncedAt: "2026-11-06T19:00:00Z",
    currentBalance: 3,
    lifetimeBalance: 13,
    daily: { "2026-11-06": 0.5 },
  });

  expect(next.currentBalance).toBe(3);
  expect(next.lifetimeBalance).toBe(13);
  expect(next.daily["2026-11-06"]).toBe(0.5);
  expect(next.monthlyEarnings[monthKey]).toBe(3);
  expect(next.lastWithdrawalAt).toBeNull();
  expect(next.withdrawals).toBe(0);
});
