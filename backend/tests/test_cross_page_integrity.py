"""Cross-page integrity tests use real accounting projections, not mock totals."""
from copy import deepcopy
import unittest

from backend.cross_page_integrity import cross_page_integrity


def fixture():
    saved = {
        "yield_monthly_snapshots_v1": {
            "2026-11": {
                "monthKey": "2026-11", "total": 10, "locked": False,
                "platforms": [{"platform": "Kryptex", "amount": 10}],
            },
        },
        "yield_project_latest_balance_feed_v1": {
            "receivedAt": "2026-11-15T12:00:00Z",
            "projects": [
                {"id": "kryptex", "name": "Kryptex",
                 "balanceUsd": 25, "inactive": False},
                {"id": "inactive-lulo", "name": "Lulo",
                 "balanceUsd": 1500, "inactive": True},
            ],
        },
        "project_income_portfolio_summary_v1": {
            "portfolioBalance": 1525,
            "activePortfolioBalance": 25,
            "source": "backend-project-feed",
        },
        "monthly_business_changes_v1": {
            "2026-11": {"items": [{
                "name": "Cash / Bank", "start": 0, "end": None,
            }]},
        },
        "financials_bank_openings_v1": {"2026-11": 0},
        "financials_journal_v1": [{
            "id": "capital", "date": "2026-11-05",
            "debitAccount": "cash", "creditAccount": "equity",
            "amount": 10,
        }],
        "hardware_payback_devices_v1": [{
            "id": "pc", "name": "PC", "cost": 500, "power": 0,
            "startMonth": "2026-11", "earningsStartDay": "2026-11-15",
            "sources": ["Kryptex"],
        }],
        "financials_unetwork_business_phones_v1": [],
    }
    trackers = {
        "Kryptex": {
            "kryptexConfirmedDays": {"2026-11-15": True},
            "kryptexMiningDaily": {"2026-11-15": 1},
        },
        "Salad": {}, "RollerCoin": {}, "Unetwork": {},
    }
    income = [{
        "monthKey": "2026-11", "projectTotal": 10, "total": 10,
        "sources": {"Kryptex": 10},
    }]
    return saved, trackers, income


def run(saved, trackers, income, bitcoin=20):
    daily = {"2026-11-15": {"sources": {"Kryptex": 1}}}
    return cross_page_integrity(
        saved, "2026-11", "2026-11-15",
        bitcoin, income, daily, trackers,
        current_kryptex_daily=2,
    )


def checks(report):
    return {row["code"]: row for row in report["checks"]}


class CrossPageIntegrityTests(unittest.TestCase):
    def test_saved_provider_bookings_passive_and_cash_statements_reconcile(self):
        saved, trackers, income = fixture()
        before = deepcopy((saved, trackers, income))
        result = run(saved, trackers, income)
        found = checks(result)
        self.assertEqual(found["booked-month:2026-11"]["status"], "pass")
        self.assertEqual(found["passive-history:2026-11"]["status"], "pass")
        self.assertEqual(found["home-financials"]["status"], "pass")
        self.assertEqual(found["crypto-portfolio"]["status"], "pass")
        self.assertEqual(found["hardware-credit"]["status"], "pass")
        self.assertEqual(found["journal-preview"]["status"], "pass")
        self.assertEqual(result["bookedProviderLifetimeUsd"], 10)
        self.assertFalse(result["financialLedgerMutated"])
        self.assertTrue(result["readOnly"])
        self.assertEqual((saved, trackers, income), before)

    def test_inactive_holding_does_not_count_as_active_or_earned_income(self):
        saved, trackers, income = fixture()
        report = run(saved, trackers, income)
        found = checks(report)
        self.assertEqual(found["inactive-portfolio-holdings"]["status"], "info")
        self.assertEqual(found["inactive-lulo-valuation"]["status"], "warning")
        self.assertEqual(found["inactive-lulo-valuation"]["historicalPortfolioLuloUsd"], 1500)
        self.assertEqual(found["inactive-lulo-valuation"]["currentBusinessLuloUsd"], 0)
        self.assertEqual(found["crypto-portfolio"]["allProjectsUsd"], 1525)
        self.assertEqual(found["crypto-portfolio"]["activeProjectsUsd"], 25)
        self.assertEqual(report["bookedProviderLifetimeUsd"], 10)
        self.assertEqual(found["home-financials"]["status"], "pass")

    def test_snapshot_source_difference_is_an_error_not_adjusted(self):
        saved, trackers, income = fixture()
        saved["yield_monthly_snapshots_v1"]["2026-11"]["total"] = 12
        before = deepcopy(saved)
        report = run(saved, trackers, income)
        found = checks(report)
        self.assertEqual(found["booked-month:2026-11"]["status"], "error")
        self.assertEqual(report["status"], "error")
        self.assertEqual(saved, before)

    def test_provider_summary_drift_is_an_error_not_recoded_as_income(self):
        saved, trackers, income = fixture()
        saved["project_income_portfolio_summary_v1"]["portfolioBalance"] = 1599
        found = checks(run(saved, trackers, income))
        self.assertEqual(found["crypto-portfolio"]["status"], "error")
        self.assertEqual(found["booked-month:2026-11"]["status"], "pass")

    def test_passive_history_missing_booked_month_fails_closed(self):
        saved, trackers, _ = fixture()
        result = run(saved, trackers, [])
        self.assertEqual(checks(result)["passive-history:2026-11"]["status"],
                         "error")

    def test_btc_quote_changes_assets_but_not_earned_provider_income(self):
        saved, trackers, income = fixture()
        low = run(saved, trackers, income, bitcoin=10)
        high = run(saved, trackers, income, bitcoin=1000)
        self.assertEqual(low["bookedProviderLifetimeUsd"],
                         high["bookedProviderLifetimeUsd"])
        self.assertEqual(checks(low)["home-financials"]["status"], "pass")
        self.assertEqual(checks(high)["home-financials"]["status"], "pass")
        self.assertNotEqual(checks(low)["home-financials"]["home"]["knownSubtotal"],
                            checks(high)["home-financials"]["home"]["knownSubtotal"])

    def test_missing_btc_quote_does_not_invent_asset_value(self):
        saved, trackers, income = fixture()
        report = run(saved, trackers, income, bitcoin=None)
        found = checks(report)
        self.assertFalse(found["home-financials"]["bitcoinQuoteIncluded"])
        self.assertEqual(found["btc-valuation-coverage"]["status"], "warning")
        self.assertEqual(found["home-financials"]["status"], "pass")


if __name__ == "__main__":
    unittest.main()
