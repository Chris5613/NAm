"""Market GET requests are bounded and coalesced."""
import asyncio
import time
import unittest
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

    def test_removed_mlb_route_is_not_registered(self):
        self.assertFalse(any(
            getattr(route, "path", "") == "/api/market/mlb/{path:path}"
            for route in market.router.routes
        ))
        self.assertNotIn("mlb", market._provider_config())

    def test_cache_is_bounded(self):
        for i in range(market.CACHE_MAX_ENTRIES + 30):
            market.cache_result(str(i), i)
        self.assertEqual(len(market._cache), market.CACHE_MAX_ENTRIES)


if __name__ == "__main__":
    unittest.main()
