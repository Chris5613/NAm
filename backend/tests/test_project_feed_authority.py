"""Concurrent source updates must not overwrite the backend portfolio summary."""
import asyncio
from datetime import datetime, timedelta, timezone
import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session

from backend.models import User, Setting
from backend.routers.project_tracking import receive_latest


@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"


class ProjectFeedAuthorityTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        User.__table__.create(self.engine)
        Setting.__table__.create(self.engine)
        self.db = Session(self.engine)
        self.user = User(id=1, username="portfolio-test", password_hash="unused")
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def save(self, rows):
        return asyncio.run(receive_latest({"projects": rows}, self.user, self.db))

    def summary(self):
        row = self.db.scalar(select(Setting).where(
            Setting.user_id == self.user.id,
            Setting.key == "project_income_portfolio_summary_v1"))
        return row.value if row else None

    def test_backend_sums_unique_feeds_and_preserves_inactive_assets(self):
        at = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
        self.db.add(Setting(user_id=1,key="project_income_unetwork_tracker_v1",
                            value={"currentBalance":44.90,"lastSyncedAt":at}))
        self.db.commit()
        result = self.save([
            {"id":"lulo-project-1","name":"Lulo","balanceUsd":1500.64,
             "sourceLastSyncedAt":at,"inactive":True,"requiresLiveSync":True},
            {"id":"unetwork-project","name":"Unetwork","balanceUsd":44.90,
             "sourceLastSyncedAt":at,"inactive":False,"requiresLiveSync":True},
        ])
        self.assertTrue(result["portfolio"]["complete"])
        self.assertAlmostEqual(result["portfolio"]["totalUsd"],1545.54)
        self.assertAlmostEqual(self.summary()["portfolioBalance"],1545.54)
        self.assertAlmostEqual(self.summary()["activePortfolioBalance"],44.90)
        self.assertEqual(self.summary()["activePositions"],1)
        self.assertEqual(self.summary()["source"],"backend-project-feed")
        self.assertNotIn("lulo-project-1",result["staleProjects"])

    def test_older_tab_cannot_overwrite_newer_same_provider_amount(self):
        now = datetime.now(timezone.utc)
        recent = (now - timedelta(minutes=1)).isoformat()
        old = (now - timedelta(minutes=4)).isoformat()
        self.db.add(Setting(user_id=1,key="project_income_kryptex_tracker_v1",
                            value={"currentBalance":259.34,"lastSyncedAt":recent}))
        self.db.commit()
        self.save([{"id":"kryptex-project","name":"Kryptex",
                    "balanceUsd":259.34,"sourceLastSyncedAt":recent,
                    "requiresLiveSync":True}])
        self.save([{"id":"kryptex-project","name":"Kryptex",
                    "balanceUsd":111.00,"sourceLastSyncedAt":old,
                    "requiresLiveSync":True}])
        self.assertAlmostEqual(self.summary()["portfolioBalance"],259.34)
        # Even a same-timestamp stale tab must not rewrite a balance.
        self.save([{"id":"kryptex-project","name":"Kryptex",
                    "balanceUsd":100.00,"sourceLastSyncedAt":recent,
                    "requiresLiveSync":True}])
        self.assertAlmostEqual(self.summary()["portfolioBalance"],259.34)

    def test_rollercoin_price_update_is_not_extra_income(self):
        recent = (datetime.now(timezone.utc)-timedelta(minutes=1)).isoformat()
        self.db.add(Setting(user_id=1,key="project_income_rollercoin_tracker_v2",
                            value={"currentTrxBalance":60,"lastTrxPrice":0.3,
                                   "balanceSyncedAt":recent}))
        self.db.commit()
        self.save([{"id":"rollercoin-project","name":"RollerCoin",
                    "balanceUsd":18.0,"balanceTrx":60,"trxUsdPrice":0.3,
                    "sourceLastSyncedAt":recent,"requiresLiveSync":True}])
        stored = self.db.scalar(select(Setting).where(
            Setting.user_id == 1,
            Setting.key == "project_income_rollercoin_tracker_v2"))
        stored.value = {**stored.value, "lastTrxPrice": 0.31}
        self.db.commit()
        self.save([{"id":"rollercoin-project","name":"RollerCoin",
                    "balanceUsd":500.0,"balanceTrx":60,"trxUsdPrice":0.31,
                    "sourceLastSyncedAt":recent,"requiresLiveSync":True}])
        self.assertAlmostEqual(self.summary()["portfolioBalance"],18.6)

    def test_browser_spoofed_provider_balance_uses_saved_tracker(self):
        synced = (datetime.now(timezone.utc)-timedelta(seconds=30)).isoformat()
        self.db.add(Setting(user_id=1,key="project_income_kryptex_tracker_v1",
                            value={"currentBalance":264.09,"lastSyncedAt":synced}))
        self.db.commit()
        result=self.save([{"id":"kryptex-project","name":"Kryptex",
                          "balanceUsd":9999999,"sourceLastSyncedAt":synced}])
        self.assertAlmostEqual(result["portfolio"]["totalUsd"],264.09)
        self.assertAlmostEqual(self.summary()["portfolioBalance"],264.09)

    def test_invalid_feed_does_not_replace_saved_summary_with_zero(self):
        self.save([{"id":"manual-project","name":"Manual",
                    "balanceUsd":5.0,"requiresLiveSync":False}])
        self.save([{"id":"missing-project","name":"Unknown","balanceUsd":-1000}])
        self.assertAlmostEqual(self.summary()["portfolioBalance"],5.0)


if __name__ == "__main__":
    unittest.main()
