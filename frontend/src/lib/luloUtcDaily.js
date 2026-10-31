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
