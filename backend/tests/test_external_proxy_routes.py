"""Regression guards for the non–Phase-7 external data proxies."""
import asyncio
import io
import unittest
from unittest.mock import patch

from urllib.request import Request as UrlRequest

from backend.server import jupiter_fluid_pnl, kryptex_status


class _Response:
    def __enter__(self):
        return self
    def __exit__(self, *_args):
        return False
    def read(self, _size=-1):
        return b'{"pnl":12.5}'


class ExternalProxyTests(unittest.TestCase):
    def test_jupiter_fluid_pnl_creates_outbound_urllib_request(self):
        # Previously the FastAPI Request type shadowed urllib.Request and
        # constructing the outbound request would fail before any network I/O.
        with patch("backend.server.urlopen", return_value=_Response()) as fetch:
            data = asyncio.run(jupiter_fluid_pnl(42, 9))
        self.assertEqual(data, {"pnl": 12.5})
        request = fetch.call_args.args[0]
        self.assertIsInstance(request, UrlRequest)
        self.assertEqual(
            request.full_url,
            "https://api.solana.fluid.io/v2/main/borrowing/vaults/42/nfts/9/pnl",
        )
        self.assertEqual(fetch.call_args.kwargs["timeout"], 10)

    def test_local_kryptex_probes_are_offloaded_without_shape_changes(self):
        with patch("backend.server.read_kryptex", side_effect=lambda endpoint: {"path": endpoint}) as read:
            result = asyncio.run(kryptex_status())
        self.assertEqual(result, {
            "balance": {"path": "balance"},
            "devices": {"path": "devices"},
            "currency_rates": {"path": "currency-rates"},
        })
        self.assertEqual(read.call_count, 3)


if __name__ == "__main__":
    unittest.main()
