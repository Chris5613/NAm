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
