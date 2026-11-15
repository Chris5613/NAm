import {
  moneyRound, valueOrNull, equipmentSchedule,
  unmatchedEquipmentPurchases, equipmentAliasKey,
} from "./financialAccounting";

test("missing financial amounts stay unknown rather than becoming zero", () => {
  expect(valueOrNull(null)).toBeNull();
  expect(valueOrNull("")).toBeNull();
  expect(valueOrNull("invalid")).toBeNull();
  expect(valueOrNull(0)).toBe(0);
  expect(moneyRound(1.235)).toBe(1.24);
});

test("equipment acquisition depreciates over the configured life", () => {
  const device = { id: "pc", cost: 500, startMonth: "2026-11" };
  expect(equipmentSchedule(device, "2026-10")).toBeNull();
  expect(equipmentSchedule(device, "2026-11")).toMatchObject({
    start: 0, end: 491.67, depreciation: 8.33,
  });
  expect(equipmentSchedule(device, "2031-11").end).toBe(0);
  expect(equipmentSchedule(device, "2031-11").depreciation).toBe(0);
});

test("confirmed PC alias is a matching prompt, not a second device", () => {
  expect(equipmentAliasKey("RTX 2080 PC"))
    .toBe(equipmentAliasKey("RTX 2080 Super PC"));
  const asset = [{
    id: "device:2080", name: "RTX 2080 Super PC", category: "equipment",
    acquisitionMonth: "2026-11", historicalCost: 500,
    source: "hardware-payback",
  }];
  const journal = [{
    id: "purchase", date: "2026-11-05", description: "Purchase RTX 2080 PC",
    debitAccount: "equipment", creditAccount: "equity", amount: 500,
  }];
  expect(unmatchedEquipmentPurchases(asset, journal, "2026-11")).toEqual([]);
});

test("GPU trade-in full journal debit covers one registered cash-cost asset", () => {
  const assets = [{
    id: "device:5080", name: "RTX 5080", category: "equipment",
    acquisitionMonth: "2026-11", historicalCost: 1250,
    source: "hardware-payback",
  }];
  const journal = [{
    id: "trade", date: "2026-11-13", description: "Purchase RTX 5080",
    lines: [
      { account: "equipment", debit: 1950, credit: 0 },
      { account: "cash", debit: 0, credit: 1250 },
      { account: "equipment:5070", debit: 0, credit: 491.67 },
      { account: "gainDisposal", debit: 0, credit: 208.33 },
    ],
  }];
  expect(unmatchedEquipmentPurchases(assets, journal, "2026-11")).toEqual([]);
});

test("unfunded equipment remains visible for explicit journal review", () => {
  const asset = [{
    id: "device:5070", name: "RTX 5070", category: "equipment",
    acquisitionMonth: "2026-11", historicalCost: 500,
    source: "hardware-payback",
  }];
  expect(unmatchedEquipmentPurchases(asset, [], "2026-11")).toEqual(asset);
});

test("identical GPU names do not let one purchase fund two devices", () => {
  const assets = ["one", "two"].map(id => ({
    id: "device:" + id, name: "RTX 5080", category: "equipment",
    acquisitionMonth: "2026-11", historicalCost: 1250,
    source: "hardware-payback",
  }));
  const entries = [{
    id: "purchase", date: "2026-11-13", description: "RTX 5080 purchase",
    debitAccount: "equipment", creditAccount: "cash", amount: 1250,
  }];
  expect(unmatchedEquipmentPurchases(assets, entries, "2026-11"))
    .toHaveLength(1);
});
