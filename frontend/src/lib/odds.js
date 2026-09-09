export function normalizeOddsToDecimal(odds) {
  if (odds === null || odds === undefined || odds === "") return null;

  const raw = String(odds).trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d.+\-]/g, "");
  const numeric = Number(cleaned);

  if (!Number.isFinite(numeric) || numeric === 0) return null;

  if (raw.includes(".") || (numeric > 1 && numeric < 10)) {
    return numeric;
  }

  if (numeric > 0) {
    return numeric / 100 + 1;
  }

  if (numeric < 0) {
    return 100 / Math.abs(numeric) + 1;
  }

  return null;
}

export function calculateProfit(stake, odds) {
  const wager = Math.abs(Number(stake) || 0);
  const decimalOdds = normalizeOddsToDecimal(odds);

  if (!wager || !Number.isFinite(decimalOdds) || decimalOdds <= 1) return 0;

  return wager * (decimalOdds - 1);
}
