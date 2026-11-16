import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { api } from "@/lib/apiClient";
import { financialCacheKey, clearFinancialCache, requestFinancialCache } from "@/lib/financialFastCache";
import { useFinancialFastQuery } from "./useFinancialFastQuery";

jest.mock("@/lib/apiClient", () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

const path = "/api/project-tracking/financial-core/home-business";
const validated = value => value?.sourceOfCalculation === "backend-home-business";

function Probe({ onResult }) {
  const state = useFinancialFastQuery({
    path, validator: validated, maxAgeMs: 12000, intervalMs: 0, onFocus: false,
  });
  onResult(state);
  return <div>{state.data?.value ?? "Loading"}</div>;
}

let container;
let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  clearFinancialCache();
  jest.restoreAllMocks();
  api.get.mockReset();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  clearFinancialCache();
});

test("remount shows freshly validated backend data without another request", async () => {
  const key = financialCacheKey(path);
  await requestFinancialCache(key,
    async () => ({ sourceOfCalculation: "backend-home-business", value: "Verified $25" }),
    validated);
  let observed;
  await act(async () => {
    root.render(<Probe onResult={next => { observed = next; }}/>);
  });
  expect(container.textContent).toBe("Verified $25");
  expect(observed.stale).toBe(false);
  expect(api.get).not.toHaveBeenCalled();
});

test("stale verified figures stay visible until refreshed server data arrives", async () => {
  let now = 1000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  const key = financialCacheKey(path);
  await requestFinancialCache(key,
    async () => ({ sourceOfCalculation: "backend-home-business", value: "Old verified" }),
    validated);
  now += 14000;
  let release;
  api.get.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  let observed;
  await act(async () => {
    root.render(<Probe onResult={next => { observed = next; }}/>);
    await Promise.resolve();
  });
  expect(container.textContent).toBe("Old verified");
  expect(observed.stale).toBe(true);
  expect(api.get).toHaveBeenCalledTimes(1);
  await act(async () => {
    release({ sourceOfCalculation: "backend-home-business", value: "New verified" });
  });
  expect(container.textContent).toBe("New verified");
  expect(observed.stale).toBe(false);
});
