import { kryptexIncrease } from "./kryptexEarnings";
test("withdrawal and redeposit do not become mining income", () => {
  const down = kryptexIncrease(60, 100, undefined);
  expect(down).toEqual({ earned: 0, peak: 100 });
  expect(kryptexIncrease(100, 60, down.peak)).toEqual({ earned: 0, peak: 100 });
  expect(kryptexIncrease(101, 100, 100)).toEqual({ earned: 1, peak: 101 });
});
