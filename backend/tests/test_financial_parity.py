"""Financial parity telemetry carries no financial data or mutation."""
import copy
import unittest

from backend.financial_parity import record_parity_observation, parity_summary


class FinancialParityTests(unittest.TestCase):
    def test_idempotent_sample_and_mismatch_transition(self):
        base = record_parity_observation(
            {}, "balance-rows", "2026-11", "matched",
            "backend-projection", "aabbccdd", "2026-11-15T08:00:00Z")
        duplicated = record_parity_observation(
            base, "balance-rows", "2026-11", "matched",
            "backend-projection", "aabbccdd", "2026-11-15T09:00:00Z")
        self.assertEqual(duplicated, base)
        changed = record_parity_observation(
            base, "balance-rows", "2026-11", "mismatched",
            "backend-projection", "eecc9900", "2026-11-15T09:00:00Z")
        summary = parity_summary(changed)
        self.assertEqual(summary["summary"]["matched"], 0)
        self.assertEqual(summary["summary"]["mismatched"], 1)
        self.assertEqual(summary["checks"][0]["status"], "mismatched")
        self.assertEqual(base["lastByArea"]["balance-rows:2026-11:backend-projection"]["status"],
                         "matched")

    def test_amount_free_mismatch_reason_is_saved_and_validated(self):
        first = record_parity_observation(
            {}, "income-history", "2026-11", "mismatched",
            "backend-persisted", "aabbccdd",
            reason="source-difference")
        evidence = parity_summary(first)["checks"][0]
        self.assertEqual(evidence["reason"], "source-difference")
        self.assertNotIn("amount", str(evidence))
        with self.assertRaises(ValueError):
            record_parity_observation(
                {}, "income-history", "2026-11", "mismatched",
                "backend-persisted", "aabbccdd", reason="$500 secret")

    def test_invalid_status_and_sensitive_raw_data_are_rejected(self):
        for area, month, status, source, fingerprint in (
            ("arbitrary", "2026-11", "matched", "backend-projection", "aabbccdd"),
            ("income-history", "2026-15", "matched", "backend-projection", "aabbccdd"),
            ("income-history", "2026-11", "unknown", "backend-projection", "aabbccdd"),
            ("income-history", "2026-11", "matched", "browser-guess", "aabbccdd"),
            ("income-history", "2026-11", "matched", "backend-projection", "SECRET_KEY"),
        ):
            with self.subTest(area=area), self.assertRaises(ValueError):
                record_parity_observation(
                    {}, area, month, status, source, fingerprint)


if __name__ == "__main__":
    unittest.main()
