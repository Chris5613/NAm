"""Bitcoin valuation: one server price, deduplicated wallet quantity, no income."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import unittest

from backend.bitcoin_valuation import wallet_evidence, combine_crypto_valuation

NOW = datetime(2026, 11, 15, 5, tzinfo=timezone.utc)


def wallet(id, address, chain="bitcoin"):
    return SimpleNamespace(id=id, address=address, chain=chain)


def snapshot(amount, price=64869, at=NOW):
    return {"savedAt":int(at.timestamp() * 1000),
            "data":{"tokens":[{"symbol":"BTC","amount":amount,"price":price}],
                    "total_usd":amount * price}}


class BitcoinValuationTests(unittest.TestCase):
    def test_one_quote_applied_to_seven_unique_wallets(self):
        wallets=[wallet(str(i), "btc-address-"+str(i)) for i in range(7)]
        cache={str(i):snapshot(.001 if i<6 else .01106226) for i in range(7)}
        observed=wallet_evidence(wallets,cache,NOW)
        self.assertEqual(observed["walletCount"],7)
        self.assertAlmostEqual(observed["btcAmount"],.01706226)
        summary=combine_crypto_valuation(observed,3945.30325102,81180,
                                        "coingecko-backend","2026-11-15T05:00:00Z",1,NOW)
        self.assertAlmostEqual(summary["bitcoin"]["valueUsd"],1385.1142668,7)
        self.assertAlmostEqual(summary["cryptoTotalUsd"],5330.41751782,7)
        self.assertTrue(summary["complete"])
        self.assertEqual(summary["bitcoin"]["quoteSource"],"coingecko-backend")

    def test_price_only_changes_do_not_change_wallet_amount_or_income(self):
        wallets=[wallet("a","addr-a")]
        observed=wallet_evidence(wallets,{"a":snapshot(.02)},NOW)
        low=combine_crypto_valuation(observed,200,65000,user_id=1)
        high=combine_crypto_valuation(observed,200,81000,user_id=1)
        self.assertEqual(low["bitcoin"]["amountBtc"],high["bitcoin"]["amountBtc"])
        self.assertAlmostEqual(high["cryptoTotalUsd"]-low["cryptoTotalUsd"],320)
        self.assertNotIn("minedIncomeUsd",high)

    def test_duplicate_addresses_not_double_counted(self):
        wallets=[wallet("first","SAME"),wallet("duplicate","same")]
        observed=wallet_evidence(wallets,{"first":snapshot(.01),"duplicate":snapshot(.8)},NOW)
        self.assertAlmostEqual(observed["btcAmount"],.01)
        self.assertEqual(observed["walletCount"],1)

    def test_missing_or_invalid_wallet_cannot_fake_zero(self):
        wallets=[wallet("a","one"),wallet("b","two")]
        observed=wallet_evidence(wallets,{"a":snapshot(.01)},NOW)
        self.assertIsNone(observed["btcAmount"])
        self.assertEqual(observed["missingWalletCount"],1)
        result=combine_crypto_valuation(observed,100,81000,user_id=1)
        self.assertIsNone(result["cryptoTotalUsd"])
        self.assertFalse(result["complete"])

    def test_fallback_quote_is_labeled_provisional(self):
        observed=wallet_evidence([wallet("a","one")],{"a":snapshot(.01)},NOW)
        result=combine_crypto_valuation(observed,100,user_id=1)
        self.assertEqual(result["bitcoin"]["quoteSource"],"wallet-observation-fallback")
        self.assertAlmostEqual(result["cryptoTotalUsd"],748.69)

    def test_stale_wallet_reading_is_disclosed(self):
        observed=wallet_evidence([wallet("a","one")],
            {"a":snapshot(.01,at=NOW-timedelta(hours=3))},NOW)
        self.assertEqual(observed["staleWalletCount"],1)
        self.assertEqual(observed["missingWalletCount"],0)

    def test_mismatched_cache_prices_need_independent_backend_quote(self):
        wallets=[wallet("a","one"),wallet("b","two")]
        observed=wallet_evidence(wallets,{"a":snapshot(.01,64869),"b":snapshot(.02,81180)},NOW)
        self.assertTrue(observed["legacyQuoteDisagreement"])
        self.assertIsNone(observed["fallbackPriceUsd"])
        self.assertIsNone(combine_crypto_valuation(observed,100)["cryptoTotalUsd"])


if __name__ == "__main__":
    unittest.main()
