"""Home daily category baselines and history must be backend-owned."""
import copy
import unittest

from backend.networth_trends import networth_trends


class NetWorthTrendsTests(unittest.TestCase):
    DAY = "2026-11-15"
    VALUE = 21871.87233
    CATEGORIES = {
        "stocks": 9564.02233,
        "crypto": 7735.41,
        "cash": 8835.43,
        "other": 3000.0,
        "debts": 7262.99,
    }

    def test_first_call_sets_daily_baseline_and_preserves_old_months(self):
        old_history = [
            {"monthKey": "2026-09", "month": "Sep 2026",
             "value": 19983.019365, "live": False},
            {"monthKey": "2026-10", "month": "Oct 2026",
             "value": 21157.532922, "live": False},
            {"monthKey": "2026-11", "month": "Nov 2026",
             "value": 21308.60233, "live": True},
        ]
        saved_before = copy.deepcopy(old_history)
        result, stored = networth_trends(
            self.VALUE, self.CATEGORIES, self.DAY,
            {"dateKey": "2026-11-14", "baseline": 21800.0},
            {"dateKey": "2026-11-14", "baseline": self.CATEGORIES},
            old_history,
        )
        self.assertEqual(result["dailyChange"]["change"], 0)
        self.assertEqual(result["categoryChanges"]["crypto"], 0)
        self.assertEqual(stored["daily_net_worth_baseline_pst"]["dateKey"], self.DAY)
        self.assertEqual(stored["monthly_net_worth_history_v2"][:2], old_history[:2])
        self.assertEqual(stored["monthly_net_worth_history_v2"][2]["value"], self.VALUE)
        self.assertEqual(old_history, saved_before)

    def test_same_day_keeps_original_baseline_and_updates_only_current_month(self):
        base = {"dateKey": self.DAY, "baseline": 20000.0}
        saved_cat = {"dateKey": self.DAY, "baseline": self.CATEGORIES}
        result, stored = networth_trends(
            self.VALUE, {**self.CATEGORIES, "crypto": self.CATEGORIES["crypto"] + 8},
            self.DAY, base, saved_cat, [],
        )
        self.assertAlmostEqual(result["dailyChange"]["change"], 1871.87233)
        self.assertAlmostEqual(result["categoryChanges"]["crypto"], 8)
        self.assertIs(stored["daily_net_worth_baseline_pst"], base)
        self.assertEqual(len(result["monthlyHistory"]), 1)

    def test_unverified_total_or_category_cannot_write_any_history(self):
        for total, categories in (
            (float("nan"), self.CATEGORIES),
            (None, self.CATEGORIES),
            (-100, self.CATEGORIES),
            (self.VALUE, {"crypto": 100}),
        ):
            with self.subTest(total=total), self.assertRaises(ValueError):
                networth_trends(total, categories, self.DAY)

    def test_missing_or_duplicate_historical_month_is_not_assigned_zero(self):
        history = [
            {"monthKey": "2026-09", "value": None},
            {"monthKey": "2026-09", "value": 100},
            {"monthKey": "2026-10", "value": 15},
        ]
        view, _ = networth_trends(
            self.VALUE, self.CATEGORIES, self.DAY,
            months_saved=history,
        )
        self.assertEqual(len(view["monthlyHistory"]), 3)
        self.assertIsNone(view["monthlyHistory"][0]["value"])
        self.assertEqual(view["monthlyHistory"][1]["value"], 15)


if __name__ == "__main__":
    unittest.main()
