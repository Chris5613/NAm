/**
 * Backend-owned earnings display preview. The cache is NEVER an accounting
 * input: only the authenticated /earnings-dashboard response can populate it.
 * Session-scoped, versioned, user-isolated, time-limited, and Pacific-day aware.
 */
export const EARNINGS_DASHBOARD_CACHE_PREFIX = "nam:crypto-dashboard:earnings:v1:";
export const EARNINGS_DASHBOARD_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function storeOrNull(storage) {
  if (storage) return storage;
  try { return typeof window === "undefined" ? null : window.sessionStorage; }
  catch { return null; }
}
export function earningsCacheKey(userId, month) {
  if (userId == null || !/^\d{4}-\d{2}$/.test(String(month))) return null;
  return EARNINGS_DASHBOARD_CACHE_PREFIX +
    encodeURIComponent(String(userId)) + ":" + month;
}
const validValue = value => value === null ||
  (typeof value === "number" && Number.isFinite(value) && value >= 0);

export function validateBackendEarningsSnapshot(data, month, todayKey) {
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      data.sourceOfCalculation !== "backend-postgres" ||
      data.month !== month || data.todayKey !== todayKey ||
      !validValue(data.monthTotalUsd) || !validValue(data.todayTotalUsd) ||
      !validValue(data.yesterdayTotalUsd) || !validValue(data.weeklyTotalUsd) ||
      !Array.isArray(data.days) || data.days.length < 28 ||
      data.days.length > 31 || !Array.isArray(data.weekDays) ||
      data.weekDays.length !== 7 ||
      !Number.isFinite(Date.parse(data.calculatedAt || ""))) return null;
  const days = [];
  let monthSum = 0;
  for (const row of data.days) {
    if (!row || typeof row !== "object" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.key) ||
        !row.key.startsWith(month + "-") || !validValue(row.value) ||
        !row.sources || typeof row.sources !== "object" || Array.isArray(row.sources))
      return null;
    if (row.value !== null) monthSum += row.value;
    const sources = {};
    for (const [name, value] of Object.entries(row.sources)) {
      if (!name || name.length > 80 || !validValue(value)) return null;
      sources[name] = value;
    }
    // Preserve backend reconciliation evidence through the session preview.
    // Dropping these fields made unverified legacy receipts indistinguishable
    // from independently confirmed provider income on the dashboard.
    const provenance = {};
    const rawProvenance = row.provenance && typeof row.provenance === "object" &&
      !Array.isArray(row.provenance) ? row.provenance : {};
    for (const [name, source] of Object.entries(rawProvenance)) {
      if (Object.hasOwn(sources, name) && typeof source === "string" &&
          source.length <= 100) provenance[name] = source;
    }
    const provisionalSources = Array.isArray(row.provisionalSources)
      ? [...new Set(row.provisionalSources.filter(name =>
          typeof name === "string" && Object.hasOwn(sources, name) &&
          sources[name] > 0))] : [];
    const correctedSourcesUsd = {};
    const corrections = row.correctedSourcesUsd &&
      typeof row.correctedSourcesUsd === "object" &&
      !Array.isArray(row.correctedSourcesUsd) ? row.correctedSourcesUsd : {};
    for (const [name, correction] of Object.entries(corrections)) {
      if (Object.hasOwn(sources, name) && typeof correction === "number" &&
          Number.isFinite(correction)) correctedSourcesUsd[name] = correction;
    }
    days.push({ key: row.key, day: row.day, date: row.date, label: row.label,
      value: row.value, future: row.future === true, sources,
      provenance, provisionalSources, correctedSourcesUsd });
  }
  if (Math.abs(monthSum - data.monthTotalUsd) > 0.02) return null;
  const today = days.find(row => row.key === todayKey);
  if (today && today.value !== data.todayTotalUsd) return null;
  if (!data.monthlySources || typeof data.monthlySources !== "object" ||
      !data.todaySources || typeof data.todaySources !== "object") return null;
  const copySources = obj => {
    const out = {};
    for (const [name, value] of Object.entries(obj)) {
      if (name && name.length < 81 && validValue(value) && value !== null)
        out[name] = value;
    }
    return out;
  };
  const weekDays = [];
  for (const row of data.weekDays) {
    if (!row || !/^\d{4}-\d{2}-\d{2}$/.test(String(row.key)) ||
        !validValue(row.value)) return null;
    weekDays.push({ key: row.key, day: row.day, date: row.date,
      value: row.value, live: row.live === true, future: row.future === true });
  }
  const reviewDays = days.filter(row => !row.future &&
    (row.provisionalSources.length || Object.keys(row.correctedSourcesUsd).length))
    .map(row => ({ date: row.key, sources: row.provisionalSources,
      corrections: row.correctedSourcesUsd }));
  // Null indicates an older API response which did not include verification
  // metadata. Never assume it was fully verified.
  const fullyVerified = data.fullyVerified === true
    ? !days.some(row => !row.future && row.provisionalSources.length)
    : data.fullyVerified === false ? false : null;
  // The booked provider-month snapshot and provisional dated receipts are
  // distinct accounting views. Keep the backend's read-only comparison intact
  // instead of silently forcing those totals to agree.
  let monthAccountingComparison = null;
  const rawComparison = data.monthAccountingComparison;
  if (rawComparison && typeof rawComparison === "object" &&
      rawComparison.source === "yield_monthly_snapshots_v1" &&
      ["matched", "different-basis", "needs-review"].includes(rawComparison.status) &&
      typeof rawComparison.bookedTotalUsd === "number" &&
      Number.isFinite(rawComparison.bookedTotalUsd) &&
      typeof rawComparison.differenceUsd === "number" &&
      Number.isFinite(rawComparison.differenceUsd)) {
    const differences = Array.isArray(rawComparison.providerDifferences)
      ? rawComparison.providerDifferences.filter(row =>
          row && typeof row.provider === "string" && row.provider.length <= 100 &&
          typeof row.differenceUsd === "number" &&
          Number.isFinite(row.differenceUsd)).map(row => ({
            provider: row.provider,
            differenceUsd: row.differenceUsd,
            provisionalDaily: row.provisionalDaily === true,
          })) : [];
    monthAccountingComparison = {
      status: rawComparison.status,
      source: rawComparison.source,
      bookedTotalUsd: rawComparison.bookedTotalUsd,
      datedTotalUsd: data.monthTotalUsd,
      differenceUsd: rawComparison.differenceUsd,
      providerDifferences: differences,
      snapshotUpdatedAt: typeof rawComparison.snapshotUpdatedAt === "string"
        ? rawComparison.snapshotUpdatedAt : null,
      locked: rawComparison.locked === true,
    };
  }
  // Preserve the server-calculated lifetime booking through session caching.
  // Never compute a secondary cumulative total in the browser.
  const lifetime = data.lifetimeEarned;
  const lifetimeEarned = lifetime &&
    lifetime.source === "recorded-income-history-v1" &&
    typeof lifetime.totalUsd === "number" && Number.isFinite(lifetime.totalUsd) &&
    typeof lifetime.fromMonth === "string" &&
    /^\d{4}-\d{2}$/.test(lifetime.fromMonth) &&
    lifetime.throughMonth === month
      ? { totalUsd: lifetime.totalUsd, fromMonth: lifetime.fromMonth,
          throughMonth: lifetime.throughMonth, source: lifetime.source } : null;
  // Historical source-month bookings arrive with the daily/weekly dashboard.
  // Validate and retain them across session cache reads; no browser income
  // reconstruction or assumption that missing months mean zero.
  const history = data.incomeHistory;
  let incomeHistory = null;
  if (history?.sourceOfCalculation === "backend-persisted-income-history" &&
      history.currentMonth === month && Array.isArray(history.months) &&
      history.months.every(row =>
        row && /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(row.monthKey) &&
        typeof row.total === "number" && Number.isFinite(row.total) &&
        row.sources && typeof row.sources === "object" &&
        !Array.isArray(row.sources) &&
        Object.entries(row.sources).every(([name, value]) =>
          typeof name === "string" && name.length > 0 && name.length <= 80 &&
          typeof value === "number" && Number.isFinite(value)))) {
    // An older annual-only 2025 record has no trustworthy month date.
    // Keep it as year evidence rather than fabricating monthly chart points.
    const annualUndated = Array.isArray(history.annualUndated)
      ? history.annualUndated.filter(row => row && /^\d{4}$/.test(String(row.year)) &&
          typeof row.total === "number" && Number.isFinite(row.total) && row.total >= 0 &&
          row.sources && typeof row.sources === "object" && !Array.isArray(row.sources) &&
          Object.entries(row.sources).every(([name, value]) =>
            name.length > 0 && name.length <= 80 && typeof value === "number" &&
            Number.isFinite(value) && value >= 0))
          .map(row => ({ year: String(row.year), total: row.total, sources: {...row.sources} }))
      : [];
    incomeHistory = {
      sourceOfCalculation: history.sourceOfCalculation,
      currentMonth: month,
      months: history.months.map(row => ({
        monthKey: row.monthKey, total: row.total,
        sources: { ...row.sources },
      })),
      annualUndated,
      // Explicit year-level historical rewards reconciliation (no fake date).
      annualReconciliations: Array.isArray(history.annualReconciliations)
        ? history.annualReconciliations.filter(row =>
            row && /^\d{4}$/.test(String(row.year)) &&
            row.basis === "project-break-even-lifetime-less-dated-rewards" &&
            typeof row.total === "number" && Number.isFinite(row.total) &&
            row.total >= 0 && row.sources &&
            typeof row.sources === "object" && !Array.isArray(row.sources) &&
            Object.entries(row.sources).every(([name, value]) =>
              name.length > 0 && name.length <= 80 &&
              typeof value === "number" && Number.isFinite(value) && value >= 0))
          .map(row => ({year: String(row.year), total: row.total,
            sources: {...row.sources}, basis: row.basis}))
        : [],
    };
  }
  return {
    sourceOfCalculation: "backend-postgres",
    month, todayKey, days, weekDays,
    monthTotalUsd: data.monthTotalUsd, todayTotalUsd: data.todayTotalUsd,
    yesterdayTotalUsd: data.yesterdayTotalUsd,
    yesterdayDay: data.yesterdayDay,
    weeklyTotalUsd: data.weeklyTotalUsd,
    monthlySources: copySources(data.monthlySources),
    todaySources: copySources(data.todaySources),
    reviewDays, fullyVerified, monthAccountingComparison,
    lifetimeEarned, incomeHistory,
    calculatedAt: data.calculatedAt,
  };
}
export function readBackendEarningsCache(userId, month, todayKey, storage, now = Date.now()) {
  const key = earningsCacheKey(userId, month), store = storeOrNull(storage);
  if (!key || !store) return null;
  try {
    const value = JSON.parse(store.getItem(key) || "null");
    if (!value || !Number.isFinite(value.cachedAt) ||
        value.cachedAt > now || now - value.cachedAt > EARNINGS_DASHBOARD_MAX_AGE_MS) {
      store.removeItem(key); return null;
    }
    const data = validateBackendEarningsSnapshot(value.data, month, todayKey);
    if (!data) { store.removeItem(key); return null; }
    return { data, cachedAt: value.cachedAt };
  } catch { try { store.removeItem(key); } catch {} return null; }
}
export function writeBackendEarningsCache(userId, month, data, storage, now = Date.now()) {
  const key = earningsCacheKey(userId, month), store = storeOrNull(storage);
  const validated = validateBackendEarningsSnapshot(data, month, data?.todayKey);
  if (!key || !store || !validated) return null;
  try {
    const previous = readBackendEarningsCache(userId, month, validated.todayKey, store, now);
    if (previous && Date.parse(previous.data.calculatedAt) >
        Date.parse(validated.calculatedAt)) return previous;
    const value = { data: validated, cachedAt: now };
    store.setItem(key, JSON.stringify(value));
    return value;
  } catch { return { data: validated, cachedAt: now }; }
}
export function clearBackendEarningsCache(userId, storage) {
  if (userId == null) return;
  const store = storeOrNull(storage);
  if (!store) return;
  // Remove only this account's monthly display previews, never other user IDs.
  const prefix = EARNINGS_DASHBOARD_CACHE_PREFIX + encodeURIComponent(String(userId)) + ":";
  try {
    const keys = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    keys.forEach(key => store.removeItem(key));
  } catch {}
}
