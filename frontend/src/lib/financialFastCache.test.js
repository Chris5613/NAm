import {
  financialCacheKey, readFinancialCache, readFinancialCacheState, peekFinancialCache,
  clearFinancialCache, invalidateFinancialCache, requestFinancialCache,
} from "./financialFastCache";

beforeEach(() => { clearFinancialCache(); jest.restoreAllMocks(); });

test("identical month/source inputs reuse only validated backend response", async () => {
  const key = financialCacheKey("/financial-core/evaluate", {
    month: "2026-11", entries: [{ id: "posted", amount: 42 }],
  });
  const fetcher = jest.fn(async () => ({
    sourceOfCalculation: "backend-financial-core",
    month: "2026-11", total: 42,
  }));
  const validate = value => value.sourceOfCalculation === "backend-financial-core";
  const first = await requestFinancialCache(key, fetcher, validate);
  expect(first.total).toBe(42);
  const second = await requestFinancialCache(key, fetcher, validate);
  expect(second).toEqual(first);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const another = financialCacheKey("/financial-core/evaluate", {
    month: "2026-10", entries: [{ id: "posted", amount: 42 }],
  });
  expect(readFinancialCache(another)).toBeNull();
  expect(financialCacheKey("/financial-core/evaluate", {
    month: "2026-11", entries: [{ id: "posted", amount: 41 }],
  })).not.toBe(key);
});

test("concurrent same-input requests are deduplicated", async () => {
  const key = financialCacheKey("/balance-rows", { month: "2026-11" });
  let resolve;
  const fetcher = jest.fn(() => new Promise(r => { resolve = r; }));
  const validate = response => response?.month === "2026-11";
  const a = requestFinancialCache(key, fetcher, validate, { force: true });
  const b = requestFinancialCache(key, fetcher, validate, { force: true });
  await Promise.resolve();
  expect(fetcher).toHaveBeenCalledTimes(1);
  resolve({ month: "2026-11", rows: [] });
  await expect(a).resolves.toMatchObject({ month: "2026-11" });
  await expect(b).resolves.toMatchObject({ month: "2026-11" });
});

test("writes invalidate cached amounts and reject obsolete in-flight responses", async () => {
  const key = financialCacheKey("/current-ledger", { month: "2026-11" });
  let resolve;
  const oldRequest = requestFinancialCache(key,
    () => new Promise(r => { resolve = r; }),
    response => response?.month === "2026-11", { force: true });
  await Promise.resolve();
  invalidateFinancialCache();
  resolve({ month: "2026-11", total: 999999 });
  await expect(oldRequest).rejects.toThrow("invalidated");
  expect(peekFinancialCache(key)).toBeNull();
  await requestFinancialCache(key, async () => ({ month: "2026-11", total: 1 }),
    value => value.month === "2026-11");
  expect(peekFinancialCache(key).total).toBe(1);
});

test("never caches rejected, malformed or unauthorized backend responses", async () => {
  const key = financialCacheKey("/trial", { month: "2026-09" });
  await expect(requestFinancialCache(key, async () => ({ month: "wrong" }),
    result => result.month === "2026-09")).rejects.toThrow("Invalid backend");
  expect(peekFinancialCache(key)).toBeNull();
  await expect(requestFinancialCache(key, async () => {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }, () => true)).rejects.toThrow("Unauthorized");
  expect(peekFinancialCache(key)).toBeNull();
});

test("cache obeys short expiration, bounded capacity and session reset", async () => {
  let currentTime = 1000;
  jest.spyOn(Date, "now").mockImplementation(() => currentTime);
  const key = financialCacheKey("/ledger", { month: "2026-11" });
  await requestFinancialCache(key, async () => ({ month: "2026-11" }),
    value => value?.month === "2026-11");
  expect(readFinancialCache(key, 10000)).not.toBeNull();
  currentTime += 10001;
  expect(readFinancialCache(key, 10000)).toBeNull();
  for (let i = 0; i < 45; i++) {
    const k = financialCacheKey("/ledger", { revision: i });
    await requestFinancialCache(k, async () => ({ revision: i }),
      v => v?.revision === i);
  }
  expect(peekFinancialCache(financialCacheKey("/ledger", { revision: 0 }))).toBeNull();
  expect(peekFinancialCache(financialCacheKey("/ledger", { revision: 44 }))).not.toBeNull();
  clearFinancialCache();
  expect(peekFinancialCache(financialCacheKey("/ledger", { revision: 44 }))).toBeNull();
});

test("stale validated result remains viewable but is never treated as fresh", async () => {
  let now = 1000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  const key = financialCacheKey("/financial-core/evaluate", { month: "2026-11" });
  const fetcher = jest.fn(async () => ({ sourceOfCalculation: "backend-financial-core", total: 23 }));
  await requestFinancialCache(key, fetcher,
    data => data.sourceOfCalculation === "backend-financial-core");
  now += 12001;
  expect(readFinancialCache(key, 12000)).toBeNull();
  expect(readFinancialCacheState(key, 12000)).toMatchObject({
    data: { total: 23 }, stale: true, ageMs: 12001,
  });
  // An unrelated request should never be answered by a stale cached result.
  const fresh = await requestFinancialCache(key, fetcher,
    data => data.sourceOfCalculation === "backend-financial-core",
    { maxAgeMs: 12000 });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fresh.total).toBe(23);
  expect(readFinancialCacheState(key, 12000).stale).toBe(false);
});

test("stale views expire after five minutes and invalidation erases them", async () => {
  let now = 1000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  const key = financialCacheKey("/trial", { month: "2026-10" });
  await requestFinancialCache(key, async () => ({ balanced: true }), v => v.balanced);
  now += 300001;
  expect(readFinancialCacheState(key, 12000)).toBeNull();
  await requestFinancialCache(key, async () => ({ balanced: true }), v => v.balanced);
  now += 15000;
  expect(readFinancialCacheState(key, 12000)?.stale).toBe(true);
  invalidateFinancialCache();
  expect(readFinancialCacheState(key, 12000)).toBeNull();
});
