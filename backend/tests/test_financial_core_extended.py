"""Parity fixtures for new server accounting projections."""
import unittest

from backend.financial_core import (
    auto_income_journal, build_statement_rows, project_break_even,
    project_automatic_expenses, split_revenue, trial_balance,
    balance_sheet_totals, evaluate_statement,
)
from backend.income_history_core import (
    reconcile_lulo_months, historical_income, legacy_months,
)


class BackendAccountingMigrationTests(unittest.TestCase):
    def test_auto_income_subtracts_manually_posted_credit_not_withdrawal(self):
        month = "2026-11"
        income = {"total": 9, "sources": {"Kryptex": 6, "Salad": 3}}
        manual = [
            {"date": "2026-11-14", "description": "Kryptex",
             "debitAccount": "platform:kryptex",
             "creditAccount": "revenue", "amount": 2},
            {"date": "2026-11-14", "description": "Transfer",
             "debitAccount": "cash", "creditAccount": "luloCash", "amount": 50},
        ]
        result = auto_income_journal(month, income, manual, month,
                                     "2026-11-14")
        self.assertEqual(result["manualRevenueTotal"], 2)
        self.assertEqual(result["generatedRevenueTotal"], 7)
        per_provider = {entry["description"]: entry["amount"]
                        for entry in result["entries"]}
        self.assertEqual(per_provider["Synced Kryptex income"], 4)
        self.assertEqual(per_provider["Synced Salad income"], 3)
        self.assertFalse(result["pendingReview"])

    def test_encoded_journal_source_matches_browser_revenue_classification(self):
        journal = [{
            "id": "synced-income:2026-11:roller%20coin",
            "date": "2026-11-15",
            "lines": [{"account": "platform:rollercoin", "debit": 4},
                      {"account": "revenue", "credit": 4}],
        }]
        result = split_revenue(journal)
        self.assertEqual(result["mining"], 4)
        self.assertEqual(result["unclassified"], 0)

    def test_unknown_source_cannot_generate_fabricated_receivable(self):
        result = auto_income_journal("2026-11", {
            "total": 3, "sources": {"Unidentified Crypto Yield": 3},
        }, [], "2026-11", "2026-11-14")
        self.assertFalse(result["entries"])
        self.assertEqual(result["pendingReviewTotal"], 3)

    def test_backend_auto_expenses_do_not_double_book_manual_depreciation(self):
        rows = [
            {"category": "equipment", "depreciation": 8.33},
            {"category": "equipment", "depreciation": 32.5},
        ]
        manual = [{
            "id": "manual-dep", "date": "2026-11-15",
            "lines": [
                {"account": "depreciation", "debit": 8.33, "credit": 0},
                {"account": "accDep", "debit": 0, "credit": 8.33},
            ],
        }]
        result = project_automatic_expenses("2026-11", rows, manual, 0)
        self.assertAlmostEqual(result["scheduledDepreciationUsd"], 40.83)
        self.assertAlmostEqual(result["manualDepreciationUsd"], 8.33)
        self.assertAlmostEqual(result["autoDepreciationUsd"], 32.5)
        self.assertEqual(len(result["entries"]), 1)
        self.assertEqual(result["entries"][0]["id"], "auto-depreciation:2026-11")
        self.assertEqual(result["entries"][0]["lines"][0]["debit"], 32.5)

    def test_backend_auto_expenses_separate_nominal_power_and_paid_cash(self):
        result = project_automatic_expenses(
            "2026-11", [], [], 0
        )
        self.assertEqual(result["entries"], [])
        self.assertEqual(result["powerEstimateUsd"], 0)
        metered = project_automatic_expenses("2026-11", [], [], 3.42)
        self.assertEqual(len(metered["entries"]), 1)
        power = metered["entries"][0]
        self.assertTrue(power["estimated"])
        self.assertEqual(power["lines"][0]["account"], "electric")
        self.assertEqual(power["lines"][1]["account"], "payable")
        self.assertFalse(any(line["account"] == "cash" for line in power["lines"]))

    def test_backend_auto_expenses_ignore_past_preledger_month(self):
        result = project_automatic_expenses(
            "2026-08", [{"category": "equipment", "depreciation": 8}], [], 2)
        self.assertEqual(result["entries"], [])
        self.assertEqual(result["autoDepreciationUsd"], 0)

    def test_trial_balance_uses_cumulative_signed_subaccounts_without_browser_math(self):
        entries = [
            {"id": "purchase", "lines": [
                {"account": "equipment", "debit": 1950, "credit": 0},
                {"account": "cash", "debit": 0, "credit": 1250},
                {"account": "equipment:hardware:rtx5070", "debit": 0, "credit": 491.67},
                {"account": "gainDisposal", "debit": 0, "credit": 208.33},
            ]},
        ]
        accounts = [
            {"id": "equipment", "name": "Equipment"},
            {"id": "cash", "name": "Cash"},
            {"id": "equipment:hardware:rtx5070", "name": "Traded GPU"},
            {"id": "gainDisposal", "name": "Disposal gain"},
            {"id": "revenue", "name": "Unused"},
        ]
        result = trial_balance(accounts, entries)
        self.assertEqual(len(result["rows"]), 4)
        self.assertEqual(result["debitsUsd"], 1950)
        self.assertEqual(result["creditsUsd"], 1950)
        self.assertEqual(result["differenceUsd"], 0)
        self.assertTrue(result["balanced"])
        self.assertEqual(result["rows"][0]["debit"], 1950)
        self.assertEqual(result["rows"][1]["credit"], 1250)

    def test_statement_cash_unknown_remains_null_even_with_journal_activity(self):
        rows = build_statement_rows([], [{
            "date": "2026-11-14",
            "debitAccount": "cash", "creditAccount": "equity", "amount": 100,
        }])
        cash = next(x for x in rows if x["id"] == "ledger:cash")
        self.assertIsNone(cash["end"])
        self.assertTrue(cash["unverifiedOpening"])
        self.assertEqual(cash["journalChange"], 100)

    def test_explicit_cash_balance_is_not_credited_twice(self):
        rows = build_statement_rows([{
            "id": "bank", "name": "Cash / Bank", "category": "cash",
            "start": 500, "end": 600,
        }], [{
            "id": "receipt", "date": "2026-11-14",
            "debitAccount": "cash", "creditAccount": "revenue", "amount": 100,
        }], cash_opening=500)
        self.assertEqual(rows[0]["end"], 600)
        self.assertEqual(rows[0]["unreconciledCash"], 0)

    def test_lulo_backfill_competes_with_daily_not_additive(self):
        months = [{"monthKey": "2026-11", "total": 7,
                   "platforms": [{"platform": "Lulo", "amount": 2},
                                 {"platform": "Salad", "amount": 5}]}]
        result = reconcile_lulo_months(
            months, {"wallet": {"2026-11": 2.5}},
            {"wallet": {"2026-11": 3}}, "2026-11",
            [{"id": "wallet", "lulo_daily_performance": [
                {"date": "2026-11-14", "amount": 1},
                {"date": "2026-11-13", "amount": 2},
            ]}], "2026-11-14")
        self.assertEqual(result[0]["total"], 8)
        self.assertEqual(next(x["amount"] for x in result[0]["platforms"]
                              if x["platform"] == "Lulo"), 3)

    def test_stock_payout_and_manual_import_are_not_double_counted(self):
        monthly = [{"monthKey": "2026-11", "total": 10,
                    "platforms": [{"platform": "Kryptex", "amount": 10}]}]
        payouts = {"VTI:2026-11-13": {
            "symbol": "VTI", "date": "2026-11-13", "amount": 2.5}}
        result = historical_income(
            monthly, payouts, "2026-11",
            {"months": {}}, {"2026-11": {"kryptex": 5, "Other": 3}})
        self.assertEqual(result[0]["total"], 15.5)
        self.assertEqual(result[0]["sources"]["Kryptex"], 10)
        self.assertEqual(result[0]["sources"]["Other"], 3)
        self.assertEqual(result[0]["sources"]["Stocks"], 2.5)

    def test_backend_balance_sheet_totals_preserve_missing_value_flags(self):
        rows = [
            {"name": "Equipment", "category": "equipment",
             "start": 500, "end": 480},
            {"name": "Cash", "category": "cash",
             "start": None, "end": None},
            {"name": "Accounts payable", "category": "liabilities",
             "start": 10, "end": 12},
        ]
        data = balance_sheet_totals(rows)
        self.assertEqual(data["sourceOfCalculation"],
                         "backend-financial-statement-totals-v1")
        self.assertIsNone(data["assetsStart"])
        self.assertIsNone(data["assetsEnd"])
        self.assertIsNone(data["netEnd"])
        self.assertEqual(data["missingAssetCount"], 1)
        self.assertEqual(data["knownAssetsSubtotal"], 480)
        self.assertEqual(data["debtStart"], 10)
        self.assertEqual(data["debtEnd"], 12)

    def test_backend_archived_display_totals_stay_separate_from_current_ledger(self):
        result = evaluate_statement({
            "month": "2026-11", "entries": [], "rows": [],
            "displayRows": [
                {"id": "cash", "name": "Cash", "category": "cash",
                 "start": 300, "end": 350},
                {"id": "payable", "name": "Debt", "category": "liabilities",
                 "start": 50, "end": 40},
            ],
        })
        archive = result["displayTotals"]
        self.assertEqual(archive["assetsEnd"], 350)
        self.assertEqual(archive["debtEnd"], 40)
        self.assertEqual(archive["netStart"], 250)
        self.assertEqual(archive["netEnd"], 310)
        self.assertEqual(archive["netChange"], 60)
        self.assertEqual(result["business"]["knownSubtotal"], 0)
        self.assertNotEqual(result["statementTotals"]["assetsEnd"], 350)
        self.assertEqual(result["cashMovements"], {"cashIn": 0, "cashOut": 0})

    def test_break_even_preserves_lulo_loopscale_without_counting_principal(self):
        quick = {"projects": [
            {"yield_tracking": "lulo_lending", "lulo_total_balance_usd": 1000,
             "lulo_weighted_apy": 5, "lulo_lifetime_interest_usd": 3},
        ], "loopscaleSnapshot": {
            "positionValueUsd": 500, "netApy": 10, "pnlUsd": 7,
        }}
        costs = {"lulo-live": {"totalSpent": 20},
                 "loopscale-live": {"totalSpent": 25}}
        result = project_break_even([], {}, costs, quick)
        rows = {row["id"]: row for row in result["rows"]}
        self.assertEqual(rows["lulo-live"]["earned"], 3)
        self.assertEqual(rows["loopscale-live"]["earned"], 7)
        self.assertEqual(rows["lulo-live"]["spent"], 20)
        self.assertEqual(rows["loopscale-live"]["spent"], 25)
        self.assertAlmostEqual(rows["lulo-live"]["daily"], 1000 * .05 / 365)
        self.assertAlmostEqual(rows["loopscale-live"]["daily"], 500 * .10 / 365)
        self.assertEqual(result["totalEarned"], 10)
        self.assertEqual(result["totalSpent"], 45)

    def test_break_even_never_treats_portfolio_balance_as_earnings(self):
        stats = {
            "salad": {"lifetimeUsd": 4, "estimatedDailyUsd": 1},
            "rollercoin": {}, "unetwork": {}, "kryptex": {},
        }
        result = project_break_even([{
            "platform": "Lulo", "balance": 10000,
            "earned": 2, "apy": 5,
        }], stats, {"salad-project": {"totalSpent": 10}})
        lulo = next(r for r in result["rows"] if r["name"] == "Lulo")
        self.assertEqual(lulo["earned"], 2)
        self.assertEqual(result["totalEarned"], 4)
        self.assertEqual(result["totalSpent"], 10)
        salad = next(r for r in result["rows"] if r["name"] == "Salad")
        self.assertEqual(salad["daysToProfit"], 6)


if __name__ == "__main__":
    unittest.main()
