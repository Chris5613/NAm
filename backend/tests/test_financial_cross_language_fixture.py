"""Execute the same accounting fixture as the frontend Jest suite."""
import json
import unittest
from pathlib import Path

from backend.financial_core import (
    compute_profit, split_revenue, classify_cash_flows,
    equipment_schedule, sum_business_rows, calculate_net_worth,
)


FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] /
     "frontend/src/fixtures/financialParityFixture.json").read_text()
)


class FinancialCrossLanguageFixtureTests(unittest.TestCase):
    def test_shared_journal_matches_profit_revenue_and_cash_flows(self):
        data = FIXTURE
        self.assertEqual(
            compute_profit(data["entries"], data["savedExpenses"]),
            data["expectedProfit"],
        )
        self.assertEqual(split_revenue(data["entries"]), data["expectedRevenue"])
        flows = classify_cash_flows(data["entries"])
        self.assertEqual(
            {**flows["totals"], "total": flows["total"]},
            data["expectedCashFlow"],
        )

    def test_shared_device_business_and_home_assets(self):
        data = FIXTURE
        self.assertEqual(
            equipment_schedule(data["devices"][0], data["month"]),
            data["expectedDevice"],
        )
        business = sum_business_rows(data["businessRows"])
        self.assertEqual(business, data["expectedBusiness"])
        networth = calculate_net_worth(
            data["personalAssets"], business, 0,
        )
        self.assertEqual(networth["total_net_worth"],
                         data["expectedNetWorth"])
        self.assertEqual(networth["breakdown"]["crypto"], 1900)


if __name__ == "__main__":
    unittest.main()
