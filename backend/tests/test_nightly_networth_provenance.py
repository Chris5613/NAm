"""Nightly snapshot attribution is explicit; retained totals use old formula."""
import unittest
from types import SimpleNamespace

from backend.networth_reconciliation import legacy_nightly_components
from backend.scheduler import calculate_net_worth, nightly_net_worth_components


class FakeSession:
    def __init__(self, assets):
        self.assets = assets
    def scalars(self, query):
        class Rows:
            def __init__(self, assets):
                self.assets = assets
            def all(self):
                return self.assets
        return Rows(self.assets)
    def scalar(self, query):
        return None


class NightlyProvenanceTests(unittest.TestCase):
    def test_exposed_basis_is_not_misrepresented_as_home_financials(self):
        assets=[
            SimpleNamespace(category="stocks", quantity=2, current_price=50,
                            manual_value=None),
            SimpleNamespace(category="cash",quantity=None,current_price=None,manual_value=1000),
            SimpleNamespace(category="debts",quantity=None,current_price=None,manual_value=80),
        ]
        comp=legacy_nightly_components(
            assets,{"portfolioBalance":150,"source":"backend-project-feed"},
            {"total":9999,"projectPortfolio":{"bitcoin":{"value":650}}}
        )
        self.assertAlmostEqual(comp["totalUsd"],1820.0)
        self.assertEqual(comp["cryptoSubtotalUsd"],800.0)
        self.assertFalse(comp["businessBalanceSheetIncluded"])
        self.assertFalse(comp["bankCashDeduplicated"])
        self.assertFalse(comp["comparableToHomeFinancials"])

    def test_missing_project_summary_uses_legacy_cache_but_marks_fallback(self):
        comp=legacy_nightly_components([],{},{"total":500})
        self.assertEqual(comp["cryptoSubtotalUsd"],500)
        self.assertEqual(comp["componentSources"]["project"],"legacy-networth-crypto-total")
        self.assertIsNone(comp["projectBalanceUsd"])


if __name__=="__main__":
    unittest.main()
