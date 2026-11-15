"""Home / Financials preview does not invent a full accounting total."""
from datetime import datetime, timezone
from types import SimpleNamespace
import unittest

from backend.networth_reconciliation import (
    legacy_nightly_components, home_reconciliation_preview,
    lulo_withdrawal_review, personal_assets_home_basis,
)

NOW = datetime(2026, 11, 15, 5, 0, tzinfo=timezone.utc)
def asset(cat, qty=None, price=None, manual=None):
    return SimpleNamespace(category=cat, quantity=qty,
                           current_price=price, manual_value=manual)
def wallet(id,address):
    return SimpleNamespace(id=id,chain="bitcoin",address=address)
def cached_wallet(amount=.01,price=65000):
    return {"w1":{"savedAt":int(NOW.timestamp()*1000),"data":{
        "tokens":[{"symbol":"BTC","amount":amount,"price":price}],"total_usd":amount*price}}}
def report(month_record=None):
    return home_reconciliation_preview(
        [asset("stocks",2,50),asset("cash",manual=1000),
         asset("other",manual=50),asset("debts",manual=80)],
        [wallet("w1","one")],cached_wallet(),
        {"receivedAt":NOW.isoformat(),"projects":[{"id":"kryptex-project","balanceUsd":150}]},
        {"portfolioBalance":150,"source":"backend-project-feed"},
        {"projectPortfolio":{"bitcoin":{"value":600}}},month_record or {},
        [],"2026-11",1,NOW
    )

class NetWorthReconciliationTests(unittest.TestCase):
    def test_nightly_legacy_formula_is_explicit_and_not_claimed_as_home(self):
        personal=[asset("stocks",2,50),asset("cash",manual=1000),
                  asset("debts",manual=80)]
        result=legacy_nightly_components(
            personal,{"portfolioBalance":150},
            {"total":99999,"projectPortfolio":{"bitcoin":{"value":650}}})
        self.assertEqual(result["totalUsd"],1820)
        self.assertFalse(result["businessBalanceSheetIncluded"])
        self.assertFalse(result["comparableToHomeFinancials"])
        self.assertEqual(result["cryptoSubtotalUsd"],800)
        self.assertIsNone(result["cryptoLegacyFallbackUsd"])

    def test_stocks_manual_fallback_matches_home_but_old_scheduler_does_not(self):
        personal=[asset("stocks",manual=120)]
        self.assertEqual(personal_assets_home_basis(personal)["subtotalUsd"],120)
        self.assertEqual(legacy_nightly_components(personal,{},{} )["totalUsd"],0)

    def test_same_backend_sources_have_diagnostic_subtotal_not_certified_total(self):
        result=report()
        self.assertAlmostEqual(result["simplifiedPersonalPlusCryptoUsd"],1870)
        self.assertIsNone(result["homeCertifiedNetWorthUsd"])
        self.assertFalse(result["certified"])
        self.assertIsNone(result["businessBalanceSheetUsd"])
        self.assertEqual(result["projectPortfolioUsd"],150)
        self.assertEqual(result["bitcoin"]["amountBtc"],.01)
        self.assertEqual(result["bitcoin"]["quoteSource"],"wallet-observation-fallback")

    def test_unknown_wallet_cannot_be_reported_as_zero(self):
        result=home_reconciliation_preview(
            [asset("cash",manual=20)],[wallet("w1","one")],{},
            {"receivedAt":NOW.isoformat(),"projects":[{"id":"kryptex-project","balanceUsd":20}]},
            {"portfolioBalance":20,"source":"backend-project-feed"},
            {},{},[],"2026-11",1,NOW)
        self.assertIsNone(result["simplifiedPersonalPlusCryptoUsd"])
        self.assertIn("bitcoin-wallet-quantity-or-market-quote-missing",result["flags"])

    def test_lulo_opening_difference_flag_only_does_not_write_journal(self):
        journal=[{"date":"2026-11-01","lines":[
            {"account":"cash","debit":2488.14,"credit":0},
            {"account":"luloCash","debit":0,"credit":2488.14},
        ]}]
        original=repr(journal)
        flagged=lulo_withdrawal_review(
            journal,{"2026-11":{"items":[{"name":"Lulo","start":"2484.14"}]}},
            "2026-11")
        self.assertTrue(flagged["amountsRequireReview"])
        self.assertAlmostEqual(flagged["differenceUsd"],4.0)
        self.assertFalse(flagged["bankReceiptIndependentlyVerified"])
        self.assertFalse(flagged["financialJournalMutated"])
        self.assertEqual(repr(journal),original)

    def test_provider_summary_mismatch_is_unknown_not_overwritten(self):
        f=report()
        self.assertEqual(f["projectPortfolioUsd"],150)
        incomplete=home_reconciliation_preview(
            [asset("cash",manual=50)],[wallet("w1","one")],cached_wallet(),
            {"receivedAt":NOW.isoformat(),"projects":[{"id":"kryptex-project","balanceUsd":150}]},
            {"portfolioBalance":200,"source":"backend-project-feed"},
            {},{},[],"2026-11",1,NOW)
        self.assertIsNone(incomplete["projectPortfolioUsd"])
        self.assertIsNone(incomplete["simplifiedPersonalPlusCryptoUsd"])
        self.assertIn("project-feed-summary-mismatch-or-absent",incomplete["flags"])

    def test_missing_personal_valuation_flags_unknown(self):
        result=personal_assets_home_basis([asset("cash")])
        self.assertFalse(result["fullyValued"])
        self.assertIsNone(result["subtotalUsd"])
        self.assertEqual(result["unknownAssetCategories"],["cash"])


if __name__ == "__main__":
    unittest.main()
