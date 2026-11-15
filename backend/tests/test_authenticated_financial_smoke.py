"""Authenticated HTTP smoke tests on disposable PostgreSQL; never production.

Requires NAM_AUTH_SMOKE=1, DATABASE_URL, SESSION_SECRET, httpx, and migrated
CI PostgreSQL. Real signed session cookies, write-origin checks and user-
scoped routes are exercised without starting scheduler/background tasks.
"""
import os
import unittest
import uuid
from unittest.mock import AsyncMock, patch

@unittest.skipUnless(os.getenv("NAM_AUTH_SMOKE") == "1",
                     "Requires disposable authenticated CI PostgreSQL")
class AuthenticatedFinancialSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from backend.server import app
        from backend.db import SessionLocal
        from backend.auth import hash_password
        from backend.models import Setting, User

        cls.client = TestClient(app, base_url="http://localhost:8001")
        cls.username = "nam_smoke_" + uuid.uuid4().hex[:12]
        cls.password = "disposable-ci-smoke-password-only"
        with SessionLocal() as db:
            cls.user = User(username=cls.username,
                            password_hash=hash_password(cls.password))
            db.add(cls.user)
            db.flush()
            cls.user_id = cls.user.id
            saved = {
                "financials_bank_openings_v1": {"2026-11": 0},
                "financials_month_closes_v1": {},
                "financials_journal_v1": [],
                "monthly_business_changes_v1": {
                    "2026-10": {
                        "locked": True,
                        "items": [{"name": "Test balance", "start": 0,
                                   "end": 1, "estimated": True}],
                    },
                    "2026-11": {"items": []},
                },
                "yield_monthly_snapshots_v1": {
                    "2026-10": {
                        "locked": True, "total": 1,
                        "platforms": [{"platform": "Kryptex", "amount": 1}],
                    },
                    "2026-11": {
                        "locked": False, "total": 0.02737941,
                        "platforms": [{"platform": "Salad",
                                       "amount": 0.02737941}],
                    },
                },
                "hardware_payback_devices_v1": [{
                    "id": "smoke-5080", "name": "RTX 5080 Smoke",
                    "cost": 1250, "power": 0,
                    "startMonth": "2026-11",
                    "earningsStartDay": "2026-11-13",
                    "sources": ["Salad"],
                }],
                "project_income_salad_tracker_v1": {"daily": {}},
                "yield_server_daily_income_2026-11-13": {
                    "sources": {"Salad": 0.02737941}},
                "yield_project_latest_balance_feed_v1": {
                    "receivedAt": "2026-11-15T12:00:00Z",
                    "projects": [{"id": "salad", "name": "Salad",
                                  "balanceUsd": 1, "inactive": False}],
                },
                "project_income_portfolio_summary_v1": {
                    "source": "backend-project-feed",
                    "portfolioBalance": 1,
                    "activePortfolioBalance": 1,
                },
                "financials_unetwork_business_phones_v1": [],
            }
            db.add_all([
                Setting(user_id=cls.user_id, key=k, value=v)
                for k, v in saved.items()
            ])
            db.commit()
        cls.headers = {"origin": "http://localhost:3000"}

    @classmethod
    def tearDownClass(cls):
        from backend.db import SessionLocal
        from backend.models import User, Setting
        from sqlalchemy import delete
        if hasattr(cls, "user_id"):
            with SessionLocal() as db:
                db.execute(delete(Setting).where(Setting.user_id == cls.user_id))
                db.execute(delete(User).where(User.id == cls.user_id))
                db.commit()
        cls.client.close()

    def test_01_requires_real_authenticated_session(self):
        self.assertEqual(self.client.get(
            "/api/project-tracking/hardware-payback-lifetime").status_code, 401)
        self.assertEqual(self.client.get(
            "/api/project-tracking/cross-page-integrity").status_code, 401)
        self.assertEqual(self.client.post(
            "/api/project-tracking/financial-core/current-ledger",
            headers=self.headers,
            json={"month": "2026-11", "baseRows": [],
                  "journalPreview": []}).status_code, 401)

    def test_02_login_and_read_only_pages(self):
        response = self.client.post("/api/auth/login", headers=self.headers,
                                    json={"username": self.username,
                                          "password": self.password})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("nam_session", response.cookies)
        me = self.client.get("/api/auth/me")
        self.assertEqual(me.status_code, 200, me.text)
        self.assertEqual(me.json()["username"], self.username)

        readiness = self.client.get(
            "/api/project-tracking/financial-core/close-readiness/2026-10")
        self.assertEqual(readiness.status_code, 200, readiness.text)
        self.assertEqual(readiness.json()["status"], "protected-uncertified")
        self.assertFalse(readiness.json()["certifiedClosePresent"])

        device = self.client.get(
            "/api/project-tracking/hardware-payback-lifetime")
        self.assertEqual(device.status_code, 200, device.text)
        self.assertEqual(device.json()["devices"][0]["id"], "smoke-5080")
        self.assertTrue(device.json()["mathReconciles"])
        self.assertEqual(device.json()["devices"][0]["checkpointAppliedToRevenue"],
                         False)
        self.assertAlmostEqual(
            device.json()["devices"][0]["verifiedRewardSubtotalUsd"],
            0.02737941)

        edited = self.client.post(
            "/api/project-tracking/hardware-payback/checkpoint-preview",
            headers=self.headers, json={
                "expectedDevices": [{
                    "id": "smoke-5080", "name": "RTX 5080 Smoke",
                    "cost": 1250, "power": 0,
                    "startMonth": "2026-11",
                    "earningsStartDay": "2026-11-13",
                    "sources": ["Salad"],
                }],
                "proposedDevices": [{
                    "id": "smoke-5080", "name": "RTX 5080 Renamed",
                    "cost": 1250, "power": 0,
                    "startMonth": "2026-11",
                    "earningsStartDay": "2026-11-13",
                    "sources": ["Salad"],
                }],
            })
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["devices"][0]["name"],
                         "RTX 5080 Renamed")
        self.assertFalse(edited.json()["financialLedgerMutated"])

        ledger = self.client.post(
            "/api/project-tracking/financial-core/current-ledger",
            headers=self.headers, json={
                "month": "2026-11", "baseRows": [],
                "journalPreview": [], "autoPower": 0,
            })
        self.assertEqual(ledger.status_code, 200, ledger.text)
        self.assertEqual(ledger.json()["sourceOfCalculation"],
                         "backend-current-financial-ledger-v1")
        self.assertFalse(ledger.json()["financialLedgerMutated"])

        balance = self.client.post(
            "/api/project-tracking/financial-core/evaluate",
            headers=self.headers, json={
                "month": "2026-11", "entries": ledger.json()["entries"],
                "rows": [], "devices": [], "savedExpenses": None,
                "cashOpening": 9999999, "payableOpening": 9999999,
            })
        self.assertEqual(balance.status_code, 200, balance.text)
        self.assertEqual(balance.json()["sourceOfCalculation"],
                         "backend-financial-core")
        self.assertNotEqual(
            balance.json()["business"].get("bankCashValue"), 9999999)

        from backend import routers
        with patch.object(routers.project_tracking, "bitcoin_valuation",
                          new_callable=AsyncMock) as valuation:
            valuation.return_value = {
                "bitcoin": {"valueUsd": 0}, "sourceOfCalculation": "test",
            }
            audit = self.client.get("/api/project-tracking/cross-page-integrity")
        self.assertEqual(audit.status_code, 200, audit.text)
        self.assertTrue(audit.json()["readOnly"])
        self.assertFalse(audit.json()["financialLedgerMutated"])
        self.assertIn("hardware-credit",
                      {row["code"] for row in audit.json()["checks"]})

    def test_03_locked_journal_write_fails_and_saved_data_is_unchanged(self):
        from backend.db import SessionLocal
        from backend.models import Setting
        from sqlalchemy import select
        with SessionLocal() as db:
            before = db.scalar(select(Setting).where(
                Setting.user_id == self.user_id,
                Setting.key == "financials_journal_v1")).value
        forbidden = [{
            "id": "no-edit-locked-month", "date": "2026-10-12",
            "debitAccount": "cash", "creditAccount": "equity",
            "amount": 100,
        }]
        response = self.client.patch(
            "/api/settings/financials_journal_v1",
            headers=self.headers, json={"before": before, "after": forbidden})
        self.assertEqual(response.status_code, 422, response.text)
        with SessionLocal() as db:
            after = db.scalar(select(Setting).where(
                Setting.user_id == self.user_id,
                Setting.key == "financials_journal_v1")).value
            hardware = db.scalar(select(Setting).where(
                Setting.user_id == self.user_id,
                Setting.key == "hardware_payback_devices_v1")).value
        self.assertEqual(before, after)
        self.assertEqual(hardware[0]["name"], "RTX 5080 Smoke")

if __name__ == "__main__":
    unittest.main()
