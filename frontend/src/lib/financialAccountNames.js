// Display-only aliases for Financials. Never change accounting IDs, tracker
// provider names, journal descriptions, or the source assets themselves.
const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function balanceAccountId(row) {
  const id = String(row?.id || "");
  const key = norm(row?.name);
  if (id === "ledger:cash" || ["cash","cashbank","checking","businesscash","bank"].includes(key)) return "cash";
  if (id === "ledger:payable" || ["accountspayable","payable"].includes(key)) return "payable";
  if (key === "btc" || key === "bitcoin" || key === "cryptocurrency") return "crypto";
  if (key === "lulo" || key === "luloyieldsavings") return "luloCash";
  if (key === "loopscale" || key === "defiinvestments") return "defi";
  if (key === "brokerage" || key === "stocks") return "brokerage";
  if (["kryptex","rollercoin","salad","unetwork"].includes(key)) return "platform:" + key;
  if (id.startsWith("project:")) {
    const provider=norm(id.slice(8));
    if (["kryptex","rollercoin","salad","unetwork"].includes(provider)) return "platform:"+provider;
  }
  // Equipment is grouped into a single GL account, so renaming an individual
  // GPU must NOT rename every equipment transaction.
  return null;
}
export function balanceAliasKey(row) {
  if (!row?.id) return null;
  const id = String(row.id);
  if (!id.startsWith("device:")) {
    const name = norm(row.name);
    if (["rtx2080pc","rtx2080superpc"].includes(name)) return "asset:confirmed-rtx2080";
    if (name === "rtx5070gpu") return "asset:confirmed-rtx5070";
  }
  const accountId=balanceAccountId(row);
  return accountId ? "account:"+accountId : "row:"+id;
}
export function cleanAccountLabels(labels) {
  if (!labels || typeof labels!=="object" || Array.isArray(labels)) return {};
  return Object.fromEntries(Object.entries(labels)
    .filter(([key,value]) => typeof key==="string" && typeof value==="string" &&
      key.length<=250 && value.trim() && value.trim().length<=80)
    .map(([key,value])=>[key,value.trim()]));
}
export function balanceDisplayName(row,labels={}) {
  const key=balanceAliasKey(row);
  return (key && labels[key]) || row?.name || "";
}
export function chartDisplayName(account,labels={}) {
  return labels["account:"+account.id] || account.name;
}
// Locate a specific equipment item mentioned in an existing ledger entry.
// This is for presentation only: chart accounts remain grouped, and a match
// is made only when exactly one distinct asset is referenced.
export function equipmentEntryDisplayName(entry,rows,labels={}) {
  const description=norm(entry?.description);
  if (!description) return null;
  const items=(rows || []).filter(row=>row.category==="equipment");
  const matches=items.filter(row=>{
    const key=norm(row.name);
    if (key.length<5) return false;
    const variants=["rtx2080superpc","rtx2080pc"].includes(key)
      ? ["rtx2080superpc","rtx2080pc"] : [key];
    return variants.some(value=>description.includes(value));
  });
  const unique=new Map(matches.map(row=>[balanceAliasKey(row),row]));
  if (unique.size!==1) return null;
  const row=[...unique.values()][0];
  return labels[balanceAliasKey(row)] ? balanceDisplayName(row,labels) : null;
}
export function journalDisplayDescription(entry,rows,labels={}) {
  const original=String(entry?.description || "");
  if (!original || !Object.keys(labels).length) return original;
  // Render aliases in existing descriptions, without editing the underlying
  // journal or the provider names used for syncing and deduplication.
  const aliases=[];
  for(const row of rows || []) {
    const name=balanceDisplayName(row,labels);
    if(!name || name===row.name) continue;
    const variant=String(row.name || "");
    const terms=["rtx2080superpc","rtx2080pc"].includes(norm(variant))
      ? ["RTX 2080 Super PC","RTX 2080 PC"] : [variant];
    for(const term of terms) aliases.push({term,label:name});
  }
  aliases.sort((a,b)=>b.term.length-a.term.length);
  const originalLower=original.toLowerCase();
  const replacements=[];
  for(const item of aliases) {
    let index=0;
    const lower=item.term.toLowerCase();
    while((index=originalLower.indexOf(lower,index))>=0) {
      const end=index+item.term.length;
      const before=index ? originalLower[index-1] : "";
      const after=end<originalLower.length ? originalLower[end] : "";
      const boundary=(!before || !/[a-z0-9]/.test(before)) &&
        (!after || !/[a-z0-9]/.test(after));
      if(boundary && !replacements.some(span=>index<span.end && end>span.start)) {
        replacements.push({start:index,end,label:item.label});
      }
      index=end;
    }
  }
  if(!replacements.length)return original;
  replacements.sort((a,b)=>a.start-b.start);
  let result="",next=0;
  for(const span of replacements) {
    result+=original.slice(next,span.start)+span.label;
    next=span.end;
  }
  return result+original.slice(next);
}
