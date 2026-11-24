import { stockPayoutTotal } from "./stockDividendPayouts";

/**
 * Shared booked-income projection for the All Years chart and its popup.
 * Annual-only income is counted only when the same source has no dated rows
 * in that calendar year. Never assign undated revenue to an invented month.
 */
export function buildAnnualEarningsBreakdown({
  year, projectIncome = [], annualUndated = [], todayKey = "",
}) {
  if (!/^\d{4}$/.test(String(year)) || String(year) > String(todayKey).slice(0, 4)) {
    return null;
  }
  const totals = {};
  const datedSources = new Set();
  let hasRecorded = false;
  for (const month of projectIncome) {
    const key = String(month?.monthKey || "");
    if (!key.startsWith(year + "-") || key > String(todayKey).slice(0, 7)) continue;
    hasRecorded = true;
    for (const item of month.platforms || []) {
      const name = String(item?.platform || "").trim();
      const amount = Number(item?.amount);
      if (!name || !Number.isFinite(amount)) continue;
      totals[name] = (totals[name] || 0) + amount;
      datedSources.add(name.toLowerCase());
    }
  }
  let includesAnnualOnly = false;
  for (const annual of annualUndated) {
    if (String(annual?.year) !== year) continue;
    for (const [name, raw] of Object.entries(annual.sources || {})) {
      const amount = Number(raw);
      if (!name || !Number.isFinite(amount) || amount <= 0 ||
          datedSources.has(name.toLowerCase())) continue;
      totals[name] = (totals[name] || 0) + amount;
      includesAnnualOnly = true;
    }
  }
  if (!hasRecorded && !includesAnnualOnly) return null;
  const entries = Object.entries(totals)
    .filter(([, amount]) => amount !== 0)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  return {
    label: year,
    note: includesAnnualOnly
      ? "Recorded earnings by project for this year, including annual-only history without assigned monthly dates."
      : "Recorded earnings by project across this calendar year.",
    entries,
    total: entries.reduce((sum, row) => sum + row.amount, 0),
    includesAnnualOnly,
  };
}

export function buildSelectedEarningsBreakdown({
  selection,
  earningsChartRange,
  projectIncome,
  stockPayouts,
  todayKey,
  luloUtcDay,
  hasLuloProjects,
  sourceTotalsForDay,
  currentMonthSources,
  annualUndated = [],
}) {
  if (!selection || selection.range !== earningsChartRange) return null;

  let sources = {};
  let label = "";
  let note = "";

  if (selection.range === "allYears") {
    return buildAnnualEarningsBreakdown({
      year: String(selection.key), projectIncome, annualUndated, todayKey,
    });
  }
  if (selection.range === "yearly") {
    const currentMonth = String(todayKey).slice(0, 7);
    const isCurrentMonth = selection.key === currentMonth &&
      currentMonthSources && typeof currentMonthSources === "object";
    if (isCurrentMonth) {
      // Match the visible "Earnings This Month" chart, including restored
      // daily mining income, rather than an independently cached monthly row.
      sources = { ...currentMonthSources };
    } else {
      const month = projectIncome.find(item => item.monthKey === selection.key);
      sources = Object.fromEntries(
        (month?.platforms || [])
          .filter(item => Number.isFinite(Number(item.amount)))
          .map(item => [String(item.platform), Number(item.amount)])
      );
      const paidStocks = stockPayoutTotal(stockPayouts, selection.key);
      if (paidStocks > 0) sources.Stocks = paidStocks;
      if (!month && !paidStocks) return null;
    }

    label = selection.key;
    note = isCurrentMonth
      ? "Recorded daily earnings for this month, summed by project"
      : "Recorded monthly project totals and received stock payouts";
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
