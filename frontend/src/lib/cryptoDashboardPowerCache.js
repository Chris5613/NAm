function nonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value : null;
}
function sanitizePowerCost(raw) {
  if (!raw || raw.sourceOfCalculation !== "backend-power-meter-tariffs")
    return null;
  const deviceCosts = {};
  if (raw.deviceCosts && typeof raw.deviceCosts === "object" &&
      !Array.isArray(raw.deviceCosts)) {
    for (const [key, entry] of Object.entries(raw.deviceCosts).slice(0, 16)) {
      if (!entry || typeof entry !== "object") continue;
      deviceCosts[String(key).slice(0, 64)] = {
        complete: entry.complete === true,
        nominalUsd: nonnegative(entry.nominalUsd),
        outOfPocketUsd: nonnegative(entry.outOfPocketUsd),
      };
    }
  }
  const rate = raw.currentRate;
  const safeRate = rate && nonnegative(rate.effectiveUsdPerKwh) != null &&
    nonnegative(rate.nominalUsdPerKwh) != null ? {
      label: String(rate.label || "").slice(0, 40),
      effectiveUsdPerKwh: rate.effectiveUsdPerKwh,
      nominalUsdPerKwh: rate.nominalUsdPerKwh,
    } : null;
  return {
    sourceOfCalculation: "backend-power-meter-tariffs",
    month: String(raw.month || "").slice(0, 7),
    complete: raw.complete === true &&
      nonnegative(raw.nominalUsd) != null &&
      nonnegative(raw.outOfPocketUsd) != null,
    freeMiningPower: raw.freeMiningPower === true,
    nominalUsd: nonnegative(raw.nominalUsd),
    outOfPocketUsd: nonnegative(raw.outOfPocketUsd),
    hourlyOutOfPocketUsd: nonnegative(raw.hourlyOutOfPocketUsd),
    dailyOutOfPocketUsd: nonnegative(raw.dailyOutOfPocketUsd),
    projectedOutOfPocketMonthEndUsd: nonnegative(raw.projectedOutOfPocketMonthEndUsd),
    currentRate: safeRate,
    deviceCosts,
  };
}
/** Short-lived, authenticated-account display cache of backend power telemetry. */
export const POWER_PREVIEW_PREFIX = "nam:crypto-dashboard:power:v1:";
export const POWER_PREVIEW_MAX_AGE = 10 * 60 * 1000;
const key = id => id == null ? null : POWER_PREVIEW_PREFIX + encodeURIComponent(String(id));
const storeFor = s => { if (s) return s; try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; } };
export function validatePowerPreview(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const latest = raw.latest, month = raw.currentMonth;
  if (latest != null && (typeof latest !== "object" ||
    !Number.isFinite(Number(latest.totalWatts)) || Number(latest.totalWatts) < 0 ||
    !Number.isFinite(Date.parse(latest.observedAt || "")) ||
    !Array.isArray(latest.devices) || latest.devices.length > 16)) return null;
  if (month != null && (typeof month !== "object" || Array.isArray(month) ||
    !Number.isFinite(Number(month.totalKwh || 0)) || Number(month.totalKwh || 0) < 0)) return null;
  const mining = raw.kryptexDailyRunRate;
  const validMining = mining && typeof mining === "object" &&
    mining.source === "backend-kryptex-machine-aggregate" &&
    typeof mining.usdPerDay === "number" && Number.isFinite(mining.usdPerDay) &&
    mining.usdPerDay >= 0 &&
    Number.isInteger(mining.machineCount) && mining.machineCount > 0
      ? { usdPerDay: mining.usdPerDay, machineCount: mining.machineCount,
          source: "backend-kryptex-machine-aggregate", observedAt: mining.observedAt || null }
      : null;
  return {
    configured: raw.configured === true,
    kryptexDailyRunRate: validMining,
    powerCost: sanitizePowerCost(raw.powerCost),
    latest: latest == null ? null : {
      observedAt: latest.observedAt, totalWatts: Number(latest.totalWatts),
      devices: latest.devices.map(d => ({
        id: String(d?.id || "").slice(0, 64),
        label: String(d?.label || "").slice(0, 80),
        watts: Number(d?.watts) || 0,
      })),
    },
    currentMonth: month == null ? null : {
      month: month.month, totalKwh: Number(month.totalKwh || 0),
      devices: month.devices && typeof month.devices === "object" ? month.devices : {},
      tiers: month.tiers && typeof month.tiers === "object" ? month.tiers : {},
    },
  };
}
export function readCryptoDashboardPowerCache(userId, storage, now = Date.now()) {
  const k=key(userId), s=storeFor(storage); if (!k || !s) return null;
  try {
    const v=JSON.parse(s.getItem(k)||"null");
    if (!v || !Number.isFinite(v.cachedAt) || v.cachedAt > now ||
        now-v.cachedAt>POWER_PREVIEW_MAX_AGE) {s.removeItem(k);return null;}
    const data=validatePowerPreview(v.data);
    if(!data) {s.removeItem(k);return null;}
    return {data,cachedAt:v.cachedAt};
  } catch {return null;}
}
export function writeCryptoDashboardPowerCache(userId, raw, storage, now = Date.now()) {
  const k=key(userId),s=storeFor(storage),data=validatePowerPreview(raw);
  if (!k || !s || !data) return null;
  try {s.setItem(k,JSON.stringify({cachedAt:now,data}));} catch {}
  return {data,cachedAt:now};
}
export function clearCryptoDashboardPowerCache(userId, storage) {
  const k=key(userId),s=storeFor(storage);if(!k||!s)return;
  try{s.removeItem(k);}catch{}
}
