import { stockPayoutTotal } from "./stockDividendPayouts";

/**
 * Shared booked-income projection for the All Years chart and its popup.
 * Annual-only income is counted only when the same source has no dated rows
 * in that calendar year. Never assign undated revenue to an invented month.
 */
export function buildAnnualEarningsBreakdown({
  year, projectIncome = [], annualUndated = [], annualReconciliations = [], todayKey = "",
}) {
  if (!/^\d{4}$/.test(String(year)) || String(year) > String(todayKey).slice(0, 4)) {
    return null;
  }
  // All GoMining products are one business/platform for annual presentation:
  // GoMining Mining, Bounty, Liquidity, Locking, and "GoMining" share a row.
  // Historical transaction names remain unchanged in the accounting ledger.
  const displayName = name => {
    const normalized = String(name).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalized.startsWith("gomining")) return "GoMining";
    // Unity Network is a legacy mirror, NOT additional Unetwork income.
    // Owner confirmed the canonical Unetwork lifetime earnings were already
    // correct (~$310.22 on 2026-11-23). Do not sum the legacy alias into it.
    if (normalized === "unetwork") return "Unetwork";
    return name;
  };
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
      if (!name || !Number.isFinite(amount) ||
          name.toLowerCase().replace(/[^a-z0-9]/g, "") === "unitynetwork") continue;
      const label = displayName(name);
      totals[label] = (totals[label] || 0) + amount;
      datedSources.add(label.toLowerCase());
    }
  }
  let includesAnnualOnly = false;
  for (const annual of annualUndated) {
    if (String(annual?.year) !== year) continue;
    for (const [name, raw] of Object.entries(annual.sources || {})) {
      const amount = Number(raw);
      const label = displayName(name);
      if (!name || !Number.isFinite(amount) || amount <= 0 ||
          name.toLowerCase().replace(/[^a-z0-9]/g, "") === "unitynetwork" ||
          datedSources.has(label.toLowerCase())) continue;
      totals[label] = (totals[label] || 0) + amount;
      includesAnnualOnly = true;
    }
  }
  // A reconciliation is an incremental, undated lifetime provider
  // baseline. Add it to the SAME provider row (e.g. RollerCoin), not as a
  // second project or a fabricated monthly earning.
  let includesReconciliation = false;
  for (const annual of annualReconciliations) {
    if (String(annual?.year) !== year) continue;
    for (const [name, raw] of Object.entries(annual.sources || {})) {
      const amount = Number(raw);
      if (!name || !Number.isFinite(amount) || amount <= 0 ||
          name.toLowerCase().replace(/[^a-z0-9]/g, "") === "unitynetwork") continue;
      const label = displayName(name);
      totals[label] = (totals[label] || 0) + amount;
      includesReconciliation = true;
    }
  }
  if (!hasRecorded && !includesAnnualOnly && !includesReconciliation) return null;
  const entries = Object.entries(totals)
    .filter(([, amount]) => amount !== 0)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  return {
    label: year,
    note: includesAnnualOnly || includesReconciliation
      ? "Recorded annual earnings by project, including separately confirmed historical rewards without assigned dates."
      : "Recorded earnings by project across this calendar year.",
    entries,
    total: entries.reduce((sum, row) => sum + row.amount, 0),
    includesAnnualOnly,
    includesReconciliation,
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
  annualReconciliations = [],
}) {
  if (!selection || selection.range !== earningsChartRange) return null;

  let sources = {};
  let label = "";
  let note = "";

  if (selection.range === "allYears") {
    return buildAnnualEarningsBreakdown({
      year: String(selection.key), projectIncome, annualUndated,
      annualReconciliations, todayKey,
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

/**
 * Extension reads the accumulated JumpTask-transferred balance, not daily
 * earnings. The ONLY defensible current-day estimate available from this
 * extension is growth between its first and latest same-Pacific-day samples.
 * This measures observed positive change, not verified full-day income.
 * If the balance decreases (e.g. a transfer/reset), do not report a loss.
 * A single reading establishes a baseline of $0.00, never wallet=earnings.
 */
export function honeygainObservedDailyUsd(snapshot, dayKey) {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(dayKey))) return null;
  const observation = snapshot?.projectObservations?.honeygain;
  const entry = observation?.dailyHistory?.[dayKey];
  if (!entry || typeof entry !== "object") return null;
  const first = entry.firstCredits;
  const last = entry.lastCredits;
  if (first == null || last == null ||
      !Number.isFinite(Number(first)) || !Number.isFinite(Number(last)) ||
      Number(first) < 0 || Number(last) < 0) return null;
  // Preserve subcent values; no rounding until presentation.
  return Math.max(0, (Number(last) - Number(first)) / 1000);
}

/**
 * One shared DAILY DISPLAY total for both screens. It is not an accounting
 * booking. The base is dated provider earnings, and Honeygain contributes
 * only observed growth since today's first extension reading (never balance).
 */
export function todayProjectsDisplayTotal(snapshot, todayKey) {
  if (!snapshot || snapshot.todayKey !== todayKey ||
      snapshot.todayTotalUsd == null) return null;
  const projectEarned = Object.entries(snapshot.todaySources || {})
    .reduce((sum, [name, raw]) => {
      const amount = Number(raw);
      return name === "Stocks" || name === "Honeygain" ||
        raw == null || !Number.isFinite(amount) ? sum : sum + amount;
    }, 0);
  return projectEarned + (honeygainObservedDailyUsd(snapshot, todayKey) ?? 0);
}
