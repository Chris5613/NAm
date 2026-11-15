/**
 * Adapt authenticated source-income-history rows for existing Yield Farming
 * chart components. The backend total already includes dated stock payouts,
 * so callers must not add browser stock payouts to these rows again.
 */
export function backendYieldIncomeRows(months) {
  if (!Array.isArray(months)) return [];
  return months.filter(row => row && /^\d{4}-(0[1-9]|1[0-2])$/.test(row.monthKey) &&
    Number.isFinite(row.total) &&
    row.sources && typeof row.sources === "object" && !Array.isArray(row.sources))
    .map(row => ({
      monthKey: row.monthKey,
      total: row.total,
      platforms: Object.entries(row.sources)
        .filter(([name, amount]) => name && typeof amount === "number" &&
          Number.isFinite(amount))
        .map(([platform, amount]) => ({ platform, amount })),
    }));
}
