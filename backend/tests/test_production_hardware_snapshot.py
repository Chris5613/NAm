"""Frozen completed-day production-read hardware evidence regression.

As-of the end of 2026-11-14, no production writes or prices are used.
This snapshot captures confirmed Kryptex daily USD records and two Salad
receipts, one user-attested and one supported by lifetime snapshots.
Equipment ledger cost basis (which includes trade-in consideration) remains
separate from the $1,250 *cash* payback cost for the second GPU.
"""
import copy
import unittest

from backend.hardware_payback_lifetime import build_lifetime_hardware_payback

KRYPTEX = {
    "2026-11-01": 0.35368299,
    "2026-11-02": 0.94466434,
    "2026-11-03": 1.46182145,
    "2026-11-04": 2.79086762,
    "2026-11-05": 3.87152979,
    "2026-11-06": 4.15850646,
    "2026-11-07": 4.2381691143374995,
    "2026-11-08": 3.832304643115,
    "2026-11-09": 3.2095771495230005,
    "2026-11-10": 3.2716109030019997,
    "2026-11-11": 3.1830661035825,
    "2026-11-12": 2.9390032170445006,
    "2026-11-13": 3.288413716235,
    "2026-11-14": 4.44678473,
}


def evidence():
    devices = [
        {"id": "hardware-2080", "name": "RTX 2080 PC",
         "cost": 500, "power": 0, "startMonth": "2026-11",
         "earningsStartDay": "2026-11-01",
         "sources": ["Kryptex"],
         "checkpoint": {"month": "2026-11", "baseline": 0, "carried": 0}},
        {"id": "hardware-5080", "name": "RTX 5080",
         "cost": 1250, "power": 0, "startMonth": "2026-11",
         "earningsStartDay": "2026-11-13",
         "sources": ["Salad", "Kryptex"],
         "checkpoint": {"month": "2026-11", "baseline": 21.04920985714286,
                        "carried": .02737899999999982}},
    ]
    daily = {
        **{day: {"sources": {"Kryptex": value}}
           for day, value in KRYPTEX.items()},
        "2026-11-13": {"sources": {
            "Kryptex": 3.288413716235, "Salad": .02737941}},
        "2026-11-14": {"sources": {
            "Kryptex": 4.44678473, "Salad": .00046496}},
    }
    trackers = {
        "Kryptex": {
            "kryptexMiningDaily": dict(KRYPTEX),
            "kryptexConfirmedDays": {day: True for day in KRYPTEX},
        },
        "Salad": {
            "daily": {},
            "earningSnapshots": [
                {"syncedAt": "2026-11-14T06:52:12.636Z",
                 "lifetimeBalance": 87.20853211},
                {"syncedAt": "2026-11-14T16:32:01.846Z",
                 "lifetimeBalance": 87.20853211},
                {"syncedAt": "2026-11-15T07:59:32.638Z",
                 "lifetimeBalance": 87.20899707},
            ],
        },
    }
    return devices, daily, trackers


class ProductionHardwareSnapshotTests(unittest.TestCase):
    def test_kryptex_cash_cost_recovery_and_shared_gpu_evidence(self):
        devices, daily, trackers = evidence()
        before = copy.deepcopy((devices, daily, trackers))
        total_daily = round(sum(KRYPTEX.values()), 8)
        self.assertAlmostEqual(total_daily, 41.99000223)
        output = build_lifetime_hardware_payback(
            devices, daily, trackers, "2026-11-14"
        rows = {r["id"]: r for r in output["devices"]}
        self.assertTrue(output["mathReconciles"])
        self.assertAlmostEqual(output["sumDeviceCashCostUsd"], 1750)
        self.assertAlmostEqual(rows["hardware-2080"]["observedCreditUsd"],
                               41.99000223
        self.assertTrue(rows["hardware-2080"]["complete"])
        self.assertAlmostEqual(rows["hardware-2080"]["paidMiningPowerUsd"], 0)
        self.assertAlmostEqual(rows["hardware-5080"]["observedCreditUsd"],
                               7.76304282
        self.assertAlmostEqual(output["repeatedDeviceCreditsUsd"], 7.73519845)
        self.assertTrue(rows["hardware-5080"]["complete"])
        self.assertAlmostEqual(rows["hardware-5080"]["verifiedRecoveryUsd"],
                               7.76304282)
        self.assertEqual(rows["hardware-5080"]["missingSourceDayCount"], 0)
        self.assertAlmostEqual(rows["hardware-5080"]["verifiedRewardSubtotalUsd"],
                               7.76304282
        self.assertAlmostEqual(rows["hardware-5080"]["provisionalRewardSubtotalUsd"],
                               0)
        self.assertFalse(output["financialLedgerMutated"])
        self.assertFalse(output["checkpointWrites"])
        self.assertEqual((devices, daily, trackers), before)

    def test_forecast_preserves_70_30_blend_without_booking_future_income(self):
        devices, daily, trackers = evidence()
        result = build_lifetime_hardware_payback(
            devices, daily, trackers, "2026-11-15",
            current_kryptex_daily=5.346465274751038)
        rows = {r["id"]: r for r in result["devices"]}
        for row in rows.values():
            self.assertEqual(
                row["forecastBasis"], "blend-70pct-7day-30pct-live-kryptex")
            self.assertAlmostEqual(
                row["forecastHistoricalKryptexDailyUsd"], 3.45296578)
            self.assertAlmostEqual(
                row["forecastLiveKryptexDailyUsd"], 5.34646527)
            self.assertIsNotNone(row["estimatedPaybackDate"])
        self.assertAlmostEqual(rows["hardware-2080"]["estimatedDailyCreditUsd"],
                               4.02101563)
        self.assertTrue(rows["hardware-5080"]["forecastPartial"])

if __name__ == "__main__":
    unittest.main()
