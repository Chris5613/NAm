"""Backend current journal construction is nonposting and source-specific."""
import copy
import unittest

from backend.financial_current_journal import current_financial_ledger
from backend.financial_core import activity


def fixture():
    return {
        "month": "2026-11", "currentMonth": "2026-11",
        "todayKey": "2026-11-15",
        "journalPreview": [{
            "id": "pc-purchase", "date": "2026-11-05",
            "description": "Owner-contributed GPU",
            "debitAccount": "equipment", "creditAccount": "equity",
            "amount": 500,
        }],
        "incomeMonth": {
            "monthKey": "2026-11", "total": 10,
            "sources": {"Kryptex": 8, "Salad": 2},
        },
        "baseRows": [{
            "id": "device:2080", "name": "RTX 2080",
            "category": "equipment", "depreciation": 5,
        }],
        "autoPower": 0,
        "confirmedMovements": {
            "transfer-1": {
                "id": "transfer-1", "date": "2026-11-12",
                "type": "transfer", "from": "platform:kryptex",
                "to": "cash", "amount": 3, "feeUsd": 0,
            },
        },
        "phones": [], "closedMonths": {},
    }


class CurrentFinancialJournalTests(unittest.TestCase):
    def test_assembles_income_movement_and_depreciation_once(self):
        data = fixture()
        original = copy.deepcopy(data)
        result = current_financial_ledger(data)
        rows = result["entries"]
        ids = [row["id"] for row in rows]
        self.assertEqual(ids.count("pc-purchase"), 1)
        self.assertEqual(ids.count("auto-depreciation:2026-11"), 1)
        self.assertEqual(ids.count("auto-movement:transfer-1"), 1)
        self.assertEqual(ids.count("synced-income:2026-11:kryptex"), 1)
        self.assertEqual(ids.count("synced-income:2026-11:salad"), 1)
        self.assertAlmostEqual(-activity(rows, "revenue"), 10)
        self.assertAlmostEqual(activity(rows, "depreciation"), 5)
        self.assertEqual(result["sourceOfCalculation"],
                         "backend-current-financial-ledger-v1")
        self.assertFalse(result["financialLedgerMutated"])
        self.assertEqual(data, original)

    def test_posted_manual_provider_income_does_not_double_credit(self):
        data = fixture()
        data["journalPreview"].append({
            "id": "posted-salad", "date": "2026-11-14",
            "description": "Salad income", "debitAccount": "platform:salad",
            "creditAccount": "revenue", "amount": 2,
        })
        result = current_financial_ledger(data)
        rows = result["entries"]
        self.assertNotIn("synced-income:2026-11:salad",
                         {row["id"] for row in rows})
        self.assertAlmostEqual(-activity(rows, "revenue"), 10)

    def test_transfer_with_fee_is_expense_not_revenue(self):
        data = fixture()
        data["incomeMonth"] = {"monthKey": "2026-11", "total": 0, "sources": {}}
        data["confirmedMovements"]["transfer-1"]["feeUsd"] = 0.50
        result = current_financial_ledger(data)
        entries = result["entries"]
        self.assertEqual(sum(row["id"] == "auto-movement:transfer-1"
                             for row in entries), 1)
        self.assertEqual(sum(row["id"] == "auto-fee:transfer-1"
                             for row in entries), 1)
        self.assertAlmostEqual(activity(entries, "fees"), 0.50)
        self.assertAlmostEqual(activity(entries, "revenue"), 0)

    def test_approved_transfer_already_posted_manually_not_duplicated(self):
        data = fixture()
        data["journalPreview"].append({
            "id": "already-posted", "date": "2026-11-12",
            "debitAccount": "cash", "creditAccount": "platform:kryptex",
            "amount": 3,
        })
        result = current_financial_ledger(data)
        ids = [row["id"] for row in result["entries"]]
        self.assertIn("already-posted", ids)
        self.assertNotIn("auto-movement:transfer-1", ids)

    def test_locked_snapshot_is_unchanged_by_later_provider_observations(self):
        data = fixture()
        frozen = [{
            "id": "frozen-oct", "date": "2026-11-01",
            "debitAccount": "cash", "creditAccount": "equity", "amount": 12,
        }]
        data["closedMonths"] = {"2026-11": {"entries": frozen,
            "incomeMonth": {"monthKey": "2026-11", "total": 1,
                            "sources": {"Kryptex": 1}}}}
        before = copy.deepcopy(data)
        result = current_financial_ledger(data)
        self.assertEqual(len(result["entries"]), 1)
        self.assertEqual(result["entries"][0]["id"], "frozen-oct")
        self.assertEqual(result["entries"][0]["lines"][0]["account"], "cash")
        self.assertTrue(result["frozen"])
        self.assertEqual(result["income"]["syncedTotal"], 1)
        self.assertEqual(data, before)

    def test_legacy_month_displays_only_allowed_may_phone_entry(self):
        data = fixture()
        data["month"] = "2026-05"
        data["journalPreview"] = [
            {"id": "unetwork-phone:p1", "date": "2026-05-20",
             "source": "unetwork-business-phone", "debitAccount": "equipment",
             "creditAccount": "equity", "amount": 80},
            {"id": "stale-legacy", "date": "2026-05-21",
             "debitAccount": "cash", "creditAccount": "revenue", "amount": 99},
        ]
        data["phones"] = [{"id": "p1", "businessDate": "2026-05-20"}]
        result = current_financial_ledger(data)
        self.assertEqual([entry["id"] for entry in result["entries"]],
                         ["unetwork-phone:p1"])
        self.assertEqual(result["generatedEntryCount"], 0)

    def test_opening_phone_depreciation_only_once(self):
        data = fixture()
        data["month"] = "2026-09"
        data["phones"] = [{
            "id": "p1", "businessDate": "2026-05-20",
            "businessValue": 120, "startMonth": "2026-05",
            "cost": 120, "usefulLifeMonths": 12,
        }]
        first = current_financial_ledger(data)
        adjustments = [row for row in first["entries"]
                       if row["id"] == "opening-iphone-depreciation:2026-09"]
        self.assertEqual(len(adjustments), 1)
        self.assertEqual(adjustments[0]["lines"][0]["debit"], 4.0)
        data["closedMonths"] = {"2026-09": {
            "entries": copy.deepcopy(first["entries"])}}
        second = current_financial_ledger(data)
        self.assertEqual(sum(row["id"] ==
            "opening-iphone-depreciation:2026-09"
            for row in second["entries"]), 1)

    def test_missing_rows_and_invalid_month_fail_closed(self):
        data = fixture()
        data["baseRows"] = None
        with self.assertRaisesRegex(ValueError, "Backend asset rows required"):
            current_financial_ledger(data)
        data = fixture()
        data["month"] = "2026-13"
        with self.assertRaisesRegex(ValueError, "Invalid reporting month"):
            current_financial_ledger(data)


if __name__ == "__main__":
    unittest.main()
