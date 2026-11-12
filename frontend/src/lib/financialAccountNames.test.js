import {
  balanceAliasKey, balanceAccountId, balanceDisplayName, chartDisplayName,
  cleanAccountLabels, equipmentEntryDisplayName, journalDisplayDescription,
} from "./financialAccountNames";

test("Kryptex renamed in balance sheet uses the same account label in ledger and trial", () => {
  const row={id:"project:kryptex",name:"Kryptex",category:"digital"};
  const account={id:"platform:kryptex",name:"Kryptex Receivables"};
  const alias={["account:platform:kryptex"]:"My Kryptex Mining"};
  expect(balanceAccountId(row)).toBe("platform:kryptex");
  expect(balanceDisplayName(row,alias)).toBe("My Kryptex Mining");
  expect(chartDisplayName(account,alias)).toBe("My Kryptex Mining");
  expect(journalDisplayDescription({description:"Synced Kryptex income",origin:"crypto-income"},[row],alias))
    .toBe("Synced My Kryptex Mining income");
});

test("equipment aliases stay attached to stable equipment identifiers", () => {
  const older={id:"hardware:rtx2080super-pc",name:"RTX 2080 Super PC",category:"equipment"};
  const label={"asset:confirmed-rtx2080":"My First Mining PC"};
  expect(balanceAliasKey(older)).toBe("asset:confirmed-rtx2080");
  expect(balanceDisplayName(older,label)).toBe("My First Mining PC");
  expect(equipmentEntryDisplayName({description:"Paid $500 for RTX 2080 Super PC"},[older],label))
    .toBe("My First Mining PC");
  expect(journalDisplayDescription({description:"Paid $500 for RTX 2080 Super PC"},[older],label))
    .toBe("Paid $500 for My First Mining PC");
});

test("separately recorded identical GPUs remain independently renameable", () => {
  const row1={id:"device:gpu1",name:"RTX 2080 Super PC",category:"equipment"};
  const row2={id:"device:gpu2",name:"RTX 2080 Super PC",category:"equipment"};
  expect(balanceAliasKey(row1)).toBe("row:device:gpu1");
  expect(balanceAliasKey(row2)).toBe("row:device:gpu2");
});

test("grouped mining equipment GL account is not renamed when only one GPU is", () => {
  const row={id:"device:gpu1",name:"RTX 5070 GPU",category:"equipment"};
  const labels={"row:device:gpu1":"My 5070"};
  expect(balanceAccountId(row)).toBeNull();
  expect(chartDisplayName({id:"equipment",name:"Mining Equipment"},labels))
    .toBe("Mining Equipment");
  expect(equipmentEntryDisplayName({description:"Purchase RTX 5070 GPU"},[row],labels))
    .toBe("My 5070");
});

test("label cleaning rejects empty and malformed saved names", () => {
  expect(cleanAccountLabels({
    "account:cash":"  Business Wallet  ",
    "account:crypto":" ",
    "account:equity":3,
  })).toEqual({"account:cash":"Business Wallet"});
});

test("debit balances and journal data aren't modified when displaying names", () => {
  const row=Object.freeze({id:"project:btc",name:"BTC",start:25,end:30,category:"digital"});
  const labels={"account:crypto":"My Bitcoin"};
  const result=balanceDisplayName(row,labels);
  expect(result).toBe("My Bitcoin");
  expect(row.name).toBe("BTC");
  expect(row.end).toBe(30);
});


test("renamed wallet and provider labels appear in manual transfer descriptions", () => {
  const rows=[
    {id:"project:kryptex",name:"Kryptex",category:"digital"},
    {id:"project:btc",name:"BTC",category:"digital"},
  ];
  const names={"account:platform:kryptex":"Mining Pool","account:crypto":"Main Wallet"};
  expect(journalDisplayDescription({description:"Transferred $5 from Kryptex to BTC"},rows,names))
    .toBe("Transferred $5 from Mining Pool to Main Wallet");
});

test("ambiguous identical physical GPUs do not rewrite a journal description arbitrarily", () => {
  const rows=[
    {id:"device:first",name:"RTX 2080 Super PC",category:"equipment"},
    {id:"device:second",name:"RTX 2080 Super PC",category:"equipment"},
  ];
  const names={"row:device:first":"Server One","row:device:second":"Server Two"};
  expect(journalDisplayDescription({description:"Bought RTX 2080 Super PC"},rows,names))
    .toBe("Bought RTX 2080 Super PC");
});
