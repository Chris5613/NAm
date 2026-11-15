"""A past Financials close cannot be erased by tab sync, only explicit reopen."""
import copy
import unittest

from backend.closed_month_guard import (
    protect_closed_financial_months, reopen_closed_financial_month,
)


class ClosedMonthGuardTests(unittest.TestCase):
    def setUp(self):
        self.closed = {"2026-10": {
            "rows": [{"id": "asset", "end": 100}],
            "entries": [{"id": "old", "date": "2026-10-15"}],
            "revenue": 20,
            "pnlProfit": 11,
        }}

    def test_generic_patch_cannot_rewrite_or_erase_close(self):
        for proposed in (
            {},
            {"2026-10": {**self.closed["2026-10"], "revenue": 1000000}},
            {"2026-10": None},
        ):
            with self.subTest(proposed=proposed), self.assertRaises(ValueError):
                protect_closed_financial_months(self.closed, proposed)

    def test_add_new_valid_close_and_leave_prior_untouched(self):
        old = copy.deepcopy(self.closed)
        proposed = {**old, "2026-11": {"rows": [], "entries": []}}
        result = protect_closed_financial_months(self.closed, proposed)
        self.assertEqual(result, proposed)
        self.assertEqual(self.closed, old)

    def test_new_close_requires_valid_month_and_statement_rows(self):
        with self.assertRaises(ValueError):
            protect_closed_financial_months({}, {"2026-13": {"rows": []}})
        with self.assertRaises(ValueError):
            protect_closed_financial_months({}, {"2026-11": {"revenue": 11}})

    def test_explicit_reopen_removes_only_one_close_without_ledger_changes(self):
        old = copy.deepcopy(self.closed)
        result = reopen_closed_financial_month(self.closed, "2026-10")
        self.assertEqual(result, {})
        self.assertEqual(old, self.closed)
        with self.assertRaises(ValueError):
            reopen_closed_financial_month(self.closed, "2026-11")


if __name__ == "__main__":
    unittest.main()
