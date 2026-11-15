/** Account-scoped short-lived preview of backend-owned device recovery. */
export const HARDWARE_PREVIEW_TTL = 2 * 60 * 1000;
const key = (userId, day) => userId == null || !/^\d{4}-\d{2}-\d{2}$/.test(String(day))
  ? null : "nam:hardware-payback:backend:v1:" +
    encodeURIComponent(String(userId)) + ":" + day;
const storeFor = store => {
  if (store) return store;
  try { return typeof window === "undefined" ? null : window.sessionStorage; }
  catch { return null; }
};
const finite = value => typeof value === "number" && Number.isFinite(value) &&
  value >= 0 ? value : null;
const text = value => String(value == null ? "" : value).slice(0, 128);

export function validateBackendHardwarePayback(raw, day) {
  if (!raw || raw.sourceOfCalculation !== "backend-dated-hardware-payback-v1" ||
      raw.asOfDay !== day || !Array.isArray(raw.devices) ||
      raw.devices.length > 100 || raw.mathReconciles !== true ||
      finite(raw.sumObservedDeviceCreditsUsd) == null) return null;
  const ids = new Set();
  const devices = [];
  for (const device of raw.devices) {
    if (!device || typeof device !== "object" || !device.id ||
        ids.has(String(device.id)) || !Array.isArray(device.sources)) return null;
    const recorded = finite(device.observedCreditUsd);
    const remaining = finite(device.observedRemainingUsd);
    const progress = finite(device.observedProgressPct);
    if ((recorded !== null && (remaining === null || progress === null)) ||
        (recorded === null && (remaining !== null || progress !== null))) return null;
    ids.add(String(device.id));
    devices.push({
      id: text(device.id), name: text(device.name),
      startDay: text(device.startDay),
      sources: device.sources.map(text).slice(0, 12),
      cashCostUsd: finite(device.cashCostUsd),
      observedCreditUsd: recorded,
      observedRemainingUsd: remaining,
      observedProgressPct: progress,
      verifiedRecoveryUsd: finite(device.verifiedRecoveryUsd),
      confirmedBeforeEarningsStartUsd: finite(device.confirmedBeforeEarningsStartUsd),
      provisionalRewardSubtotalUsd: finite(device.provisionalRewardSubtotalUsd),
      missingSourceDayCount: Number.isInteger(device.missingSourceDayCount) &&
        device.missingSourceDayCount >= 0 ? device.missingSourceDayCount : 0,
      provisionalSourceDayCount: Number.isInteger(device.provisionalSourceDayCount) &&
        device.provisionalSourceDayCount >= 0 ? device.provisionalSourceDayCount : 0,
      checkpointBaselineUnderstatesPriorRewards:
        device.checkpointBaselineUnderstatesPriorRewards === true,
      complete: device.complete === true,
    });
  }
  return {
    sourceOfCalculation: "backend-dated-hardware-payback-v1",
    asOfDay: day, devices,
    sumDeviceCashCostUsd: finite(raw.sumDeviceCashCostUsd),
    sumObservedDeviceCreditsUsd: raw.sumObservedDeviceCreditsUsd,
    sumObservedRemainingUsd: finite(raw.sumObservedRemainingUsd),
    observedSelectedSourceRevenueUsd: finite(raw.observedSelectedSourceRevenueUsd),
    repeatedDeviceCreditsUsd: finite(raw.repeatedDeviceCreditsUsd),
    unverifiedDeviceCreditsUsd: finite(raw.unverifiedDeviceCreditsUsd),
    complete: raw.complete === true, mathReconciles: true,
    reviewFlags: Array.isArray(raw.reviewFlags) ? raw.reviewFlags.slice(0, 100).map(text) : [],
  };
}
export function readBackendHardwarePaybackCache(userId, day, store, now=Date.now()) {
  const k=key(userId,day),s=storeFor(store);
  if(!k||!s)return null;
  try {
    const raw=JSON.parse(s.getItem(k)||"null");
    if(!raw||!Number.isFinite(raw.cachedAt)||raw.cachedAt>now||
       now-raw.cachedAt>HARDWARE_PREVIEW_TTL) {
      s.removeItem(k);return null;
    }
    const data=validateBackendHardwarePayback(raw.data,day);
    if(!data){s.removeItem(k);return null;}
    return {data,cachedAt:raw.cachedAt};
  } catch {return null;}
}
export function writeBackendHardwarePaybackCache(userId, day, raw, store, now=Date.now()) {
  const k=key(userId,day),s=storeFor(store);
  const data=validateBackendHardwarePayback(raw,day);
  if(!k||!s||!data)return null;
  try {s.setItem(k,JSON.stringify({data,cachedAt:now}));}catch{}
  return {data,cachedAt:now};
}

// Logout must discard every date's cached financial preview for this account.
export function clearBackendHardwarePaybackCache(userId,store) {
  if(userId==null)return;
  const s=storeFor(store),prefix="nam:hardware-payback:backend:v1:"+
    encodeURIComponent(String(userId))+":";
  if(!s)return;
  try {
    for(let index=s.length-1;index>=0;index--) {
      const k=s.key(index);
      if(k && k.startsWith(prefix))s.removeItem(k);
    }
  } catch { /* optional display cache */ }
}
