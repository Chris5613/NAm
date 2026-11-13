import { recordedDailyProviderIncome as today } from "./recordedDailyProviderIncome";

test("Kryptex only reports confirmed daily income, not projected profitability",()=>{
  const history={kryptex:{profitabilityUsdDay:4.55,kryptexMiningDaily:{"2026-11-13":2.13},
    kryptexConfirmedDays:{"2026-11-13":true}}};
  expect(today("Kryptex","2026-11-13",history)).toBe(2.13);
  expect(today("Kryptex","2026-11-12",history)).toBeNull();
  expect(today("Kryptex","2026-11-13",{kryptex:{kryptexMiningDaily:{"2026-11-13":2.13}}})).toBeNull();
});
test("RollerCoin prefers wallet observations to avoid double counting",()=>{
  expect(today("RollerCoin","2026-11-13",{rollercoin:{daily:{"2026-11-13":{usd:0.2}},
    walletDaily:{"2026-11-13":{usd:0.35}}}})).toBe(0.35);
});
test("Loopscale combines dated observations from each position",()=>{
  const history={loopscale:{positions:{a:{observedDaily:{"2026-11-13":0.3}},
    b:{observedDaily:{"2026-11-13":0.1}}}}};
  expect(today("Loopscale","2026-11-13",history)).toBeCloseTo(0.4);
  expect(today("Loopscale","2026-11-12",history)).toBeNull();
});
test("Lulo chooses one daily performance observation instead of also adding transactions",()=>{
  const history={luloProjects:[{lulo_daily_performance:[
    {date:"2026-11-13",amount:0.19},{date:"2026-11-13",amount:0.2}],
    transactions:[{source:"lulo_yield",date:"2026-11-13",amount:0.19}]}]};
  expect(today("Lulo","2026-11-13",history)).toBe(0.2);
});
test("Missing records are not replaced by an estimated daily rate",()=>{
  expect(today("Salad","2026-11-13",{salad:{estimatedDailyUsd:0.33}})).toBeNull();
  expect(today("Unetwork","2026-11-13",{unetwork:{daily:{"2026-11-13":{usd:0}}}})).toBe(0);
  expect(today("Stocks","2026-11-13",{})).toBeNull();
});
