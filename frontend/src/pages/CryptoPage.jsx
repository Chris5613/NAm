import { useState, useEffect, useCallback, useRef } from "react";
import { walletsApi, tokenPrefsApi, customTokensApi, cryptoCacheApi } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, RefreshCw, Trash2, Wallet, ExternalLink, Lock, Coins, Layers, Settings, EyeOff, Eye, Image, Pencil } from "lucide-react";

function formatCurrency(v) {
  if (!v && v !== 0) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);
}
function shortenAddr(a) { return a?.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || ""; }

const CHAIN_META = {
  bitcoin: { name: "Bitcoin", color: "border-amber-500/30 text-amber-400", activeBg: "bg-amber-500/15", icon: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png" },
  solana: { name: "Solana", color: "border-purple-500/30 text-purple-400", activeBg: "bg-purple-500/15", icon: "https://assets.coingecko.com/coins/images/4128/small/solana.png" },
  ethereum: { name: "Ethereum", color: "border-blue-500/30 text-blue-400", activeBg: "bg-blue-500/15", icon: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" },
  bsc: { name: "BNB Chain", color: "border-yellow-500/30 text-yellow-400", activeBg: "bg-yellow-500/15", icon: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png" },
  polygon: { name: "Polygon", color: "border-violet-500/30 text-violet-400", activeBg: "bg-violet-500/15", icon: "https://assets.coingecko.com/coins/images/4713/small/polygon.png" },
  avalanche: { name: "Avalanche", color: "border-red-500/30 text-red-400", activeBg: "bg-red-500/15", icon: "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png" },
  arbitrum: { name: "Arbitrum", color: "border-sky-500/30 text-sky-400", activeBg: "bg-sky-500/15", icon: "https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg" },
  optimism: { name: "Optimism", color: "border-rose-500/30 text-rose-400", activeBg: "bg-rose-500/15", icon: "https://assets.coingecko.com/coins/images/25244/small/Optimism.png" },
  base: { name: "Base", color: "border-blue-500/30 text-blue-400", activeBg: "bg-blue-500/15", icon: "https://assets.coingecko.com/asset_platforms/images/131/small/base.jpeg" },
  tron: { name: "Tron", color: "border-red-500/30 text-red-400", activeBg: "bg-red-500/15", icon: "https://assets.coingecko.com/coins/images/1094/small/tron-logo.png" },
  fantom: { name: "Fantom", color: "border-blue-500/30 text-blue-400", activeBg: "bg-blue-500/15", icon: "https://assets.coingecko.com/coins/images/4001/small/Fantom_round.png" },
};

export default function CryptoPage() {
  const [wallets, setWallets] = useState([]);
  const [balances, setBalances] = useState({});
  const [defiPositions, setDefiPositions] = useState([]);
  const [tokenPrefs, setTokenPrefs] = useState({});
  const [customTokens, setCustomTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [liveHistory, setLiveHistory] = useState([]);
  const [activeChain, setActiveChain] = useState(null);
  const [logoEditToken, setLogoEditToken] = useState(null);

  const fetchWallets = useCallback(async () => {
    try {
      const [walletsRes, prefsRes, customRes] = await Promise.all([
        walletsApi.getAll(),
        tokenPrefsApi.getAll(),
        customTokensApi.getAll(),
      ]);
      setWallets(walletsRes.data || []);
      const prefsMap = {};
      (prefsRes.data || []).forEach(p => { prefsMap[p.symbol] = p; });
      setTokenPrefs(prefsMap);
      setCustomTokens(customRes.data || []);
    } catch { toast.error("Failed to load wallets"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchWallets(); }, [fetchWallets]);

  const fetchingRef = useRef(new Set());

  useEffect(() => {
    if (wallets.length === 0) return;
    // Fetch balances for any wallet that hasn't been fetched yet (covers newly added wallets too)
    wallets.forEach(async (w) => {
      if (balances[w.id] || fetchingRef.current.has(w.id)) return;
      fetchingRef.current.add(w.id);
      try {
        const res = await walletsApi.getBalances(w.id);
        setBalances(prev => ({ ...prev, [w.id]: res.data }));
      } catch (err) {
        console.error(`Balance fetch error for ${w.id}:`, err);
      } finally {
        fetchingRef.current.delete(w.id);
      }
    });
    // Fetch DeFi positions once for Solana wallets
    const solWallets = wallets.filter(w => w.chain === "solana");
    if (solWallets.length > 0 && defiPositions.length === 0) fetchAllDefi(solWallets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets]);

  // Auto-poll every hour
  useEffect(() => {
    if (wallets.length === 0) return;
    const interval = setInterval(() => {
      fetchWallets();
      // Re-fetch balances for all wallets
      wallets.forEach(async (w) => {
        if (fetchingRef.current.has(w.id)) return;
        fetchingRef.current.add(w.id);
        try {
          const res = await walletsApi.getBalances(w.id);
          setBalances(prev => ({ ...prev, [w.id]: res.data }));
        } catch { /* silent */ }
        finally { fetchingRef.current.delete(w.id); }
      });
    }, 3600000); // 1 hour
    return () => clearInterval(interval);
  }, [wallets.length, fetchWallets, wallets]);

  const fetchBalance = async (wid) => {
    try {
      const res = await walletsApi.getBalances(wid);
      setBalances(prev => ({ ...prev, [wid]: res.data }));
    } catch { /* silent */ }
  };

  const fetchAllDefi = async (solWallets) => {
    const allPositions = [];
    for (const w of solWallets) {
      try {
        const res = await walletsApi.getDefiPositions(w.address);
        if (res.data?.positions) allPositions.push(...res.data.positions);
      } catch { /* silent */ }
    }
    // Merge by platform
    const merged = {};
    allPositions.forEach(p => {
      const key = p.platform_id || p.platform;
      if (!merged[key]) { merged[key] = { ...p, tokens: [...p.tokens] }; }
      else {
        merged[key].total_value += p.total_value;
        merged[key].tokens.push(...p.tokens);
      }
    });
    setDefiPositions(Object.values(merged).sort((a, b) => b.total_value - a.total_value));
  };

  const refreshAll = async () => {
    setRefreshing(true);
    const newBalances = {};
    for (const w of wallets) {
      try {
        const res = await walletsApi.getBalances(w.id);
        newBalances[w.id] = res.data;
      } catch { /* silent */ }
    }
    setBalances(newBalances);
    const solWallets = wallets.filter(w => w.chain === "solana");
    if (solWallets.length > 0) await fetchAllDefi(solWallets);
    const total = Object.values(newBalances).reduce((s, b) => s + (b?.total_usd || 0), 0);
    if (total > 0) setLiveHistory(prev => [...prev, { time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), value: total }]);
    setRefreshing(false);
    toast.success("Refreshed");
  };

  const toggleHideToken = async (symbol) => {
    const current = tokenPrefs[symbol]?.hidden || false;
    try {
      await tokenPrefsApi.update(symbol, { hidden: !current });
      setTokenPrefs(prev => ({ ...prev, [symbol]: { ...prev[symbol], symbol, hidden: !current } }));
      toast.success(!current ? `${symbol} hidden` : `${symbol} shown`);
    } catch { toast.error("Failed to update"); }
  };

  const setTokenLogo = async (symbol, url) => {
    try {
      await tokenPrefsApi.update(symbol, { custom_icon_url: url });
      setTokenPrefs(prev => ({ ...prev, [symbol]: { ...prev[symbol], symbol, custom_icon_url: url } }));
      setLogoEditToken(null);
      toast.success("Logo updated");
    } catch { toast.error("Failed to update"); }
  };

  // Aggregate - exclude hidden tokens from totals
  const allTokensRaw = [];
  wallets.forEach(w => {
    balances[w.id]?.tokens?.forEach(t => allTokensRaw.push({ ...t, chain: w.chain }));
  });
  // Add custom tokens to raw totals
  customTokens.forEach(ct => {
    allTokensRaw.push({ symbol: ct.symbol, usd_value: ct.amount * ct.price, chain: ct.chain || "custom" });
  });
  // Calculate total excluding hidden
  const hiddenSymbols = new Set(Object.entries(tokenPrefs).filter(([_, p]) => p.hidden).map(([s]) => s));
  const visibleTotal = allTokensRaw.filter(t => !hiddenSymbols.has(t.symbol)).reduce((s, t) => s + (t.usd_value || 0), 0);
  const defiTotalValue = defiPositions.reduce((s, p) => s + p.total_value, 0);
  const grandTotal = visibleTotal + defiTotalValue;

  const chainBreakdown = {};
  wallets.forEach(w => {
    const tokens = balances[w.id]?.tokens || [];
    const visibleValue = tokens.filter(t => !hiddenSymbols.has(t.symbol)).reduce((s, t) => s + (t.usd_value || 0), 0);
    chainBreakdown[w.chain] = (chainBreakdown[w.chain] || 0) + visibleValue;
  });
  // Add custom tokens to chain breakdown
  customTokens.forEach(ct => {
    if (!hiddenSymbols.has(ct.symbol)) {
      const ctChain = ct.chain || "custom";
      chainBreakdown[ctChain] = (chainBreakdown[ctChain] || 0) + (ct.amount * ct.price);
    }
  });
  if (defiTotalValue > 0) chainBreakdown["solana"] = (chainBreakdown["solana"] || 0) + defiTotalValue;
  const sortedChains = Object.entries(chainBreakdown).sort((a, b) => b[1] - a[1]);

  // Combine tokens (wallet balances + custom tokens)
  const allTokens = [];
  wallets.forEach(w => {
    if (activeChain && w.chain !== activeChain) return;
    balances[w.id]?.tokens?.forEach(t => allTokens.push({ ...t, chain: w.chain }));
  });
  // Add custom tokens matching active chain filter
  customTokens.forEach(ct => {
    if (activeChain && ct.chain !== activeChain) return;
    allTokens.push({
      symbol: ct.symbol,
      name: ct.name,
      amount: ct.amount,
      price: ct.price,
      usd_value: ct.amount * ct.price,
      icon_url: ct.icon_url || "",
      category: "wallet",
      protocol: null,
      chain: ct.chain || "custom",
    });
  });
  const combined = {};
  allTokens.forEach(t => {
    const key = `${t.symbol}_${t.category}_${t.protocol || ""}`;
    if (combined[key]) { combined[key].amount += t.amount; combined[key].usd_value += t.usd_value; }
    else combined[key] = { ...t };
  });
  const combinedTokens = Object.values(combined).sort((a, b) => b.usd_value - a.usd_value);
  // Apply token prefs: filter hidden, apply custom icons
  const walletTokens = combinedTokens
    .filter(t => t.category === "wallet" && t.usd_value > 0.01)
    .filter(t => !tokenPrefs[t.symbol]?.hidden)
    .map(t => ({
      ...t,
      icon_url: tokenPrefs[t.symbol]?.custom_icon_url || t.icon_url,
    }));
  const hiddenTokens = combinedTokens
    .filter(t => t.category === "wallet" && t.usd_value > 0.01 && tokenPrefs[t.symbol]?.hidden);
  const walletTotal = walletTokens.reduce((s, t) => s + t.usd_value, 0);

  // Filter DeFi by chain (defi is always solana)
  const filteredDefi = (!activeChain || activeChain === "solana") ? defiPositions : [];

  useEffect(() => { if (grandTotal > 0 && liveHistory.length === 0) setLiveHistory([{ time: "Now", value: grandTotal }]); }, [grandTotal]);

  // Sync crypto total + chain breakdown + tokens to backend cache so the main Net Worth page reflects it
  const lastSyncedRef = useRef(null);
  useEffect(() => {
    if (loading) return;
    // Only sync when we have fetched balances (wallets may still be loading)
    if (wallets.length > 0 && Object.keys(balances).length === 0) return;
    const syncKey = JSON.stringify({ t: grandTotal, c: sortedChains.length });
    if (lastSyncedRef.current === syncKey) return;
    lastSyncedRef.current = syncKey;

    // Build chain-keyed tokens (wallet tokens + custom tokens, excluding hidden)
    const tokensByChain = {};
    wallets.forEach(w => {
      (balances[w.id]?.tokens || []).forEach(t => {
        if (hiddenSymbols.has(t.symbol)) return;
        if ((t.usd_value || 0) < 0.01) return;
        if (!tokensByChain[w.chain]) tokensByChain[w.chain] = [];
        tokensByChain[w.chain].push({
          symbol: t.symbol,
          name: t.name || "",
          amount: t.amount || 0,
          price: t.price || 0,
          usd_value: t.usd_value || 0,
          icon_url: tokenPrefs[t.symbol]?.custom_icon_url || t.icon_url || "",
          chain: w.chain,
        });
      });
    });
    customTokens.forEach(ct => {
      if (hiddenSymbols.has(ct.symbol)) return;
      const value = (ct.amount || 0) * (ct.price || 0);
      if (value < 0.01) return;
      const ch = ct.chain || "custom";
      if (!tokensByChain[ch]) tokensByChain[ch] = [];
      tokensByChain[ch].push({
        symbol: ct.symbol,
        name: ct.name || ct.symbol,
        amount: ct.amount || 0,
        price: ct.price || 0,
        usd_value: value,
        icon_url: tokenPrefs[ct.symbol]?.custom_icon_url || ct.icon_url || "",
        chain: ch,
      });
    });
    // Merge same-symbol tokens within a chain
    Object.keys(tokensByChain).forEach(ch => {
      const merged = {};
      tokensByChain[ch].forEach(t => {
        const k = t.symbol;
        if (merged[k]) { merged[k].amount += t.amount; merged[k].usd_value += t.usd_value; }
        else merged[k] = { ...t };
      });
      tokensByChain[ch] = Object.values(merged).sort((a, b) => b.usd_value - a.usd_value);
    });

    const chainsPayload = sortedChains.map(([chain, value]) => ({
      chain,
      value,
      tokens: tokensByChain[chain] || [],
    }));

    const allTokensFlat = [];
    Object.values(tokensByChain).forEach(arr => allTokensFlat.push(...arr));

    cryptoCacheApi.set({
      total: grandTotal,
      chains: chainsPayload,
      tokens: allTokensFlat,
    }).catch(() => { /* silent */ });
  }, [grandTotal, loading, wallets, balances, customTokens, tokenPrefs, sortedChains.length]);

  if (loading) return <div className="flex items-center justify-center min-h-[300px]"><p className="text-muted-foreground font-mono animate-pulse">Loading...</p></div>;

  return (
    <div className="space-y-6" data-testid="crypto-page">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-medium tracking-tight">Crypto</h1>
        <div className="flex items-center gap-2">
          {wallets.length > 0 && (
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={refreshing} className="border-border/40 hover:bg-secondary" data-testid="refresh-all-btn">
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />Refresh
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setWalletModalOpen(true)} className="border-border/40 hover:bg-secondary" data-testid="manage-wallets-btn">
            <Settings className="w-4 h-4 mr-2" strokeWidth={1.5} />Wallets
          </Button>
        </div>
      </div>

      {wallets.length === 0 ? (
        <Card className="border-border/40 bg-card">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <Wallet className="w-10 h-10 text-muted-foreground mb-4" strokeWidth={1.5} />
            <p className="text-muted-foreground text-sm mb-3">No wallets added yet</p>
            <Button size="sm" onClick={() => setWalletModalOpen(true)} className="bg-white text-black hover:bg-neutral-200">
              <Plus className="w-4 h-4 mr-2" />Add Wallets
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Net Worth + Chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border/40 bg-card" data-testid="crypto-net-worth">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground mb-1">Net Worth</p>
                <p className="font-mono text-4xl font-bold text-foreground">{formatCurrency(grandTotal)}</p>
              </CardContent>
            </Card>
            <Card className="border-border/40 bg-card">
              <CardContent className="p-4">
                {liveHistory.length > 1 ? (
                  <ResponsiveContainer width="100%" height={110}>
                    <AreaChart data={liveHistory} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={0.2}/><stop offset="100%" stopColor="#10B981" stopOpacity={0}/></linearGradient></defs>
                      <Tooltip contentStyle={{ background: "#121214", border: "1px solid #27272A", borderRadius: "6px", fontFamily: "'Space Mono', monospace", fontSize: "11px" }} formatter={v => [formatCurrency(v), ""]} />
                      <Area type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2} fill="url(#cg)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div className="h-[110px] flex items-center justify-center"><p className="text-xs text-muted-foreground">Chart builds as you refresh</p></div>}
              </CardContent>
            </Card>
          </div>

          {/* Network Chips */}
          <div className="flex items-center gap-3 flex-wrap" data-testid="network-chips">
            <button onClick={() => setActiveChain(null)} className={`flex items-center gap-2 px-4 py-2.5 rounded-md border transition-colors ${!activeChain ? "border-white/30 bg-white/10 text-foreground" : "border-border/40 text-muted-foreground hover:border-white/20"}`} data-testid="network-chip-all">
              <Layers className="w-4 h-4" strokeWidth={1.5} /><div><p className="text-xs font-medium text-left">All</p><p className="font-mono text-xs">{formatCurrency(grandTotal)}</p></div>
            </button>
            {sortedChains.map(([chain, value]) => {
              const m = CHAIN_META[chain] || { name: chain, color: "border-border text-foreground", activeBg: "bg-secondary", icon: "" };
              const pct = grandTotal > 0 ? ((value / grandTotal) * 100).toFixed(0) : 0;
              const active = activeChain === chain;
              return (
                <button key={chain} onClick={() => setActiveChain(active ? null : chain)} className={`flex items-center gap-2.5 px-4 py-2.5 rounded-md border transition-colors ${active ? `${m.activeBg} ${m.color}` : "border-border/40 text-muted-foreground hover:border-white/20"}`} data-testid={`network-chip-${chain}`}>
                  {m.icon && <img src={m.icon} alt="" className="w-5 h-5 rounded-full" />}
                  <div><p className="text-xs font-medium text-left">{m.name}</p><p className="font-mono text-xs">{formatCurrency(value)} <span className="opacity-60">{pct}%</span></p></div>
                </button>
              );
            })}
          </div>

          {/* Holdings */}
          {walletTokens.length > 0 && (
            <Card className="border-border/40 bg-card" data-testid="holdings-section">
              <CardHeader className="pb-0 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Coins className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} /><CardTitle className="text-sm font-medium">Holdings</CardTitle></div>
                  <span className="font-mono text-sm text-foreground">{formatCurrency(walletTotal)}</span>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-2 pt-2">
                <div className="px-3 py-1.5 grid grid-cols-5 text-xs text-muted-foreground border-b border-border/20">
                  <span>Asset</span><span className="text-right">Balance</span><span className="text-right">Price</span><span className="text-right">Value</span><span></span>
                </div>
                {walletTokens.map((t, i) => (
                  <div key={i} className="px-3 py-2.5 grid grid-cols-5 items-center hover:bg-secondary/30 transition-colors group">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setLogoEditToken(t.symbol)} className="relative flex-shrink-0 group/logo" title="Click to set custom logo">
                        {t.icon_url ? <img src={t.icon_url} alt="" className="w-6 h-6 rounded-full" onError={e => e.target.style.display='none'} /> : <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center border border-border/40"><span className="text-[10px] font-bold text-muted-foreground">{(t.symbol||"?")[0]}</span></div>}
                        <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity">
                          <Image className="w-3 h-3 text-white" strokeWidth={2} />
                        </div>
                      </button>
                      <span className="text-sm font-medium text-foreground">{t.symbol}</span>
                    </div>
                    <span className="font-mono text-xs text-foreground text-right">{t.amount < 0.0001 ? t.amount.toExponential(2) : t.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                    <span className="font-mono text-xs text-muted-foreground text-right">{t.price > 0 ? formatCurrency(t.price) : "-"}</span>
                    <span className="font-mono text-sm text-foreground text-right font-medium">{t.usd_value > 0.01 ? formatCurrency(t.usd_value) : "<$0.01"}</span>
                    <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => toggleHideToken(t.symbol)} className="text-muted-foreground hover:text-foreground p-1" title="Hide token" data-testid={`hide-${t.symbol}`}>
                        <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                ))}
                {hiddenTokens.length > 0 && (
                  <div className="px-3 py-2 border-t border-border/20">
                    <p className="text-xs text-muted-foreground mb-1">{hiddenTokens.length} hidden token{hiddenTokens.length > 1 ? "s" : ""}</p>
                    <div className="flex flex-wrap gap-2">
                      {hiddenTokens.map(t => (
                        <button key={t.symbol} onClick={() => toggleHideToken(t.symbol)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded bg-secondary/50" data-testid={`show-${t.symbol}`}>
                          <Eye className="w-3 h-3" /> {t.symbol}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* DeFi Positions from Jupiter */}
          {filteredDefi.filter(p => p.label !== "Wallet").map((pos, idx) => (
            <Card key={idx} className="border-border/40 bg-card" data-testid={`defi-${pos.platform_id}`}>
              <CardHeader className="pb-0 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-emerald-400" strokeWidth={1.5} /><CardTitle className="text-sm font-medium">{pos.platform}</CardTitle><span className="text-xs text-muted-foreground">{pos.label}</span></div>
                  <div className="flex items-center gap-3">
                    {pos.apy > 0 && <span className="text-xs font-mono text-emerald-400">Earn</span>}
                    <span className="font-mono text-sm text-foreground">{formatCurrency(pos.total_value)}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-2 pt-2">
                <div className="px-3 py-1.5 grid grid-cols-5 text-xs text-muted-foreground border-b border-border/20">
                  <span>Asset</span><span className="text-right">Balance</span><span className="text-right">Yield</span><span className="text-right">Price</span><span className="text-right">Value</span>
                </div>
                {pos.tokens.filter(t => t.value > 0.01).map((t, i) => (
                  <div key={i} className="px-3 py-2.5 grid grid-cols-5 items-center hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-2">
                      {t.image_uri ? <img src={t.image_uri} alt="" className="w-5 h-5 rounded-full" /> : <div className="w-5 h-5 rounded-full bg-secondary" />}
                      <span className="text-sm font-medium text-foreground">{t.symbol || t.name || shortenAddr(t.address)}</span>
                    </div>
                    <span className="font-mono text-xs text-foreground text-right">{t.amount?.toLocaleString(undefined, { maximumFractionDigits: 2 })} {t.symbol}</span>
                    <span className="font-mono text-xs text-emerald-400 text-right">{t.apy ? `${(t.apy * 100).toFixed(2)}% APY` : "-"}</span>
                    <span className="font-mono text-xs text-muted-foreground text-right">{t.price > 0 ? formatCurrency(t.price) : "-"}</span>
                    <span className="font-mono text-sm text-foreground text-right font-medium">{formatCurrency(t.value)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </>
      )}

      <WalletManageModal open={walletModalOpen} onOpenChange={setWalletModalOpen} wallets={wallets} customTokens={customTokens} onUpdate={fetchWallets} />
      <LogoEditDialog symbol={logoEditToken} open={!!logoEditToken} onOpenChange={(o) => !o && setLogoEditToken(null)} onSave={setTokenLogo} />
    </div>
  );
}

function TokenRow({ token }) {
  return (
    <div className="px-3 py-2.5 grid grid-cols-4 items-center hover:bg-secondary/30 transition-colors">
      <div className="flex items-center gap-2">
        {token.icon_url ? <img src={token.icon_url} alt="" className="w-5 h-5 rounded-full" onError={e => e.target.style.display='none'} /> : <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center"><span className="text-[9px] font-bold text-muted-foreground">{(token.symbol||"?")[0]}</span></div>}
        <span className="text-sm font-medium text-foreground">{token.symbol}</span>
      </div>
      <span className="font-mono text-xs text-foreground text-right">{token.amount < 0.0001 ? token.amount.toExponential(2) : token.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
      <span className="font-mono text-xs text-muted-foreground text-right">{token.price > 0 ? formatCurrency(token.price) : "-"}</span>
      <span className="font-mono text-sm text-foreground text-right font-medium">{token.usd_value > 0.01 ? formatCurrency(token.usd_value) : "<$0.01"}</span>
    </div>
  );
}

function WalletManageModal({ open, onOpenChange, wallets, customTokens, onUpdate }) {
  const [addresses, setAddresses] = useState("");
  const [chain, setChain] = useState("solana");
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    const lines = addresses.split(/[\n,]+/).map(a => a.trim()).filter(Boolean);
    if (lines.length === 0) { toast.error("Enter at least one address"); return; }
    setSubmitting(true);
    try {
      const payload = lines.map(addr => ({ address: addr, chain, label: null }));
      await walletsApi.addBulk(payload);
      toast.success(`${lines.length} wallet(s) added`);
      setAddresses("");
      onUpdate();
    } catch { toast.error("Failed to add wallets"); } finally { setSubmitting(false); }
  };

  const handleDelete = async (wallet) => {
    await walletsApi.delete(wallet.id);
    toast.success("Removed");
    onUpdate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="wallet-manage-modal">
        <DialogHeader>
          <DialogTitle>Manage Wallets</DialogTitle>
          <DialogDescription>Add or remove wallet addresses</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Chain</Label>
            <Select value={chain} onValueChange={setChain}>
              <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="solana">Solana (SOL)</SelectItem>
                <SelectItem value="bitcoin">Bitcoin (BTC)</SelectItem>
                <SelectItem value="ethereum">Ethereum (ETH)</SelectItem>
                <SelectItem value="bsc">BNB Chain (BSC)</SelectItem>
                <SelectItem value="polygon">Polygon (MATIC)</SelectItem>
                <SelectItem value="avalanche">Avalanche (AVAX)</SelectItem>
                <SelectItem value="arbitrum">Arbitrum (ARB)</SelectItem>
                <SelectItem value="optimism">Optimism (OP)</SelectItem>
                <SelectItem value="base">Base</SelectItem>
                <SelectItem value="tron">Tron (TRX)</SelectItem>
                <SelectItem value="fantom">Fantom (FTM)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Addresses (one per line or comma-separated)</Label>
            <textarea
              className="w-full h-28 px-3 py-2 bg-background border border-border rounded-md text-sm font-mono text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={"Paste wallet addresses here...\nOne per line or comma-separated"}
              value={addresses}
              onChange={e => setAddresses(e.target.value)}
              data-testid="wallet-addresses-input"
            />
          </div>
          <Button onClick={handleAdd} disabled={submitting} className="w-full bg-white text-black hover:bg-neutral-200" data-testid="submit-wallets-btn">
            {submitting ? "Adding..." : "Add Wallets"}
          </Button>
        </div>

        {wallets.length > 0 && (
          <div className="space-y-2 pt-4 border-t border-border/40">
            <p className="text-xs text-muted-foreground font-medium">Connected ({wallets.length})</p>
            {wallets.map(w => (
              <div key={w.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/30">
                <div className="flex items-center gap-2">
                  <img src={CHAIN_META[w.chain]?.icon || ""} alt="" className="w-4 h-4 rounded-full" onError={e => e.target.style.display='none'} />
                  <span className="text-xs text-muted-foreground">{CHAIN_META[w.chain]?.name || w.chain}</span>
                  <span className="font-mono text-xs text-foreground">{shortenAddr(w.address)}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-400 hover:text-rose-300" onClick={() => handleDelete(w)} data-testid={`del-wallet-${w.id}`}>
                  <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Custom Tokens */}
        <CustomTokensSection customTokens={customTokens} onUpdate={onUpdate} />
      </DialogContent>
    </Dialog>
  );
}


function LogoEditDialog({ symbol, open, onOpenChange, onSave }) {
  const [url, setUrl] = useState("");
  if (!symbol) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-sm" data-testid="logo-edit-dialog">
        <DialogHeader>
          <DialogTitle>Set Logo — {symbol}</DialogTitle>
          <DialogDescription>Paste an image URL for this token</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {url && <img src={url} alt="" className="w-10 h-10 rounded-full mx-auto border border-border" />}
          <Input
            placeholder="https://example.com/logo.png"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="bg-background border-border font-mono text-sm"
            data-testid="logo-url-input"
          />
          <Button onClick={() => onSave(symbol, url)} className="w-full bg-white text-black hover:bg-neutral-200" disabled={!url} data-testid="save-logo-btn">
            Save Logo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomTokensSection({ customTokens, onUpdate }) {
  const [form, setForm] = useState({ symbol: "", name: "", amount: "", price: "", icon_url: "", chain: "solana" });
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const priceTimeout = useRef(null);

  // Auto-fetch price when symbol changes
  const fetchPrice = async (symbol) => {
    if (!symbol || symbol.length < 2) return;
    setFetchingPrice(true);
    try {
      const price = await customTokensApi.getPrice(symbol);
      if (price > 0) {
        setForm(prev => ({
          ...prev,
          price: price.toString(),
        }));
      }
    } catch { /* silent */ } finally { setFetchingPrice(false); }
  };

  const handleSymbolChange = (value) => {
    setForm(prev => ({ ...prev, symbol: value }));
    if (priceTimeout.current) clearTimeout(priceTimeout.current);
    priceTimeout.current = setTimeout(() => fetchPrice(value), 800);
  };

  const handleAdd = async () => {
    if (!form.symbol || !form.amount) { toast.error("Symbol and amount required"); return; }
    setSubmitting(true);
    try {
      await customTokensApi.create({
        symbol: form.symbol.toUpperCase(),
        name: form.name || form.symbol,
        amount: parseFloat(form.amount) || 0,
        price: parseFloat(form.price) || 0,
        icon_url: form.icon_url || null,
        chain: form.chain,
      });
      toast.success(`${form.symbol} added`);
      setForm({ symbol: "", name: "", amount: "", price: "", icon_url: "", chain: "solana" });
      onUpdate();
    } catch { toast.error("Failed to add"); } finally { setSubmitting(false); }
  };

  const handleEdit = async () => {
    if (!editingId) return;
    setSubmitting(true);
    try {
      await customTokensApi.update(editingId, {
        symbol: form.symbol.toUpperCase(),
        name: form.name || form.symbol,
        amount: parseFloat(form.amount) || 0,
        price: parseFloat(form.price) || 0,
        icon_url: form.icon_url || null,
        chain: form.chain,
      });
      toast.success("Updated");
      setEditingId(null);
      setForm({ symbol: "", name: "", amount: "", price: "", icon_url: "", chain: "solana" });
      onUpdate();
    } catch { toast.error("Failed to update"); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id, symbol) => {
    try {
      await customTokensApi.delete(id);
      toast.success(`${symbol} removed`);
      onUpdate();
    } catch { toast.error("Failed to delete"); }
  };

  const startEdit = (token) => {
    setEditingId(token.id);
    setForm({
      symbol: token.symbol || "",
      name: token.name || "",
      amount: token.amount?.toString() || "",
      price: token.price?.toString() || "",
      icon_url: token.icon_url || "",
      chain: token.chain || "solana",
    });
  };

  return (
    <div className="space-y-3 pt-4 border-t border-border/40">
      <p className="text-xs text-muted-foreground font-medium">Custom Tokens</p>

      {/* Existing custom tokens list */}
      {customTokens && customTokens.length > 0 && (
        <div className="space-y-1 mb-3">
          {customTokens.map(ct => (
            <div key={ct.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/30">
              <div className="flex items-center gap-2">
                {ct.icon_url ? <img src={ct.icon_url} alt="" className="w-4 h-4 rounded-full" /> : <div className="w-4 h-4 rounded-full bg-secondary flex items-center justify-center"><span className="text-[8px] font-bold text-muted-foreground">{(ct.symbol || "?")[0]}</span></div>}
                <span className="text-xs font-medium text-foreground">{ct.symbol}</span>
                <span className="font-mono text-xs text-muted-foreground">{ct.amount} @ ${ct.price}</span>
                <span className="text-[10px] text-muted-foreground">({CHAIN_META[ct.chain]?.name || ct.chain})</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(ct)} className="text-muted-foreground hover:text-foreground p-1" data-testid={`edit-custom-${ct.id}`}>
                  <Pencil className="w-3 h-3" strokeWidth={1.5} />
                </button>
                <button onClick={() => handleDelete(ct.id, ct.symbol)} className="text-rose-400 hover:text-rose-300 p-1" data-testid={`del-custom-${ct.id}`}>
                  <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit form */}
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <Input placeholder="Symbol (e.g. TRX, ETH)" value={form.symbol} onChange={e => handleSymbolChange(e.target.value)} className="bg-background border-border text-sm" data-testid="custom-token-symbol" />
          {fetchingPrice && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground animate-pulse">fetching...</span>}
        </div>
        <Select value={form.chain} onValueChange={(v) => setForm({...form, chain: v})}>
          <SelectTrigger className="bg-background border-border text-sm"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="solana">Solana</SelectItem>
            <SelectItem value="bitcoin">Bitcoin</SelectItem>
            <SelectItem value="ethereum">Ethereum</SelectItem>
            <SelectItem value="bsc">BNB Chain</SelectItem>
            <SelectItem value="polygon">Polygon</SelectItem>
            <SelectItem value="arbitrum">Arbitrum</SelectItem>
            <SelectItem value="base">Base</SelectItem>
            <SelectItem value="tron">Tron</SelectItem>
            <SelectItem value="custom">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Input placeholder="Name (auto-filled)" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="bg-background border-border text-sm" />
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" step="any" placeholder="Amount" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="bg-background border-border font-mono text-sm" data-testid="custom-token-amount" />
        <Input type="number" step="any" placeholder="Price (auto-filled)" value={form.price} onChange={e => setForm({...form, price: e.target.value})} className="bg-background border-border font-mono text-sm" />
      </div>
      <Input placeholder="Icon URL (optional)" value={form.icon_url} onChange={e => setForm({...form, icon_url: e.target.value})} className="bg-background border-border text-sm" />
      {editingId ? (
        <div className="flex gap-2">
          <Button onClick={handleEdit} disabled={submitting} size="sm" className="flex-1 bg-white text-black hover:bg-neutral-200" data-testid="save-custom-token-btn">
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
          <Button onClick={() => { setEditingId(null); setForm({ symbol: "", name: "", amount: "", price: "", icon_url: "", chain: "solana" }); }} size="sm" variant="outline" className="border-border/40">
            Cancel
          </Button>
        </div>
      ) : (
        <Button onClick={handleAdd} disabled={submitting} size="sm" className="w-full bg-secondary text-foreground hover:bg-secondary/80" data-testid="add-custom-token-btn">
          {submitting ? "Adding..." : "Add Custom Token"}
        </Button>
      )}
    </div>
  );
}
