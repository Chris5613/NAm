"""Backfilled reward days cannot be credited before the 5080 started."""
import copy
import unittest

from backend.hardware_payback_lifetime import build_lifetime_hardware_payback


def input_rows():
    devices = [
        {"id":"2080","name":"RTX 2080 PC","cost":500,
         "startMonth":"2026-11","earningsStartDay":"2026-11-01",
         "sources":["Kryptex"],
         "checkpoint":{"month":"2026-11","baseline":0,"carried":0}},
        {"id":"5080","name":"RTX 5080","cost":1250,
         "startMonth":"2026-11","earningsStartDay":"2026-11-13",
         "sources":["Kryptex","Salad"],
         "checkpoint":{"month":"2026-11","baseline":21.04920985714286,
                       "carried":0.02737899999999982}},
    ]
    history = {
        "2026-11-01":{"sources":{"Kryptex":34.25480378}},
        "2026-11-13":{"sources":{"Kryptex":2.96635159,"Salad":.02737941}},
        "2026-11-14":{"sources":{"Kryptex":4.19122475,"Salad":.00046496}},
    }
    k = {
        "kryptexConfirmedDays":{"2026-11-01":True,"2026-11-13":True,
                                "2026-11-14":True},
        "kryptexMiningDaily":{"2026-11-01":34.25480378,
                              "2026-11-13":2.96635159,"2026-11-14":4.19122475},
    }
    return devices, history, {"Kryptex":k}


class HardwarePaybackLifetimeTests(unittest.TestCase):
    def test_5080_excludes_all_prior_kryptex_even_if_checkpoint_wrong(self):
        devices,history,trackers=input_rows()
        original=copy.deepcopy((devices,history,trackers))
        result=build_lifetime_hardware_payback(devices,history,trackers,"2026-11-14")
        rows={r["id"]:r for r in result["devices"]}
        self.assertAlmostEqual(rows["5080"]["observedCreditUsd"],7.18542071)
        self.assertAlmostEqual(rows["5080"]["observedRemainingUsd"],1242.81457929)
        self.assertTrue(0 < rows["5080"]["observedProgressPct"] < 1)
        self.assertAlmostEqual(result["sumDeviceCashCostUsd"],1750)
        self.assertAlmostEqual(result["sumObservedRemainingUsd"],
                               1750-result["sumObservedDeviceCreditsUsd"])
        self.assertAlmostEqual(rows["5080"]["verifiedRewardSubtotalUsd"],7.15757634)
        self.assertAlmostEqual(rows["5080"]["provisionalRewardSubtotalUsd"],.02784437)
        self.assertIsNone(rows["5080"]["verifiedRecoveryUsd"])
        self.assertTrue(rows["5080"]["checkpointBaselineUnderstatesPriorRewards"])
        self.assertAlmostEqual(rows["5080"]["confirmedBeforeEarningsStartUsd"],34.25480378)
        self.assertAlmostEqual(result["repeatedDeviceCreditsUsd"],7.15757634)
        self.assertFalse(result["complete"])
        self.assertTrue(result["mathReconciles"])
        self.assertEqual((devices,history,trackers),original)

    def test_missing_day_is_not_implicit_zero_or_certified(self):
        devices,history,trackers=input_rows()
        devices=[devices[0]]
        outcome=build_lifetime_hardware_payback(devices,history,trackers,"2026-11-14")
        self.assertFalse(outcome["devices"][0]["complete"])
        self.assertEqual(outcome["devices"][0]["missingSourceDayCount"],11)
        self.assertIsNone(outcome["devices"][0]["verifiedRecoveryUsd"])

    def test_full_coverage_can_certify_one_machine_without_any_price_quote(self):
        devices,history,trackers=input_rows()
        devices=[devices[0]]
        for i in range(2,13):
            d=f"2026-11-{i:02d}"
            trackers["Kryptex"]["kryptexMiningDaily"][d]=0
            trackers["Kryptex"]["kryptexConfirmedDays"][d]=True
        result=build_lifetime_hardware_payback(devices,history,trackers,"2026-11-14")
        self.assertTrue(result["complete"])
        self.assertAlmostEqual(result["devices"][0]["verifiedRecoveryUsd"],41.41238012)
        self.assertAlmostEqual(result["selectedSourceRevenueUsd"] if "selectedSourceRevenueUsd" in result else result["observedSelectedSourceRevenueUsd"],41.41238012)
        self.assertEqual(result["devices"][0]["paidMiningPowerUsd"],0)

    def test_invalid_or_future_earnings_start_never_invents_money(self):
        devices,history,trackers=input_rows()
        devices[1]["earningsStartDay"]="2026-12-01"
        result=build_lifetime_hardware_payback(devices,history,trackers,"2026-11-14")
        row=next(x for x in result["devices"] if x["id"]=="5080")
        self.assertIsNone(row["verifiedRecoveryUsd"])
        self.assertFalse(row["complete"])

    def test_duplicate_aliases_and_device_ids_cannot_add_fake_rewards(self):
        devices,history,trackers=input_rows()
        devices.append(copy.deepcopy(devices[0]))
        devices[1]["sources"]=["Kryptex","Kryptex","Salad","Salad"]
        result=build_lifetime_hardware_payback(devices,history,trackers,"2026-11-14")
        self.assertIn("duplicate-device-id:2080",result["reviewFlags"])
        self.assertTrue(result["mathReconciles"])

    def test_estimated_payback_from_seven_completed_days_and_not_today(self):
        devices, history, trackers = input_rows()
        devices = [devices[0]]
        # Seven completed, confirmed reward days are the forecast basis.
        for day in range(8, 15):
            key = f"2026-11-{day:02d}"
            trackers["Kryptex"]["kryptexConfirmedDays"][key] = True
            trackers["Kryptex"]["kryptexMiningDaily"][key] = 5.0
        trackers["Kryptex"]["kryptexConfirmedDays"]["2026-11-15"] = True
        trackers["Kryptex"]["kryptexMiningDaily"]["2026-11-15"] = 300.0
        result = build_lifetime_hardware_payback(
            devices, history, trackers, "2026-11-15")
        row = result["devices"][0]
        self.assertEqual(row["forecastBasis"], "trailing-seven-completed-days")
        self.assertEqual(row["estimatedDailyCreditUsd"], 5.0)
        self.assertEqual(row["estimatedDaysRemaining"],
                         __import__("math").ceil(row["observedRemainingUsd"] / 5))
        self.assertIsNotNone(row["estimatedPaybackDate"])
        self.assertFalse(row["forecastPartial"])

    def test_partial_provider_history_is_labeled_provisional(self):
        devices, history, trackers = input_rows()
        for day in range(8, 15):
            key = f"2026-11-{day:02d}"
            trackers["Kryptex"]["kryptexConfirmedDays"][key] = True
            trackers["Kryptex"]["kryptexMiningDaily"][key] = 3.0
        row = next(r for r in build_lifetime_hardware_payback(
            devices, history, trackers, "2026-11-15")["devices"]
            if r["id"] == "5080")
        self.assertTrue(row["forecastPartial"])
        self.assertIsNotNone(row["estimatedPaybackDate"])
        self.assertEqual(row["forecastProviderCoverage"]["Kryptex"], 7)
        self.assertEqual(row["forecastProviderCoverage"]["Salad"], 2)

    def test_missing_recent_history_does_not_make_up_payback_date(self):
        devices, history, trackers = input_rows()
        result = build_lifetime_hardware_payback(
            [devices[0]], history, trackers, "2026-11-14")
        row = result["devices"][0]
        self.assertIsNone(row["estimatedPaybackDate"])
        self.assertEqual(row["forecastBasis"], "insufficient-history")

    def test_daily_earnings_not_affected_by_market_quote_repricing(self):
        devices,history,trackers=input_rows()
        first=build_lifetime_hardware_payback(devices,history,trackers,"2026-11-14")
        history["2026-11-13"]["btcUsdPrice"]=65000
        history["2026-11-14"]["btcUsdPrice"]=81180
        later=build_lifetime_hardware_payback(devices,history,trackers,"2026-11-14")
        self.assertEqual(first["sumObservedDeviceCreditsUsd"],later["sumObservedDeviceCreditsUsd"])


if __name__=="__main__":
    unittest.main()
