export function latestRollerCoinTimestamp(...values) {
  const valid = values.filter(value => Number.isFinite(Date.parse(value || "")));
  return valid.length
    ? valid.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest)
    : null;
}

export function shouldAcceptRollerCoinBalance(current, payload) {
  if (payload?.current_balance_trx === null || payload?.current_balance_trx === undefined ||
      !Number.isFinite(Number(payload.current_balance_trx)) ||
      Number(payload.current_balance_trx) < 0) {
    return false;
  }
  const previousAt = latestRollerCoinTimestamp(
    current?.balanceSyncedAt, current?.walletLastObservedAt
  );
  if (!previousAt) return true;
  const incomingAt = Date.parse(payload?.balance_synced_at || "");
  return Number.isFinite(incomingAt) && incomingAt >= Date.parse(previousAt);
}
