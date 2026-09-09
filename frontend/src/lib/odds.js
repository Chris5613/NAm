export function normalizeOddsToDecimal(odds) {
  if (odds === null || odds === undefined || odds === "") return null;

  const raw = String(odds).trim();
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) return null;

  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 1) return null;

  if (Number.isInteger(numeric) && numeric >= 10) return null;

  return numeric;
}

export function calculateProfit(stake, odds) {
  const wager = Math.abs(Number(stake) || 0);
  const decimalOdds = normalizeOddsToDecimal(odds);

  if (!wager || !Number.isFinite(decimalOdds) || decimalOdds <= 1) return 0;

  return wager * (decimalOdds - 1);
}
