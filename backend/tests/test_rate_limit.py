"""Sensitive endpoint rate limiting is bounded and self-expiring."""
import unittest
from fastapi import HTTPException
from backend.rate_limit import check_request_rate

class RateLimitTests(unittest.TestCase):
    def test_login_window_and_retry_after(self):
        for i in range(3):
            check_request_rate("unit-test", "unique-test-user", max_attempts=3, seconds=60, now=float(i))
        with self.assertRaises(HTTPException) as problem:
            check_request_rate("unit-test", "unique-test-user", max_attempts=3, seconds=60, now=3)
        self.assertEqual(problem.exception.status_code, 429)
        self.assertIn("Retry-After", problem.exception.headers)
        check_request_rate("unit-test", "unique-test-user", max_attempts=3, seconds=60, now=80)
    def test_identities_do_not_overlap(self):
        check_request_rate("unit-test-2", "one", max_attempts=1, seconds=60, now=0)
        check_request_rate("unit-test-2", "two", max_attempts=1, seconds=60, now=0)
if __name__ == "__main__": unittest.main()
