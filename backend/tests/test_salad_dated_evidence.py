"""Source-specific Salad proof; never reallocate undated lifetime balances."""
import copy
import unittest

from backend.salad_dated_evidence import verified_salad_day
from backend.earnings_dashboard import provider_entries
from backend.hardware_payback_lifetime import build_lifetime_hardware_payback


def snapshots():
    return {
        "earningSnapshots": [
            {"syncedAt": "2026-11-14T06:52:12.636Z",
             "lifetimeBalance": 87.20853211},  # Nov 13, 22:52 Pacific
            {"syncedAt": "2026-11-14T16:32:01.846Z",
             "lifetimeBalance": 87.20853211},  # Nov 14, 08:32
            {"syncedAt": "2026-11-15T00:16:14.549Z",
             "lifetimeBalance": 87.20899707},  # Nov 14, 16:16
            {"syncedAt": "2026-11-15T07:59:32.638Z",
             "lifetimeBalance": 87.20899707},  # Nov 14, 23:59
            {"syncedAt": "2026-11-15T08:00:32.752Z",
             "lifetimeBalance": 87.20899707},  # Nov 15, 00:00
        ],
    }


class SaladDatedEvidenceTests(unittest.TestCase):
    def test_recovers_november_14_from_anchored_provider_snapshots(self):
        self.assertAlmostEqual(verified_salad_day(
            snapshots(), "2026-11-14", "2026-11-15"), 0.00046496)
        self.assertIsNone(verified_salad_day(
            snapshots(), "2026-11-13", "2026-11-15"))
        self.assertIsNone(verified_salad_day(
            snapshots(), "2026-11-15", "2026-11-15"))

    def test_does_not_invent_previous_day_or_current_day_rewards(self):
        rows = snapshots()
        rows["earningSnapshots"] = rows["earningSnapshots"][:2]
        self.assertIsNone(verified_salad_day(
            rows, "2026-11-14", "2026-11-15"))

    def test_rejects_gapped_baseline_and_decreasing_lifetime(self):
        rows = snapshots()
        original = copy.deepcopy(rows)
        rows["earningSnapshots"][1]["lifetimeBalance"] = 87.21
        self.assertIsNone(verified_salad_day(
            rows, "2026-11-14", "2026-11-15"))
        self.assertNotEqual(rows, original)
        rows = snapshots()
        rows["earningSnapshots"][2]["lifetimeBalance"] = 87.1
        self.assertIsNone(verified_salad_day(
            rows, "2026-11-14", "2026-11-15"))

    def test_uses_saved_dated_salad_reward_before_inference(self):
        sal = snapshots()
        sal["daily"] = {"2026-11-14": 0.00046496}
        entry = provider_entries(
            "2026-11-14", {"sources": {"Salad": 0.00046496}},
            {"Salad": sal})
        self.assertEqual(entry["provenance"]["Salad"], "dated-salad-reward")

    def test_5080_receives_verified_nov14_but_nov13_stays_provisional(self):
        device = [{
            "id": "5080", "name": "RTX 5080", "cost": 1250,
            "startMonth": "2026-11", "earningsStartDay": "2026-11-13",
            "sources": ["Salad"],
        }]
        daily = {
            "2026-11-13": {"sources": {"Salad": 0.02737941}},
            "2026-11-14": {"sources": {"Salad": 0.00046496}},
        }
        result = build_lifetime_hardware_payback(
            device, daily, {"Salad": snapshots()}, "2026-11-15")
        row = result["devices"][0]
        self.assertAlmostEqual(row["verifiedRewardSubtotalUsd"], 0.00046496)
        self.assertAlmostEqual(row["provisionalRewardSubtotalUsd"], 0.02737941)
        self.assertFalse(row["complete"])
        self.assertTrue(result["mathReconciles"])
        self.assertEqual(result["checkpointWrites"], False)
        self.assertEqual(result["financialLedgerMutated"], False)


if __name__ == "__main__":
    unittest.main()
