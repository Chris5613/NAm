"""Balance-sheet equipment migration parity fixtures."""
import unittest
from backend.financial_balance_rows import (
    financial_balance_rows, with_journal_equipment,
)
from backend.financial_core import phone_asset_rows


class FinancialBalanceRowsTests(unittest.TestCase):
    def test_honeygain_november_inception_reconciles_balance_change(self):
        records = {"2026-10": {"items": []}, "2026-11": {"items": []}}
        rows = financial_balance_rows("2026-11", records,
                                      {"honeygain": 0.14468}, [], "2026-11")
        honeygain = next(row for row in rows if row["id"] == "project:honeygain")
        self.assertEqual(honeygain["start"], 0)
        self.assertAlmostEqual(honeygain["end"], 0.14468)
        self.assertEqual(round(honeygain["end"] - honeygain["start"], 2), 0.14)

    def test_honeygain_explicit_or_prior_opening_is_never_overridden(self):
        records = {"2026-10": {"items": [{"name": "Honeygain", "end": 2}]},
                   "2026-11": {"items": []}}
        rows = financial_balance_rows("2026-11", records,
                                      {"honeygain": 2.14}, [], "2026-11")
        honeygain = next(row for row in rows if row["id"] == "project:honeygain")
        self.assertEqual(honeygain["start"], 2)

    def test_rate_x_is_excluded_from_current_balance_sheet_even_if_live_zero(self):
        records = {"2026-11": {"items": [{"name": "Rate X", "end": 600},
                                            {"name": "Kryptex", "end": 20}]}}
        live = {"ratex": 0, "kryptex": 42}
        rows = financial_balance_rows("2026-11", records, live, [],
                                      "2026-11")
        self.assertNotIn("ratex", {row["name"].lower().replace(" ", "")
                                   for row in rows})
        self.assertEqual(next(row for row in rows if row["name"] == "Kryptex")["end"], 42)

    def test_rate_x_is_not_added_as_a_live_project_asset_when_positive(self):
        rows = financial_balance_rows("2026-11", {}, {
            "ratex": 750, "salad": 2.5,
        }, [], "2026-11")
        self.assertNotIn("project:ratex", [row["id"] for row in rows])
        self.assertEqual(next(row["end"] for row in rows
                              if row["id"] == "project:salad"), 2.5)

    def test_rate_x_extra_balance_sheet_alias_excluded_without_mutating_saved(self):
        import copy
        records = {"2026-11": {"balanceSheetItems": [
            {"id": "rate-x-asset", "name": "Rate X", "end": 600},
            {"id": "regular-asset", "name": "Business Asset", "end": 10},
        ]}}
        frozen = copy.deepcopy(records)
        rows = financial_balance_rows("2026-11", records, {}, [], "2026-11")
        self.assertNotIn("rate-x-asset", [row["id"] for row in rows])
        self.assertIn("regular-asset", [row["id"] for row in rows])
        self.assertEqual(records, frozen)

    def test_locked_historical_rate_x_is_preserved_without_rewriting_it(self):
        records = {"2026-10": {"locked": True, "items": [
            {"name": "Rate X", "end": 600},
        ]}}
        rows = financial_balance_rows("2026-10", records,
                                      {"ratex": 0}, [], "2026-11")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Rate X")
        self.assertEqual(rows[0]["end"], 600)

    def test_two_independently_registered_gpus_are_never_merged(self):
        devices = [
            {"id": "gpu-1", "name": "RTX 5080 GPU", "cost": 1950,
             "startMonth": "2026-11"},
            {"id": "gpu-2", "name": "RTX 5080 GPU", "cost": 1000,
             "startMonth": "2026-11"},
        ]
        rows = financial_balance_rows("2026-11", {}, {}, devices, "2026-11")
        gpu_rows = [r for r in rows if r["name"] == "RTX 5080 GPU"]
        self.assertEqual(len(gpu_rows), 2)
        self.assertEqual({r["id"] for r in gpu_rows},
                         {"device:gpu-1", "device:gpu-2"})

    def test_known_pc_alias_does_not_duplicate_confirmed_asset(self):
        records = {"2026-11": {"items": [
            {"name": "RTX 2080 PC", "start": 500, "end": 491.67}
        ]}}
        rows = financial_balance_rows("2026-11", records, {}, [],
                                      "2026-11")
        pcs = [r for r in rows if "2080" in r["name"]]
        self.assertEqual(len(pcs), 1)
        self.assertEqual(pcs[0]["name"], "RTX 2080 Super PC")

    def test_journal_full_trade_in_debit_updates_known_asset_cost(self):
        base = [{"id": "device:5080", "name": "RTX 5080 GPU",
                 "category": "equipment", "historicalCost": 1250,
                 "acquisitionMonth": "2026-11", "source": "hardware-payback",
                 "start": 0, "end": 1229.17, "depreciation": 20.83}]
        journal = [{
            "id": "purchase", "date": "2026-11-13",
            "description": "RTX 5080 GPU acquisition via trade-in",
            "debitAccount": "equipment", "creditAccount": "equity",
            "amount": 1950,
        }]
        rows = with_journal_equipment(base, journal, "2026-11")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["historicalCost"], 1950)
        self.assertEqual(rows[0]["end"], 1917.5)

    def test_retirement_by_specific_subaccount_closes_only_that_device(self):
        base = [
            {"id": "device:1", "name": "RTX 2080 Super PC",
             "category": "equipment", "historicalCost": 500,
             "acquisitionMonth": "2026-11", "source": "hardware-payback",
             "start": 0, "end": 491.67, "depreciation": 8.33},
            {"id": "device:2", "name": "RTX 5080 GPU",
             "category": "equipment", "historicalCost": 1950,
             "acquisitionMonth": "2026-11", "source": "hardware-payback",
             "start": 0, "end": 1917.5, "depreciation": 32.5},
        ]
        journal = [{
            "id": "dispose", "date": "2026-11-14", "description": "Sell PC",
            "lines": [{"account": "cash", "debit": 491.67},
                      {"account": "equipment:device:1", "credit": 491.67}],
        }]
        result = with_journal_equipment(base, journal, "2026-11")
        self.assertEqual(result[0]["end"], 0)
        self.assertTrue(result[0]["retired"])
        self.assertEqual(result[1]["end"], 1917.5)

    def test_5070_trade_for_5080_preserves_full_purchase_and_retires_trade_in(self):
        records = {
            "2026-11": {"balanceSheetItems": [{
                "id": "hardware:rtx5070", "name": "RTX 5070 GPU",
                "category": "equipment", "historicalCost": 500,
                "placedInServiceMonth": "2026-11", "usefulLifeMonths": 60,
            }]},
        }
        devices = [{
            "id": "rtx-5080", "name": "RTX 5080", "cost": 1250,
            "startMonth": "2026-11",
        }]
        ledger = [{
            "id": "buy5080", "date": "2026-11-13",
            "description": "Purchase: RTX 5080",
            "lines": [
                {"account": "equipment", "debit": 1950, "credit": 0},
                {"account": "cash", "debit": 0, "credit": 1250},
                {"account": "equipment:hardware:rtx5070", "debit": 0,
                 "credit": 491.67},
                {"account": "gainDisposal", "debit": 0, "credit": 208.33},
            ],
        }]
        rows = financial_balance_rows(
            "2026-11", records, {}, devices, "2026-11")
        values = with_journal_equipment(rows, ledger, "2026-11")
        new_gpu = next(r for r in values if r["name"] == "RTX 5080")
        old_gpu = next(r for r in values if r["id"] == "hardware:rtx5070")
        self.assertEqual(new_gpu["historicalCost"], 1950)
        self.assertEqual(new_gpu["end"], 1917.5)
        self.assertTrue(old_gpu["retired"])
        self.assertEqual(old_gpu["end"], 0)
        self.assertEqual(len([r for r in values if r["name"] == "RTX 5080"]), 1)

    def test_registered_business_phone_acquisition_is_not_added_twice(self):
        phone = {
            "id": "phone-one", "name": "iPhone 13 — Unetwork #1",
            "businessDate": "2026-05-20", "startMonth": "2026-05",
            "cost": 360, "fundingAccount": "equity",
        }
        rows = phone_asset_rows([phone], "2026-11")
        acquisition = [{
            "id": "unetwork-phone:phone-one",
            "date": "2026-05-20",
            "description": "iPhone 13 — Unetwork #1",
            "debitAccount": "equipment", "creditAccount": "equity",
            "amount": 360,
        }]
        output = with_journal_equipment(rows, acquisition, "2026-11")
        self.assertEqual(len(output), 1)
        self.assertEqual(output[0]["id"], "unetwork-phone:phone-one")

    def test_locked_month_ignores_later_hardware_changes(self):
        records = {"2026-10": {"locked": True, "items": [
            {"name": "Lulo", "start": 100, "end": 110},
        ]}}
        rows = financial_balance_rows("2026-10", records, {"Lulo": 5000},
                                      [{"id": "new", "name": "GPU",
                                        "cost": 1200, "startMonth": "2026-10"}],
                                      "2026-11")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["end"], 110)


if __name__ == "__main__":
    unittest.main()
