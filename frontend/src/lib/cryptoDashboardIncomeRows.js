/**
 * Backend-only income rows for Crypto Dashboard Top Projects.
 * No local estimated APY, historical inferred provider revenue, or writing.
 */
function sourceKey(value) {
  const key=String(value || "").toLowerCase().replace(/[^a-z0-9]/g,"");
  return key==="unitynetwork" ? "unetwork" : key;
}
export function backendCryptoProviderIncomeRows(earnings, portfolio) {
  if (earnings?.sourceOfCalculation !== "backend-postgres" ||
      !earnings.monthlySources || typeof earnings.monthlySources !== "object")
    return [];
  const current=earnings.todaySources || {};
  const providers=Array.isArray(portfolio?.projects) ? portfolio.projects : [];
  return Object.entries(earnings.monthlySources)
    .filter(([platform, amount]) => platform && typeof amount === "number" &&
      Number.isFinite(amount) && amount > 0)
    .map(([platform, amount]) => {
      const matching=providers.find(project => sourceKey(project.name) === sourceKey(platform));
      const today=Object.entries(current).find(([name]) => sourceKey(name)===sourceKey(platform));
      const daily=today && Number.isFinite(today[1]) && today[1]>=0 ? today[1] : null;
      return {platform,amount,daily,inactive: matching ? matching.inactive === true : null};
    })
    .sort((a,b)=>b.amount-a.amount || a.platform.localeCompare(b.platform));
}
