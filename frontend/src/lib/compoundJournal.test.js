import { journalLines, journalActivity, validateCompoundEntry } from "./compoundJournal";

test("balanced 4-line RTX 5070 trade supports owner equity and disposal gain",()=>{
 const result=validateCompoundEntry([
  {account:"equipment",debit:"1950",credit:""},
  {account:"equipment",debit:"",credit:"491.67"},
  {account:"equity",debit:"",credit:"1250"},
  {account:"gainDisposal",debit:"",credit:"208.33"},
 ],["equipment","equity","gainDisposal"]);
 expect(result.error).toBeUndefined();
 expect(result.debits).toBe(1950);
 expect(result.credits).toBe(1950);
 expect(journalActivity({lines:result.lines},"equity")).toBe(-1250);
});
test("unbalanced compound entries are rejected",()=>{
 expect(validateCompoundEntry([
  {account:"equipment",debit:"1950",credit:""},
  {account:"equity",debit:"",credit:"1250"},
 ],["equipment","equity"]).error).toMatch(/match/);
});
test("old two-account entries still produce journal lines",()=>{
 expect(journalLines({debitAccount:"equipment",creditAccount:"equity",amount:560})).toEqual([
  {account:"equipment",debit:560,credit:0},{account:"equity",debit:0,credit:560}
 ]);
});
test("one line cannot be both debit and credit",()=>{
 expect(validateCompoundEntry([
  {account:"equipment",debit:10,credit:10},
  {account:"equity",debit:0,credit:10},
 ],["equipment","equity"]).error).toBeTruthy();
});
