"""Durable server-side journal transaction/period invariants."""
import unittest

from backend.journal_guard import guard_journal_write


class JournalGuardTests(unittest.TestCase):
    def setUp(self):
        self.entry = {
            "id": "journal:1", "date": "2026-11-14",
            "description": "Equipment", "lines": [
                {"account": "equipment", "debit": 1950, "credit": 0},
                {"account": "cash", "debit": 0, "credit": 1250},
                {"account": "equipment:old", "debit": 0, "credit": 700},
            ],
        }

    def test_valid_compound_trade_in_is_balanced_at_server(self):
        self.assertEqual(guard_journal_write([], [self.entry], {}), [self.entry])

    def test_unbalanced_or_negative_or_subcent_line_rejected(self):
        for value in (-1, 1949, 1950.001, float("nan")):
            candidate = {**self.entry, "lines": [
                {**self.entry["lines"][0], "debit": value},
                *self.entry["lines"][1:],
            ]}
            with self.subTest(value=value), self.assertRaises(ValueError):
                guard_journal_write([], [candidate], {})

    def test_legacy_double_entry_supported_without_inventing_amount(self):
        legacy = {"id": "old", "date": "2026-11-02",
                  "debitAccount": "cash", "creditAccount": "equity", "amount": 250}
        self.assertEqual(guard_journal_write([], [legacy], {}), [legacy])

    def test_unchanged_historical_unbalanced_entry_survives(self):
        legacy = {"id": "old", "date": "2026-10-02",
                  "debitAccount": "cash", "creditAccount": "cash", "amount": -10}
        locked = {"2026-10": {"rows": []}}
        self.assertEqual(guard_journal_write([legacy], [legacy], locked),
                         [legacy])

    def test_locked_period_blocks_create_edit_delete_and_date_move(self):
        locked = {"2026-11": {"rows": []}}
        with self.assertRaises(ValueError):
            guard_journal_write([], [self.entry], locked)
        moved = {**self.entry, "date": "2026-12-01"}
        with self.assertRaises(ValueError):
            guard_journal_write([self.entry], [moved], locked)
        with self.assertRaises(ValueError):
            guard_journal_write([self.entry], [], locked)

    def test_monthly_changes_lock_blocks_journal_without_independent_close(self):
        business = {
            "2026-09": {"locked": True, "revenueSnapshot": 330.062266},
            "2026-10": {"locked": True, "revenueSnapshot": 202.769111},
        }
        september = {**self.entry, "id": "old-september", "date": "2026-09-13"}
        october = {**self.entry, "id": "old-october", "date": "2026-10-14"}
        for entry in (september, october):
            with self.subTest(month=entry["date"][:7]):
                with self.assertRaisesRegex(ValueError, "closed accounting month"):
                    guard_journal_write([], [entry], {}, business)
                with self.assertRaisesRegex(ValueError, "closed month"):
                    guard_journal_write([entry], [], {}, business)
                self.assertEqual(
                    guard_journal_write([entry], [entry], {}, business),
                    [entry])
                moved = {**entry, "date": "2026-11-15"}
                with self.assertRaisesRegex(ValueError, "closed accounting month"):
                    guard_journal_write([entry], [moved], {}, business)
        self.assertEqual(guard_journal_write([], [self.entry], {}, business),
                         [self.entry])

    def test_duplicate_manual_journal_id_rejected(self):
        with self.assertRaises(ValueError):
            guard_journal_write([], [self.entry, self.entry], {})

    def test_unknown_account_is_rejected_but_registered_equipment_allowed(self):
        valid = {**self.entry, "lines": [
            {"account": "equipment:device:gpu_5080", "debit": 1950, "credit": 0},
            *self.entry["lines"][1:],
        ]}
        self.assertEqual(guard_journal_write([], [valid], {}), [valid])
        invalid = {**valid, "lines": [
            {"account": "secret-revenue", "debit": 1950, "credit": 0},
            *self.entry["lines"][1:],
        ]}
        with self.assertRaisesRegex(ValueError, "Unknown journal account"):
            guard_journal_write([], [invalid], {})

    def test_browser_cannot_post_automatic_accrual_as_manual(self):
        with self.assertRaises(ValueError):
            guard_journal_write([], [{**self.entry, "automatic": True}], {})


if __name__ == "__main__":
    unittest.main()
