export const STOCK_DIVIDEND_PAYOUTS_KEY = "yield_stock_dividend_payouts_v1";
// Do not recalculate earlier payments from today's shares; their eligible
// share counts were never captured by the tracker.
export const AUTO_STOCK_PAYOUT_START_DATE = "2026-10-31";

export function announcedStockPayouts(schedule, history, shares, today) {
  const results = {};
  for (const symbol of ["VTI", "VOO"]) {
    const count = Number(shares?.[symbol]);
    if (!Number.isFinite(count) || count <= 0) continue;
    for (const payment of schedule?.[symbol] || []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payment?.payableDate || "") ||
          payment.payableDate < AUTO_STOCK_PAYOUT_START_DATE || payment.payableDate > today) continue;
      const declared = (history?.[symbol] || []).find(row => row.exDate === payment.exDate);
      const perShare = Number(declared?.amountPerShare);
      if (!Number.isFinite(perShare) || perShare <= 0) continue;
      const amount = Math.round(perShare * count * 100) / 100;
      if (amount < 0.01) continue;
      const key = `${symbol}:${payment.payableDate}`;
      results[key] = { symbol, date: payment.payableDate, amount,
        source: "announced", exDate: payment.exDate, perShare, shares: count };
    }
  }
  return results;
}

export function stockPayoutTotal(payouts, period) {
  const records = payouts && typeof payouts === "object" && !Array.isArray(payouts)
    ? Object.values(payouts) : [];
  return records.reduce((total, record) => {
    if (!["VTI", "VOO"].includes(record?.symbol) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(record?.date || "") ||
        !(period.length === 7 ? record.date.startsWith(period) : record.date === period)) return total;
    const amount = Number(record.amount);
    return Number.isFinite(amount) && amount > 0 ? total + amount : total;
  }, 0);
}
