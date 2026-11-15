"""User confirmation must never masquerade as a provider receipt or alter booked revenue."""
import unittest
from backend.user_confirmed_provider_evidence import user_confirmed_provider_day
from backend.earnings_dashboard import provider_entries
from backend.hardware_payback_lifetime import build_lifetime_hardware_payback

class UserConfirmedProviderEvidenceTests(unittest.TestCase):
    def test_exact_november_13_is_user_verified_only(self):
        observed = {"sources": {"Salad": 0.02737941, "Kryptex": 2.96635159}}
        prior = dict(observed["sources"])
        result = provider_entries("2026-11-13", observed, {"Salad": {}})
        self.assertEqual(result["provenance"]["Salad"],
                         "user-attested-recorded-daily-receipt")
        self.assertEqual(result["sources"]["Salad"], 0.02737941)
        self.assertEqual(result["correctedSourcesUsd"], {})
        self.assertEqual(result["provisionalSources"], ["Kryptex"])
        self.assertEqual(observed["sources"], prior)
        attest = user_confirmed_provider_day(
            "2026-11-13", "Salad", 0.02737941)
        self.assertEqual(attest["approvedOn"], "2026-11-15")
        self.assertNotIn("provider-verified", attest["provenance"])

    def test_cannot_confirm_modified_missing_or_other_day(self):
        for day, amount in (
            ("2026-11-13", None), ("2026-11-13", 0.02737942),
            ("2026-11-12", 0.02737941), ("2026-11-14", 0.02737941)):
            with self.subTest(day=day, amount=amount):
                self.assertIsNone(user_confirmed_provider_day(
                    day, "Salad", amount))
        row = provider_entries("2026-11-13",
            {"sources": {"Salad": 0.02737942}}, {"Salad": {}})
        self.assertEqual(row["provenance"]["Salad"],
                         "legacy-server-receipt")
        self.assertIn("Salad", row["provisionalSources"])

    def test_5080_credit_is_verified_by_user_attestation_without_new_revenue(self):
        device = [{"id": "5080", "name": "RTX 5080",
                   "cost": 1250, "startMonth": "2026-11",
                   "earningsStartDay": "2026-11-13",
                   "sources": ["Salad"]}]
        daily = {"2026-11-13": {"sources": {"Salad": 0.02737941}}}
        result = build_lifetime_hardware_payback(
            device, daily, {"Salad": {}}, "2026-11-13")
        row = result["devices"][0]
        self.assertAlmostEqual(row["verifiedRewardSubtotalUsd"], 0.02737941)
        self.assertAlmostEqual(row["provisionalRewardSubtotalUsd"], 0)
        self.assertEqual(row["observedCreditUsd"], 0.02737941)
        self.assertTrue(result["mathReconciles"])
        self.assertFalse(result["financialLedgerMutated"])

if __name__ == "__main__":
    unittest.main()
