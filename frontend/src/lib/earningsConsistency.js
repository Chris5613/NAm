export function buildEarningsConsistency(todayKey, sourcesForDay, todayTotal) {
  const anchor = new Date(`${todayKey}T12:00:00Z`);
  const days = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(anchor);
    day.setUTCDate(anchor.getUTCDate() - (29 - index));
    const key = day.toISOString().slice(0, 10);
    const sources = sourcesForDay(key) || {};
    const values = Object.values(sources).map(Number).filter(Number.isFinite);
    const recorded = values.length > 0;
    const total = key === todayKey ? todayTotal : values.reduce((sum, amount) => sum + amount, 0);
    return { key, recorded, complete: key < todayKey, value: recorded && Number.isFinite(total) ? total : null };
  });
  const completed = days.filter(day => day.complete && day.value !== null);
  const best = completed.length ? completed.reduce((top, day) => day.value > top.value ? day : top) : null;
  return {
    days,
    best,
    average: completed.length ? completed.reduce((sum, day) => sum + day.value, 0) / completed.length : null,
    earningDays: completed.filter(day => day.value > 0).length,
    recordedDays: completed.length,
  };
}
