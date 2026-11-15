import { automaticExpenseEntriesMatch } from "./useBackendAutomaticExpenses";
import { financialAssetRowsMatch } from "./useBackendFinancialBalanceRows";
import { incomeHistoryMatches } from "./useBackendIncomeHistory";
import { autoIncomeMatches } from "./useBackendAutoIncomeJournal";

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

test("Balance Sheet parity refuses a changed GPU book value or missing device", () => {
  const rows = [
    { id: "device:5080", name: "RTX 5080 GPU", category: "equipment",
      start: 0, end: 1917.5, depreciation: 32.5,
      historicalCost: 1950, acquisitionMonth: "2026-11",
      source: "hardware-payback" },
  ];
  expect(financialAssetRowsMatch(rows, [{ ...rows[0] }])).toBe(true);
  expect(financialAssetRowsMatch(rows, [{
    ...rows[0], historicalCost: 1250,
  }])).toBe(false);
  expect(financialAssetRowsMatch(rows, [])).toBe(false);
});

test("automatic depreciation parity matches posted lines, not just a headline total", () => {
  const expenses = [
    { id: "auto-depreciation:2026-11", date: "2026-11-28",
      description: "Monthly equipment depreciation", automatic: true,
      lines: [
        { account: "depreciation", debit: 32.5, credit: 0 },
        { account: "accDep", debit: 0, credit: 32.5 },
      ],
    },
  ];
  expect(automaticExpenseEntriesMatch(expenses, [{
    ...expenses[0], lines: expenses[0].lines.map(row => ({ ...row })),
  }])).toBe(true);
  expect(automaticExpenseEntriesMatch(expenses, [{
    ...expenses[0], lines: [
      { ...expenses[0].lines[0], debit: 31.5 },
      expenses[0].lines[1],
    ],
  }])).toBe(false);
  expect(automaticExpenseEntriesMatch(expenses, [])).toBe(false);
});

test("estimated electricity accrual is not treated as a paid cash entry", () => {
  const estimate = [{
    id: "auto-power-estimate:2026-11",
    date: "2026-11-28", automatic: true, estimated: true,
    description: "Estimated mining electricity — not a confirmed payment",
    lines: [
      { account: "electric", debit: 5, credit: 0 },
      { account: "payable", debit: 0, credit: 5 },
    ],
  }];
  expect(automaticExpenseEntriesMatch(estimate, estimate)).toBe(true);
  expect(automaticExpenseEntriesMatch(estimate, [{
    ...estimate[0], lines: [
      estimate[0].lines[0],
      { account: "cash", debit: 0, credit: 5 },
    ],
  }])).toBe(false);
});
