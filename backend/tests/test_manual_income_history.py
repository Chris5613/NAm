import json
import os
import unittest
from unittest.mock import patch

from backend.manual_income_history import manual_income_for_user


class ManualIncomeHistoryTests(unittest.TestCase):
    def test_configured_income_only_reaches_its_account(self):
        config = {"userId": 7, "monthly": {"2026-05": {"Example": 40}}, "annual2025": {"Example": 20}}
        with patch.dict(os.environ, {"NAM_MANUAL_INCOME_HISTORY": json.dumps(config)}):
            self.assertEqual(manual_income_for_user(7), {
                "monthly": {"2026-05": {"Example": 40.0}}, "annual2025": {"Example": 20.0},
            })
            self.assertEqual(manual_income_for_user(8), {"monthly": {}, "annual2025": {}})

    def test_user_confirmed_salad_2025_does_not_override_other_users(self):
        config = {"userId": 1, "amount": 28.49}
        with patch.dict(os.environ, {
            "NAM_CONFIRMED_SALAD_2025_JSON": json.dumps(config),
            "NAM_MANUAL_INCOME_HISTORY": "",
        }):
            self.assertEqual(manual_income_for_user(1)["annual2025"],
                             {"Salad": 28.49})
            self.assertEqual(manual_income_for_user(2)["annual2025"], {})

    def test_salad_confirmation_does_not_overwrite_prior_manual_2025(self):
        config = {"userId": 1, "amount": 28.49}
        manual = {"userId": 1, "annual2025": {"Salad": 27, "Other": 8}}
        with patch.dict(os.environ, {
            "NAM_CONFIRMED_SALAD_2025_JSON": json.dumps(config),
            "NAM_MANUAL_INCOME_HISTORY": json.dumps(manual),
        }):
            self.assertEqual(manual_income_for_user(1)["annual2025"],
                             {"Salad": 27.0, "Other": 8.0})

    def test_invalid_months_and_amounts_are_discarded(self):
        config = {"userId": 7, "monthly": {"2026-13": {"Bad": 1}, "2026-05": {"Valid": 2, "Zero": 0, "Bad": "nan"}}}
        with patch.dict(os.environ, {"NAM_MANUAL_INCOME_HISTORY": json.dumps(config)}):
            self.assertEqual(manual_income_for_user(7), {
                "monthly": {"2026-05": {"Valid": 2.0}}, "annual2025": {},
            })


if __name__ == "__main__":
    unittest.main()
