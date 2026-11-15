import { shouldRefreshHomeNetWorth } from "./netWorthRefreshKeys";

test.each([
  null,
  "networth_assets",
  "networth_crypto_cache",
  "project_income_portfolio_summary_v1",
  "project_income_kryptex_tracker_v1",
  "financials_journal_v1",
  "financials_bank_openings_v1",
  "hardware_payback_devices_v1",
  "financials_unetwork_business_phones_v1",
  "financials_power_estimates_v1",
])("Home net worth recalculates when %s changes", key => {
  expect(shouldRefreshHomeNetWorth(key)).toBe(true);
});

test.each([
  "monthly_net_worth_history_v2",
  "daily_net_worth_baseline_pst",
  "daily_category_baseline_pst",
  "networth_live_history",
  "networth_history",
  "nam_financial_goals_v1",
  "nam_recurring_bills_v1",
  "yield_inactive_project_ids_v1",
])("Home net worth does not recursively refresh on %s", key => {
  expect(shouldRefreshHomeNetWorth(key)).toBe(false);
});
