"""Balance-sheet equipment migration parity fixtures."""
import unittest
from backend.financial_balance_rows import (
    financial_balance_rows, with_journal_equipment,
)


class FinancialBalanceRowsTests(unittest.TestCase):
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
