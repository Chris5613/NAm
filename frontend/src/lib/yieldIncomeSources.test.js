import { buildSourceTotalsForDay } from "./yieldIncomeSources";

const baseContext = (overrides = {}) => ({
  todayKey: "2026-11-06",
  luloProjects: [],
  currentLuloUtc: { utcDay: "2026-11-07", status: "unavailable", amount: null },
  unetworkTracker: { daily: {} },
  kryptexTracker: { kryptexMiningDaily: {}, kryptexConfirmedDays: {} },
  saladTracker: { daily: {} },
  rollerCoinTracker: { daily: {}, walletDaily: {}, lastTrxPrice: 0 },
  earningsLedger: { days: {} },
  stockPayouts: {},
  loopscaleHistory: { positions: {} },
  recoveredEarningsByDay: {},
  projectRecovery: null,
  savedLoopscaleReference: null,
  currentLoopscaleReference: 0,
  SALAD_FIXED_DAY: "2026-10-29",
  SALAD_FIXED_TOTAL: 0.6804,
  LULO_FIXED_DAY: "2026-10-29",
  LULO_FIXED_TOTAL: 0.36,
  ROLLERCOIN_OCT30_ANCHOR_DAY: "2026-10-30",
  ROLLERCOIN_OCT30_ANCHOR_TRX: 35.269272,
  ROLLERCOIN_OCT30_ANCHOR_AT: Date.parse("2026-10-30T16:04:00Z"),
  ROLLERCOIN_OCT30_ESTIMATED_MORNING_TRX: 0.53,
  LOOPSCALE_FIXED_DISPLAY_DAY: "2026-10-29",
  LOOPSCALE_FIXED_DISPLAY_USD: 2,
  ...overrides,
});

test("today uses dated provider income and excludes balance-only movement", () => {
  const context = baseContext({
    kryptexTracker: {
      kryptexMiningDaily: { "2026-11-06": 1.2 },
      kryptexConfirmedDays: { "2026-11-06": true },
    },
    saladTracker: { daily: { "2026-11-06": 0.3 } },
    rollerCoinTracker: {
      daily: { "2026-11-06": { usd: 0.5 } },
      walletDaily: {},
      lastTrxPrice: 0.25,
    },
    unetworkTracker: {
      daily: { "2026-11-06": { count: 1, micros: 0, usd: 0.2 } },
    },
    loopscaleHistory: {
      positions: {
        a: { observedDaily: { "2026-11-06": 0.4 } },
      },
    },
  });

  expect(buildSourceTotalsForDay("2026-11-06", context)).toEqual({
    Kryptex: 1.2,
    Salad: 0.3,
    RollerCoin: 0.5,
    Unetwork: 0.2,
    Loopscale: 0.4,
  });
});

test("historical ledger sources are preserved while unconfirmed Kryptex is removed", () => {
  const context = baseContext({
    earningsLedger: {
      days: {
        "2026-11-05": {
          sources: { Salad: 0.7, Kryptex: 9, RollerCoin: 0.4 },
        },
      },
    },
  });

  expect(buildSourceTotalsForDay("2026-11-05", context)).toEqual({
    Salad: 0.7,
    RollerCoin: 0.4,
  });
});

test("future Pacific days expose only the current Lulo UTC day", () => {
  const context = baseContext();
  expect(buildSourceTotalsForDay("2026-11-07", context)).toEqual({});
  expect(buildSourceTotalsForDay("2026-11-08", context)).toEqual({});
});
