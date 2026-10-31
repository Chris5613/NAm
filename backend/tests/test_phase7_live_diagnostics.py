"""Live verification is entirely read-only and fails closed."""
import json
import os
import unittest
from unittest.mock import patch
from datetime import datetime, timedelta, timezone

from tools import phase7_live_diagnostics as probe


class LiveDiagnosticTests(unittest.TestCase):
    def test_reject_insecure_remote_base_and_credentials_in_url(self):
        for value in ("http://example.com", "https://me:pass@example.com",
                      "https://example.com/admin", "https://example.com?token=x"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                probe.validate_base_url(value)
        self.assertEqual(probe.validate_base_url("https://example.com/"), "https://example.com")
        self.assertEqual(probe.validate_base_url("http://localhost:8000"), "http://localhost:8000")

    def test_same_timestamp_poll_is_not_progress(self):
        at = "2026-10-30T20:00:00Z"
        first = {"successfulAt": at, "lulo": {"secret-wallet": {"syncedAt": at}}}
        self.assertFalse(probe.assess_progress(first, first))
        self.assertFalse(probe.assess_progress(first, {
            "successfulAt": "2026-10-30T20:01:00Z", "lulo": first["lulo"]
        }))
        after = {"successfulAt": "2026-10-30T20:10:00Z", "lulo": {
            "secret-wallet": {"syncedAt": "2026-10-30T20:10:00Z"},
        }}
        self.assertTrue(probe.assess_progress(first, after))

    def test_secondary_wallet_advance_counts_even_if_another_is_newer(self):
        before = {"successfulAt": "2026-10-30T20:10:00Z", "lulo": {
            "wallet-a": {"syncedAt": "2026-10-30T20:10:00Z"},
            "wallet-b": {"syncedAt": "2026-10-30T20:00:00Z"},
        }}
        after = {"successfulAt": "2026-10-30T20:11:00Z", "lulo": {
            "wallet-a": {"syncedAt": "2026-10-30T20:10:00Z"},
            "wallet-b": {"syncedAt": "2026-10-30T20:05:00Z"},
        }}
        self.assertTrue(probe.assess_progress(before, after))

    def test_different_wallet_cannot_look_like_same_wallet_progress(self):
        before = {"successfulAt": "2026-10-30T20:00:00Z", "lulo": {
            "old": {"syncedAt": "2026-10-30T20:00:00Z"}}}
        after = {"successfulAt": "2026-10-30T20:05:00Z", "lulo": {
            "new": {"syncedAt": "2026-10-30T20:05:00Z"}}}
        self.assertFalse(probe.assess_progress(before, after))

    def test_never_posts_and_does_not_print_secrets(self):
        from backend.tests.test_phase7_readiness_check import status, backups
        start, end = "2026-10-30T20:00:00Z", "2026-10-30T20:10:00Z"
        def latest(at):
            return {"successfulAt": at, "lulo": {"wallet-should-not-print": {"syncedAt": at}}}
        answers = [
            {"/api/yield-sources/latest": latest(start),
             "/api/yield-sources/migration-status": status(),
             "/api/yield-sources/cutover-backups": backups()},
            {"/api/yield-sources/latest": latest(end),
             "/api/yield-sources/migration-status": status(),
             "/api/yield-sources/cutover-backups": backups()},
        ]
        from io import StringIO
        buf = StringIO()
        with patch.dict(os.environ, {"NAM_SESSION_COOKIE": "sensitive-secret"}), \
             patch.object(probe, "verify_once", side_effect=answers), \
             patch.object(probe.time, "sleep", return_value=None), \
             patch("sys.stdout", buf):
            result = probe.main(["--base-url", "https://example.com", "--interval-seconds", "1"])
        self.assertEqual(result, 0)
        self.assertNotIn("sensitive-secret", buf.getvalue())
        self.assertNotIn("wallet-should-not-print", buf.getvalue())
        self.assertEqual(json.loads(buf.getvalue())["financialWritesMayBeEnabled"], False)

    def test_authenticated_probe_rejects_redirect_without_following(self):
        import io
        from urllib.error import HTTPError
        class Redir:
            def __init__(self):
                self.url = "https://other.example/steal"
            def read(self, _):
                return b"{}"
        handler = probe._NoRedirect()
        self.assertIsNone(handler.redirect_request(None, None, 302, "redirect", {},
                                                   "https://other.example/steal"))
        # HTTPS client construction must use the no-redirect opener.
        with patch.object(probe, "build_opener") as factory:
            factory.return_value.open.return_value.__enter__.return_value.read.return_value = b'{}'
            probe.fetch_json("https://example.com", "/api/yield-sources/latest", "private-cookie")
            factory.assert_called_once_with(probe._NoRedirect)
            self.assertEqual(factory.return_value.open.call_args.args[0].get_method(), "GET")

    def test_only_explicit_readonly_endpoints(self):
        with self.assertRaises(ValueError):
            probe.fetch_json("https://example.com", "/api/resources/projects", "private-cookie")


if __name__ == "__main__":
    unittest.main()
