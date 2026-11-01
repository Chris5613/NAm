import { stockPayoutTotal } from "./stockDividendPayouts";

export function shiftMonth(monthKey, offset) {
  const date = new Date(`${monthKey}-15T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function buildIncomeHistory(projectMonths, payouts, currentMonth) {
  const months = new Map();
  for (const month of projectMonths || []) {
    const key = String(month?.monthKey || "");
    if (!/^\d{4}-\d{2}$/.test(key) || key > currentMonth) continue;
    const sources = {};
    for (const platform of month.platforms || []) {
      const name = String(platform?.platform || "").trim();
      const value = Number(platform?.amount);
      if (name && Number.isFinite(value) && value !== 0) sources[name] = (sources[name] || 0) + value;
    }
    // Match the Passive Income chart's project total. Its stored monthly
    // snapshot may contain more than the individually listed platforms.
    const projectTotal = Math.max(0, Number(month.total) || 0);
    const listed = Object.values(sources).reduce((sum, value) => sum + value, 0);
    if (projectTotal > listed + 0.005) sources["Other projects"] = projectTotal - listed;
    months.set(key, { monthKey: key, sources, projectTotal });
  }
  for (const record of Object.values(payouts || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record?.date || "") || record.date.slice(0, 7) > currentMonth) continue;
    if (!["VTI", "VOO"].includes(record.symbol) || !(Number(record.amount) > 0)) continue;
    const key = record.date.slice(0, 7);
    if (!months.has(key)) months.set(key, { monthKey: key, sources: {}, projectTotal: 0 });
  }
  return [...months.values()].map(month => {
    const stocks = stockPayoutTotal(payouts, month.monthKey);
    const sources = { ...month.sources, ...(stocks > 0 ? { Stocks: stocks } : {}) };
    return { ...month, stocks, sources, total: month.projectTotal + stocks };
  }).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}
