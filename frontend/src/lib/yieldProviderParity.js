// Pure parity checks used while moving provider accounting to PostgreSQL.
// Backend provider stats parity guards remain while readings can lag.
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

