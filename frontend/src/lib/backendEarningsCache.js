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
    days.push({ key: row.key, day: row.day, date: row.date, label: row.label,
      value: row.value, future: row.future === true, sources });
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
  return {
    sourceOfCalculation: "backend-postgres",
    month, todayKey, days, weekDays,
    monthTotalUsd: data.monthTotalUsd, todayTotalUsd: data.todayTotalUsd,
    yesterdayTotalUsd: data.yesterdayTotalUsd,
    yesterdayDay: data.yesterdayDay,
    weeklyTotalUsd: data.weeklyTotalUsd,
    monthlySources: copySources(data.monthlySources),
    todaySources: copySources(data.todaySources),
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
