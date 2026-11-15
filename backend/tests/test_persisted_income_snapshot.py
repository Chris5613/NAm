"""Backend source-owned income history stays separate from balances."""
import copy
import unittest

from backend.persisted_income_snapshot import source_income_history, project_history_rows
from types import SimpleNamespace


class PersistedIncomeSnapshotTests(unittest.TestCase):
    def test_booked_source_rows_without_dividend_setting_remain_exact(self):
        snapshots = {
            "2026-10": {
                "monthKey": "2026-10", "locked": True, "total": 20,
                "platforms": [{"platform": "Kryptex", "amount": 20}],
            },
            "2026-11": {
                "monthKey": "2026-11", "locked": False, "total": 8,
                "platforms": [
                    {"platform": "Kryptex", "amount": 4},
                    {"platform": "Loopscale", "amount": 3},
                    {"platform": "Lulo", "amount": 1},
                ],
            },
        }
        original = copy.deepcopy(snapshots)
        result = source_income_history(
            snapshots, None, [], {"monthly": {}}, "2026-11")
        self.assertEqual([r["total"] for r in result["months"]], [20, 8])
        self.assertEqual(result["months"][1]["sources"], {
            "Kryptex": 4, "Loopscale": 3, "Lulo": 1})
        self.assertEqual(result["missingOptionalSources"],
                         ["dividend-payout-setting-not-present"])
        self.assertEqual(snapshots, original)

    def test_stock_payment_and_manual_source_are_added_once(self):
        result = source_income_history(
            {"2026-11": {
                "total": 10, "platforms": [
                    {"platform": "Kryptex", "amount": 10}],
            }},
            {"VTI:2026-11-12": {
                "symbol": "VTI", "date": "2026-11-12", "amount": 2.5}},
            [], {"monthly": {"2026-11": {
                "Kryptex": 10, "Stocks": 2.5, "Other": 1}}}, "2026-11")
        row = result["months"][0]
        self.assertEqual(row["stocks"], 2.5)
        self.assertAlmostEqual(row["total"], 13.5)
        self.assertEqual(row["sources"]["Kryptex"], 10)
        self.assertEqual(row["sources"]["Stocks"], 2.5)
        self.assertEqual(row["sources"]["Other"], 1)
        self.assertEqual(result["missingOptionalSources"], [])

    def test_current_provider_projection_fixes_stale_open_month_without_writes(self):
        snapshots = {
            "2026-10": {
                "monthKey": "2026-10", "locked": True, "total": 25,
                "platforms": [{"platform": "Kryptex", "amount": 25}],
            },
            "2026-11": {
                "monthKey": "2026-11", "locked": False, "total": 10,
                "platforms": [
                    {"platform": "Kryptex", "amount": 8},
                    {"platform": "Lulo", "amount": 2},
                ],
            },
        }
        original = copy.deepcopy(snapshots)
        result = source_income_history(
            snapshots, {}, [], {"monthly": {}}, "2026-11",
            current_provider_months=[{
                "monthKey": "2026-11",
                "total": 11,
                "platforms": [
                    {"platform": "Kryptex", "amount": 11},
                ],
            }],
        )
        self.assertEqual([row["total"] for row in result["months"]],
                         [25, 13])
        self.assertEqual(result["months"][1]["sources"],
                         {"Kryptex": 11, "Lulo": 2})
        self.assertEqual(snapshots, original)

    def test_current_earned_usd_can_decline_without_maximum_based_repricing(self):
        snapshots = {
            "2026-11": {"monthKey": "2026-11", "total": 15,
                        "platforms": [{"platform": "Kryptex", "amount": 15}]},
        }
        result = source_income_history(
            snapshots, {}, [], {}, "2026-11",
            current_provider_months=[{
                "monthKey": "2026-11",
                "total": 12,
                "platforms": [{"platform": "Kryptex", "amount": 12}],
            }],
        )
        self.assertEqual(result["months"][0]["total"], 12)
        self.assertEqual(snapshots["2026-11"]["total"], 15)

    def test_project_embedded_earnings_survive_empty_relational_history(self):
        projects = [
            SimpleNamespace(
                id="clore", name="Clore AI", earned=32.42,
                data={"transactions": [
                    {"date": "2026-06-07", "type": "earning", "amount": 6.75},
                    {"date": "2026-06-07", "type": "earning", "amount": 25.67},
                ]},
            ),
            SimpleNamespace(
                id="unity", name="Unity  Network", earned=0,
                data={"transactions": [
                    {"date": "2026-08-01", "type": "earning", "amount": 1.155289},
                ]},
            ),
        ]
        rows = project_history_rows(projects, {})
        self.assertEqual(len(rows[0]["transactions"]), 2)
        self.assertEqual(len(rows[1]["transactions"]), 1)
        history = source_income_history(
            {}, {}, rows, {"monthly": {}}, "2026-11")
        by_month = {month["monthKey"]: month for month in history["months"]}
        self.assertAlmostEqual(by_month["2026-06"]["sources"]["Clore AI"],
                               32.42)
        self.assertAlmostEqual(by_month["2026-08"]["sources"]["Unity  Network"],
                               1.155289)

    def test_relational_project_history_replaces_embedded_not_adds_twice(self):
        project = SimpleNamespace(
            id="p1", name="Clore AI", earned=25,
            data={"transactions": [
                {"date": "2026-06-01", "type": "earning", "amount": 25},
            ]},
        )
        relational = {"p1": [
            {"date": "2026-06-01", "type": "earning", "amount": 25},
        ]}
        rows = project_history_rows([project], relational)
        history = source_income_history({}, {}, rows, {}, "2026-11")
        self.assertEqual(history["months"][0]["total"], 25)
        self.assertEqual(len(rows[0]["transactions"]), 1)

    def test_wallet_balance_is_never_recognized_as_earnings(self):
        result = source_income_history(
            {}, None, [{
                "name": "Lulo", "earned": 0,
                "yield_tracking": "lulo_lending",
                "balance": 2500,
            }], {"monthly": {}}, "2026-11")
        self.assertEqual(result["months"], [])

    def test_unrecognized_monthly_snapshot_is_not_fabricated(self):
        result = source_income_history({
            "2026-11": {"total": 5000, "platforms": None},
        }, {}, [], {"monthly": {}}, "2026-11")
        self.assertEqual(result["months"], [])


if __name__ == "__main__":
    unittest.main()
