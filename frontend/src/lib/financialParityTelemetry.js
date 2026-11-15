import { api } from "@/lib/apiClient";

/**
 * Diagnostics contain only area, reporting month, source type, match status
 * and a nonreversible, non-cryptographic revision token. No dollar amounts,
 * wallet addresses, journal entries or API credentials are transmitted.
 *
 * Repeated renders for the same revision do not enqueue another settings
 * update. This metadata is never a source of financial truth.
 */
const sent = new Set();

function revisionToken(signature) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < signature.length; i++) {
    hash ^= signature.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function reportFinancialParity(
  area, month, matched, source, signature,
) {
  if (!/^[a-z-]{3,50}$/.test(String(area)) ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)) ||
      typeof signature !== "string" || source == null) return;
  const fingerprint = revisionToken(signature);
  const status = matched ? "matched" : "mismatched";
  const key = [area, month, source, status, fingerprint].join(":");
  if (sent.has(key)) return;
  if (sent.size > 300) sent.clear();
  sent.add(key);
  api.post("/api/project-tracking/financial-core/parity-observation", {
    area, month, source, status, fingerprint,
  }).catch(() => { sent.delete(key); });
}
