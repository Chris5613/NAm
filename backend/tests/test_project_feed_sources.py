"""Regression checks for provider accounts that once accepted browser totals."""
import unittest

from backend.project_feed_sources import from_tracker


class BackendProviderFeedTests(unittest.TestCase):
    def test_kryptex_tracker_not_fabricated_browser_amount(self):
        row = from_tracker(
            {"id":"kryptex-project","name":"Kryptex","balanceUsd":99999999},
            {"kryptex-project":{"currentBalance":264.09,
                                "lastSyncedAt":"2026-11-15T03:50:00Z"}})
        self.assertAlmostEqual(row["balanceUsd"],264.09)
        self.assertEqual(row["balanceSource"],"backend-provider-tracker")

    def test_unetwork_tracks_once_daily_update_timestamp(self):
        row = from_tracker({"id":"unetwork-project","balanceUsd":3000},
                           {"unetwork-project":{"currentBalance":44.90,
                           "lastSyncedAt":"2026-11-15T01:17:25Z"}})
        self.assertEqual(row["sourceLastSyncedAt"],"2026-11-15T01:17:25Z")
        self.assertAlmostEqual(row["balanceUsd"],44.9)

    def test_rollercoin_uses_current_trx_times_price_not_lifetime_earnings(self):
        row = from_tracker({"id":"rollercoin-project","balanceUsd":914.95},
                           {"rollercoin-project":{"currentTrxBalance":60,
                           "lastTrxPrice":.31,"balanceSyncedAt":"2026-11-15T03:50:00Z",
                           "daily":{"2026-11-14":{"usd":2000}}}})
        self.assertAlmostEqual(row["balanceUsd"],18.60)
        self.assertAlmostEqual(row["balanceTrx"],60)
        self.assertEqual(row["balanceSource"],"backend-provider-tracker")

    def test_missing_tracker_preserves_prior_instead_of_fabricating_zero(self):
        self.assertIsNone(from_tracker({"id":"salad-project","balanceUsd":0},{}))
        self.assertIsNone(from_tracker({"id":"kryptex-project","balanceUsd":500},
                       {"kryptex-project":{"currentBalance":None,"lastSyncedAt":None}}))

    def test_other_source_adapters_remain_unchanged_until_source_cutover(self):
        row={"id":"loopscale-project","balanceUsd":2050.5}
        self.assertIs(from_tracker(row,{}),row)
        self.assertIsNone(from_tracker({"id":"rollercoin-project","balanceUsd":50},
                {"rollercoin-project":{"currentTrxBalance":10,"lastTrxPrice":None}}))


if __name__ == "__main__":
    unittest.main()
