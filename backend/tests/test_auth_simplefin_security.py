"""Authentication and SimpleFIN URL security regressions."""
import asyncio
import unittest
from fastapi import HTTPException
from backend.routers.auth_routes import PasswordReset, reset_password
from backend.routers.simplefin_routes import validate_bridge_url, normalize_access_url

class SecurityHardeningTests(unittest.TestCase):
    def test_fixed_answer_reset_disabled(self):
        with self.assertRaises(HTTPException) as result:
            asyncio.run(reset_password(PasswordReset(username="test", security_answer="test", new_password="newpassword123")))
        self.assertEqual(result.exception.status_code, 410)

    def test_simplefin_claim_restricts_host_and_path(self):
        for url in ("https://bridge.simplefin.org/simplefin/claim/demo", "https://beta-bridge.simplefin.org/simplefin/claim/demo"):
            self.assertEqual(validate_bridge_url(url, claim=True), url)
        for url in ("https://127.0.0.1/simplefin/claim/demo", "https://bridge.simplefin.org.evil.test/simplefin/claim/demo", "https://bridge.simplefin.org@127.0.0.1/simplefin/claim/demo", "https://bridge.simplefin.org:444/simplefin/claim/demo", "https://bridge.simplefin.org/admin", "http://bridge.simplefin.org/simplefin/claim/demo", "https://bridge.simplefin.org/simplefin/claim/demo#fragment"):
            with self.subTest(url=url), self.assertRaises(HTTPException):
                validate_bridge_url(url, claim=True)

    def test_stored_access_url_approved_host(self):
        normalized, credentials = normalize_access_url("https://user:pass@bridge.simplefin.org/simplefin")
        self.assertNotIn("pass", normalized)
        self.assertTrue(normalized.split("?")[0].endswith("/simplefin/accounts"))
        self.assertIsNotNone(credentials)
        with self.assertRaises(HTTPException):
            normalize_access_url("https://user:pass@127.0.0.1/simplefin")

if __name__ == "__main__":
    unittest.main()
