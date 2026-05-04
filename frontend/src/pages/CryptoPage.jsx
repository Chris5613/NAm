import { useState, useEffect, useCallback } from "react";
import { walletsApi } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, RefreshCw, Trash2, Wallet, ExternalLink, Lock, Coins } from "lucide-react";

function formatCurrency(value) {
  if (!value && value !== 0) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  }).format(value);
}

function shortenAddress(addr) {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const CHAIN_META = {
  bitcoin: { name: "Bitcoin", color: "bg-amber-500/10 border-amber-500/20 text-amber-400", icon: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png" },
  solana: { name: "Solana", color: "bg-purple-500/10 border-purple-500/20 text-purple-400", icon: "https://assets.coingecko.com/coins/images/4128/small/solana.png" },
};

export default function CryptoPage() {
  const [wallets, setWallets] = useState([]);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [liveHistory, setLiveHistory] = useState([]);

  const fetchWallets = useCallback(async () => {
    try {
      const res = await walletsApi.getAll();
      setWallets(res.data || []);
    } catch {
      toast.error("Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWallets(); }, [fetchWallets]);

  useEffect(() => {
    if (wallets.length > 0) {
      wallets.forEach((w) => { if (!balances[w.id]) fetchBalance(w.id); });
    }
  }, [wallets]);

  const fetchBalance = async (walletId) => {
    setRefreshingId(walletId);
    try {
      const res = await walletsApi.getBalances(walletId);
      setBalances((prev) => ({ ...prev, [walletId]: res.data }));
    } catch {
      // silent
    } finally {
      setRefreshingId(null);
    }
  };

  const refreshAll = async () => {
    for (const w of wallets) {
      await fetchBalance(w.id);
    }
    // Track live history
    const total = Object.values(balances).reduce((s, b) => s + (b?.total_usd || 0), 0);
    if (total > 0) {
      setLiveHistory(prev => [...prev, { time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), value: total }]);
    }
    toast.success("Refreshed");
  };

  const handleDelete = async (wallet) => {
    await walletsApi.delete(wallet.id);
    setWallets((prev) => prev.filter((w) => w.id !== wallet.id));
    setBalances((prev) => { const n = { ...prev }; delete n[wallet.id]; return n; });
    toast.success("Wallet removed");
  };

  // Aggregate data
  const totalValue = Object.values(balances).reduce((s, b) => s + (b?.total_usd || 0), 0);
  const allTokens = Object.values(balances).flatMap(b => b?.tokens || []);

  // Per-chain breakdown
  const chainBreakdown = {};
  wallets.forEach(w => {
    const bal = balances[w.id];
    if (bal) {
      chainBreakdown[w.chain] = (chainBreakdown[w.chain] || 0) + (bal.total_usd || 0);
    }
  });

  // Group by category
  const walletTokens = allTokens.filter(t => t.category === "wallet" && t.usd_value > 0.01);
  const stakingTokens = allTokens.filter(t => t.category === "staking" && t.usd_value > 0.01);
  const walletTotal = walletTokens.reduce((s, t) => s + t.usd_value, 0);
  const stakingTotal = stakingTokens.reduce((s, t) => s + t.usd_value, 0);

  // Add current total to live history on first load
  useEffect(() => {
    if (totalValue > 0 && liveHistory.length === 0) {
      setLiveHistory([{ time: "Now", value: totalValue }]);
    }
  }, [totalValue]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground font-mono animate-pulse">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="crypto-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-medium tracking-tight">Crypto</h1>
        <div className="flex items-center gap-2">
          {wallets.length > 0 && (
            <Button variant="outline" size="sm" onClick={refreshAll} className="border-border/40 hover:bg-secondary" data-testid="refresh-all-btn">
              <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.5} />
              Refresh
            </Button>
          )}
          <Button size="sm" onClick={() => setAddOpen(true)} className="bg-white text-black hover:bg-neutral-200" data-testid="add-wallet-btn">
            <Plus className="w-4 h-4 mr-2" strokeWidth={1.5} />
            Add Wallet
          </Button>
        </div>
      </div>

      {wallets.length === 0 ? (
        <Card className="border-border/40 bg-card">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <Wallet className="w-10 h-10 text-muted-foreground mb-4" strokeWidth={1.5} />
            <p className="text-muted-foreground text-sm mb-2">No wallets added yet</p>
            <p className="text-muted-foreground text-xs">Add your BTC or Solana wallet address to track holdings live</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Net Worth + Chart Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border/40 bg-card" data-testid="crypto-net-worth">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground mb-1">Net Worth</p>
                <p className="font-mono text-4xl font-bold text-foreground">{formatCurrency(totalValue)}</p>
                <p className="font-mono text-xs text-emerald-400 mt-1">
                  {totalValue > 0 ? `${(totalValue / 85).toFixed(2)} SOL` : ""}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/40 bg-card" data-testid="crypto-chart">
              <CardContent className="p-4">
                {liveHistory.length > 1 ? (
                  <ResponsiveContainer width="100%" height={130}>
                    <AreaChart data={liveHistory} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <defs>
                        <linearGradient id="cryptoGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Tooltip contentStyle={{ background: "#121214", border: "1px solid #27272A", borderRadius: "6px", fontFamily: "'Space Mono', monospace", fontSize: "11px" }} formatter={(v) => [formatCurrency(v), ""]} />
                      <Area type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2} fill="url(#cryptoGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[130px] flex items-center justify-center">
                    <p className="text-xs text-muted-foreground">Chart builds as you refresh</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Network Chips */}
          <div className="flex items-center gap-3 flex-wrap" data-testid="network-chips">
            {Object.entries(chainBreakdown).map(([chain, value]) => {
              const meta = CHAIN_META[chain] || { name: chain, color: "bg-secondary border-border text-foreground", icon: "" };
              const pct = totalValue > 0 ? ((value / totalValue) * 100).toFixed(0) : 0;
              return (
                <div key={chain} className={`flex items-center gap-2.5 px-4 py-2.5 rounded-md border ${meta.color}`} data-testid={`network-chip-${chain}`}>
                  {meta.icon && <img src={meta.icon} alt="" className="w-5 h-5 rounded-full" />}
                  <div>
                    <p className="text-xs font-medium">{meta.name}</p>
                    <p className="font-mono text-xs">{formatCurrency(value)} <span className="text-muted-foreground">{pct}%</span></p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Wallet Holdings Section */}
          {walletTokens.length > 0 && (
            <Card className="border-border/40 bg-card" data-testid="holdings-section">
              <CardHeader className="pb-0 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                    <CardTitle className="text-sm font-medium">Holdings</CardTitle>
                  </div>
                  <span className="font-mono text-sm text-foreground">{formatCurrency(walletTotal)}</span>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-2 pt-2">
                <div className="px-3 py-1.5 grid grid-cols-4 text-xs text-muted-foreground border-b border-border/20">
                  <span>Asset</span>
                  <span className="text-right">Balance</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Value</span>
                </div>
                {walletTokens.sort((a, b) => b.usd_value - a.usd_value).map((token, idx) => (
                  <TokenRow key={idx} token={token} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Staking/DeFi Section */}
          {stakingTokens.length > 0 && (
            <Card className="border-border/40 bg-card" data-testid="staking-section">
              <CardHeader className="pb-0 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                    <CardTitle className="text-sm font-medium">Staking</CardTitle>
                  </div>
                  <span className="font-mono text-sm text-foreground">{formatCurrency(stakingTotal)}</span>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-2 pt-2">
                <div className="px-3 py-1.5 grid grid-cols-5 text-xs text-muted-foreground border-b border-border/20">
                  <span>Asset</span>
                  <span>Protocol</span>
                  <span className="text-right">Balance</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Value</span>
                </div>
                {stakingTokens.sort((a, b) => b.usd_value - a.usd_value).map((token, idx) => (
                  <div key={idx} className="px-3 py-2.5 grid grid-cols-5 items-center hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-2">
                      {token.icon_url ? <img src={token.icon_url} alt="" className="w-5 h-5 rounded-full" /> : <div className="w-5 h-5 rounded-full bg-secondary" />}
                      <span className="text-sm font-medium text-foreground">{token.symbol}</span>
                    </div>
                    <span className="text-xs text-emerald-400">{token.protocol || "-"}</span>
                    <span className="font-mono text-xs text-foreground text-right">{token.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                    <span className="font-mono text-xs text-muted-foreground text-right">{token.price > 0 ? formatCurrency(token.price) : "-"}</span>
                    <span className="font-mono text-sm text-foreground text-right font-medium">{formatCurrency(token.usd_value)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Wallet addresses management */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Connected Wallets</p>
            {wallets.map(w => (
              <div key={w.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/30">
                <div className="flex items-center gap-2">
                  <img src={CHAIN_META[w.chain]?.icon || ""} alt="" className="w-4 h-4 rounded-full" />
                  <span className="text-xs text-foreground">{w.label || CHAIN_META[w.chain]?.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{shortenAddress(w.address)}</span>
                  <a href={w.chain === "bitcoin" ? `https://mempool.space/address/${w.address}` : `https://solscan.io/account/${w.address}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                  </a>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-400 hover:text-rose-300" onClick={() => handleDelete(w)} data-testid={`delete-wallet-${w.id}`}>
                  <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      <AddWalletDialog open={addOpen} onOpenChange={setAddOpen} onAdded={() => { setAddOpen(false); fetchWallets(); }} />
    </div>
  );
}

function TokenRow({ token }) {
  return (
    <div className="px-3 py-2.5 grid grid-cols-4 items-center hover:bg-secondary/30 transition-colors">
      <div className="flex items-center gap-2">
        {token.icon_url ? <img src={token.icon_url} alt="" className="w-5 h-5 rounded-full" onError={(e) => e.target.style.display='none'} /> : <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center"><span className="text-[9px] font-bold text-muted-foreground">{(token.symbol || "?")[0]}</span></div>}
        <span className="text-sm font-medium text-foreground">{token.symbol}</span>
      </div>
      <span className="font-mono text-xs text-foreground text-right">
        {token.amount < 0.0001 ? token.amount.toExponential(2) : token.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </span>
      <span className="font-mono text-xs text-muted-foreground text-right">{token.price > 0 ? formatCurrency(token.price) : "-"}</span>
      <span className="font-mono text-sm text-foreground text-right font-medium">{token.usd_value > 0.01 ? formatCurrency(token.usd_value) : "<$0.01"}</span>
    </div>
  );
}

function AddWalletDialog({ open, onOpenChange, onAdded }) {
  const [form, setForm] = useState({ address: "", chain: "solana", label: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.address) { toast.error("Wallet address is required"); return; }
    setSubmitting(true);
    try {
      await walletsApi.add(form);
      toast.success("Wallet added");
      setForm({ address: "", chain: "solana", label: "" });
      onAdded();
    } catch {
      toast.error("Failed to add wallet");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-md" data-testid="add-wallet-dialog">
        <DialogHeader>
          <DialogTitle>Add Wallet</DialogTitle>
          <DialogDescription>Enter your wallet address to track holdings live</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Chain</Label>
            <Select value={form.chain} onValueChange={(val) => setForm({ ...form, chain: val })}>
              <SelectTrigger className="bg-background border-border" data-testid="wallet-chain-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="solana">Solana</SelectItem>
                <SelectItem value="bitcoin">Bitcoin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Wallet Address</Label>
            <Input placeholder={form.chain === "bitcoin" ? "bc1q... or 1A1z..." : "Your Solana address"} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="wallet-address-input" className="bg-background border-border font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label>Label (optional)</Label>
            <Input placeholder="e.g. Main Wallet, Cold Storage" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} data-testid="wallet-label-input" className="bg-background border-border" />
          </div>
          <Button type="submit" disabled={submitting} className="w-full bg-white text-black hover:bg-neutral-200" data-testid="submit-wallet-btn">
            {submitting ? "Adding..." : "Add Wallet"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
