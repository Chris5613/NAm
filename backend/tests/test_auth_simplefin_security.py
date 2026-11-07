"""Authentication and SimpleFIN URL security regressions."""
import asyncio
import os
import unittest
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException, Request, Response
from backend.routers.auth_routes import PasswordReset, SetupCredentials, reset_password, setup
from backend.routers.simplefin_routes import (
    get_simplefin_account_balance,
    normalize_access_url,
    normalize_transaction_date,
    user_scoped_provider_id,
    validate_bridge_url,
)

class SecurityHardeningTests(unittest.TestCase):
    def test_fixed_answer_reset_disabled(self):
        with self.assertRaises(HTTPException) as result:
            asyncio.run(reset_password(PasswordReset(username="test", security_answer="test", new_password="newpassword123")))
        self.assertEqual(result.exception.status_code, 410)


    def test_setup_requires_private_bootstrap_token(self):
        credentials = SetupCredentials(
            username="owner",
            password="long-enough-password",
            setup_token="wrong",
        )
        request = Request({"type": "http", "client": ("127.0.0.1", 1234), "headers": []})
        with patch.dict(os.environ, {"APP_SETUP_TOKEN": "correct"}, clear=False), \
             patch("backend.routers.auth_routes.check_request_rate"):
            with self.assertRaises(HTTPException) as result:
                asyncio.run(setup(credentials, Response(), request, SimpleNamespace()))
        self.assertEqual(result.exception.status_code, 403)

    def test_simplefin_money_and_dates_are_strict(self):
        balance = get_simplefin_account_balance({"balance": "12.340000"}, is_debt=True)
        self.assertEqual(balance, Decimal("12.340000"))
        self.assertIsNone(get_simplefin_account_balance({"balance": "NaN"}, is_debt=True))
        self.assertEqual(normalize_transaction_date("2026-11-07T12:30:00Z"), "2026-11-07")
        self.assertIsNone(normalize_transaction_date("not-a-real-date"))
        self.assertIsNone(normalize_transaction_date(0))

    def test_provider_ids_fall_back_to_user_scope_on_foreign_collision(self):
        class FakeDb:
            def get(self, model, row_id):
                if row_id == "simplefin-account":
                    return SimpleNamespace(user_id=99)
                return None

        self.assertEqual(
            user_scoped_provider_id(FakeDb(), object, "simplefin-account", 7),
            "simplefin-account-u7",
        )
        self.assertEqual(
            user_scoped_provider_id(FakeDb(), object, "simplefin-new", 7),
            "simplefin-new",
        )

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
