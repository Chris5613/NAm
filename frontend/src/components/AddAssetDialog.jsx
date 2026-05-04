import { useState, useCallback, useEffect } from "react";
import { assetsApi, pricesApi } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, Landmark, CreditCard, Coins, RefreshCw, Loader2, Boxes } from "lucide-react";

const CATEGORIES = [
  { value: "stocks", label: "Stocks", icon: TrendingUp, hint: "Stock holdings with real-time prices" },
  { value: "cash", label: "Cash / Bank", icon: Landmark, hint: "Savings, checking, emergency funds" },
  { value: "debts", label: "Debts / Liabilities", icon: CreditCard, hint: "Loans, credit cards, mortgages" },
  { value: "other", label: "Other Assets", icon: Boxes, hint: "Real estate, vehicles, gold, watches, collectibles, anything manual" },
  { value: "crypto", label: "Crypto (manual)", icon: Coins, hint: "Use the Crypto tab for wallets. Use this only for manual crypto entries." },
];

export default function AddAssetDialog({ open, onOpenChange, onCreated, defaultCategory = "stocks" }) {
  const [category, setCategory] = useState(defaultCategory);
  const [submitting, setSubmitting] = useState(false);

  // Shared
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  // Stocks
  const [ticker, setTicker] = useState("");
  const [tickerSearchResults, setTickerSearchResults] = useState([]);
  const [searchingTicker, setSearchingTicker] = useState(false);
  const [stockQty, setStockQty] = useState("");
  const [stockPrice, setStockPrice] = useState("");
  const [stockCostBasis, setStockCostBasis] = useState("");
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [priceInfo, setPriceInfo] = useState(null);

  // Cash / Debts
  const [amount, setAmount] = useState("");

  // Crypto (manual)
  const [coinSearchResults, setCoinSearchResults] = useState([]);
  const [coinSymbol, setCoinSymbol] = useState("");
  const [coinIconUrl, setCoinIconUrl] = useState("");
  const [cryptoQty, setCryptoQty] = useState("");
  const [cryptoPrice, setCryptoPrice] = useState("");

  useEffect(() => {
    if (open) setCategory(defaultCategory);
  }, [open, defaultCategory]);

  const resetForm = () => {
    setName(""); setNotes(""); setTicker(""); setTickerSearchResults([]);
    setStockQty(""); setStockPrice(""); setStockCostBasis(""); setPriceInfo(null);
    setAmount(""); setCoinSearchResults([]); setCoinSymbol(""); setCoinIconUrl("");
    setCryptoQty(""); setCryptoPrice("");
  };

  // Stock ticker search (Finnhub)
  const searchTicker = useCallback(async (q) => {
    if (!q || q.length < 1) { setTickerSearchResults([]); return; }
    setSearchingTicker(true);
    try {
      const data = await pricesApi.searchStock(q);
      setTickerSearchResults(data || []);
    } catch {
      setTickerSearchResults([]);
    } finally {
      setSearchingTicker(false);
    }
  }, []);

  const selectTicker = async (item) => {
    setTicker(item.symbol);
    setName(item.name || item.symbol);
    setTickerSearchResults([]);
    // Auto-fetch current price
    setFetchingPrice(true);
    try {
      const data = await pricesApi.getStock(item.symbol);
      setStockPrice(String(data.c));
      setPriceInfo(data);
    } catch (err) {
      toast.error("Failed to fetch price");
    } finally {
      setFetchingPrice(false);
    }
  };

  const refreshStockPrice = async () => {
    if (!ticker) return;
    setFetchingPrice(true);
    try {
      const data = await pricesApi.getStock(ticker);
      setStockPrice(String(data.c));
      setPriceInfo(data);
      toast.success(`Latest: $${data.c}`);
    } catch (err) {
      toast.error("Failed to refresh price");
    } finally {
      setFetchingPrice(false);
    }
  };

  // Crypto coin search (CoinGecko)
  const searchCoin = useCallback(async (q) => {
    if (!q || q.length < 2) { setCoinSearchResults([]); return; }
    try {
      const data = await pricesApi.searchCrypto(q);
      setCoinSearchResults(data || []);
    } catch { setCoinSearchResults([]); }
  }, []);

  const selectCoin = (coin) => {
    setCoinSymbol(coin.id);
    setName(coin.name || coin.id);
    setCoinIconUrl(coin.icon_url || "");
    setCoinSearchResults([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let payload = { category, name, notes: notes || null };
      if (category === "stocks") {
        if (!ticker) { toast.error("Enter a ticker symbol"); setSubmitting(false); return; }
        if (!stockQty) { toast.error("Enter quantity"); setSubmitting(false); return; }
        payload = {
          ...payload,
          name: name || ticker,
          symbol: ticker.toUpperCase(),
          quantity: parseFloat(stockQty) || 0,
          current_price: parseFloat(stockPrice) || 0,
          cost_basis: parseFloat(stockCostBasis) || 0,
          manual_value: null,
          icon_url: null,
        };
      } else if (category === "cash" || category === "debts" || category === "other") {
        if (!name) { toast.error("Enter a name"); setSubmitting(false); return; }
        if (!amount) { toast.error("Enter an amount"); setSubmitting(false); return; }
        payload = {
          ...payload,
          symbol: null,
          quantity: 0,
          current_price: 0,
          cost_basis: 0,
          manual_value: parseFloat(amount) || 0,
          icon_url: null,
        };
      } else if (category === "crypto") {
        if (!coinSymbol) { toast.error("Select a coin"); setSubmitting(false); return; }
        if (!cryptoQty) { toast.error("Enter quantity"); setSubmitting(false); return; }
        payload = {
          ...payload,
          symbol: coinSymbol,
          quantity: parseFloat(cryptoQty) || 0,
          current_price: parseFloat(cryptoPrice) || 0,
          cost_basis: 0,
          manual_value: null,
          icon_url: coinIconUrl || null,
        };
      }
      await assetsApi.create(payload);
      toast.success(`${payload.name} added`);
      resetForm();
      onCreated();
    } catch (err) {
      toast.error("Failed to add asset");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-md max-h-[90vh] overflow-y-auto" data-testid="add-asset-dialog">
        <DialogHeader>
          <DialogTitle>Add Asset</DialogTitle>
          <DialogDescription>Track a new holding, cash account, or debt</DialogDescription>
        </DialogHeader>

        {/* Category picker as visual cards */}
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const active = category === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                data-testid={`category-btn-${cat.value}`}
                className={`flex items-center gap-2 p-3 rounded-lg border transition-colors text-left ${
                  active
                    ? "bg-white/10 border-white/30 text-foreground"
                    : "bg-secondary/30 border-border/40 text-muted-foreground hover:bg-secondary/50"
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.5} />
                <span className="text-sm font-medium">{cat.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground -mt-1">{CATEGORIES.find(c => c.value === category)?.hint}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ===== STOCKS ===== */}
          {category === "stocks" && (
            <>
              <div className="space-y-2 relative">
                <Label htmlFor="ticker">Ticker Symbol</Label>
                <Input
                  id="ticker"
                  placeholder="Search e.g. AAPL, Tesla, Microsoft"
                  value={ticker}
                  onChange={(e) => { setTicker(e.target.value.toUpperCase()); searchTicker(e.target.value); }}
                  data-testid="input-ticker"
                  className="bg-background border-border font-mono"
                  autoComplete="off"
                />
                {searchingTicker && (
                  <div className="absolute right-3 top-9"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                )}
                {tickerSearchResults.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg max-h-56 overflow-y-auto" data-testid="ticker-search-results">
                    {tickerSearchResults.map((t) => (
                      <button
                        key={t.symbol}
                        type="button"
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-secondary text-left text-sm transition-colors"
                        onClick={() => selectTicker(t)}
                        data-testid={`ticker-result-${t.symbol}`}
                      >
                        <span className="font-mono text-foreground">{t.symbol}</span>
                        <span className="text-xs text-muted-foreground truncate ml-3">{t.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="stock-name">Name (optional)</Label>
                <Input id="stock-name" placeholder="Apple Inc." value={name} onChange={(e) => setName(e.target.value)} className="bg-background border-border" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="stock-qty">Quantity (shares)</Label>
                  <Input
                    id="stock-qty"
                    type="number"
                    step="any"
                    placeholder="0"
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    data-testid="input-quantity"
                    className="bg-background border-border font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stock-price" className="flex items-center justify-between">
                    <span>Current Price ($)</span>
                    {ticker && (
                      <button type="button" onClick={refreshStockPrice} disabled={fetchingPrice} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1" data-testid="refresh-stock-price">
                        <RefreshCw className={`w-3 h-3 ${fetchingPrice ? "animate-spin" : ""}`} strokeWidth={1.5} />
                        Refresh
                      </button>
                    )}
                  </Label>
                  <Input
                    id="stock-price"
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={stockPrice}
                    onChange={(e) => setStockPrice(e.target.value)}
                    data-testid="input-price"
                    className="bg-background border-border font-mono"
                  />
                </div>
              </div>

              {priceInfo && (
                <div className="px-3 py-2 rounded-md bg-secondary/40 border border-border/30 text-xs font-mono flex items-center justify-between">
                  <span className="text-muted-foreground">Live: <span className="text-foreground">${priceInfo.price}</span></span>
                  <span className={priceInfo.change >= 0 ? "text-emerald-400" : "text-rose-400"}>{priceInfo.change_percent}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="cost-basis">Cost Basis ($) — optional</Label>
                <Input
                  id="cost-basis"
                  type="number"
                  step="any"
                  placeholder="Total amount you invested"
                  value={stockCostBasis}
                  onChange={(e) => setStockCostBasis(e.target.value)}
                  data-testid="input-cost-basis"
                  className="bg-background border-border font-mono"
                />
              </div>
            </>
          )}

          {/* ===== CASH / DEBTS / OTHER ===== */}
          {(category === "cash" || category === "debts" || category === "other") && (
            <>
              <div className="space-y-2">
                <Label htmlFor="cd-name">
                  {category === "debts" ? "Debt Name" : category === "other" ? "Asset Name" : "Account Name"}
                </Label>
                <Input
                  id="cd-name"
                  placeholder={
                    category === "debts"
                      ? "e.g. Chase Credit Card"
                      : category === "other"
                      ? "e.g. House, Tesla Model 3, Rolex Submariner"
                      : "e.g. Chase Savings"
                  }
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-name"
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cd-amount">
                  {category === "debts" ? "Amount Owed ($)" : category === "other" ? "Estimated Value ($)" : "Balance ($)"}
                </Label>
                <Input
                  id="cd-amount"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  data-testid="input-manual-value"
                  className="bg-background border-border font-mono"
                />
              </div>
            </>
          )}

          {/* ===== CRYPTO (manual) ===== */}
          {category === "crypto" && (
            <>
              <div className="space-y-2 relative">
                <Label htmlFor="coin">Coin</Label>
                <div className="flex items-center gap-2">
                  {coinIconUrl && <img src={coinIconUrl} alt="" className="w-6 h-6 rounded-sm" />}
                  <Input
                    id="coin"
                    placeholder="Search coin (e.g. bitcoin, solana)"
                    value={coinSymbol}
                    onChange={(e) => { setCoinSymbol(e.target.value); searchCoin(e.target.value); }}
                    className="bg-background border-border"
                  />
                </div>
                {coinSearchResults.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {coinSearchResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-secondary text-left text-sm"
                        onClick={() => selectCoin(c)}
                      >
                        {c.icon_url && <img src={c.icon_url} alt="" className="w-5 h-5 rounded-sm" />}
                        <span className="text-foreground">{c.name}</span>
                        <span className="font-mono text-xs text-muted-foreground uppercase">{c.symbol}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input type="number" step="any" placeholder="0" value={cryptoQty} onChange={(e) => setCryptoQty(e.target.value)} className="bg-background border-border font-mono" />
                </div>
                <div className="space-y-2">
                  <Label>Price ($)</Label>
                  <Input type="number" step="any" placeholder="0.00" value={cryptoPrice} onChange={(e) => setCryptoPrice(e.target.value)} className="bg-background border-border font-mono" />
                </div>
              </div>
            </>
          )}

          {/* Notes - shared */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-notes" className="bg-background border-border" />
          </div>

          <Button type="submit" disabled={submitting} className="w-full bg-white text-black hover:bg-neutral-200" data-testid="submit-add-asset">
            {submitting ? "Adding..." : "Add Asset"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
