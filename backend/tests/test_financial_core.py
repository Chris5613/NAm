"""Server-financial calculation parity and no-silent-invention checks."""
import unittest
from backend.financial_core import (
    compute_profit, classify_cash_flows, split_revenue, equipment_schedule,
    calculate_net_worth, sum_business_rows, evaluate_statement, activity,
)


class FinancialCoreTests(unittest.TestCase):
    def test_compound_and_legacy_entries_have_matching_account_effects(self):
        old = {"id": "old", "debitAccount": "cash", "creditAccount": "revenue",
               "amount": 12.5}
        new = {"id": "new", "lines": [
            {"account": "cash", "debit": 12.5, "credit": 0},
            {"account": "revenue", "debit": 0, "credit": 12.5},
        ]}
        for entry in (old, new):
            self.assertEqual(activity([entry], "cash"), 12.5)
            self.assertEqual(compute_profit([entry], None)["revenue"], 12.5)

    def test_transfer_does_not_create_income_or_affect_profit(self):
        transfer = {"id": "transfer", "date": "2026-11-01",
                    "description": "Lulo withdrawal", "lines": [
                        {"account": "cash", "debit": 500},
                        {"account": "luloCash", "credit": 500},
                    ]}
        profit = compute_profit([transfer], None)
        self.assertEqual(profit["revenue"], 0)
        self.assertEqual(profit["profit"], 0)
        self.assertEqual(classify_cash_flows([transfer])["totals"]["transfers"], 500)

    def test_income_expense_depreciation_and_saved_expense_overlap(self):
        ledger = [
            {"id": "synced-income:2026-11:kryptex", "date": "2026-11-14",
             "lines": [{"account": "platform:kryptex", "debit": 40},
                       {"account": "revenue", "credit": 40}]},
            {"id": "fee", "date": "2026-11-14", "lines": [
                {"account": "fees", "debit": 1},
                {"account": "cash", "credit": 1},
            ]},
            {"id": "depreciation", "date": "2026-11-14", "lines": [
                {"account": "depreciation", "debit": 3},
                {"account": "accDep", "credit": 3},
            ]},
        ]
        result = evaluate_statement({
            "month": "2026-11", "entries": ledger, "savedExpenses": 5,
            "rows": [{"id": "machine", "category": "equipment", "end": 97}],
            "devices": [{"id": "machine", "cost": 120,
                         "startMonth": "2026-11",
                         "usefulLifeMonths": 60}],
        })
        self.assertEqual(result["profit"]["revenue"], 40)
        self.assertEqual(result["profit"]["expenses"], 6)
        self.assertEqual(result["profit"]["profit"], 31)
        self.assertEqual(result["revenueSources"]["mining"], 40)
        self.assertEqual(result["cashFlow"]["totals"]["operating"], -1)
        self.assertEqual(result["equipmentSchedule"][0]["depreciation"], 2)

    def test_known_missing_business_asset_is_not_fabricated_zero(self):
        report = sum_business_rows([
            {"id": "bank", "name": "Cash / Bank",
             "category": "cash", "end": None},
            {"id": "equipment", "name": "PC",
             "category": "equipment", "end": 500},
        ])
        self.assertTrue(report["incomplete"])
        self.assertIsNone(report["netValue"])
        result = calculate_net_worth([{
            "category": "cash", "manual_value": 100,
        }], report, 200)
        self.assertEqual(result["breakdown"]["crypto"], 200)
        self.assertFalse(result["businessVerified"])

    def test_business_cash_overlap_is_subtracted_once_and_reported(self):
        business = sum_business_rows([
            {"id": "ledger:cash", "name": "Cash / Bank",
             "category": "cash", "end": 250},
            {"id": "equipment", "name": "PC",
             "category": "equipment", "end": 500},
            {"id": "loan", "name": "Payable",
             "category": "liabilities", "end": 50},
        ])
        result = calculate_net_worth([
            {"category": "cash", "manual_value": 200},
        ], business, 0)
        self.assertEqual(result["cashOverlapUsd"], 200)
        self.assertEqual(result["breakdown"]["crypto"], 500)
        self.assertEqual(result["total_net_worth"], 700)
        self.assertTrue(result["needsTransferReconciliation"])

    def test_equipment_depreciation_honors_start_and_end_months(self):
        d = {"cost": 120, "startMonth": "2026-05", "usefulLifeMonths": 120}
        self.assertIsNone(equipment_schedule(d, "2026-04"))
        self.assertEqual(equipment_schedule(d, "2026-05")["end"], 119)
        self.assertEqual(equipment_schedule(d, "2026-06")["depreciation"], 1)
        self.assertEqual(equipment_schedule(d, "2036-06")["end"], 0)

    def test_invalid_month_rejected(self):
        with self.assertRaises(ValueError):
            evaluate_statement({"month": "2026-13", "entries": []})


if __name__ == "__main__":
    unittest.main()
