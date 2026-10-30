// Promote server-observed Loopscale P/L only when it cannot roll back a
// newer browser observation or discard a historical manual correction.
const validTime = value => {
  const millis = Date.parse(value || "");
  return Number.isFinite(millis) ? millis : null;
};

export function mergeBackendLoopscaleHistory(local, incoming) {
  const serverPositions = incoming?.positions;
  if (!serverPositions || typeof serverPositions !== "object") return local;
  const current = local && typeof local === "object" ? local : { positions: {} };
  const existing = current.positions || {};
  let changed = false;
  const next = { ...existing };

  for (const [loanId, value] of Object.entries(serverPositions)) {
    if (!value || typeof value !== "object" ||
        !(Number(value.lastValueUsd) > 0) ||
        !Number.isFinite(Number(value.lastPnlUsd))) continue;

    const theirsAt = validTime(value.lastSyncedAt);
    const ours = existing[loanId];
    const oursAt = validTime(ours?.lastSyncedAt);
    if (theirsAt === null || (oursAt !== null && theirsAt <= oursAt)) continue;

    const ourBaselines = ours?.monthBaselines || {};
    const theirBaselines = value.monthBaselines || {};
    const conflict = Object.entries(ourBaselines).some(([month, amount]) => {
      if (!Object.prototype.hasOwnProperty.call(theirBaselines, month)) return false;
      const localAmount = Number(amount);
      const backendAmount = Number(theirBaselines[month]);
      return !Number.isFinite(localAmount) || !Number.isFinite(backendAmount) ||
        Math.abs(localAmount - backendAmount) > 0.000001;
    });
    if (conflict) continue;

    // Keep any months and observations not present on the server yet.
    // The backend starts from the existing ledger, then adds new reads.
    const oldRecords = Array.isArray(ours?.observations) ? ours.observations : [];
    const freshRecords = Array.isArray(value.observations) ? value.observations : [];
    const recordsByTime = new Map();
    [...oldRecords, ...freshRecords].forEach(row => {
      if (row?.syncedAt) recordsByTime.set(row.syncedAt, row);
    });

    next[loanId] = {
      ...(ours || {}), ...value,
      monthBaselines: { ...ourBaselines, ...theirBaselines },
      monthlyEarnings: { ...(ours?.monthlyEarnings || {}), ...(value.monthlyEarnings || {}) },
      observedDaily: { ...(ours?.observedDaily || {}), ...(value.observedDaily || {}) },
      observations: [...recordsByTime.values()]
        .sort((a, b) => (validTime(a.syncedAt) || 0) - (validTime(b.syncedAt) || 0))
        .slice(-1440),
    };
    changed = true;
  }
  return changed ? { ...current, positions: next } : local;
}
