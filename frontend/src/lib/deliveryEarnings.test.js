import {
  addDaysKey,
  currentMonthKey,
  getDeliveryApp,
  getEarnings,
  getExpenses,
  getNet,
  getWeekStartKey,
  shiftMonth,
  todayKey,
} from "./deliveryEarnings";

describe("delivery earnings helpers", () => {
  test("normalizes legacy earnings shapes without counting expenses as income", () => {
    expect(getEarnings({ earnings: "12.50", expenses: 2 })).toBe(12.5);
    expect(getEarnings({ gross: 8 })).toBe(8);
    expect(getEarnings({ basePay: 3, tips: 4, promo: 1 })).toBe(8);
    expect(getExpenses({ expenses: -5 })).toBe(0);
    expect(getNet({ earnings: 12.5, expenses: 2 })).toBe(10.5);
  });

  test("normalizes delivery platform names", () => {
    expect(getDeliveryApp({ app: "Instacart" })).toBe("Instacart");
    expect(getDeliveryApp({ platform: "Shipt" })).toBe("Shipt");
    expect(getDeliveryApp({ app: "something old" })).toBe("DoorDash");
  });

  test("calendar helpers preserve local date semantics", () => {
    const date = new Date(2026, 10, 6, 12, 0, 0);
    expect(todayKey(date)).toBe("2026-11-06");
    expect(currentMonthKey(date)).toBe("2026-11");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(addDaysKey("2026-11-06", 1)).toBe("2026-11-07");
    expect(getWeekStartKey("2026-11-06")).toBe("2026-11-02");
  });
});
