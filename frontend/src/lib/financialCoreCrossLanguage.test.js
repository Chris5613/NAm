import fixture from "../fixtures/financialParityFixture.json";
import { equipmentSchedule } from "./financialAccounting";
import { sumFinancialBusiness } from "./financialAssetsSnapshot";

test("client equipment and business asset display helpers agree with fixture", () => {
  expect(equipmentSchedule(fixture.devices[0], fixture.month))
    .toEqual(fixture.expectedDevice);
  const business = sumFinancialBusiness(fixture.businessRows);
  expect(business).toEqual(fixture.expectedBusiness);
});
