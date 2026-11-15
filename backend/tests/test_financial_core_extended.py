"""Parity fixtures for new server accounting projections."""
import unittest

from backend.financial_core import (
    auto_income_journal, build_statement_rows, project_break_even,
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

    def test_unknown_source_cannot_generate_fabricated_receivable(self):
        result = auto_income_journal("2026-11", {
            "total": 3, "sources": {"Unidentified Crypto Yield": 3},
        }, [], "2026-11", "2026-11-14")
        self.assertFalse(result["entries"])
        self.assertEqual(result["pendingReviewTotal"], 3)

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
