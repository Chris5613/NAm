"""Typed Spending API input validation regression tests."""
import unittest
from decimal import Decimal

from pydantic import ValidationError

from backend.routers.spending import (
    SpendingAccountInput,
    SpendingBudgetInput,
    SpendingTransactionInput,
    SpendingTransactionPatch,
)


class SpendingSchemaTests(unittest.TestCase):
    def test_transaction_keeps_exact_six_decimal_amount(self):
        payload = SpendingTransactionInput(
            amount="12.123456",
            date="2026-11-06T19:30:00Z",
            merchant="Test",
        )
        self.assertEqual(payload.amount, Decimal("12.123456"))
        self.assertEqual(payload.date, "2026-11-06")

    def test_more_than_six_decimal_places_is_rejected(self):
        with self.assertRaises(ValidationError):
            SpendingTransactionInput(
                amount="1.1234567",
                date="2026-11-06",
            )

    def test_invalid_dates_are_rejected_at_schema_boundary(self):
        with self.assertRaises(ValidationError):
            SpendingTransactionInput(amount="1.00", date="2026-02-30")

    def test_account_and_budget_use_decimal_values(self):
        account = SpendingAccountInput(currentBalance="-42.10")
        budget = SpendingBudgetInput(budget="500.25")
        self.assertEqual(account.currentBalance, Decimal("-42.100000"))
        self.assertEqual(budget.budget, Decimal("500.250000"))

    def test_patch_tracks_fields_without_defaulting_missing_values(self):
        patch = SpendingTransactionPatch(category="Food")
        self.assertEqual(patch.model_fields_set, {"category"})
        self.assertIsNone(patch.amount)


if __name__ == "__main__":
    unittest.main()
