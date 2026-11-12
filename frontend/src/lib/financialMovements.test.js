import {
  collectMovementCandidates, collectBankMovementCandidates, movementFromReview,
  movementJournal, reconcileBalances, resolveFinancialAccount,
} from "./financialMovements";

test("a verified provider withdrawal moves assets without creating income", () => {
  const candidates = collectMovementCandidates([{
    id:"k", name:"Kryptex", transactions:[{
      id:"wd-001", type:"withdrawal", date:"2026-11-12", amountUsd:25,
      from:"Kryptex", to:"BTC wallet", feeUsd:0.5,
    }],
  }]);
  expect(candidates).toHaveLength(1);
  expect(candidates[0].matchable).toBe(true);
  const entries = movementJournal(candidates,"2026-11");
  expect(entries).toHaveLength(2);
  expect(entries[0].lines).toEqual([
    {account:"crypto",debit:25,credit:0},
    {account:"platform:kryptex",debit:0,credit:25},
  ]);
  expect(entries[1].lines[0]).toEqual({account:"fees",debit:0.5,credit:0});
  expect(entries.every(entry => entry.lines.reduce((sum,line) => sum + line.debit - line.credit,0) === 0)).toBe(true);
});

test("unverified withdrawal is a candidate, never auto-booked", () => {
  const candidates = collectMovementCandidates([{
    id:"roller", name:"RollerCoin", transactions:[{id:"w-01",date:"2026-11-09",type:"withdraw",amount:12}],
  }]);
  expect(candidates[0].matchable).toBe(false);
  expect(movementJournal(candidates, "2026-11")).toHaveLength(0);
  const reviewed = movementFromReview(candidates[0],{to:"crypto"});
  expect(reviewed).toBeTruthy();
  expect(movementJournal([reviewed],"2026-11")).toHaveLength(1);
});

test("no destination can be invented from wallet balances", () => {
  expect(collectMovementCandidates([{id:"u", name:"Unetwork",
    currentBalance:10,withdrawals:25,transactions:[]}])).toEqual([]);
});

test("coin-denominated amounts cannot be misread as USD", () => {
  expect(collectMovementCandidates([{id:"p",name:"RollerCoin",transactions:[
    {id:"token",type:"withdrawal",amount:15,currency:"TRX",date:"2026-11-10",from:"RollerCoin",to:"BTC"},
  ]}])).toEqual([]);
});

test("bank transfer or mining deposit needs business-purpose review", () => {
  const items = collectBankMovementCandidates([
    {id:"1",date:"2026-11-04",amount:-12,category:"Transfers",merchant:"Wallet transfer"},
    {id:"2",date:"2026-11-08",amount:6,category:"Income",merchant:"Kryptex payout"},
    {id:"3",date:"2026-11-08",amount:-0.25,category:"Fees",merchant:"Bank fee"},
    {id:"4",date:"2026-11-07",amount:100,category:"Groceries",merchant:"Food Store"},
  ]);
  expect(items).toHaveLength(3);
  expect(items.every(row => row.matchable === false)).toBe(true);
  expect(items.find(row => row.id==="bank:2").from).toBe("platform:kryptex");
  expect(items.find(row => row.id==="bank:2").to).toBe("cash");
});

test("confirmed fee is a balanced expense, not revenue", () => {
  const fee = movementFromReview({id:"bank:3",date:"2026-11-08",amount:0.25,type:"fee",provider:"Bank fee",from:"cash"});
  const rows = movementJournal([fee],"2026-11");
  expect(rows[0].lines).toEqual([
    {account:"fees",debit:0.25,credit:0},
    {account:"cash",debit:0,credit:0.25},
  ]);
});

test("reconciliation reports unexplained changes without posting them", () => {
  const rows = reconcileBalances([
    {name:"Kryptex",start:10,end:20,category:"digital"},
    {name:"BTC",start:300,end:330,category:"digital"},
  ],{sources:{Kryptex:12}},[],"2026-11");
  expect(rows.find(row=>row.name==="Kryptex").unexplained).toBe(-2);
  expect(rows.find(row=>row.name==="BTC").valuationSensitive).toBe(true);
});

test("same event id is imported only once", () => {
  const tx={id:"w1",date:"2026-11-08",type:"transfer",from:"Kryptex",to:"BTC",amount:10};
  const rows=collectMovementCandidates([{id:"p1",name:"Kryptex",transactions:[tx,tx]}]);
  expect(rows).toHaveLength(1);
  expect(resolveFinancialAccount("BTC wallet")).toBe("crypto");
});
