import fixture from "../fixtures/financialParityFixture.json";
import {
  buildFinancialProfit, splitFinancialRevenue,
  classifyCashFlows, equipmentSchedule,
} from "./financialAccounting";
import { sumFinancialBusiness } from "./financialAssetsSnapshot";
import {
  calculateNetWorth, getCryptoBusinessValue,
} from "./dashboardMetrics";

test("front-end financial engine matches shared GPU trade-in, income, and cash fixture", () => {
  const profit = buildFinancialProfit(fixture.entries, fixture.savedExpenses);
  expect(profit).toEqual(fixture.expectedProfit);
  expect(splitFinancialRevenue(fixture.entries)).toEqual(fixture.expectedRevenue);
  const flows = classifyCashFlows(fixture.entries);
  expect({ ...flows.totals, total: flows.total }).toEqual(fixture.expectedCashFlow);
});

test("client equipment, business assets and combined net worth agree with fixture", () => {
  expect(equipmentSchedule(fixture.devices[0], fixture.month))
    .toEqual(fixture.expectedDevice);
  const business = sumFinancialBusiness(fixture.businessRows);
  expect(business).toEqual(fixture.expectedBusiness);
  const personalCash = calculateNetWorth(fixture.personalAssets, 0).breakdown.cash;
  const crypto = getCryptoBusinessValue(business, 0, personalCash);
  const result = calculateNetWorth(fixture.personalAssets, crypto);
  expect(result.total_net_worth).toBe(fixture.expectedNetWorth);
  expect(crypto).toBe(1900);
});
