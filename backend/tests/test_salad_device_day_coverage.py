"""Coverage reports exclude days before the device actually earns Salad."""
import unittest
from backend.salad_device_day_coverage import salad_device_day_coverage


def tracker():
    return {"Salad": {"earningSnapshots": [
        {"syncedAt":"2026-11-14T06:52:12.636Z","lifetimeBalance":87.20853211},
        {"syncedAt":"2026-11-14T16:32:01.846Z","lifetimeBalance":87.20853211},
        {"syncedAt":"2026-11-15T07:59:32.638Z","lifetimeBalance":87.20899707},
    ]}}


def device(start="2026-11-13", sources=None):
    return {"id":"5080","name":"RTX 5080", "cost":1250,
            "earningsStartDay":start,
            "sources":sources or ["Kryptex","Salad"]}


class SaladDeviceDayCoverageTests(unittest.TestCase):
    def test_completed_device_days_have_distinct_provenance(self):
        daily = {
            "2026-11-13":{"sources":{"Salad":0.02737941}},
            "2026-11-14":{"sources":{"Salad":0.00046496}},
        }
        report = salad_device_day_coverage(
            [device()],daily,tracker(),"2026-11-15")
        self.assertTrue(report["allCompletedDaysCovered"])
        one = report["devices"][0]
        self.assertEqual(one["status"],"covered")
        self.assertEqual(one["missingDays"],[])
        self.assertEqual(one["provisionalDays"],[])
        self.assertEqual(one["incompleteDays"],["2026-11-15"])
        self.assertEqual([r["day"] for r in one["verifiedDays"]],
                         ["2026-11-13","2026-11-14"])
        self.assertEqual(one["verifiedDays"][0]["provenance"],
                         "user-attested-recorded-daily-receipt")
        self.assertEqual(one["verifiedDays"][1]["provenance"],
                         "dated-salad-lifetime-delta")
        self.assertTrue(report["readOnly"])
        self.assertFalse(report["financialLedgerMutated"])

    def test_missing_completed_days_remain_unverified(self):
        r = salad_device_day_coverage([device()],{},tracker(),"2026-11-15")
        self.assertEqual(r["devices"][0]["missingDays"],["2026-11-13"])
        self.assertEqual(r["devices"][0]["status"],"needs-evidence")
        self.assertFalse(r["allCompletedDaysCovered"])

    def test_legacy_receipt_does_not_gain_verified_status(self):
        r = salad_device_day_coverage(
            [device(start="2026-11-12")],
            {"2026-11-12":{"sources":{"Salad":0.00572426}},
             "2026-11-13":{"sources":{"Salad":0.02737941}}},
            tracker(),"2026-11-15")
        self.assertEqual(r["devices"][0]["status"],"needs-evidence")
        self.assertEqual(r["devices"][0]["provisionalDays"][0]["day"],
                         "2026-11-12")

    def test_source_switch_excludes_salad_after_effective_date(self):
        row = device(sources=["Kryptex"])
        row["sourceSegments"] = [
            {"startDay":"2026-11-13","endDay":"2026-11-14",
             "sources":["Kryptex","Salad"]},
            {"startDay":"2026-11-15","sources":["Kryptex"]},
        ]
        daily={"2026-11-13":{"sources":{"Salad":0.02737941}}}
        r = salad_device_day_coverage(
            [row],daily,tracker(),"2026-11-15")
        self.assertEqual(r["devices"][0]["incompleteDays"],[])
        self.assertTrue(r["allCompletedDaysCovered"])

    def test_invalid_segments_do_not_silently_reassign_credits(self):
        row=device()
        row["sourceSegments"]=[
            {"startDay":"2026-11-12","sources":["Salad"]},
        ]
        r=salad_device_day_coverage([row],{},tracker(),"2026-11-15")
        self.assertEqual(r["devices"][0]["status"],"invalid-source-segments")
        self.assertFalse(r["allCompletedDaysCovered"])


if __name__=="__main__":
    unittest.main()
