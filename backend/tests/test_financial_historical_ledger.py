import copy
import unittest

from backend.financial_historical_ledger import (
    historical_trial_balance, opening_phone_depreciation, movement_entries,
)


class HistoricalLedgerCutoverTests(unittest.TestCase):
    def setUp(self):
        self.data = {
            "month": "2026-11",
            "currentMonth": "2026-11",
            "todayKey": "2026-11-15",
            "currentEntries": [{
                "id": "gpu-trade", "date": "2026-11-12",
                "lines": [
                    {"account": "equipment", "debit": 1950, "credit": 0},
                    {"account": "cash", "debit": 0, "credit": 1250},
                    {"account": "equipment:hardware:rtx5070",
                     "debit": 0, "credit": 491.67},
                    {"account": "gainDisposal", "debit": 0, "credit": 208.33},
                ],
            }],
            "journal": [],
            "closedMonths": {},
            "records": {},
            "incomeMonths": [{
                "monthKey": "2026-09", "total": 5,
                "sources": {"Kryptex": 5},
            }],
            "hardwareDevices": [],
            "phones": [],
            "confirmedMovements": {},
            "accounts": [
                {"id": "equipment"}, {"id": "cash"},
                {"id": "equipment:hardware:rtx5070"},
                {"id": "gainDisposal"}, {"id": "revenue"},
                {"id": "platform:kryptex"},
            ],
        }

    def test_cumulative_september_earnings_and_november_gpu_trade(self):
        result = historical_trial_balance(self.data)
        self.assertEqual(result["sourceOfCalculation"],
                         "backend-trial-balance")
        self.assertEqual(result["debitsUsd"], 1955)
        self.assertEqual(result["creditsUsd"], 1955)
        self.assertTrue(result["balanced"])
        self.assertEqual(result["month"], "2026-11")
        self.assertGreaterEqual(result["includedEntries"], 2)

    def test_locked_month_ledger_is_used_not_generated_again(self):
        data = copy.deepcopy(self.data)
        data["closedMonths"] = {"2026-09": {"entries": [{
            "id": "closed-income", "date": "2026-09-28",
            "lines": [{"account": "platform:kryptex",
                       "debit": 3, "credit": 0},
                      {"account": "revenue", "debit": 0, "credit": 3}],
        }]}}
        result = historical_trial_balance(data)
        self.assertEqual(result["debitsUsd"], 1953)
        self.assertEqual(result["creditsUsd"], 1953)

    def test_pre_september_phone_adjustment_does_not_post_revenue(self):
        phone = {
            "id": "one", "name": "Business phone", "businessDate": "2026-05-20",
            "startMonth": "2026-05", "cost": 560,
        }
        entry = opening_phone_depreciation([phone])
        self.assertIsNotNone(entry)
        self.assertEqual(entry["lines"][0]["account"], "equity")
        self.assertEqual(entry["lines"][1]["account"], "accDep")
        self.assertGreater(entry["lines"][0]["debit"], 0)

    def test_confirmed_movement_does_not_double_post_manual_cash(self):
        moves = [{"id": "transfer-a", "date": "2026-10-22", "from": "lulo",
                  "to": "cash", "amount": 100}]
        manual = [{"id": "manual", "date": "2026-10-22",
                   "debitAccount": "cash", "creditAccount": "luloCash",
                   "amount": 100}]
        # The same confirmed transfer has already been posted manually.
        # Do not credit cash twice when comparing resolved account IDs.
        results = movement_entries(moves, "2026-10", set(), manual)
        self.assertEqual(results, [])

    def test_source_inputs_not_changed_by_backend_trial(self):
        original = copy.deepcopy(self.data)
        historical_trial_balance(self.data)
        self.assertEqual(self.data, original)


if __name__ == "__main__":
    unittest.main()
