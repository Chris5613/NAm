import { normalizeOddsToDecimal } from "./odds";

describe("decimal odds input", () => {
  it("accepts decimal odds like 1.83", () => {
    expect(normalizeOddsToDecimal("1.83")).toBe(1.83);
    expect(normalizeOddsToDecimal("2.50")).toBe(2.5);
    expect(normalizeOddsToDecimal("2")).toBe(2);
  });

  it("rejects American odds values and moneyline-like integers", () => {
    expect(normalizeOddsToDecimal("+130")).toBeNull();
    expect(normalizeOddsToDecimal("-110")).toBeNull();
    expect(normalizeOddsToDecimal("130")).toBeNull();
  });
});
