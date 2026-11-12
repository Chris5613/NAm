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
  if(entry?.origin === "crypto-income") {
    const matched=(rows||[]).find(row=>{
      const accountId=balanceAccountId(row);
      if(!accountId || !labels["account:"+accountId]) return false;
      const label=String(row.name||"");
      return label && original.toLowerCase().includes(label.toLowerCase());
    });
    if(matched) return original.replace(new RegExp(
      String(matched.name).replace(/[.*+?^${}()|[\]\\]/g,"\\  if (!original || !Object.keys(labels).length) return original;
  const assets=(rows || []).filter(row=>row.category==="equipment" &&"),"i"),
      balanceDisplayName(matched,labels));
  }
  const assets=(rows || []).filter(row=>row.category==="equipment" &&
    balanceDisplayName(row,labels)!==row.name);
  for (const row of assets) {
    const name=String(row.name || "");
    if (!name) continue;
    const alternatives=["rtx2080superpc","rtx2080pc"].includes(norm(name))
      ? ["RTX 2080 Super PC","RTX 2080 PC"] : [name];
    for(const variant of alternatives) {
      const pos=original.toLowerCase().indexOf(variant.toLowerCase());
      if(pos>=0) {
        return original.slice(0,pos)+balanceDisplayName(row,labels)+
          original.slice(pos+variant.length);
      }
    }
  }
  return original;
}
