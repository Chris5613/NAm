import {extractBackendKryptexRunRate,projectedDailyMiningNet} from "./backendKryptexRunRate";

test("daily run rate comes only from backend machine aggregate", () => {
  const actual = extractBackendKryptexRunRate({
    machine_count:2, status:{profitability_usd_day:4.27}
  });
  expect(actual.usdPerDay).toBe(4.27);
  expect(actual.machineCount).toBe(2);
  expect(actual.source).toBe("backend-kryptex-machine-aggregate");
  expect(projectedDailyMiningNet(actual,0)).toBe(4.27);
  expect(projectedDailyMiningNet(actual,1.25)).toBe(3.0199999999999996);
});
test("missing or stale local estimate cannot substitute for source evidence", () => {
  expect(extractBackendKryptexRunRate(null)).toBeNull();
  expect(extractBackendKryptexRunRate({machine_count:0,status:{profitability_usd_day:3.55}})).toBeNull();
  expect(extractBackendKryptexRunRate({machine_count:1,status:{profitability_usd_day:"3.55"}})).toBeNull();
  expect(extractBackendKryptexRunRate({machine_count:1,status:{profitability_usd_day:-1}})).toBeNull();
  expect(projectedDailyMiningNet(null,0)).toBeNull();
});
test("zero profitability is a legitimate observed value", () => {
  const stopped=extractBackendKryptexRunRate({machine_count:1,status:{profitability_usd_day:0}});
  expect(stopped.usdPerDay).toBe(0);
  expect(projectedDailyMiningNet(stopped,0)).toBe(0);
});
test("arbitrary browsing data is not accepted as backend run rate",()=>{
  expect(projectedDailyMiningNet({usdPerDay:500,source:"browser"},0)).toBeNull();
});
