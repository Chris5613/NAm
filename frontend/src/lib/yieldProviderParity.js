// Pure parity checks used while moving provider accounting to PostgreSQL.
// Keep the live browser reading on screen whenever backend data lags.
export const EXTENSION_PROVIDERS = new Set([
  "RollerCoin", "Salad", "Unetwork", "Kryptex",
]);

export function statsMatch(local, server) {
  if (!server || !local) return false;
  return Object.entries(local).every(([key, value]) => {
    const computed = server[key];
    if (typeof value === "number") {
      return Number.isFinite(value) &&
        typeof computed === "number" &&
        Number.isFinite(computed) &&
        Math.abs(value - computed) <= 0.000001;
    }
    if (value === null || value === undefined ||
        typeof value === "boolean" || typeof value === "string") {
      return (value ?? null) === (computed ?? null);
    }
    // Miner lists are display-only and remain browser-owned.
    return true;
  });
}

export function providerAmounts(months) {
  const values = new Map();
  for (const month of months || []) {
    for (const row of month.platforms || []) {
      if (!EXTENSION_PROVIDERS.has(row.platform)) continue;
      values.set(month.monthKey + ":" + row.platform, Number(row.amount));
    }
  }
  return values;
}

export function matchingProviderMonths(local, server) {
  const left = providerAmounts(local);
  const right = providerAmounts(server);
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    const fromServer = right.get(key);
    if (!Number.isFinite(value) || !Number.isFinite(fromServer) ||
        Math.abs(fromServer - value) > 0.000002) return false;
  }
  return true;
}

export function mergeServerMonthlyIncome(localMonths, backendMonths) {
  if (!Array.isArray(backendMonths) ||
      !matchingProviderMonths(localMonths, backendMonths)) return localMonths;

  const amounts = providerAmounts(backendMonths);
  return localMonths.map(month => {
    const platforms = (month.platforms || []).map(entry => {
      const key = month.monthKey + ":" + entry.platform;
      if (!EXTENSION_PROVIDERS.has(entry.platform) || !amounts.has(key))
        return entry;
      return { ...entry, amount: amounts.get(key) };
    });
    return {
      ...month, platforms,
      total: Number(platforms.reduce(
        (sum, entry) => sum + (Number(entry.amount) || 0), 0
      ).toFixed(6)),
    };
  });
}
