import { mergeDailyHighWaterSources } from "./useDailyEarningsHighWater";

test("daily high-water merge never decreases a source", () => {
  expect(
    mergeDailyHighWaterSources(
      { Kryptex: 1.25, Salad: 0.4 },
      { Kryptex: 0.9, Salad: 0.55, RollerCoin: 0.2 }
    )
  ).toEqual({
    Kryptex: 1.25,
    Salad: 0.55,
    RollerCoin: 0.2,
  });
});

test("daily high-water merge clamps invalid and negative readings", () => {
  expect(
    mergeDailyHighWaterSources(
      { Kryptex: 1 },
      { Kryptex: -5, Salad: Number.NaN }
    )
  ).toEqual({
    Kryptex: 1,
    Salad: 0,
  });
});
