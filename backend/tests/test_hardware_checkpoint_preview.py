"""Checkpoint preview never overwrites historical device credits or settings."""
import copy
import unittest

from backend.hardware_checkpoint_preview import (
    preview_hardware_edit, HardwareEditConflict,
)


def hardware():
    return [
        {"id": "2080", "name": "RTX 2080 PC", "cost": 500, "power": 0,
         "startMonth": "2026-11", "earningsStartDay": "2026-11-01",
         "sources": ["Kryptex"], "source": "Kryptex",
         "checkpoint": {"time": 1794000000000, "month": "2026-11",
                        "baseline": 1.5, "carried": 13.42, "ledger": "kryptex-confirmed-v2"}},
        {"id": "5080", "name": "RTX 5080", "cost": 1950, "power": 0,
         "startMonth": "2026-11", "earningsStartDay": "2026-11-13",
         "sources": ["Kryptex", "Salad"], "source": "Kryptex",
         "checkpoint": {"time": 1794500000000, "month": "2026-11",
                        "baseline": 23.5, "carried": 0.0273789}},
    ]


def preview(saved, expected, proposed):
    return preview_hardware_edit(
        saved, expected, proposed,
        "2026-11-15", "2026-11-15T12:00:00+00:00",
    )


class HardwareCheckpointPreviewTests(unittest.TestCase):
    def test_rename_preserves_both_historical_checkpoints_and_source_data(self):
        saved = hardware()
        prior = copy.deepcopy(saved)
        proposed = copy.deepcopy(saved)
        proposed[1]["name"] = "ASUS RTX 5080"
        result = preview(saved, prior, proposed)
        self.assertTrue(result["complete"])
        self.assertEqual(result["sourceOfCalculation"],
                         "backend-hardware-checkpoint-preview-v1")
        self.assertFalse(result["checkpointWrites"])
        self.assertFalse(result["financialLedgerMutated"])
        self.assertEqual(result["devices"][0], saved[0])
        self.assertEqual(result["devices"][1]["checkpoint"], saved[1]["checkpoint"])
        self.assertEqual(result["devices"][1]["name"], "ASUS RTX 5080")
        self.assertEqual(saved, prior)

    def test_new_device_starts_without_invented_credit(self):
        saved = hardware()
        new = {
            "id": "new", "name": "New GPU", "cost": 250, "power": 0,
            "startMonth": "2026-11", "earningsStartDay": "2026-11-15",
            "sources": ["Salad"], "checkpoint": {"carried": 99999, "baseline": 500},
        }
        result = preview(saved, copy.deepcopy(saved), saved + [new])
        checkpoint = result["devices"][2]["checkpoint"]
        self.assertEqual(checkpoint["carried"], 0)
        self.assertEqual(checkpoint["baseline"], 0)
        self.assertEqual(checkpoint["allocationMode"], "backend-start-day-v1")
        self.assertEqual(result["devices"][:2], saved)

    def test_source_switch_preserves_prior_credit_with_tomorrow_effective_day(self):
        saved = hardware()
        proposed = copy.deepcopy(saved)
        proposed[1]["sources"] = ["Salad"]
        result = preview(saved, copy.deepcopy(saved), proposed)
        row = result["devices"][1]
        self.assertEqual(row["checkpoint"], saved[1]["checkpoint"])
        self.assertEqual(row["sources"], ["Salad"])
        self.assertEqual(row["sourceSegments"], [
            {"startDay": "2026-11-13", "endDay": "2026-11-15",
             "sources": ["kryptex", "salad"]},
            {"startDay": "2026-11-16", "sources": ["salad"]},
        ])
        self.assertEqual(saved, hardware())

    def test_repeated_same_day_switch_replaces_future_assignment(self):
        saved = hardware()
        proposed = copy.deepcopy(saved)
        proposed[1]["sources"] = ["Salad"]
        first = preview(saved, copy.deepcopy(saved), proposed)["devices"]
        second = copy.deepcopy(first)
        second[1]["sources"] = ["RollerCoin"]
        reviewed = preview(first, copy.deepcopy(first), second)
        segments = reviewed["devices"][1]["sourceSegments"]
        self.assertEqual(len(segments), 2)
        self.assertEqual(segments[1]["sources"], ["rollercoin"])
        self.assertEqual(segments[0]["endDay"], "2026-11-15")
        self.assertEqual(reviewed["devices"][1]["checkpoint"],
                         saved[1]["checkpoint"])

    def test_stale_browser_copy_fails_closed(self):
        saved = hardware()
        stale = copy.deepcopy(saved)
        stale[1]["checkpoint"]["carried"] = 999
        with self.assertRaisesRegex(HardwareEditConflict, "reload"):
            preview(saved, stale, saved)

    def test_remove_does_not_rebase_remaining_device(self):
        saved = hardware()
        result = preview(saved, copy.deepcopy(saved), [copy.deepcopy(saved[0])])
        self.assertEqual(result["devices"], [saved[0]])

    def test_unknown_start_of_old_untouched_device_is_preserved(self):
        saved = hardware()
        saved[0]["earningsStartDay"] = None
        edited = copy.deepcopy(saved)
        edited[1]["name"] = "Edited"
        result = preview(saved, copy.deepcopy(saved), edited)
        self.assertIsNone(result["devices"][0]["earningsStartDay"])
        self.assertEqual(result["devices"][0]["checkpoint"], saved[0]["checkpoint"])

    def test_legacy_missing_start_allows_cosmetic_edit_only(self):
        saved = hardware()
        saved[0]["earningsStartDay"] = None
        proposed = copy.deepcopy(saved)
        proposed[0]["name"] = "Renamed legacy RTX 2080"
        result = preview(saved, copy.deepcopy(saved), proposed)
        self.assertIsNone(result["devices"][0]["earningsStartDay"])
        self.assertEqual(result["devices"][0]["checkpoint"], saved[0]["checkpoint"])
        proposed[0]["sources"] = ["Salad"]
        with self.assertRaisesRegex(HardwareEditConflict, "Source-switch history"):
            preview(saved, copy.deepcopy(saved), proposed)

    def test_source_order_change_does_not_rewrite_checkpoint(self):
        saved = hardware()
        proposed = copy.deepcopy(saved)
        proposed[1]["sources"] = ["Salad", "Kryptex"]
        result = preview(saved, copy.deepcopy(saved), proposed)
        self.assertEqual(result["devices"][1]["checkpoint"], saved[1]["checkpoint"])

    def test_invalid_new_hardware_and_duplicate_ids_rejected(self):
        saved = hardware()
        repeated = copy.deepcopy(saved) + [copy.deepcopy(saved[0])]
        with self.assertRaisesRegex(ValueError, "duplicate"):
            preview(saved, copy.deepcopy(saved), repeated)
        proposed = copy.deepcopy(saved) + [{
            "id": "bad", "cost": 100, "power": 0,
            "startMonth": "2026-11", "earningsStartDay": "2026-10-01",
            "sources": ["Kryptex"],
        }]
        with self.assertRaisesRegex(ValueError, "after the purchase"):
            preview(saved, copy.deepcopy(saved), proposed)


if __name__ == "__main__":
    unittest.main()
