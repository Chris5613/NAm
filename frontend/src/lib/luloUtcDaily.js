// Pure, read-only selection of the active Lulo UTC accounting day.
// Lulo's dailyPerformance rows are UTC buckets, not Pacific-day earnings.
// Keep them distinct from historical Pacific daily ledgers and monthly totals.
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
export const LULO_LIVE_STALE_MS = 20 * 60 * 1000;

export function utcLuloDayKey(at = new Date()) {
  const date = at instanceof Date ? at : new Date(at);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

export function currentLuloUtcDaily(projects, at = new Date()) {
  const now = at instanceof Date ? at : new Date(at);
  const utcDay = utcLuloDayKey(now);
  if (!utcDay || !Array.isArray(projects) || projects.length === 0) {
    return { utcDay, status: 'unavailable', amount: null };
  }

  let amount = 0;
  let missing = false;
  for (const project of projects) {
    if (!project || typeof project !== 'object') {
      return { utcDay, status: 'unavailable', amount: null };
    }
    const atMs = Date.parse(project.lulo_last_synced_at || '');
    if (!Number.isFinite(atMs) || atMs < Date.parse(`${utcDay}T00:00:00Z`) ||
      atMs - now.getTime() > 60_000 || now.getTime() - atMs > LULO_LIVE_STALE_MS) {
      return { utcDay, status: 'stale', amount: null };
    }
    const rows = project.lulo_daily_performance;
    if (!Array.isArray(rows)) {
      return { utcDay, status: 'unavailable', amount: null };
    }
    let latest = null;
    for (const row of rows) {
      if (!row || !DATE_KEY.test(String(row.date || '')) || row.date !== utcDay) continue;
      const value = row.amount === null || row.amount === undefined ? NaN : Number(row.amount);
      if (!Number.isFinite(value) || value < 0) continue;
      // One normalized UTC bucket per wallet. If duplicated, do not add it twice.
      latest = latest === null ? value : Math.max(latest, value);
    }
    if (latest === null) missing = true;
    else amount += latest;
  }

  if (missing) return { utcDay, status: 'awaiting-utc-reading', amount: null };
  return { utcDay, status: 'ready', amount: Number(amount.toFixed(8)) };
}

export function withCurrentLuloUtcEarnings(sources, lulo, isLiveDay) {
  // Never mutate the saved Pacific-day source ledger or past dates.
  if (!isLiveDay || lulo.status === 'unavailable' && !lulo.utcDay) return { ...sources };
  const next = { ...sources };
  // A stale prior-day Lulo number is *not* evidence of earnings in this UTC day.
  // In particular, do not use Math.max(previous, new); a UTC reset must decrease.
  delete next.Lulo;
  if (lulo.status === 'ready' && lulo.amount > 0) next.Lulo = lulo.amount;
  return next;
}

/**
 * Lulo's provider date is authoritative. For completed UTC days, look up
 * that day's confirmed performance bucket rather than reusing a Pacific-day
 * month-to-date delta. Cached completed days remain visible after rollover.
 */
export function completedLuloUtcDaily(projects, utcDay) {
  if (!DATE_KEY.test(String(utcDay || '')) || !Array.isArray(projects) || !projects.length) {
    return null;
  }
  let total = 0;
  for (const project of projects) {
    if (!Array.isArray(project?.lulo_daily_performance)) return null;
    let amount = null;
    for (const row of project.lulo_daily_performance) {
      if (!row || row.date !== utcDay) continue;
      const value = row.amount == null ? NaN : Number(row.amount);
      if (!Number.isFinite(value) || value < 0) continue;
      // One cumulative daily bucket per project; duplicate deliveries
      // must not produce duplicated earnings.
      amount = amount === null ? value : Math.max(amount, value);
    }
    if (amount === null) return null;
    total += amount;
  }
  return Number(total.toFixed(8));
}

/**
 * Use UTC-day Lulo earnings for the day label, without moving other
 * platforms' Pacific-day amounts. A newly started UTC day may be tomorrow
 * in California; its Lulo amount must not be assigned to today in California.
 */
export function luloSourcesForChartDay(sources, projects, dateKey, pacificToday, currentUtc) {
  const utcToday = currentUtc?.utcDay;
  if (!DATE_KEY.test(String(dateKey || '')) || !utcToday || dateKey > utcToday) return {};
  const next = dateKey > pacificToday ? {} : { ...sources };
  if (!Array.isArray(projects) || !projects.length) return next;

  if (dateKey === utcToday) {
    return withCurrentLuloUtcEarnings(next, currentUtc, true);
  }
  const closedDayAmount = completedLuloUtcDaily(projects, dateKey);
  if (closedDayAmount !== null) {
    if (closedDayAmount > 0) next.Lulo = closedDayAmount;
    else delete next.Lulo;
  }
  // If the provider's completed-day bucket is not available yet, keep
  // the historical ledger as a fallback rather than delete prior earnings.
  return next;
}
