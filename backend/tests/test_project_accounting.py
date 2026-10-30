"""Regression tests for authoritative project portfolio accounting."""
import unittest

from backend.project_accounting import amount, portfolio_summary, daily_income_summary, signed_amount


class ProjectPortfolioTests(unittest.TestCase):
    def test_empty_feed_is_not_an_authoritative_zero(self):
        self.assertEqual(
            portfolio_summary([]),
            {
                "totalUsd": 0.0, "activeTotalUsd": 0.0,
                "projectCount": 0, "valuedProjectCount": 0,
                "missingProjectIds": [], "staleProjectIds": [],
                "complete": False,
            },
        )

    def test_current_balances_not_historical_earnings(self):
        rows = [
            {"id": "lulo", "balanceUsd": 10.125, "earnedUsd": 900.0},
            {"id": "rollercoin", "balanceUsd": 2.23, "lifetimeEarnedUsd": 400.0},
            {"id": "salad", "balanceUsd": 0.74, "inactive": True},
        ]
        result = portfolio_summary(rows)
        self.assertAlmostEqual(result["totalUsd"], 13.095)
        self.assertAlmostEqual(result["activeTotalUsd"], 12.355)
        self.assertEqual(result["projectCount"], 3)
        self.assertTrue(result["complete"])

    def test_same_id_is_not_double_counted(self):
        rows = [
            {"id": "rollercoin", "balanceUsd": 3},
            {"id": "rollercoin", "balanceUsd": 4},
        ]
        self.assertEqual(portfolio_summary(rows)["totalUsd"], 4)

    def test_invalid_and_missing_values_are_not_silently_valued(self):
        rows = [
            {"id": "good", "balanceUsd": "1.25", "stale": True},
            {"id": "bad", "balanceUsd": float("nan")},
            {"id": "missing"},
            {"id": "negative", "balanceUsd": -1},
        ]
        result = portfolio_summary(rows)
        self.assertEqual(result["totalUsd"], 1.25)
        self.assertFalse(result["complete"])
        self.assertEqual(result["missingProjectIds"], ["bad", "missing", "negative"])
        self.assertEqual(result["staleProjectIds"], ["good"])

    def test_signed_daily_income_preserves_losses(self):
        total = daily_income_summary({
            "Loopscale": "-0.86", "RollerCoin": "0.60",
            "Salad": "0.001",
        })
        self.assertEqual(total["totalUsd"], -0.259)
        self.assertEqual(total["sources"]["Loopscale"], -0.86)
        self.assertTrue(total["complete"])

    def test_invalid_daily_income_is_explicitly_rejected(self):
        total = daily_income_summary({"RollerCoin": float("inf"), "Salad": 2})
        self.assertFalse(total["complete"])
        self.assertEqual(total["rejected"], ["RollerCoin"])
        self.assertEqual(total["totalUsd"], 2)

    def test_daily_income_empty_is_zero_not_inferred(self):
        total = daily_income_summary({})
        self.assertEqual(total["totalUsd"], 0)
        self.assertTrue(total["complete"])
        self.assertIsNone(signed_amount(True))

    def test_decimal_parsing_rejects_bools_and_non_finite(self):
        self.assertIsNone(amount(True))
        self.assertIsNone(amount("Infinity"))
        self.assertIsNone(amount(None))
        self.assertEqual(str(amount("0.10")), "0.10")


if __name__ == "__main__":
    unittest.main()
