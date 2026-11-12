import {
  isAllowedHistoricalEntry, preSeptemberLedgerEntries, pruneLegacyLedger,
} from "./legacyLedgerCleanup";

const phone = {
  id: "phone-seven", journalId: "unetwork-phone:phone-seven",
  businessDate: "2026-05-20",
};
const acquisition = {
  id: phone.journalId, source: "unetwork-business-phone",
  date: "2026-05-20", description: "Unetwork phone equipment",
  debitAccount: "equipment", creditAccount: "equity", amount: 560,
};
const oldIncome = { id: "old", date: "2026-05-21", debitAccount: "platform", creditAccount: "revenue", amount: 20 };
const recent = { id: "recent", date: "2026-09-01", amount: 100 };
test("May 2026 iPhone acquisition is the only retained pre-September entry", () => {
  expect(isAllowedHistoricalEntry(acquisition, [phone])).toBe(true);
  expect(isAllowedHistoricalEntry(oldIncome, [phone])).toBe(false);
  expect(preSeptemberLedgerEntries([oldIncome, acquisition, recent], "2026-05", [phone])).toEqual([acquisition]);
  expect(preSeptemberLedgerEntries([recent], "2026-09", [phone])).toEqual([recent]);
});
test("prunes saved historical transactions and frozen snapshots but not September onward", () => {
  const result = pruneLegacyLedger(
    [oldIncome, acquisition, recent],
    { may: { date: "2026-05-05" }, september: {date:"2026-09-05"} },
    { "2026-05":{ entries:[oldIncome] }, "2026-09":{ entries:[recent] } },
    [phone],
  );
  expect(result.journal).toEqual([acquisition, recent]);
  expect(Object.keys(result.movements)).toEqual(["september"]);
  expect(Object.keys(result.closedMonths)).toEqual(["2026-09"]);
  expect(result.changedJournal).toBe(true);
});
