"""The unified earnings response includes immutable server-booked month history."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from backend.routers import project_tracking


class _Rows:
    def all(self):
        return []


class _Session:
    def scalars(self, _query):
        return _Rows()


class UnifiedEarningsDashboardTests(unittest.IsolatedAsyncioTestCase):
    async def test_dashboard_embeds_same_source_owned_history_used_by_financials(self):
        history = {
            "sourceOfCalculation": "backend-persisted-income-history",
            "currentMonth": "2026-11",
            "months": [
                {"monthKey": "2026-09", "total": 10.5, "sources": {"Kryptex": 10.5}},
                {"monthKey": "2026-10", "total": 8.25, "sources": {"Salad": 8.25}},
            ],
        }
        daily = {"sourceOfCalculation": "backend-postgres",
                 "month": "2026-11", "monthTotalUsd": 3.0}
        user = SimpleNamespace(id=47)
        db = _Session()
        with patch.object(project_tracking, "setting", return_value=None), \
             patch.object(project_tracking, "build_backend_earnings_dashboard",
                          return_value=daily), \
             patch.object(project_tracking, "source_owned_income_history",
                          new_callable=AsyncMock, return_value=history) as source:
            result = await project_tracking.earnings_dashboard("2026-11", user, db)
        self.assertEqual(result["incomeHistory"], history)
        self.assertEqual(result["monthTotalUsd"], 3.0)
        source.assert_awaited_once_with(user=user, db=db)


if __name__ == "__main__":
    unittest.main()
