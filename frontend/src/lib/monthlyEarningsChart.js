import { stockPayoutTotal } from "./stockDividendPayouts";

function sumSources(sources) {
  return Object.values(sources || {}).reduce(
    (sum, amount) =>
      sum + (Number.isFinite(Number(amount)) ? Number(amount) : 0),
    0
  );
}

/**
 * Current-month chart: one row for every calendar day in the month.
 * Future days stay null so the x-axis still shows the full month without
 * drawing a misleading drop to zero after today's YTD earnings.
 */
export function buildMonthlyDailyEarningsChart({
  todayKey,
  sourceTotalsForDay,
}) {
  const monthKey = String(todayKey || "").slice(0, 7);
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month || typeof sourceTotalsForDay !== "function") {
    return [];
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const dayNumber = index + 1;
    const key = `${monthKey}-${String(dayNumber).padStart(2, "0")}`;
    const future = key > todayKey;
    return {
      key,
      day: String(dayNumber),
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${key}T12:00:00Z`)),
      value: future ? null : Math.max(0, sumSources(sourceTotalsForDay(key))),
      future,
    };
  });
}

/**
 * Current-year YTD chart: always return Jan-Dec, but leave future months null.
 */
export function buildYearlyEarningsChart(incomeRows, payouts, todayKey) {
  const year = String(todayKey || "").slice(0, 4);
  const currentMonthKey = String(todayKey || "").slice(0, 7);
  if (!/^\d{4}$/.test(year)) return [];

  return Array.from({ length: 12 }, (_, index) => {
    const monthKey = `${year}-${String(index + 1).padStart(2, "0")}`;
    const month = (incomeRows || []).find(item => item?.monthKey === monthKey);
    const future = monthKey > currentMonthKey;
    return {
      monthKey,
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        timeZone: "UTC",
      }).format(new Date(`${monthKey}-15T12:00:00Z`)),
      value: future
        ? null
        : Math.max(0, Number(month?.total) || 0) +
          stockPayoutTotal(payouts || {}, monthKey),
      future,
    };
  });
}

/** Legacy month-by-month chart shaping retained for older callers/tests. */
export function buildMonthlyEarningsChart(incomeRows, payouts, expenses) {
  const monthlyChartData = [...new Set([
    ...(incomeRows || []).filter(month => /^\d{4}-\d{2}$/.test(String(month.monthKey)))
      .map(month => month.monthKey),
    ...Object.values(payouts || {}).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row?.date || ""))
      .map(row => row.date.slice(0, 7)),
  ])].map(monthKey => {
    const month = (incomeRows || []).find(item => item.monthKey === monthKey);
    return {
      monthKey,
      label: new Intl.DateTimeFormat("en-US",{month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(monthKey+"-15T12:00:00Z")),
      value: Math.max(0,Number(month?.total) || 0) + stockPayoutTotal(payouts || {}, monthKey),
      expenses: Math.max(0,Number((expenses || {})[monthKey]) || 0),
    };
  })
    .sort((a,b) => a.monthKey.localeCompare(b.monthKey));
  return monthlyChartData;
}
