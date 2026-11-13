// Daily *recorded* provider income, never projected APY or profitability.
// null means no dated record is available; zero is a valid recorded amount.
const sourceKey = name => String(name || "").trim().toLowerCase().replace(/\s+/g,"");
const numberOrNull = value => value !== null && value !== undefined && value !== "" &&
  Number.isFinite(Number(value)) ? Math.max(0,Number(value)) : null;
const datedValue = (records,day,mapper=value=>value) =>
  Object.prototype.hasOwnProperty.call(records || {},day) ? numberOrNull(mapper(records[day])) : null;

export function recordedDailyProviderIncome(source,day,history={}) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return null;
  switch(sourceKey(source)) {
    case "kryptex":
      return history.kryptex?.kryptexConfirmedDays?.[day]
        ? datedValue(history.kryptex.kryptexMiningDaily,day) : null;
    case "salad":
      return datedValue(history.salad?.daily,day,amount=>amount?.usd ?? amount);
    case "unetwork":
    case "unitynetwork":
      return datedValue(history.unetwork?.daily,day,amount=>amount?.usd ?? amount);
    case "rollercoin": {
      const wallet=datedValue(history.rollercoin?.walletDaily,day,amount=>amount?.usd ?? amount);
      return wallet !== null ? wallet :
        datedValue(history.rollercoin?.daily,day,amount=>amount?.usd ?? amount);
    }
    case "loopscale": {
      const positions=Object.values(history.loopscale?.positions || {});
      let total=0,found=false;
      for(const position of positions) {
        const value=datedValue(position?.observedDaily,day);
        if(value!==null) {total+=value;found=true;}
      }
      return found ? total : null;
    }
    case "lulo": {
      const projects=history.luloProjects || [];
      let amount=0,found=false;
      for(const project of projects) {
        // Prefer the daily performance ledger; avoid adding overlapping
        // interest transactions for the same project and day.
        const performance=(project?.lulo_daily_performance || [])
          .filter(row=>String(row?.date || "").slice(0,10)===day)
          .map(row=>numberOrNull(row?.amount)).filter(value=>value!==null);
        if(performance.length) {
          amount+=Math.max(...performance);found=true;continue;
        }
        const transactions=(project?.transactions || []).filter(row=>
          row?.source==="lulo_yield" &&
          String(row?.source_date || row?.date || row?.created_at || "").slice(0,10)===day);
        if(transactions.length) {
          amount+=transactions.reduce((sum,row)=>sum+(numberOrNull(row.amount)||0),0);
          found=true;
        }
      }
      return found ? amount : null;
    }
    default:
      return null;
  }
}
