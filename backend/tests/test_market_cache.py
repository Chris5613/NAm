"""Market GETs are bounded, coalesced, and MLB is read-only."""
import asyncio
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.routers import market


class MarketCacheTests(unittest.TestCase):
    def tearDown(self):
        market._cache.clear()
        market._inflight_gets.clear()

    def test_identical_gets_share_one_upstream_request(self):
        calls = 0

        def slow_fetch(url, headers, body=None):
            nonlocal calls
            calls += 1
            time.sleep(0.05)
            return {"ok": True}

        async def run():
            with patch.object(market, "_fetch", side_effect=slow_fetch):
                return await asyncio.gather(
                    market.cached_get("same", "https://example.test/value", {}),
                    market.cached_get("same", "https://example.test/value", {}),
                    market.cached_get("same", "https://example.test/value", {}),
                )

        results = asyncio.run(run())
        self.assertEqual(results, [{"ok": True}] * 3)
        self.assertEqual(calls, 1)
        self.assertIn("same", market._cache)
        self.assertNotIn("same", market._inflight_gets)

    def test_mlb_route_is_get_only_and_requires_auth_dependency(self):
        route = next(
            row for row in market.router.routes
            if getattr(row, "path", "") == "/api/market/mlb/{path:path}"
        )
        self.assertEqual(route.methods, {"GET"})
        dependency_names = {
            getattr(dep.call, "__name__", "")
            for dep in route.dependant.dependencies
        }
        self.assertIn("current_user", dependency_names)

    def test_mlb_get_uses_cache(self):
        request = SimpleNamespace(method="GET", query_params={})
        user = SimpleNamespace(id=1)
        with patch.object(market, "_fetch", return_value={"dates": []}) as fetch:
            first = asyncio.run(market.public_mlb_proxy("schedule", request=request, user=user))
            second = asyncio.run(market.public_mlb_proxy("schedule", request=request, user=user))
        self.assertEqual(first, {"dates": []})
        self.assertEqual(second, {"dates": []})
        self.assertEqual(fetch.call_count, 1)

    def test_cache_is_bounded(self):
        for i in range(market.CACHE_MAX_ENTRIES + 30):
            market.cache_result(str(i), i)
        self.assertEqual(len(market._cache), market.CACHE_MAX_ENTRIES)


if __name__ == "__main__":
    unittest.main()
