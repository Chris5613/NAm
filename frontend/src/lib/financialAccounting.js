import { journalActivity } from "./compoundJournal";
// Remaining browser helpers are formatting, depreciation previews and
// unmatched-equipment prompts. Financial statement calculations are backend-owned.
export const moneyRound = value => Math.round((Number(value) || 0) * 100) / 100;
export const valueOrNull = value => value == null || value === "" || !Number.isFinite(Number(value))
  ? null : Number(value);
export const assetKey = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// These two historical labels refer to the same confirmed $500 PC.
// Do not merge two separately registered physical devices merely because
// their model numbers match.
export const equipmentAliasKey = value => {
  const key = assetKey(value);
  return key === "rtx2080pc" || key === "rtx2080superpc"
    ? "rtx2080superpc" : key;
};
export function equipmentSchedule(device, month) {
  const cost = Number(device?.cost);
  const startMonth = String(device?.startMonth || "");
  const life = Math.max(1, Number(device?.usefulLifeMonths) || 60);
  if (!(cost > 0) || !/^\d{4}-\d{2}$/.test(startMonth) || month < startMonth) return null;
  const months = (Number(month.slice(0,4)) - Number(startMonth.slice(0,4))) * 12
    + Number(month.slice(5,7)) - Number(startMonth.slice(5,7));
  // Before the purchase the asset was not owned. During its first month,
  // acquisition increases assets; only monthly depreciation reduces its value.
  const start = months === 0 ? 0 : moneyRound(cost * (1 - Math.min(life, months) / life));
  const end = moneyRound(cost * (1 - Math.min(life, months + 1) / life));
  const beforeDep = moneyRound(cost * (1 - Math.min(life, months) / life));
  return {start, end, depreciation:moneyRound(beforeDep - end), cost};
}

export function unmatchedEquipmentPurchases(rows, journal, month) {
  const acquired=(rows||[]).filter(row=>
    row.category==="equipment" && row.acquisitionMonth===month &&
    row.source!=="journal-purchase" && Number(row.historicalCost)>0);
  const spentIds=new Set();
  return acquired.filter(asset=>{
    const cost=Number(asset.historicalCost);
    const name=assetKey(asset.name);
    const match=(journal||[]).find(entry=>{
      if(spentIds.has(entry.id) ||
        String(entry.date||"").slice(0,7)!==month) return false;
      const equipmentDebit=journalActivity(entry,"equipment");
      if(equipmentDebit<=0) return false;
      const description=assetKey(entry.description);
      const sameAsset=description.includes(name) ||
        (equipmentAliasKey(asset.name)==="rtx2080superpc" &&
          (description.includes("rtx2080pc") || description.includes("rtx2080superpc")));
      if(!sameAsset) return false;
      // A trade-in can debit the NEW GPU's full value ($1,950)
      // even though the hardware register tracks only its cash portion
      // ($1,250). The posted equipment acquisition already covers the
      // purchase; do not suggest posting that cash portion a second time.
      return equipmentDebit+0.005>=cost;
    });
    if(match){spentIds.add(match.id);return false;}
    return true;
  });
}
