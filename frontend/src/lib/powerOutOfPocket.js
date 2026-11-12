// The user currently has no out-of-pocket electricity expense for mining.
// Keep utility kWh, nominal rates, and saved estimates intact for monitoring.
// If billing changes, update the start/end of this free-power period instead
// of rewriting historical tracking data.
export const FREE_POWER_FROM_MONTH = "2026-11";
export const FREE_POWER_THROUGH_MONTH = null; // Null = until the user starts paying.

export function hasFreeMiningPower(month) {
  const key = String(month || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) &&
    key >= FREE_POWER_FROM_MONTH &&
    (FREE_POWER_THROUGH_MONTH === null || key <= FREE_POWER_THROUGH_MONTH);
}

export function outOfPocketMiningPowerCost(estimatedCost, month) {
  return hasFreeMiningPower(month)
    ? 0
    : Math.max(0, Number(estimatedCost) || 0);
}
