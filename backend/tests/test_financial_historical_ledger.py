import copy
import unittest

from backend.financial_historical_ledger import (
    historical_trial_balance, opening_phone_depreciation, movement_entries,
    persisted_historical_trial_inputs,
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

    def test_server_owned_sources_preserve_matching_historical_balance(self):
        saved = {
            "financials_journal_v1": self.data["journal"],
            "financials_month_closes_v1": self.data["closedMonths"],
            "monthly_business_changes_v1": self.data["records"],
            "hardware_payback_devices_v1": self.data["hardwareDevices"],
            "financials_unetwork_business_phones_v1": self.data["phones"],
            "financials_confirmed_movements_v1": self.data["confirmedMovements"],
        }
        owned = persisted_historical_trial_inputs(
            self.data, saved, self.data["incomeMonths"],
            self.data["currentMonth"], self.data["todayKey"])
        before = historical_trial_balance(self.data)
        after = historical_trial_balance(owned)
        self.assertEqual(before, after)

    def test_previous_month_inputs_are_server_owned(self):
        source = {
            "financials_journal_v1": [{
                "id": "saved-oct", "date": "2026-10-04",
                "debitAccount": "cash", "creditAccount": "equity", "amount": 22,
            }],
            "financials_month_closes_v1": {},
            "monthly_business_changes_v1": {},
            "hardware_payback_devices_v1": [],
            "financials_unetwork_business_phones_v1": [],
            "financials_confirmed_movements_v1": {},
        }
        payload = copy.deepcopy(self.data)
        payload["journal"] = [{"id": "forged", "date": "2026-10-04",
                               "debitAccount": "cash", "creditAccount": "equity",
                               "amount": 99999}]
        payload["incomeMonths"] = [{"monthKey": "2026-10", "total": 99999,
                                    "sources": {"Kryptex": 99999}}]
        payload["closedMonths"] = {"2026-10": {"entries": []}}
        result = persisted_historical_trial_inputs(
            payload, source, [], "2026-11", "2026-11-15")
        self.assertEqual(result["journal"], source["financials_journal_v1"])
        self.assertEqual(result["incomeMonths"], [])
        self.assertEqual(result["closedMonths"], {})
        self.assertNotIn("forged", str(result))
        self.assertNotIn("99999", str(result))
        self.assertEqual(result["currentEntries"], payload["currentEntries"])
        self.assertEqual(result["accounts"], payload["accounts"])

    def test_persisted_projection_never_modifies_inputs(self):
        request, saved = copy.deepcopy(self.data), {
            "financials_journal_v1": [],
            "financials_month_closes_v1": {},
            "monthly_business_changes_v1": {},
        }
        original_request, original_saved = copy.deepcopy(request), copy.deepcopy(saved)
        result = persisted_historical_trial_inputs(
            request, saved, [], "2026-11", "2026-11-15")
        historical_trial_balance(result)
        self.assertEqual(request, original_request)
        self.assertEqual(saved, original_saved)

    def test_source_inputs_not_changed_by_backend_trial(self):
        original = copy.deepcopy(self.data)
        historical_trial_balance(self.data)
        self.assertEqual(self.data, original)


if __name__ == "__main__":
    unittest.main()
