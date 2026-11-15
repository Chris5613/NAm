import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import FinancialsIntegrityPanel, { validateFinancialIntegrityReport } from "./FinancialsIntegrityPanel";
import { api } from "@/lib/apiClient";

jest.mock("@/lib/apiClient", () => ({
  api: { get: jest.fn() },
}));

const valid = {
  sourceOfCalculation: "backend-cross-page-integrity-v1",
  month: "2026-11",
  asOfDay: "2026-11-15",
  readOnly: true,
  financialLedgerMutated: false,
  status: "warning",
  checks: [
    { code: "home-financials", status: "pass", message: "Statements reconcile" },
    { code: "salad-dates", status: "warning", message: "A daily receipt is missing",
      missingEvidence: ["2026-11-12"] },
  ],
};

let element;
let root;
beforeEach(() => {
  element = document.createElement("div");
  document.body.appendChild(element);
  root = createRoot(element);
  jest.clearAllMocks();
});
afterEach(() => {
  act(() => root.unmount());
  element.remove();
});

test("strict audit results cannot claim certification from untrusted responses", () => {
  expect(validateFinancialIntegrityReport(valid)).toBe(true);
  expect(validateFinancialIntegrityReport({
    ...valid, financialLedgerMutated: true,
  })).toBe(false);
  expect(validateFinancialIntegrityReport({
    ...valid, checks: [],
  })).toBe(false);
  expect(validateFinancialIntegrityReport({
    ...valid, checks: [{ code: "spoof", status: "passed", message: "ok" }],
  })).toBe(false);
});

test("explicit click makes one authenticated read-only request and shows warning evidence", async () => {
  api.get.mockResolvedValue(valid);
  await act(async () => { root.render(<FinancialsIntegrityPanel/>); });
  const btn = Array.from(element.querySelectorAll("button"))
    .find(node => node.textContent.includes("Run live audit"));
  expect(btn).toBeDefined();
  await act(async () => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledWith("/api/project-tracking/cross-page-integrity");
  expect(element.textContent).toContain("1 verified");
  expect(element.textContent).toContain("1 needing review");
  expect(element.textContent).toContain("2026-11-12");
});

test("confirmed authenticated report can be copied for independent review", async () => {
  api.get.mockResolvedValue(valid);
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText },
  });
  await act(async () => { root.render(<FinancialsIntegrityPanel/>); });
  await act(async () => {
    element.querySelector("button").dispatchEvent(
      new MouseEvent("click", { bubbles: true }));
  });
  const copyButton = Array.from(element.querySelectorAll("button"))
    .find(button => button.textContent.includes("Copy audit results"));
  expect(copyButton).toBeDefined();
  await act(async () => {
    copyButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(writeText).toHaveBeenCalledTimes(1);
  const copied = writeText.mock.calls[0][0];
  expect(copied).toContain("[PASS] home-financials");
  expect(copied).toContain("2026-11-12");
  expect(element.textContent).toContain("Audit copied");
});

test("invalid or inaccessible backend never reports a successful audit", async () => {
  api.get.mockResolvedValue({ ...valid, sourceOfCalculation: "unknown" });
  await act(async () => { root.render(<FinancialsIntegrityPanel/>); });
  const btn = element.querySelector("button");
  await act(async () => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(element.querySelector('[role="alert"]')?.textContent)
    .toContain("No audit result was certified");
  expect(element.textContent).not.toContain("1 verified");
});
