import { openingPhoneDepreciationEntry } from "./phoneOpeningDepreciation";

test("May iPhone depreciation is included once in September opening equity",()=>{
  const entry=openingPhoneDepreciationEntry([{id:"seven",name:"iPhones (7 Units)",businessDate:"2026-05-20",startMonth:"2026-05",cost:560,usefulLifeMonths:120}]);
  expect(entry).toMatchObject({date:"2026-09-01",automatic:true,openingAdjustment:true});
  expect(entry.lines).toEqual([{account:"equity",debit:18.67,credit:0},{account:"accDep",debit:0,credit:18.67}]);
  expect(entry.lines[0].debit).toBe(entry.lines[1].credit);
});

test("no historical phone means no opening adjustment",()=>{
  expect(openingPhoneDepreciationEntry([])).toBeNull();
  expect(openingPhoneDepreciationEntry([{id:"new",businessDate:"2026-10-01",startMonth:"2026-10",cost:560}])).toBeNull();
});
