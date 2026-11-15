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
