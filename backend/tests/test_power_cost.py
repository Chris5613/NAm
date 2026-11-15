"""Nominal metered electricity is never confused with money paid."""
from datetime import datetime
from zoneinfo import ZoneInfo
import unittest

from backend.power_cost import server_power_cost_preview, usage_nominal_cost, read_rates, rate_for_now

PT=ZoneInfo("America/Los_Angeles")

def now(day="2026-11-14",hour=18):
    y,m,d=map(int,day.split("-"))
    return datetime(y,m,d,hour,0,tzinfo=PT)

def usage(month="2026-11",kwh=92.459038,tiers=None):
    return {"month":month,"totalKwh":kwh,"trackedSeconds":1000797.14,
            "tiers": tiers or {"basic":60.202043,"offPeak":18.392,
            "midPeak":11.531161,"peak":2.333834},
            "devices":{"pc":{"kwh":40,"tiers":{"basic":40}}}}


class PowerCostTests(unittest.TestCase):
    def test_november_uses_all_basic_rate_even_with_time_tiers(self):
        t=now()
        source=server_power_cost_preview(
            usage(),{},{"observedAt":t.isoformat(),"totalWatts":458},t)
        self.assertTrue(source["complete"])
        self.assertAlmostEqual(source["nominalUsd"],15.64)
        self.assertAlmostEqual(source["measuredKwh"],92.459038)
        self.assertEqual(source["outOfPocketUsd"],0)
        self.assertEqual(source["dailyOutOfPocketUsd"],0)
        self.assertEqual(source["currentRate"]["effectiveUsdPerKwh"],0)
        self.assertFalse(source["recordsFinancialExpense"])
        self.assertAlmostEqual(source["deviceCosts"]["pc"]["nominalUsd"],6.76)
        self.assertEqual(source["deviceCosts"]["pc"]["outOfPocketUsd"],0)

    def test_before_dec_10_basic_even_if_month_starts_in_dec(self):
        self.assertEqual(rate_for_now(now("2026-12-08"),read_rates({})),"basic")

    def test_dec_10_peak_weekday_then_offpeak_weekend(self):
        rates=read_rates({})
        self.assertEqual(rate_for_now(now("2026-12-10",18),rates),"peak")
        self.assertEqual(rate_for_now(now("2026-12-12",18),rates),"offPeak")

    def test_missing_telemetry_is_not_zero_cost(self):
        t=now()
        result=server_power_cost_preview(None,{},None,t)
        self.assertFalse(result["complete"])
        self.assertIsNone(result["nominalUsd"])
        self.assertIsNone(result["dailyOutOfPocketUsd"])
        self.assertIsNone(result["measuredKwh"])

    def test_dec_tier_mismatch_fails_closed(self):
        rates=read_rates({})
        v,f=usage_nominal_cost(usage("2026-12",100,{"basic":50,"peak":20}),rates)
        self.assertIsNone(v)
        self.assertEqual(f,"tier-kwh-do-not-reconcile")

    def test_no_rate_setting_defaults_and_invalid_negative_rate_rejected(self):
        self.assertEqual(read_rates({})["basic"],read_rates({"basicRate":None})["basic"])
        r=server_power_cost_preview(usage(),{"basicRate":-1},now=now())
        self.assertEqual(r["reason"],"invalid-power-rates")

    def test_no_saved_payable_in_power_preview(self):
        r=server_power_cost_preview(usage(),{},now=now())
        self.assertNotIn("journalEntry",r)
        self.assertNotIn("payable",r)

if __name__=="__main__":
    unittest.main()
