"""POST results must not be reused for a different request body."""
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.routers import market


class MarketCacheTests(unittest.TestCase):
    def tearDown(self):
        market._cache.clear()

    def test_post_bodies_are_never_cached_for_market_or_mlb(self):
        for endpoint, args in ((market.proxy, ("solana", "rpc")),
                               (market.public_mlb_proxy, ("schedule",))):
            with self.subTest(endpoint=endpoint.__name__), patch.object(market, "_fetch", side_effect=lambda url, headers, body: body.decode()):
                market._cache.clear()
                for body in (b'{"id":1}', b'{"id":2}'):
                    request = SimpleNamespace(method="POST", query_params={})
                    request.body = lambda value=body: asyncio.sleep(0, result=value)
                    result = asyncio.run(endpoint(*args, request=request, **({"user": SimpleNamespace(id=1)} if endpoint is market.proxy else {})))
                    self.assertEqual(result, body.decode())
                self.assertEqual(market._cache, {})

    def test_cache_is_bounded(self):
        market._cache.clear()
        for i in range(market.CACHE_MAX_ENTRIES + 30):
            market.cache_result(str(i), i)
        self.assertEqual(len(market._cache), market.CACHE_MAX_ENTRIES)
