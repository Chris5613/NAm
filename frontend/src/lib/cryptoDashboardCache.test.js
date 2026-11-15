import {
  cryptoDashboardCacheKey, readCryptoDashboardCache,
  writeCryptoDashboardCache, clearCryptoDashboardCache,
  safeCryptoDashboardSnapshot, CRYPTO_DASHBOARD_CACHE_MAX_AGE_MS,
} from "./cryptoDashboardCache";

function store() {
  const data = new Map();
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
}
const snapshot = (userId = 7, receivedAt = "2026-11-15T01:17:25Z") => ({
  version: 1, userId, sourceOfCalculation: "backend-project-feed",
  complete: true, totalUsd: 1545.54, activeTotalUsd: 44.90,
  activePositions: 1, projectCount: 2, receivedAt,
  projects: [
    {id:"lulo-project",name:"Lulo",balanceUsd:1500.64,inactive:true,stale:false},
    {id:"unetwork-project",name:"Unetwork",balanceUsd:44.90,inactive:false,stale:false},
  ],
});

test("account-scoped cached snapshot never leaks to a different login", () => {
  const storage = store();
  writeCryptoDashboardCache(7, snapshot(), storage, 10000);
  expect(readCryptoDashboardCache(7, storage, 10001).data.totalUsd).toBe(1545.54);
  expect(readCryptoDashboardCache(8, storage, 10001)).toBeNull();
  expect(cryptoDashboardCacheKey(7)).not.toBe(cryptoDashboardCacheKey(8));
  clearCryptoDashboardCache(7, storage);
  expect(readCryptoDashboardCache(7, storage, 10002)).toBeNull();
});

test("display cache expires and never writes historical financial records", () => {
  const storage = store();
  writeCryptoDashboardCache(7, snapshot(), storage, 10000);
  expect(readCryptoDashboardCache(7, storage, 10000 + CRYPTO_DASHBOARD_CACHE_MAX_AGE_MS + 1)).toBeNull();
  expect(storage.getItem(cryptoDashboardCacheKey(7))).toBeNull();
});

test("later response cannot downgrade newer provider source timestamp", () => {
  const storage = store();
  const fresh = snapshot(7, "2026-11-15T03:00:00Z");
  const old = snapshot(7, "2026-11-15T02:00:00Z");
  writeCryptoDashboardCache(7, fresh, storage, 10000);
  const result = writeCryptoDashboardCache(7, { ...old, totalUsd: 999 }, storage, 10001);
  expect(result.data.totalUsd).toBe(1545.54);
  expect(readCryptoDashboardCache(7, storage, 10002).data.totalUsd).toBe(1545.54);
});

test("rejects local overrides, unverified zero and malformed server payload", () => {
  expect(safeCryptoDashboardSnapshot({...snapshot(), complete:false},7)).toBeNull();
  expect(safeCryptoDashboardSnapshot({...snapshot(), totalUsd:NaN},7)).toBeNull();
  expect(safeCryptoDashboardSnapshot({...snapshot(), totalUsd:"1545.54"},7)).toBeNull();
  expect(safeCryptoDashboardSnapshot({...snapshot(), userId:8},7)).toBeNull();
  expect(safeCryptoDashboardSnapshot({...snapshot(), sourceOfCalculation:"browser"},7)).toBeNull();
  expect(safeCryptoDashboardSnapshot({...snapshot(), projects:[{
    ...snapshot().projects[0],walletSecret:"not-for-cache"
  },snapshot().projects[1]]},7).projects[0].walletSecret).toBeUndefined();
});

test("unavailable session storage does not break snapshot rendering", () => {
  const broken = { getItem() { throw Error("disabled"); }, setItem() { throw Error("disabled"); }, removeItem() {} };
  expect(readCryptoDashboardCache(7, broken)).toBeNull();
  expect(writeCryptoDashboardCache(7, snapshot(), broken).data.totalUsd).toBe(1545.54);
});
