"""Daily scheduler failures must remain retryable after bounded backoff."""
from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import patch

from backend import scheduler


class SchedulerRetryTests(unittest.TestCase):
    def setUp(self):
        self.original = (
            scheduler._last_daily_key,
            scheduler._last_daily_attempt,
        )
        scheduler._last_daily_key = None
        scheduler._last_daily_attempt = None

    def tearDown(self):
        scheduler._last_daily_key, scheduler._last_daily_attempt = self.original

    def test_failed_daily_snapshot_retries_after_five_minutes(self):
        first = datetime(2026, 11, 7, 8, 0, tzinfo=timezone.utc)
        day = "2026-11-07"

        with patch.object(
            scheduler,
            "take_daily_snapshots",
            side_effect=[RuntimeError("temporary db failure"), 1],
        ) as take, patch.object(scheduler.log, "exception") as logged:
            self.assertFalse(scheduler.run_daily_snapshot_attempt(first, day))
            self.assertIsNone(scheduler._last_daily_key)
            self.assertEqual(scheduler._last_daily_attempt, first)
            logged.assert_called_once()

            self.assertFalse(
                scheduler.run_daily_snapshot_attempt(first + timedelta(minutes=4), day)
            )
            self.assertEqual(take.call_count, 1)
            self.assertIsNone(scheduler._last_daily_key)

            self.assertTrue(
                scheduler.run_daily_snapshot_attempt(first + timedelta(minutes=5), day)
            )
            self.assertEqual(take.call_count, 2)
            self.assertEqual(scheduler._last_daily_key, day)

            self.assertFalse(
                scheduler.run_daily_snapshot_attempt(first + timedelta(minutes=10), day)
            )
            self.assertEqual(take.call_count, 2)


if __name__ == "__main__":
    unittest.main()
