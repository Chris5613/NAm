/** A month is read-only if either persisted financial close or the booked
 * Monthly Changes business snapshot is locked. UI writes must never reopen
 * the other accounting surface implicitly.
 */
export function isFinancialMonthProtected(month, closedMonths, businessMonths) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) return true;
  return Boolean(closedMonths?.[month] || businessMonths?.[month]?.locked);
}
