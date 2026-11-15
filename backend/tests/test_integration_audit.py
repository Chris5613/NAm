"""Unit tests for cross-page, read-only NAm integration invariants."""
import unittest
from datetime import datetime, timezone

from backend.integration_audit import audit_integration_settings


class IntegrationAuditTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 15, 0, 0, tzinfo=timezone.utc)

    def test_reconciled_records_have_no_critical_errors(self):
        values = {
            "project_income_kryptex_tracker_v1": {
                "kryptexMiningDaily": {
                    "2026-11-07": 2.25,
                    "2026-11-08": 3.75,
                },
                "kryptexConfirmedDays": {
                    "2026-11-07": True,
                    "2026-11-08": True,
                },
                "monthlyEarnings": {"2026-11": 6.0},
                "kryptexMiningSatsDaily": {
                    "2026-11-07": 3000.0,
                    "2026-11-08": 5000.0,
                },
                "kryptexPendingEarningsDays": [],
            },
            "yield_monthly_snapshots_v1": {
                "2026-11": {
                    "total": 8.25,
                    "locked": False,
                    "platforms": [
                        {"platform": "Kryptex", "amount": 6.0},
                        {"platform": "Salad", "amount": 2.25},
                    ],
                },
            },
            "financials_journal_v1": [
                {"id": "gpu", "lines": [
                    {"debit": 1250, "credit": 0},
                    {"debit": 0, "credit": 1250},
                ]},
            ],
            "hardware_payback_devices_v1": [
                {"id": "gpu-1", "cost": 1250},
            ],
            "passive_income_monthly_chart_total_v1": {
                "month": "2026-11",
                "amount": 9.10,
            },
        }
        result = audit_integration_settings(values, self.now)
        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["summary"]["error"], 0)
        self.assertEqual(result["summary"]["warning"], 0)
        self.assertIn(
            "monthly_chart_source",
            {check["code"] for check in result["checks"]},
        )
        # A chart-vs-accounting difference is informational, not an error.
        self.assertEqual(
            next(c for c in result["checks"] if c["code"] == "monthly_chart_source")["status"],
            "info",
        )

    def test_flags_missing_mining_month_and_missing_sats_conversion(self):
        values = {
            "project_income_kryptex_tracker_v1": {
                "kryptexMiningDaily": {"2026-11-07": 2.0},
                "kryptexConfirmedDays": {"2026-11-07": True},
                "monthlyEarnings": {"2026-11": 1.0},
                "kryptexMiningSatsDaily": {"2026-11-08": 4000},
            },
        }
        result = audit_integration_settings(values, self.now)
        checks = {check["code"]: check for check in result["checks"]}
        self.assertEqual(result["status"], "error")
        self.assertEqual(checks["kryptex_monthly_2026-11"]["status"], "error")
        self.assertEqual(checks["kryptex_missing_conversions"]["days"], ["2026-11-08"])
        self.assertEqual(checks["kryptex_missing_conversions"]["status"], "warning")

    def test_flags_unbalanced_journal_and_duplicate_hardware(self):
        values = {
            "financials_journal_v1": [
                {"id": "bad", "lines": [
                    {"debit": 500, "credit": 0},
                    {"debit": 0, "credit": 400},
                ]},
            ],
            "hardware_payback_devices_v1": [
                {"id": "pc", "cost": 500},
                {"id": "pc", "cost": -50},
            ],
        }
        checks = {
            row["code"]: row for row in audit_integration_settings(values, self.now)["checks"]
        }
        self.assertEqual(checks["journal_balanced"]["status"], "error")
        self.assertEqual(checks["journal_balanced"]["unbalanced"][0]["differenceUsd"], 100)
        self.assertEqual(checks["hardware_register"]["status"], "error")
        self.assertTrue(checks["hardware_register"]["duplicateOrMissingIds"])

    def test_backend_crypto_portfolio_is_reconciled_separately_from_income(self):
        feed = {
            "receivedAt": "2026-11-15T03:50:00Z",
            "projects": [
                {"id": "lulo-project", "balanceUsd": 1500.64, "inactive": True},
                {"id": "kryptex-project", "balanceUsd": 270.0,
                 "balanceSource": "backend-provider-tracker"},
            ]
        }
        summary = {
            "source": "backend-project-feed",
            "portfolioBalance": 1770.64,
            "activePortfolioBalance": 270.0,
        }
        values = {
            "yield_project_latest_balance_feed_v1": feed,
            "project_income_portfolio_summary_v1": summary,
        }
        checks = {row["code"]: row for row in
                  audit_integration_settings(values, self.now)["checks"]}
        self.assertEqual(checks["crypto_portfolio_authority"]["status"], "pass")
        self.assertEqual(checks["crypto_provider_authority"]["status"], "pass")
        self.assertEqual(checks["crypto_portfolio_authority"]["activeUsd"], 270.0)

        values["project_income_portfolio_summary_v1"] = {
            **summary, "portfolioBalance": 1888.0,
        }
        checks = {row["code"]: row for row in
                  audit_integration_settings(values, self.now)["checks"]}
        self.assertEqual(checks["crypto_portfolio_authority"]["status"], "error")
        self.assertEqual(checks["crypto_provider_authority"]["status"], "pass")

    def test_legacy_provider_cache_is_warning_not_canonical_source(self):
        values = {
            "yield_project_latest_balance_feed_v1": {
                "receivedAt": "2026-11-15T03:50:00Z",
                "projects": [{"id":"salad-project", "balanceUsd":58.0}],
            },
            "project_income_portfolio_summary_v1": {
                "portfolioBalance":58.0,
            },
        }
        checks = {row["code"]: row for row in
                  audit_integration_settings(values, self.now)["checks"]}
        self.assertEqual(checks["crypto_portfolio_authority"]["status"],"warning")
        self.assertEqual(checks["crypto_provider_authority"]["status"],"warning")

    def test_divergent_btc_cache_quotes_are_warning_not_mining_income(self):
        checks = audit_integration_settings({
            "networth_crypto_cache": {
                "projectPortfolio": {"bitcoin": {"price": 64869}},
                "chains": [{"chain": "bitcoin",
                            "tokens": [{"symbol": "BTC", "price": 81180}]}],
            },
        }, self.now)["checks"]
        flagged = next(c for c in checks if c["code"] == "bitcoin_legacy_quote_drift")
        self.assertEqual(flagged["status"], "warning")
        self.assertAlmostEqual(flagged["maxPriceGapUsd"], 16311)
        self.assertNotIn("earnedUsd", flagged)

    def test_all_extension_providers_are_checked_for_monthly_snapshot_regression(self):
        values = {
            "project_income_kryptex_tracker_v1": {
                "monthlyEarnings": {"2026-11": 40.0}},
            "project_income_salad_tracker_v1": {
                "monthlyEarnings": {"2026-11": 4.0}},
            "project_income_rollercoin_tracker_v2": {
                "walletDaily": {"2026-11-12": {"usd": 7.0}}},
            "project_income_unetwork_tracker_v1": {
                "daily": {"2026-11-12": {"usd": 10.0}}},
            "yield_monthly_snapshots_v1": {
                "2026-11": {
                    "locked": False,
                    "total": 53.0,
                    "platforms": [
                        {"platform": "Kryptex", "amount": 40.0},
                        {"platform": "Salad", "amount": 2.0},
                        {"platform": "RollerCoin", "amount": 5.0},
                        {"platform": "Unetwork", "amount": 6.0},
                    ],
                },
            },
        }
        result = audit_integration_settings(values, self.now)
        checks = {row["code"]: row for row in result["checks"]}
        flagged = checks["extension_provider_snapshot_2026-11"]
        self.assertEqual(flagged["status"], "error")
        self.assertEqual({row["provider"] for row in flagged["mismatches"]},
                         {"Salad", "RollerCoin", "Unetwork"})
        self.assertNotIn("Kryptex",
                         {row["provider"] for row in flagged["mismatches"]})
        corrected = values["yield_monthly_snapshots_v1"]["2026-11"]
        corrected["total"] = 61.0
        corrected["platforms"] = [
            {"platform": "Kryptex", "amount": 40.0},
            {"platform": "Salad", "amount": 4.0},
            {"platform": "RollerCoin", "amount": 7.0},
            {"platform": "Unetwork", "amount": 10.0},
        ]
        checks = {row["code"]: row for row in
                  audit_integration_settings(values, self.now)["checks"]}
        self.assertEqual(checks["extension_provider_snapshot_2026-11"]["status"],
                         "pass")

    def test_locked_snapshot_keeps_historical_kryptex_total(self):
        result = audit_integration_settings({
            "project_income_kryptex_tracker_v1": {
                "kryptexMiningDaily": {"2026-11-07": 3},
                "kryptexConfirmedDays": {"2026-11-07": True},
                "monthlyEarnings": {"2026-11": 3},
            },
            "yield_monthly_snapshots_v1": {
                "2026-11": {
                    "locked": True,
                    "total": 2.0,
                    "platforms": [{"platform": "Kryptex", "amount": 2.0}],
                }
            },
        }, self.now)
        checks = {row["code"] for row in result["checks"]}
        self.assertNotIn("kryptex_snapshot_2026-11", checks)


if __name__ == "__main__":
    unittest.main()
