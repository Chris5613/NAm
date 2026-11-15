"""Historical financial close cannot be certified from estimated asset rows."""
import copy
import unittest

from backend.financial_close_readiness import financial_close_readiness


def records():
    return {
        "yield_monthly_snapshots_v1": {
            "2026-09": {"locked": True, "total": 330.062266},
            "2026-10": {"locked": True, "total": 202.769111},
        },
        "monthly_business_changes_v1": {
            "2026-09": {"locked": True, "items": [
                {"name": "BTC", "estimated": True, "end": 1425.62},
                {"name": "Unetwork", "end": 15.47},
            ]},
            "2026-10": {"locked": True, "items": [
                {"name": "BTC", "estimated": True, "end": 1321.21},
                {"name": "Kryptex", "end": 282.96},
            ]},
        },
        "financials_bank_openings_v1": {"2026-11": 0},
        "financials_journal_v1": [
            {"date": "2026-05-20", "id": "phone"},
        ],
        "financials_month_closes_v1": {},
    }


class FinancialCloseReadinessTests(unittest.TestCase):
    def test_september_and_october_are_protected_not_falsely_closed(self):
        saved = records()
        frozen = copy.deepcopy(saved)
        for month in ("2026-09", "2026-10"):
            with self.subTest(month=month):
                result = financial_close_readiness(saved, month, "2026-11")
                self.assertEqual(result["status"], "protected-uncertified")
                self.assertTrue(result["protectedByBusinessLock"])
                self.assertTrue(result["providerIncomeLocked"])
                self.assertFalse(result["certifiedClosePresent"])
                self.assertFalse(result["readyForNewCertifiedClose"])
                self.assertIn("Verified beginning bank cash is missing for this month",
                              result["missingEvidence"])
                self.assertIn("Historical asset rows contain unverified estimates",
                              result["missingEvidence"])
                self.assertEqual(result["postedManualJournalEntries"], 0)
                self.assertTrue(result["readOnly"])
                self.assertFalse(result["financialLedgerMutated"])
        self.assertEqual(saved, frozen)

    def test_existing_certified_close_is_recognized_without_rewriting(self):
        saved = records()
        saved["financials_month_closes_v1"]["2026-10"] = {
            "rows": [{"id": "old", "start": 10, "end": 9}],
            "entries": [],
        }
        report = financial_close_readiness(saved, "2026-10", "2026-11")
        self.assertEqual(report["status"], "recorded-financial-close")
        self.assertTrue(report["certifiedClosePresent"])

    def test_reject_future_or_invalid_month(self):
        for month in ("2026-13", "2030-01", "junk"):
            with self.assertRaisesRegex(ValueError, "Invalid historical"):
                financial_close_readiness(records(), month, "2026-11")


if __name__ == "__main__":
    unittest.main()
