// One opening balance adjustment for May-August iPhone depreciation.
// The requested pre-September ledger cleanup keeps only the May acquisition.
// This brings the Trial Balance into line with the equipment book-value
// schedule without manufacturing September operating expense or extra assets.
import { phoneAssetRows } from "./unetworkPhonesAccounting";
import { moneyRound } from "./financialAccounting";

export function openingPhoneDepreciationEntry(phones = []) {
  const mayPhones = (Array.isArray(phones) ? phones : [])
    .filter(phone => String(phone?.businessDate || "").startsWith("2026-05"));
  const amount = moneyRound(phoneAssetRows(mayPhones, "2026-08").reduce(
    (sum, row) => sum + (Number(row.historicalCost) - Number(row.end)), 0
  ));
  if (amount <= 0) return null;
  return {
    id: "opening-iphone-depreciation:2026-09",
    date: "2026-09-01",
    description: "Opening equity adjustment — May–August iPhone depreciation",
    automatic: true,
    openingAdjustment: true,
    lines: [
      {account: "equity", debit: amount, credit: 0},
      {account: "accDep", debit: 0, credit: amount},
    ],
  };
}
