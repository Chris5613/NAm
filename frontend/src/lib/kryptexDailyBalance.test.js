import { recordKryptexDailyBalance, withKryptexDailyBalance } from "./kryptexDailyBalance";

test("balance changes do not rewrite confirmed Kryptex earnings", () => {
  const day = "2026-11-02";
  const initial = {
    lastBalance: 278, peakBalance: 278, lastSyncedAt: "2026-11-02T20:00:00Z",
  };
  const down = recordKryptexDailyBalance(initial, 277.5, day, 0.8);
  expect(down[day].changeUsd).toBeCloseTo(0.3);
  expect(withKryptexDailyBalance({ Kryptex: 0.8, Salad: 1 }, { dailyBalanceDays: down }, day))
    .toEqual({ Salad: 1 });
  expect(withKryptexDailyBalance({ Kryptex: 0.8, Salad: 1 }, {
    dailyBalanceDays: down, kryptexMiningDaily: { [day]: 1.62 }, kryptexConfirmedDays: { [day]: true },
  }, day)).toEqual({ Kryptex: 1.62, Salad: 1 });
  const rebound = recordKryptexDailyBalance({ ...initial, lastBalance: 277.5, dailyBalanceDays: down }, 278, day, 0.8);
  expect(rebound[day].changeUsd).toBeCloseTo(0.8);
  const nextDay = recordKryptexDailyBalance({ ...initial, dailyBalanceDays: rebound }, 278.2, "2026-11-03");
  expect(nextDay["2026-11-03"].changeUsd).toBeCloseTo(0.2);
  expect(nextDay[day].changeUsd).toBeCloseTo(0.8);
});
