import unittest

from backend.spending_analytics import spending_analytics


ROWS = [
    {"date": "2026-11-02", "amount": -30, "category": "Groceries"},
    {"date": "2026-11-03", "amount": 100, "category": "Income"},
    {"date": "2026-11-04", "amount": -10, "category": "Dining"},
    {"date": "2026-11-04", "amount": -55, "category": "Transfers"},
    {"date": "2026-10-06", "amount": -20, "category": "Groceries"},
    {"date": "2026-01-07", "amount": 25, "category": "Income"},
]
PASSIVE = [
    {"monthKey": "2026-11", "total": 8.25},
    {"monthKey": "2026-10", "total": 4.25},
]


class SpendingAnalyticsTests(unittest.TestCase):
    def test_month_totals_and_chart_preserve_browser_rules(self):
        r = spending_analytics(ROWS, PASSIVE, "2026-11", "month",
                               "2026-11-15", 15)
        self.assertEqual(r["sourceOfCalculation"], "backend-spending-analytics-v1")
        self.assertTrue(r["readOnly"])
        self.assertFalse(r["financialLedgerMutated"])
        self.assertEqual(r["totalSpent"], 40)
        self.assertEqual(r["bankIncome"], 100)
        self.assertEqual(r["passiveIncome"], 8.25)
        self.assertEqual(r["totalIncome"], 108.25)
        self.assertEqual(r["netCashFlow"], 68.25)
        self.assertEqual(r["previousMonthToDate"], 20)
        self.assertEqual(r["monthDelta"], 20)
        self.assertEqual(r["monthTiles"][10]["total"], -40)
        # Existing browser category display sorts by signed amount descending.
        self.assertEqual(r["categoryBreakdown"], [
            {"category": "Dining", "amount": -10, "share": -25},
            {"category": "Groceries", "amount": -30, "share": -75},
        ])
        self.assertEqual(r["chartData"][3], {
            "label": "4", "spent": 40, "income": 100,
            "previous": 0,
        })
        self.assertEqual(r["yearTotal"], 60)

    def test_ytd_preserves_current_month_and_monthly_cumulative(self):
        r = spending_analytics(ROWS, PASSIVE, "2026-11", "ytd",
                               "2026-11-15", 15)
        self.assertEqual(r["totalSpent"], 60)
        self.assertEqual(r["bankIncome"], 125)
        self.assertEqual(r["passiveIncome"], 12.5)
        self.assertEqual(r["totalIncome"], 137.5)
        self.assertEqual(r["netCashFlow"], 77.5)
        self.assertEqual(len(r["chartData"]), 11)
        self.assertEqual(r["chartData"][10], {
            "label": "Nov", "spent": 60, "income": 125,
        })

    def test_disallowed_inputs_fail_closed(self):
        with self.assertRaises(ValueError):
            spending_analytics([], [], "2026-15", "month",
                               "2026-11-15", 15)
        with self.assertRaises(ValueError):
            spending_analytics([], [], "2026-11", "all",
                               "2026-11-15", 15)
        with self.assertRaises(ValueError):
            spending_analytics([], [], "2026-11", "month",
                               "2026-11-15", 0)


if __name__ == "__main__":
    unittest.main()
