"""Unsafe request origins must be rejected, including Origin: null/missing."""
import os
import unittest
from unittest.mock import patch
from backend.server import valid_write_origin
from backend.auth import session_password_version

class BrowserWriteSecurityTests(unittest.TestCase):
    def test_write_origin_must_match_exactly(self):
        allowed={"https://nam-qyn8.onrender.com"}
        self.assertTrue(valid_write_origin("https://nam-qyn8.onrender.com", None, allowed))
        self.assertTrue(valid_write_origin(None, "https://nam-qyn8.onrender.com/spending", allowed))
        for origin in ("https://evil.test", "null", "https://nam-qyn8.onrender.com.evil.test", ""):
            with self.subTest(origin=origin):
                self.assertFalse(valid_write_origin(origin, None, allowed))
        self.assertFalse(valid_write_origin(None, None, allowed))
        self.assertFalse(valid_write_origin(None, "https://evil.test/anything", allowed))

    def test_password_rotation_revokes_old_signature(self):
        with patch.dict(os.environ, {"SESSION_SECRET": "test-only-key-do-not-use-in-production"}):
            a=session_password_version("old-argon2-hash")
            b=session_password_version("new-argon2-hash")
            self.assertNotEqual(a,b)
            self.assertEqual(a,session_password_version("old-argon2-hash"))

if __name__ == "__main__": unittest.main()
