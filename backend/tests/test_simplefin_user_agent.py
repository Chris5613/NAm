"""The SimpleFIN fetcher must identify NAm, not Python's urllib default."""
import io
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from fastapi import HTTPException
from backend.routers.simplefin_routes import fetch_simplefin


class FakeResponse:
    def __init__(self, body):
        self.body = io.BytesIO(body)
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self): return self.body.read()


class SimplefinUserAgentTests(unittest.TestCase):
    def test_account_request_has_explicit_descriptive_user_agent(self):
        with patch("backend.routers.simplefin_routes.urllib.request.build_opener") as factory:
            factory.return_value.open.return_value = FakeResponse(b'{"accounts":[]}')
            data = fetch_simplefin("https://testuser:testpass@bridge.simplefin.org/simplefin")
            self.assertEqual(data, {"accounts": []})
            sent_request = factory.return_value.open.call_args.args[0]
            self.assertTrue(sent_request.get_header("User-agent").startswith("NAm/"))
            self.assertNotIn("Python-urllib", sent_request.get_header("User-agent"))
            self.assertTrue(sent_request.get_header("Authorization").startswith("Basic "))

    def test_cloudflare_1010_is_reported_without_html_response(self):
        error_body = b'{"error_code":1010,"detail":"Error 1010: Access denied"}'
        with patch("backend.routers.simplefin_routes.urllib.request.build_opener") as factory:
            factory.return_value.open.side_effect = HTTPError(
                "https://bridge.simplefin.org/simplefin/accounts",
                403, "Forbidden", {}, io.BytesIO(error_body),
            )
            with self.assertRaises(HTTPException) as caught:
                fetch_simplefin("https://user:password@bridge.simplefin.org/simplefin")
            self.assertEqual(caught.exception.status_code, 502)
            self.assertIn("Cloudflare 1010", caught.exception.detail)
            self.assertNotIn("error_code", caught.exception.detail)


if __name__ == "__main__":
    unittest.main()
