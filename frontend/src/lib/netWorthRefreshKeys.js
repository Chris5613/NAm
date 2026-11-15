// Only store changes that affect Home's current net-worth calculation should
// trigger a full recalculation. History/baseline writes are a consequence of
// recalculation and must never recursively trigger another one.
const FINANCIAL_KEYS = new Set([
  "monthly_business_changes_v1",
  "financials_journal_v1",
  "hardware_payback_devices_v1",
  "financials_confirmed_movements_v1",
  "financials_month_closes_v1",
  "financials_bank_openings_v1",
  "financials_power_estimates_v1",
  "financials_unetwork_business_phones_v1",
]);
const PROVIDER_KEYS = new Set([
  "project_income_kryptex_tracker_v1",
  "project_income_salad_tracker_v1",
  "project_income_unetwork_tracker_v1",
  "project_income_rollercoin_tracker_v2",
  "yield_loopscale_position_history_v1",
  "yield_monthly_snapshots_v1",
  "yield_project_quick_cache_v1",
  "project_income_portfolio_summary_v1",
  "networth_crypto_cache",
]);

export function shouldRefreshHomeNetWorth(key) {
  return key == null ||
    key === "networth_assets" ||
    FINANCIAL_KEYS.has(key) ||
    PROVIDER_KEYS.has(key);
}
