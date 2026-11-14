import {
  kryptexStatusMessage,
  updateKryptexTracker,
} from "./useKryptexExtension";
import {
  getCurrentMonthKey,
  getTodayKey,
} from "@/lib/yieldFarmingAccounting";

test("Kryptex confirmed chart earnings become dated mining income", () => {
  const day = getTodayKey();
  const month = getCurrentMonthKey();
  const next = updateKryptexTracker(
    {
      lastBalance: 5,
      peakBalance: 5,
      lifetimeEarnedUsd: 5,
      monthlyEarnings: { [month]: 0 },
      kryptexMiningDaily: {},
      kryptexConfirmedDays: {},
    },
    {
      synced_at: new Date().toISOString(),
      status: {
        balance_usd: 5.5,
        profitability_usd_day: 1.2,
        withdrawable_usd: 5,
        miners: [],
      },
      earnings: {
        daily_usd: { [day]: 0.75 },
      },
    }
  );

  expect(next.kryptexMiningDaily[day]).toBe(0.75);
  expect(next.kryptexConfirmedDays[day]).toBe(true);
  expect(next.monthlyEarnings[month]).toBe(0.75);
  expect(next.currentBalance).toBe(5.5);
});

test("Kryptex status message distinguishes sats awaiting price", () => {
  const day = getTodayKey();
  expect(kryptexStatusMessage({
    earnings: { daily_sats: { [day]: 123 } },
  })).toBe("Kryptex sats captured; waiting for a BTC price.");
});

test("a falling BTC/USD balance or lower converted chart reading does not erase confirmed Kryptex earnings",()=>{
  const day=getTodayKey();
  const month=getCurrentMonthKey();
  const previous={
    lastBalance:100,
    peakBalance:105,
    lifetimeEarnedUsd:45,
    monthlyEarnings:{[month]:5},
    kryptexMiningDaily:{[day]:5},
    kryptexConfirmedDays:{[day]:true},
  };
  const lower=updateKryptexTracker(previous,{
    synced_at:new Date().toISOString(),
    status:{balance_usd:90,profitability_usd_day:1,withdrawable_usd:90,miners:[]},
    earnings:{daily_usd:{[day]:4.4}},
  });
  expect(lower.currentBalance).toBe(90);
  expect(lower.kryptexMiningDaily[day]).toBe(5);
  expect(lower.monthlyEarnings[month]).toBe(5);
  expect(lower.lifetimeEarnedUsd).toBe(45);
  const higher=updateKryptexTracker(lower,{
    synced_at:new Date().toISOString(),
    status:{balance_usd:89,profitability_usd_day:1,withdrawable_usd:89,miners:[]},
    earnings:{daily_usd:{[day]:5.2}},
  });
  expect(higher.currentBalance).toBe(89);
  expect(higher.kryptexMiningDaily[day]).toBe(5.2);
  expect(higher.monthlyEarnings[month]).toBe(5.2);
});
