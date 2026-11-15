"""Provider freshness must match source cadence; never fabricate a zero balance."""
from datetime import datetime, timezone
import unittest

from backend.project_freshness import is_project_stale
from backend.routers.project_tracking import validate_item


def instant(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


class ProjectFreshnessTests(unittest.TestCase):
    def test_inactive_lulo_does_not_alarm_or_delete_its_value(self):
        row = {
            "id": "lulo-project-1", "name": "Lulo", "inactive": True,
            "requiresLiveSync": True, "sourceLastSyncedAt": "2026-11-11T04:00:00Z",
            "balanceUsd": 1500.64,
        }
        now = instant("2026-11-15T04:00:00Z")
        self.assertFalse(is_project_stale(row, now))
        normalized = validate_item(row, None, now)
        self.assertFalse(normalized["stale"])
        self.assertEqual(normalized["balanceUsd"], 1500.64)
        self.assertTrue(normalized["inactive"])

    def test_unetwork_daily_update_is_fresh_longer_than_twenty_minutes(self):
        row = {
            "id": "unetwork-project", "name": "unetwork", "requiresLiveSync": True,
            "sourceLastSyncedAt": "2026-11-15T01:17:25Z",
        }  # Nov 14, 17:17 Pacific
        self.assertFalse(is_project_stale(row, instant("2026-11-15T03:30:00Z")))
        self.assertFalse(is_project_stale(row, instant("2026-11-15T17:00:00Z")))
        self.assertFalse(is_project_stale(row, instant("2026-11-16T02:29:00Z")))
        self.assertTrue(is_project_stale(row, instant("2026-11-16T02:31:00Z")))

    def test_unetwork_new_update_resets_daily_cutoff(self):
        row = {
            "id": "unetwork-project", "name": "Unity Network", "requiresLiveSync": True,
            "sourceLastSyncedAt": "2026-11-16T01:12:00Z",
        }
        self.assertFalse(is_project_stale(row, instant("2026-11-16T02:31:00Z")))
        self.assertFalse(is_project_stale(row, instant("2026-11-16T18:00:00Z")))

    def test_pacific_daylight_savings_time(self):
        row = {
            "id": "unetwork-project", "name": "Unetwork", "requiresLiveSync": True,
            "sourceLastSyncedAt": "2026-07-15T00:05:00Z",
        }  # July 14, 17:05 PDT
        self.assertFalse(is_project_stale(row, instant("2026-07-15T19:00:00Z")))
        self.assertTrue(is_project_stale(row, instant("2026-07-16T01:31:00Z")))

    def test_active_continuous_feed_stays_on_20_minute_limit(self):
        row = {
            "id": "rollercoin-project", "name": "rollercoin", "requiresLiveSync": True,
            "sourceLastSyncedAt": "2026-11-15T03:00:00Z",
        }
        self.assertFalse(is_project_stale(row, instant("2026-11-15T03:19:00Z")))
        self.assertTrue(is_project_stale(row, instant("2026-11-15T03:21:00Z")))

    def test_missing_unetwork_reading_is_overdue(self):
        row = {"name": "Unetwork", "requiresLiveSync": True, "inactive": False}
        self.assertTrue(is_project_stale(row, instant("2026-11-15T03:00:00Z")))
        row["inactive"] = True
        self.assertFalse(is_project_stale(row, instant("2026-11-15T03:00:00Z")))


if __name__ == "__main__":
    unittest.main()
