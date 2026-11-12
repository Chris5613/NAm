import { buildAutoIncomeJournal } from "./financialAutoJournal";

const month = "2026-11";
function totals(result) {
  return result.entries.reduce((sum, entry) => sum + entry.amount, 0);
}
test("creates balanced mining and DeFi entries from the same income sources", () => {
  const result = buildAutoIncomeJournal(month, {
    total: 31, sources: { Kryptex: 10, RollerCoin: 8, Lulo: 5, Loopscale: 8 },
  }, [], month, "2026-11-12");
  expect(totals(result)).toBe(31);
  expect(result.entries).toHaveLength(4);
  expect(result.entries.find(entry => entry.description.includes("Lulo")).lines[0].account).toBe("luloCash");
  expect(result.entries.find(entry => entry.description.includes("Loopscale")).lines[0].account).toBe("defi");
  for (const entry of result.entries) {
    expect(entry.lines[0].debit).toBe(entry.lines[1].credit);
  }
});

test("manual source revenue replaces rather than duplicates provider revenue", () => {
  const result = buildAutoIncomeJournal(month,
    { total: 20, sources: { Kryptex: 12, RollerCoin: 8 } },
    [{date: "2026-11-05", description: "Kryptex mining earned", amount: 5, debitAccount: "platform", creditAccount: "revenue"}],
    month, "2026-11-12");
  expect(result.manualRevenueTotal).toBe(5);
  expect(result.generatedRevenueTotal).toBe(15);
  expect(result.entries.find(entry => entry.description.includes("Kryptex")).amount).toBe(7);
});

test("an internal BTC transfer never offsets earned revenue", () => {
  const result = buildAutoIncomeJournal(month, { total: 10, sources: { RollerCoin: 10 } },
    [{date: "2026-11-05", description: "RollerCoin to BTC", amount: 10,
      debitAccount: "crypto", creditAccount: "platform"}],
    month, "2026-11-12");
  expect(result.generatedRevenueTotal).toBe(10);
});

test("anonymous manual revenue is not counted twice", () => {
  const result = buildAutoIncomeJournal(month, {total: 20, sources: {Kryptex: 12, Salad: 8}},
    [{date:"2026-11-03", description:"Income earned", amount:10,
      debitAccount:"platform", creditAccount:"revenue"}], month, "2026-11-12");
  expect(result.generatedRevenueTotal).toBe(10);
});

test("reports a reconciliation difference when manual revenue exceeds tracked income", () => {
  const result = buildAutoIncomeJournal(month, {total: 5, sources: {Kryptex: 5}},
    [{date:"2026-11-03", description:"Kryptex", amount: 9,
      debitAccount:"platform", creditAccount:"revenue"}], month, "2026-11-12");
  expect(result.entries).toHaveLength(0);
  expect(result.unexplainedManualRevenue).toBe(4);
});

test("dividends use a brokerage debit and dividend revenue credit", () => {
  const result = buildAutoIncomeJournal(month, {total: 4.52, sources: {Stocks: 4.52}},
    [], month, "2026-11-12");
  expect(result.entries[0].lines[0].account).toBe("brokerage");
  expect(result.entries[0].lines[1].account).toBe("dividendRevenue");
});

test("no synced source does not generate imaginary revenue", () => {
  expect(buildAutoIncomeJournal(month, null).entries).toEqual([]);
});

test("unallocated income is flagged instead of manufacturing platform receivables", () => {
  const result=buildAutoIncomeJournal(month,{total:120,sources:{Kryptex:20}},[],month,"2026-11-12");
  expect(result.generatedRevenueTotal).toBe(20);
  expect(result.pendingReviewTotal).toBe(100);
  expect(result.pendingReview).toEqual([{source:"Unallocated tracked income",amount:100}]);
  expect(result.entries.some(entry=>entry.lines[0].account==="platform")).toBe(false);
});

test("unknown income provider is queued for review, not added as an asset",()=>{
  const result=buildAutoIncomeJournal(month,{total:40,sources:{"Mystery Mining":40}},[],month,"2026-11-12");
  expect(result.entries).toHaveLength(0);
  expect(result.pendingReviewTotal).toBe(40);
});
