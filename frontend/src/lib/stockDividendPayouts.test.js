import { announcedStockPayouts, stockPayoutTotal } from "./stockDividendPayouts";

test("adds only confirmed stock payouts on the requested day or month", () => {
  const payouts = {
    "VTI:2026-12-24": { symbol: "VTI", date: "2026-12-24", amount: 5.23 },
    "VOO:2026-12-23": { symbol: "VOO", date: "2026-12-23", amount: 20.45 },
    invalid: { symbol: "VTI", date: "2026-12-24", amount: "Infinity" },
    unrelated: { symbol: "Kryptex", date: "2026-12-24", amount: 20 },
  };
  expect(stockPayoutTotal(payouts, "2026-12-24")).toBe(5.23);
  expect(stockPayoutTotal(payouts, "2026-12")).toBeCloseTo(25.68);
  expect(stockPayoutTotal(payouts, "2027-01-01")).toBe(0);
});

test("counts announced dividends on payable dates only, never before announcement or for older periods", () => {
  const schedule = { VTI: [
    { exDate: "2026-09-28", payableDate: "2026-09-30" },
    { exDate: "2026-12-22", payableDate: "2026-12-24" },
  ], VOO: [{ exDate: "2026-12-21", payableDate: "2026-12-23" }] };
  const history = { VTI: [
    { exDate: "2026-09-28", amountPerShare: 0.9555 },
    { exDate: "2026-12-22", amountPerShare: 1.25 },
  ], VOO: [] };
  const shares = { VTI: 5.163, VOO: 11.03 };
  expect(announcedStockPayouts(schedule, history, shares, "2026-12-23")).toEqual({});
  const payouts = announcedStockPayouts(schedule, history, shares, "2026-12-24");
  expect(Object.keys(payouts)).toEqual(["VTI:2026-12-24"]);
  expect(payouts["VTI:2026-12-24"].amount).toBe(6.45);
  expect(stockPayoutTotal(payouts, "2026-12-24")).toBe(6.45);
});
