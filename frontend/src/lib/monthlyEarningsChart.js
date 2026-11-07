import { stockPayoutTotal } from "./stockDividendPayouts";

/** Build monthly chart rows without mutating stored earnings or expenses. */
export function buildMonthlyEarningsChart(incomeRows, payouts, expenses) {
  const monthlyChartData = [...new Set([
    ...incomeRows.filter(month => /^\d{4}-\d{2}$/.test(String(month.monthKey)))
      .map(month => month.monthKey),
    ...Object.values(payouts).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row?.date || ""))
      .map(row => row.date.slice(0, 7)),
  ])].map(monthKey => {
    const month = incomeRows.find(item => item.monthKey === monthKey);
    return {
      monthKey,
      label: new Intl.DateTimeFormat("en-US",{month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(monthKey+"-15T12:00:00Z")),
      value: Math.max(0,Number(month?.total) || 0) + stockPayoutTotal(payouts, monthKey),
      expenses: Math.max(0,Number(expenses[monthKey]) || 0),
    };
  })
    .sort((a,b) => a.monthKey.localeCompare(b.monthKey));
  return monthlyChartData;
}
