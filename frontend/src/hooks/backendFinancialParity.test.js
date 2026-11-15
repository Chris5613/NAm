import {
  financialReportMatches, financialFlowsMatch, statementRowsMatch,
} from "./useBackendFinancialCore";
import { incomeHistoryMatches } from "./useBackendIncomeHistory";
import { autoIncomeMatches } from "./useBackendAutoIncomeJournal";

test("financial backend parity prevents unexplained profit or cash differences", () => {
  const original = {
    revenue: 50, disposalGain: 0, operating: 2, fees: 1,
    depreciation: 3, expenses: 3, profit: 44,
    unitemizedExpenseOverlap: false,
  };
  expect(financialReportMatches(original, { ...original })).toBe(true);
  expect(financialReportMatches(original, { ...original, revenue: 49 })).toBe(false);
  const flows = {
    totals: { operating: 2, investing: -500, financing: 0, transfers: 10 },
  };
  expect(financialFlowsMatch(flows, { ...flows })).toBe(true);
  expect(financialFlowsMatch(flows, { totals: {
    ...flows.totals, investing: -499,
  }})).toBe(false);
});

test("statement parity preserves unknown balances instead of manufacturing zero", () => {
  const local = [{
    id: "bank", name: "Cash / Bank", category: "cash",
    start: null, end: null, journalChange: 200,
  }];
  expect(statementRowsMatch(local, [{ ...local[0] }])).toBe(true);
  expect(statementRowsMatch(local, [{ ...local[0], end: 200 }])).toBe(false);
});

test("income history parity checks source-by-source, not just headline totals", () => {
  const local = [{
    monthKey: "2026-11", projectTotal: 8, total: 8,
    sources: { Kryptex: 3, Loopscale: 5 },
  }];
  expect(incomeHistoryMatches(local, [{
    ...local[0], sources: { Loopscale: 5, Kryptex: 3 },
  }])).toBe(true);
  expect(incomeHistoryMatches(local, [{
    ...local[0], sources: { Kryptex: 5, Loopscale: 3 },
  }])).toBe(false);
});

test("auto income parity rejects duplicate generated income", () => {
  const local = {
    entries: [{ id: "synced-income:2026-11:kryptex", date: "2026-11-14",
      amount: 2, lines: [{ account: "revenue", debit: 0, credit: 2 }] }],
    syncedTotal: 3, manualRevenueTotal: 1, generatedRevenueTotal: 2,
    pendingReview: [], pendingReviewTotal: 0, unexplainedManualRevenue: 0,
  };
  expect(autoIncomeMatches(local, { ...local, entries: local.entries })).toBe(true);
  expect(autoIncomeMatches(local, { ...local, generatedRevenueTotal: 3 })).toBe(false);
});
