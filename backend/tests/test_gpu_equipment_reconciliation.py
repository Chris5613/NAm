"""Equipment values reflect journal trade funding, never cache overwrites."""
import copy
import unittest

from backend.gpu_equipment_reconciliation import reconcile_gpu_equipment


def live_fixture():
    devices = [
        {"id":"pc","name":"RTX 2080 PC","cost":500,"startMonth":"2026-11"},
        {"id":"gpu","name":"RTX 5080","cost":1250,"startMonth":"2026-11"},
    ]
    balance = {"2026-11":{"balanceSheetItems":[
        {"id":"hardware:rtx2080super-pc","name":"RTX 2080 Super PC",
         "category":"equipment","historicalCost":500,
         "placedInServiceMonth":"2026-11","usefulLifeMonths":60},
        {"id":"hardware:rtx5070","name":"RTX 5070 GPU","category":"equipment",
         "historicalCost":500,"placedInServiceMonth":"2026-11",
         "usefulLifeMonths":60},
    ]}}
    journal = [
        {"date":"2026-11-05","description":"Purchase: RTX 2080 PC",
         "debitAccount":"equipment","creditAccount":"equity","amount":500},
        {"date":"2026-11-05","description":"Purchase: RTX 5070 GPU",
         "debitAccount":"equipment","creditAccount":"equity","amount":500},
        {"date":"2026-11-13","description":"Purchase: RTX 5080","lines":[
            {"account":"equipment","debit":1950,"credit":0},
            {"account":"cash","debit":0,"credit":1250},
            {"account":"equipment:hardware:rtx5070","debit":0,"credit":491.67},
            {"account":"gainDisposal","debit":0,"credit":208.33},
        ]},
    ]
    return devices,balance,journal


class GpuEquipmentReconciliationTests(unittest.TestCase):
    def test_live_trade_5070_retired_and_5080_1950_capitalized(self):
        hardware,monthly,journal = live_fixture()
        originals=copy.deepcopy((hardware,monthly,journal))
        result=reconcile_gpu_equipment("2026-11",hardware,monthly,journal)
        self.assertTrue(result["completeForReviewedScope"])
        self.assertEqual(result["activeCount"],2)
        self.assertEqual(result["retiredCount"],1)
        self.assertEqual(result["unmatchedAcquisitionCount"],0)
        rows={r["name"]:r for r in result["assets"]}
        self.assertAlmostEqual(rows["RTX 5080"]["registerCostUsd"],1250)
        self.assertAlmostEqual(rows["RTX 5080"]["capitalizedCostUsd"],1950)
        self.assertAlmostEqual(rows["RTX 5080"]["endBookValueUsd"],1917.5)
        self.assertTrue(rows["RTX 5070 GPU"]["retired"])
        self.assertEqual(rows["RTX 5070 GPU"]["endBookValueUsd"],0)
        self.assertAlmostEqual(rows["RTX 2080 PC"]["endBookValueUsd"],491.67)
        self.assertAlmostEqual(result["activeEquipmentBookValueUsd"],2409.17)
        self.assertAlmostEqual(result["activeMonthlyDepreciationUsd"],40.83)
        self.assertEqual((hardware,monthly,journal),originals)

    def test_partial_credit_cannot_retire_old_gpu(self):
        hw,records,journal=live_fixture()
        journal[-1]["lines"][2]["credit"]=100
        result=reconcile_gpu_equipment("2026-11",hw,records,journal)
        old=next(a for a in result["assets"] if a["name"]=="RTX 5070 GPU")
        self.assertFalse(old["retired"])
        self.assertAlmostEqual(old["endBookValueUsd"],491.67)
        self.assertTrue(any(v.startswith("partial-disposal") for v in result["issues"]))

    def test_disposed_asset_stays_zero_next_month_not_recapitalized(self):
        hw,records,journal=live_fixture()
        records["2026-12"]=copy.deepcopy(records["2026-11"])
        result=reconcile_gpu_equipment("2026-12",hw,records,journal)
        old=next(a for a in result["assets"] if a["name"]=="RTX 5070 GPU")
        self.assertTrue(old["retired"])
        self.assertEqual(old["endBookValueUsd"],0)
        new=next(a for a in result["assets"] if a["name"]=="RTX 5080")
        self.assertAlmostEqual(new["capitalizedCostUsd"],1950)
        self.assertAlmostEqual(new["endBookValueUsd"],1885.0)

    def test_two_separately_registered_same_name_devices_not_merged(self):
        hw=[{"id":"one","name":"RTX 2080 PC","cost":500,"startMonth":"2026-11"},
            {"id":"two","name":"RTX 2080 PC","cost":500,"startMonth":"2026-11"}]
        result=reconcile_gpu_equipment("2026-11",hw,{},[])
        self.assertEqual(result["activeCount"],2)
        self.assertAlmostEqual(result["activeEquipmentBookValueUsd"],983.34)

    def test_unmatched_receipts_dont_become_invented_asset_values(self):
        hw,monthly,journal=live_fixture()
        journal.append({"date":"2026-11-21","description":"New unlabeled GPU purchase",
                        "debitAccount":"equipment","amount":900})
        result=reconcile_gpu_equipment("2026-11",hw,monthly,journal)
        self.assertEqual(result["unmatchedAcquisitionCount"],1)
        self.assertAlmostEqual(result["activeEquipmentBookValueUsd"],2409.17)
        self.assertFalse(result["certifiesEntireBusinessBalanceSheet"])

    def test_missing_required_sources_are_unknown_not_faked_as_zero(self):
        result=reconcile_gpu_equipment("2026-11",None,{},[])
        self.assertFalse(result["completeForReviewedScope"])
        self.assertIsNone(result["activeEquipmentBookValueUsd"])

    def test_no_future_equipment_in_current_month(self):
        hw=[{"id":"future","name":"RTX 5090","cost":3000,"startMonth":"2026-12"}]
        result=reconcile_gpu_equipment("2026-11",hw,{},[])
        self.assertEqual(result["activeCount"],0)
        self.assertEqual(result["activeEquipmentBookValueUsd"],0)


if __name__ == "__main__":
    unittest.main()
