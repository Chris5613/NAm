// A single ledger transaction may contain two or more debit/credit lines.
// Historical two-account entries continue to work without migrating stored data.
const cents = value => Math.round((Number(value)||0)*100)/100;
export function journalLines(entry) {
  if (Array.isArray(entry?.lines)) return entry.lines.map(row=>({
    account:String(row.account||""),
    debit:cents(row.debit),credit:cents(row.credit),
  }));
  if(!entry?.debitAccount || !entry?.creditAccount) return [];
  const amount=cents(entry.amount);
  return [
    {account:entry.debitAccount,debit:amount,credit:0},
    {account:entry.creditAccount,debit:0,credit:amount},
  ];
}
export function journalActivity(entry,account) {
  return cents(journalLines(entry).reduce((sum,row)=>row.account===account
    ? sum+row.debit-row.credit : sum,0));
}
export function validateCompoundEntry(lines,allowedAccounts=[]) {
  if(!Array.isArray(lines)||lines.length<2) return {error:"Add at least two account lines."};
  const valid=new Set(allowedAccounts);
  const result=[];
  for (const row of lines) {
    const debit=Number(row.debit||0), credit=Number(row.credit||0);
    if(!valid.has(row.account)||!Number.isFinite(debit)||!Number.isFinite(credit)||
       debit<0||credit<0||debit>1e12||credit>1e12||
       (debit>0&&credit>0)||(debit===0&&credit===0)||
       Math.abs(debit-cents(debit))>1e-8||Math.abs(credit-cents(credit))>1e-8)
      return {error:"Each line needs a valid account and a positive debit OR credit amount."};
    result.push({account:row.account,debit:cents(debit),credit:cents(credit)});
  }
  const debits=cents(result.reduce((sum,row)=>sum+row.debit,0));
  const credits=cents(result.reduce((sum,row)=>sum+row.credit,0));
  if(debits<=0||credits<=0||debits!==credits)
    return {error:"Debits and credits must match exactly before posting."};
  return {lines:result,debits,credits};
}
