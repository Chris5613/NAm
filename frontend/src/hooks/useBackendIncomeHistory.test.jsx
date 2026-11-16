import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { api } from "@/lib/apiClient";
import { clearFinancialCache, financialCacheKey, requestFinancialCache } from "@/lib/financialFastCache";
import { useBackendIncomeHistoryState } from "./useBackendIncomeHistory";

jest.mock("@/lib/apiClient", () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

const month = "2026-11";
const path = "/api/project-tracking/financial-core/source-income-history?viewMonth=2026-11";
const snapshot = {
  sourceOfCalculation: "backend-persisted-income-history",
  currentMonth: month,
  months: [
    { monthKey: "2026-09", total: 50, sources: { Kryptex: 50 } },
    { monthKey: "2026-10", total: 65, sources: { Kryptex: 65 } },
    { monthKey: "2026-11", total: 88.83, sources: { Kryptex: 88.83 } },
  ],
};
function Probe({ onResult }) {
  const state = useBackendIncomeHistoryState({ currentMonth: month });
  onResult(state);
  return <div>{state.loading ? "Loading" : state.error ? "Error" : state.months.length}</div>;
}
let root;
let container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  clearFinancialCache();
  api.get.mockReset();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  clearFinancialCache();
  container.remove();
});

test("unknown source-month history remains loading, never pretends to be zero", async () => {
  let resolve;
  api.get.mockImplementation(() => new Promise(done => { resolve = done; }));
  let observed;
  await act(async () => {
    root.render(<Probe onResult={next => { observed = next; }} />);
    await Promise.resolve();
  });
  expect(container.textContent).toBe("Loading");
  expect(observed.loading).toBe(true);
  expect(observed.months).toEqual([]);
  await act(async () => resolve(snapshot));
  expect(container.textContent).toBe("3");
  expect(observed.months[0].total).toBe(50);
});

test("verified session history can render immediately on a return visit", async () => {
  await requestFinancialCache(
    financialCacheKey(path), async () => snapshot,
    data => data?.sourceOfCalculation === "backend-persisted-income-history",
  );
  let observed;
  await act(async () => {
    root.render(<Probe onResult={state => { observed = state; }} />);
  });
  expect(observed.loading).toBe(false);
  expect(observed.months).toHaveLength(3);
  expect(api.get).not.toHaveBeenCalled();
});

test("transient request failure can recover on focus without losing history", async () => {
  api.get.mockRejectedValueOnce(new Error("Temporary backend unavailable"))
    .mockResolvedValue(snapshot);
  let observed;
  await act(async () => {
    root.render(<Probe onResult={state => { observed = state; }} />);
    await Promise.resolve();
  });
  expect(observed.error).toBe(true);
  expect(observed.months).toHaveLength(0);
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
  });
  expect(observed.error).toBe(false);
  expect(observed.months).toHaveLength(3);
  expect(api.get).toHaveBeenCalledTimes(2);
});
