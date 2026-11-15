import { validatePowerPreview,readCryptoDashboardPowerCache,
  writeCryptoDashboardPowerCache,clearCryptoDashboardPowerCache,POWER_PREVIEW_MAX_AGE
} from "./cryptoDashboardPowerCache";
const mem=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
const sample={configured:true,latest:{observedAt:"2026-11-15T03:00:00Z",
  totalWatts:420,devices:[{id:"pc1",label:"PC",watts:420}]},
  currentMonth:{month:"2026-11",totalKwh:17.3,tiers:{basic:17.3}},history:[{private:"no"}]};
test("only used backend fields retained, not raw history",()=>{
  const s=validatePowerPreview(sample);
  expect(s.latest.totalWatts).toBe(420);
  expect(s.history).toBeUndefined();
});
test("per-user cache does not cross accounts and expires",()=>{
  const s=mem(),t=100000;
  writeCryptoDashboardPowerCache(1,sample,s,t);
  expect(readCryptoDashboardPowerCache(1,s,t+1).data.currentMonth.totalKwh).toBe(17.3);
  expect(readCryptoDashboardPowerCache(2,s,t+1)).toBeNull();
  expect(readCryptoDashboardPowerCache(1,s,t+POWER_PREVIEW_MAX_AGE+1)).toBeNull();
  writeCryptoDashboardPowerCache(1,sample,s,t);
  clearCryptoDashboardPowerCache(1,s);
  expect(readCryptoDashboardPowerCache(1,s,t)).toBeNull();
});
test("invalid backend observations are rejected",()=>{
  expect(validatePowerPreview({...sample,latest:{...sample.latest,totalWatts:-4}})).toBeNull();
  expect(validatePowerPreview({...sample,latest:{...sample.latest,observedAt:"invalid"}})).toBeNull();
});


test("cached profitability is sanitized and never trusts a browser estimate",()=>{
  const valid={usdPerDay:4.27,machineCount:2,
    source:"backend-kryptex-machine-aggregate",observedAt:null,secret:"do-not-cache"};
  const allowed=validatePowerPreview({...sample,kryptexDailyRunRate:valid});
  expect(allowed.kryptexDailyRunRate.usdPerDay).toBe(4.27);
  expect(allowed.kryptexDailyRunRate.secret).toBeUndefined();
  expect(validatePowerPreview({...sample,kryptexDailyRunRate:{
    ...valid,source:"browser"}}).kryptexDailyRunRate).toBeNull();
});
