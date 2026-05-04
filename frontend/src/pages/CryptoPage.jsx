import { useState, useEffect, useCallback } from "react";
import { walletsApi } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, RefreshCw, Trash2, Wallet, ExternalLink, Lock, Coins, Layers, Settings } from "lucide-react";

function formatCurrency(v) {
  if (!v && v !== 0) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);
}
function shortenAddr(a) { return a?.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || ""; }

const CHAIN_META = {
  bitcoin: { name: "Bitcoin", color: "border-amber-500/30 text-amber-400", activeBg: "bg-amber-500/15", icon: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png" },
  solana: { name: "Solana", color: "border-purple-500/30 text-purple-400", activeBg: "bg-purple-500/15", icon: "https://assets.coingecko.com/coins/images/4128/small/solana.png" },
};

export default function CryptoPage() {
  const [wallets, setWallets] = useState([]);
  const [balances, setBalances] = useState({});
  const [defiPositions, setDefiPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [liveHistory, setLiveHistory] = useState([]);
  const [activeChain, setActiveChain] = useState(null);

  const fetchWallets = useCallback(async () => {
    try {
      const res = await walletsApi.getAll();
      setWallets(res.data || []);
    } catch { toast.error("Failed to load wallets"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchWallets(); }, [fetchWallets]);

  useEffect(() => {
    if (wallets.length > 0) {
      wallets.forEach(w => { if (!balances[w.id]) fetchBalance(w.id); });
      // Fetch DeFi for all Solana wallets
      const solWallets = wallets.filter(w => w.chain === "solana");
      if (solWallets.length > 0) fetchAllDefi(solWallets);
    }
  }, [wallets]);

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
    for (const w of wallets) await fetchBalance(w.id);
    const solWallets = wallets.filter(w => w.chain === "solana");
    if (solWallets.length > 0) await fetchAllDefi(solWallets);
    const total = Object.values(balances).reduce((s, b) => s + (b?.total_usd || 0), 0);
    if (total > 0) setLiveHistory(prev => [...prev, { time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), value: total }]);
    setRefreshing(false);
    toast.success("Refreshed");
  };

  // Aggregate
  const totalValue = Object.values(balances).reduce((s, b) => s + (b?.total_usd || 0), 0);
  const defiTotalValue = defiPositions.reduce((s, p) => s + p.total_value, 0);
  const grandTotal = totalValue + defiTotalValue;

  const chainBreakdown = {};
  wallets.forEach(w => { const b = balances[w.id]; if (b) chainBreakdown[w.chain] = (chainBreakdown[w.chain] || 0) + (b.total_usd || 0); });
  // Add defi to solana
  if (defiTotalValue > 0) chainBreakdown["solana"] = (chainBreakdown["solana"] || 0) + defiTotalValue;
  const sortedChains = Object.entries(chainBreakdown).sort((a, b) => b[1] - a[1]);

  // Combine tokens
  const allTokens = [];
  wallets.forEach(w => {
    if (activeChain && w.chain !== activeChain) return;
    balances[w.id]?.tokens?.forEach(t => allTokens.push({ ...t, chain: w.chain }));
  });
  const combined = {};
  allTokens.forEach(t => {
    const key = `${t.symbol}_${t.category}_${t.protocol || ""}`;
    if (combined[key]) { combined[key].amount += t.amount; combined[key].usd_value += t.usd_value; }
    else combined[key] = { ...t };
  });
  const combinedTokens = Object.values(combined).sort((a, b) => b.usd_value - a.usd_value);
  const walletTokens = combinedTokens.filter(t => t.category === "wallet" && t.usd_value > 0.01);
  const walletTotal = walletTokens.reduce((s, t) => s + t.usd_value, 0);

  // Filter DeFi by chain (defi is always solana)
  const filteredDefi = (!activeChain || activeChain === "solana") ? defiPositions : [];

  useEffect(() => { if (grandTotal > 0 && liveHistory.length === 0) setLiveHistory([{ time: "Now", value: grandTotal }]); }, [grandTotal]);

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
                <div className="px-3 py-1.5 grid grid-cols-4 text-xs text-muted-foreground border-b border-border/20">
                  <span>Asset</span><span className="text-right">Balance</span><span className="text-right">Price</span><span className="text-right">Value</span>
                </div>
                {walletTokens.map((t, i) => <TokenRow key={i} token={t} />)}
              </CardContent>
            </Card>
          )}

          {/* DeFi Positions from Jupiter */}
          {filteredDefi.filter(p => p.label !== "Wallet").map((pos, idx) => (
            <Card key={idx} className="border-border/40 bg-card" data-testid={`defi-${pos.platform_id}`}>
              <CardHeader className="pb-0 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-emerald-400" strokeWidth={1.5} /><CardTitle className="text-sm font-medium">{pos.platform}</CardTitle><span className="text-xs text-muted-foreground">{pos.label}</span></div>
                  <span className="font-mono text-sm text-foreground">{formatCurrency(pos.total_value)}</span>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-2 pt-2">
                <div className="px-3 py-1.5 grid grid-cols-4 text-xs text-muted-foreground border-b border-border/20">
                  <span>Asset</span><span className="text-right">Balance</span><span className="text-right">Price</span><span className="text-right">Value</span>
                </div>
                {pos.tokens.filter(t => t.value > 0.01).map((t, i) => (
                  <div key={i} className="px-3 py-2.5 grid grid-cols-4 items-center hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-2">
                      {t.image_uri ? <img src={t.image_uri} alt="" className="w-5 h-5 rounded-full" /> : <div className="w-5 h-5 rounded-full bg-secondary" />}
                      <span className="text-sm font-medium text-foreground">{t.symbol || t.name || shortenAddr(t.address)}</span>
                    </div>
                    <span className="font-mono text-xs text-foreground text-right">{t.amount?.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                    <span className="font-mono text-xs text-muted-foreground text-right">{t.price > 0 ? formatCurrency(t.price) : "-"}</span>
                    <span className="font-mono text-sm text-foreground text-right font-medium">{formatCurrency(t.value)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </>
      )}

      <WalletManageModal open={walletModalOpen} onOpenChange={setWalletModalOpen} wallets={wallets} onUpdate={fetchWallets} />
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

function WalletManageModal({ open, onOpenChange, wallets, onUpdate }) {
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
                <SelectItem value="solana">Solana</SelectItem>
                <SelectItem value="bitcoin">Bitcoin</SelectItem>
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
                  <img src={CHAIN_META[w.chain]?.icon || ""} alt="" className="w-4 h-4 rounded-full" />
                  <span className="font-mono text-xs text-foreground">{shortenAddr(w.address)}</span>
                  <a href={w.chain === "bitcoin" ? `https://mempool.space/address/${w.address}` : `https://solscan.io/account/${w.address}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                  </a>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-400 hover:text-rose-300" onClick={() => handleDelete(w)} data-testid={`del-wallet-${w.id}`}>
                  <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
