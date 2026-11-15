import { resetStore, remoteStorage } from "./serverStore";
import { loadKryptexTracker, saveKryptexTracker } from "./yieldFarmingAccounting";

const key = "project_income_kryptex_tracker_v1";

afterEach(() => resetStore());

test("loading backend Kryptex tracker retains sats, pending conversions and audit timestamps", () => {
  remoteStorage.setItem(key, JSON.stringify({
    initialized: true,
    currentBalance: 99,
    lastBalance: 99,
    monthlyEarnings: { "2026-11": 4.16 },
    kryptexMiningDaily: { "2026-11-06": 4.16 },
    kryptexConfirmedDays: { "2026-11-06": true },
    kryptexMiningSatsDaily: { "2026-11-06": 5490 },
    kryptexPendingEarningsDays: ["2026-11-07"],
    kryptexLastChartSyncAt: "2026-11-14T08:30:00Z",
    activeMachineCount: 2,
  }));
  const tracker = loadKryptexTracker();
  expect(tracker.kryptexMiningSatsDaily).toEqual({ "2026-11-06": 5490 });
  expect(tracker.kryptexPendingEarningsDays).toEqual(["2026-11-07"]);
  expect(tracker.kryptexLastChartSyncAt).toBe("2026-11-14T08:30:00Z");
  expect(tracker.activeMachineCount).toBe(2);
});

test("legacy extension cannot erase backend evidence or lower confirmed earnings", () => {
  remoteStorage.setItem(key, JSON.stringify({
    initialized: true,
    currentBalance: 90,
    lastBalance: 90,
    lifetimeEarnedUsd: 388.16,
    monthlyEarnings: { "2026-11": 4.16 },
    kryptexMiningDaily: { "2026-11-06": 4.16 },
    kryptexConfirmedDays: { "2026-11-06": true },
    kryptexMiningSatsDaily: { "2026-11-06": 5490 },
    kryptexPendingEarningsDays: ["2026-11-07"],
    kryptexLastChartSyncAt: "2026-11-14T08:30:00Z",
  }));
  // Older extension sends a smaller USD conversion and omits satoshi evidence.
  saveKryptexTracker({
    initialized: true,
    currentBalance: 85,
    lifetimeEarnedUsd: 350,
    monthlyEarnings: { "2026-11": 3.1 },
    kryptexMiningDaily: { "2026-11-06": 3.1 },
    kryptexConfirmedDays: { "2026-11-06": false },
  });
  const saved = JSON.parse(remoteStorage.getItem(key));
  expect(saved.kryptexMiningDaily["2026-11-06"]).toBe(4.16);
  expect(saved.kryptexConfirmedDays["2026-11-06"]).toBe(true);
  expect(saved.kryptexMiningSatsDaily["2026-11-06"]).toBe(5490);
  expect(saved.kryptexPendingEarningsDays).toEqual(["2026-11-07"]);
  expect(saved.kryptexLastChartSyncAt).toBe("2026-11-14T08:30:00Z");
  expect(saved.monthlyEarnings["2026-11"]).toBe(4.16);
  expect(saved.lifetimeEarnedUsd).toBe(388.16);
});
