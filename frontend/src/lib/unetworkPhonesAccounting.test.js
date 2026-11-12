import {
  validatePhoneAsset, makePhoneAsset, phoneJournal, phoneAssetRows,
} from "./unetworkPhonesAccounting";
import { buildFinancialBalanceRows, includeJournalEquipment, buildFinancialProfit } from "./financialAccounting";

const input={
  name:"iPhone 13 — Unetwork #1", purchaseDate:"2026-05-12",
  businessDate:"2026-05-20",businessValue:"360",
  fundingAccount:"equity",inventoryId:"inventory-1",
};

test("historical May acquisition is included in November equipment, not expensed again",()=>{
  const phone=makePhoneAsset(input,"one");
  const rows=phoneAssetRows([phone],"2026-11");
  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe("iPhone 13 — Unetwork #1");
  expect(rows[0].category).toBe("equipment");
  expect(rows[0].end).toBe(527.33);
  expect(rows[0].depreciation).toBe(3);
  const entry=phoneJournal(phone);
  expect(entry.date).toBe("2026-05-20");
  expect(entry.debitAccount).toBe("equipment");
  expect(entry.creditAccount).toBe("equity");
  const financial=buildFinancialProfit([{
    ...entry,lines:[{account:"equipment",debit:360,credit:0},{account:"equity",debit:0,credit:360}],
  }],0);
  expect(financial.expenses).toBe(0);
});

test("original purchase date is independent from business-use start",()=>{
  const phone=makePhoneAsset({...input,businessDate:"2026-11-01"},"one");
  expect(phone.purchaseDate).toBe("2026-05-12");
  expect(phone.startMonth).toBe("2026-11");
  expect(phoneJournal(phone).date).toBe("2026-11-01");
  expect(phoneAssetRows([phone],"2026-10")).toHaveLength(0);
  expect(phoneAssetRows([phone],"2026-11")[0].end).toBe(357);
});

test("different iPhones with identical model remain separate assets",()=>{
  const phones=[makePhoneAsset(input,"one"),makePhoneAsset(input,"two")];
  const rows=phoneAssetRows(phones,"2026-11");
  expect(rows).toHaveLength(2);
  expect(rows[0].id).toBe("unetwork-phone:one");
  expect(rows[1].id).toBe("unetwork-phone:two");
});

test("journal acquisition for phone doesn't add a second equipment row",()=>{
  const phone=makePhoneAsset(input,"one");
  const rows=phoneAssetRows([phone],"2026-11");
  const included=includeJournalEquipment(rows,[phoneJournal(phone)],"2026-11");
  expect(included).toHaveLength(1);
});

test("business cash is only affected when explicitly chosen",()=>{
  const personally=phoneJournal(makePhoneAsset(input,"one"));
  expect(personally.creditAccount).toBe("equity");
  const cash=phoneJournal(makePhoneAsset({...input,fundingAccount:"cash"},"two"));
  expect(cash.creditAccount).toBe("cash");
});

test("invalid value and impossible dates are rejected",()=>{
  expect(validatePhoneAsset({...input,businessValue:0})).toBeTruthy();
  expect(validatePhoneAsset({...input,purchaseDate:"2026-05-32"})).toBeTruthy();
  expect(validatePhoneAsset({...input,businessDate:"2026-04-10"})).toBeTruthy();
  expect(validatePhoneAsset({...input,fundingAccount:"unknown"})).toBeTruthy();
});

test("equipment book value reaches zero after 120 months with zero salvage value",()=>{
  const phone=makePhoneAsset(input,"one");
  expect(phone.usefulLifeMonths).toBe(120);
  expect(phoneAssetRows([phone],"2029-05")[0].end).toBe(249);
  expect(phoneAssetRows([phone],"2036-04")[0].end).toBe(0);
  expect(phoneAssetRows([phone],"2036-05")[0].depreciation).toBe(0);
});

test("previously saved 36-month phone records use the new 120-month schedule",()=>{
  const phone={...makePhoneAsset(input,"legacy"),usefulLifeMonths:36};
  expect(phoneAssetRows([phone],"2026-11")[0].end).toBe(339);
});
