export const STOCK_DIVIDEND_PAYOUTS_KEY = "yield_stock_dividend_payouts_v1";

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
