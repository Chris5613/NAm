// A falling balance establishes a drawdown, not a new earnings baseline.
// Only the amount above the prior observed peak can be considered new.
export function kryptexIncrease(balance, lastBalance, peakBalance) {
  const current = Number(balance);
  const last = Number(lastBalance);
  const peak = Number(peakBalance);
  if (!Number.isFinite(current) || current < 0) return { earned: 0, peak: Number.isFinite(peak) ? peak : 0 };
  const priorPeak = Number.isFinite(peak) && peak > 0 ? peak : Number.isFinite(last) ? last : current;
  return { earned: Math.max(0, current - priorPeak), peak: Math.max(priorPeak, current) };
}
