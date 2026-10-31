"""Only a complete, reviewed Phase 7 can be considered for a final commit."""
import unittest
from tools.phase7_release_gate import REQUIRED, inspect_evidence


class ReleaseGateTests(unittest.TestCase):
    def test_empty_manifest_fails_closed_without_financial_write_authority(self):
        result = inspect_evidence({})
        self.assertFalse(result["phase7ReadyForFinalReview"])
        self.assertFalse(result["automaticCommitAllowed"])
        self.assertFalse(result["automaticFinancialWritesAllowed"])
        self.assertEqual(result["checksPassed"], 0)

    def test_every_gate_required_even_if_all_others_pass(self):
        manifest = {"reviewedCommit": "a" * 40, "financialWritesEnabled": False,
                    "verified": dict.fromkeys(REQUIRED, True)}
        self.assertTrue(inspect_evidence(manifest)["phase7ReadyForFinalReview"])
        for gate in REQUIRED:
            bad = {**manifest, "verified": {**manifest["verified"], gate: False}}
            with self.subTest(gate=gate):
                self.assertIn(gate, inspect_evidence(bad)["outstandingGates"])

    def test_cannot_pass_with_enabled_backend_financial_writes(self):
        manifest = {"reviewedCommit": "a" * 40, "financialWritesEnabled": True,
                    "verified": dict.fromkeys(REQUIRED, True)}
        self.assertFalse(inspect_evidence(manifest)["phase7ReadyForFinalReview"])
        self.assertFalse(inspect_evidence(manifest)["automaticFinancialWritesAllowed"])


if __name__ == "__main__":
    unittest.main()
