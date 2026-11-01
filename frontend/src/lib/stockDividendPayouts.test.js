import { stockPayoutTotal } from "./stockDividendPayouts";

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
