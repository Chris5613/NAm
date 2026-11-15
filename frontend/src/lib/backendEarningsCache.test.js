import {
  earningsCacheKey, validateBackendEarningsSnapshot,
  readBackendEarningsCache, writeBackendEarningsCache,
  clearBackendEarningsCache, EARNINGS_DASHBOARD_MAX_AGE_MS,
} from "./backendEarningsCache";

function store() {
  const entries = new Map();
  return {
    get length() { return entries.size; },
    key: i => [...entries.keys()][i] || null,
    getItem: k => entries.get(k) || null,
    setItem: (k, v) => entries.set(k, v),
    removeItem: k => entries.delete(k),
  };
}
function backend(month = "2026-11", todayKey = "2026-11-14") {
  const days = [...Array(30)].map((_, i) => ({
    key: month + "-" + String(i + 1).padStart(2,"0"), day: String(i + 1),
    date: month + "-" + String(i + 1).padStart(2, "0"), label: "Nov " + (i+1),
    value: i === 13 ? 5.81 : i < 13 ? 0 : null,
    future: i > 13, sources: i === 13 ? {Kryptex:3.43,Loopscale:2.38} : {},
  }));
  return { sourceOfCalculation:"backend-postgres", month, todayKey,
    days, weekDays: [...Array(7)].map((_,i) => ({
      key:"2026-11-"+String(9+i).padStart(2,"0"),day:"Mon",date:"Nov",value:i===5?5.81:0,
    })), monthTotalUsd: 5.81, todayTotalUsd: 5.81, yesterdayTotalUsd: 0,
    weeklyTotalUsd:5.81, yesterdayDay:"2026-11-13",
    todaySources:{Kryptex:3.43,Loopscale:2.38},
    monthlySources:{Kryptex:3.43,Loopscale:2.38},
    calculatedAt:"2026-11-15T03:50:00Z",
  };
}
test("backend only and source-total parity validation", () => {
  const data = backend();
  expect(validateBackendEarningsSnapshot(data,"2026-11","2026-11-14")).not.toBeNull();
  expect(validateBackendEarningsSnapshot({...data,sourceOfCalculation:"browser"},"2026-11","2026-11-14")).toBeNull();
  expect(validateBackendEarningsSnapshot({...data,monthTotalUsd:200},"2026-11","2026-11-14")).toBeNull();
  expect(validateBackendEarningsSnapshot({...data,todayTotalUsd:6},"2026-11","2026-11-14")).toBeNull();
});
test("cached dashboard is account-specific and not reused on Pacific midnight", () => {
  const storage = store(), data = backend(), now = Date.parse("2026-11-15T04:00:00Z");
  writeBackendEarningsCache(7,"2026-11",data,storage,now);
  expect(readBackendEarningsCache(7,"2026-11","2026-11-14",storage,now+1).data.todayTotalUsd).toBe(5.81);
  expect(readBackendEarningsCache(8,"2026-11","2026-11-14",storage,now+1)).toBeNull();
  expect(readBackendEarningsCache(7,"2026-11","2026-11-15",storage,now+1)).toBeNull();
});
test("delayed lower timestamp response cannot replace newer earnings", () => {
  const storage=store(), data=backend(), now=Date.parse("2026-11-15T04:00:00Z");
  const newer={...data,calculatedAt:"2026-11-15T04:00:00Z"};
  writeBackendEarningsCache(7,"2026-11",newer,storage,now);
  const written=writeBackendEarningsCache(7,"2026-11",data,storage,now+1);
  expect(written.data.calculatedAt).toBe(newer.calculatedAt);
});
test("cache expires and logout only clears current user", () => {
  const storage=store(), data=backend(), now=Date.parse("2026-11-15T04:00:00Z");
  writeBackendEarningsCache(7,"2026-11",data,storage,now);
  writeBackendEarningsCache(8,"2026-11",data,storage,now);
  expect(readBackendEarningsCache(7,"2026-11","2026-11-14",storage,now+EARNINGS_DASHBOARD_MAX_AGE_MS+1)).toBeNull();
  clearBackendEarningsCache(8,storage);
  expect(storage.getItem(earningsCacheKey(8,"2026-11"))).toBeNull();
  expect(earningsCacheKey(7,"2026-11")).not.toBe(earningsCacheKey(8,"2026-11"));
});

test("provisional source evidence survives validation and session caching", () => {
  const storage = store();
  const data = backend();
  const row = data.days.find(item => item.key === "2026-11-14");
  row.sources = { Kryptex: 3.43, Loopscale: 2.38 };
  row.provenance = {
    Kryptex: "confirmed-kryptex-mining-day",
    Loopscale: "legacy-server-receipt",
  };
  row.provisionalSources = ["Loopscale"];
  row.correctedSourcesUsd = { Kryptex: -0.7 };
  data.fullyVerified = false;
  const saved = writeBackendEarningsCache(7, "2026-11", data, storage);
  expect(saved.data.fullyVerified).toBe(false);
  expect(saved.data.reviewDays).toEqual([{
    date: "2026-11-14", sources: ["Loopscale"],
    corrections: { Kryptex: -0.7 },
  }]);
  const reloaded = readBackendEarningsCache(7, "2026-11",
    "2026-11-14", storage);
  expect(reloaded.data.days[13].provenance.Loopscale).toBe("legacy-server-receipt");
  expect(reloaded.data.days[13].provisionalSources).toEqual(["Loopscale"]);
  expect(reloaded.data.fullyVerified).toBe(false);
});

test("confirmed corrections are retained without inventing unresolved receipts", () => {
  const data = backend();
  const row = data.days.find(item => item.key === "2026-11-14");
  row.provisionalSources = [];
  row.correctedSourcesUsd = { Kryptex: 0.12 };
  data.fullyVerified = true;
  const normalized = validateBackendEarningsSnapshot(data, "2026-11", "2026-11-14");
  expect(normalized.fullyVerified).toBe(true);
  expect(normalized.reviewDays[0].corrections.Kryptex).toBe(0.12);
  expect(normalized.reviewDays[0].sources).toEqual([]);
});
