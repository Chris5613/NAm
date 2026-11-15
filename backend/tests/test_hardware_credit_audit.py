"""Shared provider credit cannot manufacture an extra source of revenue."""
import copy
import unittest
from backend.hardware_credit_audit import hardware_credit_audit


class HardwareCreditAuditTests(unittest.TestCase):
    def test_shared_kryptex_is_a_device_credit_not_duplicate_revenue(self):
        devices=[
            {"id":"2080","name":"RTX 2080 PC","sources":["Kryptex"],
             "earningsStartDay":"2026-11-01"},
            {"id":"5080","name":"RTX 5080","sources":["Salad","Kryptex"],
             "earningsStartDay":"2026-11-13"},
        ]
        earnings={
            "sourceOfCalculation":"backend-postgres","month":"2026-11",
            "todayKey":"2026-11-14","calculatedAt":"2026-11-15T05:00:00Z",
            "days":[
                {"key":"2026-11-12","sources":{"Kryptex":2},
                 "provenance":{"Kryptex":"confirmed-kryptex-mining-day"}},
                {"key":"2026-11-13","sources":{"Kryptex":3,"Salad":.5},
                 "provenance":{"Kryptex":"confirmed-kryptex-mining-day",
                               "Salad":"legacy-server-receipt"}},
                {"key":"2026-11-14","sources":{"Kryptex":4,"Salad":.1},
                 "provenance":{"Kryptex":"confirmed-kryptex-mining-day",
                               "Salad":"legacy-server-receipt"}},
            ],
        }
        before=copy.deepcopy((devices,earnings))
        result=hardware_credit_audit("2026-11",devices,earnings)
        self.assertAlmostEqual(result["sumDeviceCreditsUsd"],16.6)
        self.assertAlmostEqual(result["selectedSourceRevenueUsd"],9.6)
        self.assertAlmostEqual(result["duplicateDeviceCreditsUsd"],7)
        self.assertTrue(result["differenceReconciles"])
        self.assertEqual(result["sharedSources"],["kryptex"])
        self.assertAlmostEqual(result["provisionalDeviceCreditsUsd"],.6)
        self.assertFalse(result["complete"])
        self.assertFalse(result["deviceCreditsAreUniqueIncome"])
        self.assertFalse(result["financialLedgerMutated"])
        self.assertEqual((devices,earnings),before)

    def test_explicit_start_controls_historical_credit_without_checkpoints(self):
        devices=[{"id":"a","earningsStartDay":"2026-11-14",
                  "sources":["Kryptex","Kryptex"]}]
        e={"sourceOfCalculation":"backend-postgres","month":"2026-11",
           "todayKey":"2026-11-14","days":[
               {"key":"2026-11-13","sources":{"Kryptex":8}},
               {"key":"2026-11-14","sources":{"Kryptex":3}}
           ]}
        result=hardware_credit_audit("2026-11",devices,e)
        self.assertEqual(result["sumDeviceCreditsUsd"],3)
        self.assertEqual(result["selectedSourceRevenueUsd"],3)
        self.assertEqual(result["duplicateDeviceCreditsUsd"],0)

    def test_unknown_start_and_bad_source_are_not_fabricated_zero(self):
        devices=[{"id":"gpu","sources":["Kryptex"],"checkpoint":{"time":123456}}]
        e={"sourceOfCalculation":"backend-postgres","month":"2026-11",
           "todayKey":"2026-11-14","days":[]}
        result=hardware_credit_audit("2026-11",devices,e)
        self.assertFalse(result["complete"])
        self.assertIsNone(result["devices"][0]["observedMonthCreditUsd"])
        self.assertEqual(result["devicesWithUnknownStart"],["gpu"])
        self.assertFalse(hardware_credit_audit("2026-11",devices,{"month":"2026-11"})["complete"])

    def test_future_rows_and_cross_month_earnings_excluded(self):
        devices=[{"id":"a","earningsStartDay":"2026-11-01","sources":["Kryptex"]}]
        earnings={"sourceOfCalculation":"backend-postgres","month":"2026-11",
            "todayKey":"2026-11-14","days":[
                {"key":"2026-11-14","sources":{"Kryptex":3}},
                {"key":"2026-11-15","future":True,"sources":{"Kryptex":1000}},
                {"key":"2026-12-01","sources":{"Kryptex":10000}},
            ]}
        result=hardware_credit_audit("2026-11",devices,earnings)
        self.assertEqual(result["sumDeviceCreditsUsd"],3)


if __name__=="__main__":
    unittest.main()
