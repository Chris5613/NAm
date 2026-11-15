// Device payback is a per-device credit allocation, not a unique business
// revenue statement. Detect repeated sources so shared Kryptex rewards are
// clearly disclosed instead of being mislabeled as distinct earnings.
export function sharedPaybackSources(devices, sourcesForDevice) {
  const uses = new Map();
  for (const device of devices || []) {
    const sources = new Set(sourcesForDevice(device));
    for (const source of sources) uses.set(source, (uses.get(source) || 0) + 1);
  }
  return [...uses].filter(([, count]) => count > 1).map(([source]) => source);
}

/**
 * Estimates each device's DAILY payback credit from the complete set of
 * selected providers. This is per-device credit, not an allocation of unique
 * business revenue. Shared sources intentionally count fully on each device.
 */
export function fullSourceDailyPaybackCredit(sources, dailyForSource) {
  return [...new Set(sources || [])].reduce((sum, source) => {
    const amount = Number(dailyForSource(source));
    return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0);
  }, 0);
}
