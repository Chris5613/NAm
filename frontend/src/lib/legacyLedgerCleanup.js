// One-time cleanup of pre-September 2026 General Ledger records.
// Only the business-use acquisition of the saved May 2026 iPhone asset remains.
// Asset registers and income-source histories are deliberately not deleted.
export const LEGACY_LEDGER_CUTOFF = "2026-09";

const monthOf = value => String(value || "").slice(0, 7);

function allowedPhoneIds(phones = []) {
  return new Set((Array.isArray(phones) ? phones : [])
    .filter(phone => monthOf(phone.businessDate) === "2026-05")
    .map(phone => String(phone.journalId || "unetwork-phone:" + phone.id)));
}

export function isAllowedHistoricalEntry(entry, phones = []) {
  const month = monthOf(entry?.date);
  if (month >= LEGACY_LEDGER_CUTOFF) return true;
  if (month !== "2026-05") return false;
  // Preserve the recorded acquisition entry, not other May phone revenue or
  // the old automatically accrued May-August income/depreciation.
  return allowedPhoneIds(phones).has(String(entry?.id || "")) &&
    (entry?.source === "unetwork-business-phone" ||
     String(entry?.id || "").startsWith("unetwork-phone:"));
}

export function preSeptemberLedgerEntries(entries, month, phones = []) {
  if (month >= LEGACY_LEDGER_CUTOFF) return entries || [];
  return (entries || []).filter(entry => isAllowedHistoricalEntry(entry, phones));
}

export function pruneLegacyLedger(journal, movements, closedMonths, phones) {
  const originalJournal = Array.isArray(journal) ? journal : [];
  const keptJournal = originalJournal.filter(entry => isAllowedHistoricalEntry(entry, phones));
  const originalMovements = movements && typeof movements === "object" && !Array.isArray(movements) ? movements : {};
  const keptMovements = Object.fromEntries(Object.entries(originalMovements)
    .filter(([, entry]) => monthOf(entry?.date) >= LEGACY_LEDGER_CUTOFF));
  const originalClosed = closedMonths && typeof closedMonths === "object" && !Array.isArray(closedMonths) ? closedMonths : {};
  // Remove frozen pre-September snapshots as well: otherwise their old ledger
  // entries can reappear even after the saved journal was cleaned.
  const keptClosed = Object.fromEntries(Object.entries(originalClosed)
    .filter(([month]) => month >= LEGACY_LEDGER_CUTOFF));
  return {
    journal: keptJournal, movements: keptMovements, closedMonths: keptClosed,
    changedJournal: keptJournal.length !== originalJournal.length,
    changedMovements: Object.keys(keptMovements).length !== Object.keys(originalMovements).length,
    changedClosed: Object.keys(keptClosed).length !== Object.keys(originalClosed).length,
  };
}
