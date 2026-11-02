const normalizedSource = name => name.toLowerCase().replace(/\s+/g, " ").trim();

// A saved source/month takes precedence over the imported figure. This keeps
// the import from counting the same income twice if transactions arrive later.
export function mergeManualIncome(months, manualMonths, currentMonth) {
  const byMonth = new Map(months.map(month => [month.monthKey, { ...month, sources: { ...month.sources } }]));
  for (const [key, entries] of Object.entries(manualMonths)) {
    if (!/^\d{4}-\d{2}$/.test(key) || key > currentMonth) continue;
    const month = byMonth.get(key) || { monthKey: key, sources: {}, projectTotal: 0, stocks: 0, total: 0 };
    for (const [source, value] of Object.entries(entries)) {
      const amount = Number(value);
      const name = normalizedSource(source);
      const alreadyRecorded = Object.keys(month.sources).some(recorded => {
        const saved = normalizedSource(recorded);
        return saved === name || (name.startsWith("gomining ") && saved === "gomining") ||
          (name === "nosana" && saved.startsWith("nosana "));
      });
      if (!source || !Number.isFinite(amount) || amount <= 0 || alreadyRecorded) continue;
      month.sources[source] = amount;
      month.projectTotal += amount;
      month.total += amount;
    }
    byMonth.set(key, month);
  }
  return [...byMonth.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}
