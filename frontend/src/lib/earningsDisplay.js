import { stockPayoutTotal } from "./stockDividendPayouts";

export function buildSelectedEarningsBreakdown({
  selection,
  earningsChartRange,
  projectIncome,
  stockPayouts,
  todayKey,
  luloUtcDay,
  hasLuloProjects,
  sourceTotalsForDay,
}) {
  if (!selection || selection.range !== earningsChartRange) return null;

  let sources = {};
  let label = "";
  let note = "";

  if (selection.range === "yearly") {
    const month = projectIncome.find(item => item.monthKey === selection.key);
    sources = Object.fromEntries(
      (month?.platforms || [])
        .filter(item => Number.isFinite(Number(item.amount)))
        .map(item => [String(item.platform), Number(item.amount)])
    );
    const paidStocks = stockPayoutTotal(stockPayouts, selection.key);
    if (paidStocks > 0) sources.Stocks = paidStocks;
    if (!month && !paidStocks) return null;

    label = selection.key;
    note = "Recorded monthly project totals and received stock payouts";
  } else {
    if (selection.key > todayKey && selection.key !== luloUtcDay) return null;

    sources = sourceTotalsForDay(selection.key);
    label = selection.key;
    note =
      selection.key === luloUtcDay && selection.key > todayKey
        ? "Only Lulo's new UTC day is active; other providers still use the previous Pacific date."
        : hasLuloProjects && selection.key <= luloUtcDay
          ? "Lulo's earnings use this UTC date; other sources use the Pacific calendar date."
          : selection.range === "daily"
            ? "Daily project totals currently available; intraday per-project snapshots were not saved"
            : "Recorded earnings for this day";
  }

  const entries = Object.entries(sources)
    .filter(([, amount]) =>
      Number.isFinite(Number(amount)) && Number(amount) !== 0
    )
    .map(([name, amount]) => ({ name, amount: Number(amount) }))
    .sort((a, b) => b.amount - a.amount);

  return {
    label,
    note,
    entries,
    total: entries.reduce((sum, item) => sum + item.amount, 0),
  };
}

export function buildTodayEarningsDisplay({
  dailySourceTotals,
  serverSources,
  previouslyDisplayedTodayMax,
  serverTotalUsd,
}) {
  const displayDailySourceTotals = Object.fromEntries(
    [...new Set([
      ...Object.keys(dailySourceTotals || {}),
      ...Object.keys(serverSources || {}),
    ])].map(name => [
      name,
      Math.max(
        0,
        Number(dailySourceTotals?.[name]) || 0,
        Number(serverSources?.[name]) || 0
      ),
    ])
  );

  const todayBreakdown = Object.entries({
    Kryptex: 0,
    ...displayDailySourceTotals,
  })
    .filter(([name, amount]) =>
      Number.isFinite(Number(amount)) &&
      (name === "Kryptex" || Number(amount) !== 0)
    )
    .map(([name, amount]) => ({ name, amount: Number(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const rawTodayEarnings = todayBreakdown.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const todayEarnings = Math.max(
    0,
    rawTodayEarnings,
    Number(previouslyDisplayedTodayMax) || 0,
    Number.isFinite(Number(serverTotalUsd)) ? Number(serverTotalUsd) : 0
  );

  return {
    displayDailySourceTotals,
    todayBreakdown,
    rawTodayEarnings,
    todayEarnings,
  };
}
