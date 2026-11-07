"""Tests for spending amount and date validation."""
import unittest
from decimal import Decimal
from fastapi import HTTPException
from backend.input_validation import finite_money, iso_day, money_decimal
class InputValidationTests(unittest.TestCase):
    def test_reject_invalid_values(self):
        for v in (float("nan"), float("inf"), "NaN", "Infinity", "garbage", {}, True, "1e100"):
            with self.subTest(v=v), self.assertRaises(HTTPException) as caught:
                finite_money(v)
            self.assertEqual(caught.exception.status_code, 422)
    def test_exact_decimal_precision(self):
        self.assertEqual(money_decimal("12.123456"), Decimal("12.123456"))
        with self.assertRaises(HTTPException) as caught:
            money_decimal("12.1234567")
        self.assertEqual(caught.exception.status_code, 422)

    def test_dates_and_signed_amounts(self):
        self.assertEqual(finite_money("-12.34"), -12.34)
        self.assertEqual(iso_day("2026-10-30"), "2026-10-30")
        self.assertEqual(iso_day("2026-10-30T19:23:12Z"), "2026-10-30")
        for value in ("2026-02-30", "10/30/2026", "", None, "2026-10-30junk"):
            with self.subTest(value=value), self.assertRaises(HTTPException):
                iso_day(value)
if __name__ == "__main__": unittest.main()
