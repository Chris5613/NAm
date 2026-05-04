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
import { Plus, RefreshCw, Trash2, Wallet, ExternalLink } from "lucide-react";

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

export default function CryptoPage() {
  const [wallets, setWallets] = useState([]);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

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

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  // Auto-fetch balances for all wallets on load
  useEffect(() => {
    if (wallets.length > 0) {
      wallets.forEach((w) => {
        if (!balances[w.id]) {
          fetchBalance(w.id);
        }
      });
    }
  }, [wallets]);

  const fetchBalance = async (walletId) => {
    setRefreshingId(walletId);
    try {
      const res = await walletsApi.getBalances(walletId);
      setBalances((prev) => ({ ...prev, [walletId]: res.data }));
    } catch {
      toast.error("Failed to fetch balances");
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDelete = async (wallet) => {
    try {
      await walletsApi.delete(wallet.id);
      setWallets((prev) => prev.filter((w) => w.id !== wallet.id));
      setBalances((prev) => { const n = { ...prev }; delete n[wallet.id]; return n; });
      toast.success("Wallet removed");
    } catch {
      toast.error("Failed to delete wallet");
    }
  };

  const handleWalletAdded = () => {
    setAddOpen(false);
    fetchWallets();
  };

  // Calculate total across all wallets
  const totalValue = Object.values(balances).reduce((sum, b) => sum + (b?.total_usd || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground font-mono animate-pulse">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="crypto-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-4xl font-medium tracking-tight">Crypto</h1>
          {totalValue > 0 && (
            <span className="font-mono text-2xl text-foreground">{formatCurrency(totalValue)}</span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="bg-white text-black hover:bg-neutral-200"
          data-testid="add-wallet-btn"
        >
          <Plus className="w-4 h-4 mr-2" strokeWidth={1.5} />
          Add Wallet
        </Button>
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
        <div className="space-y-6">
          {wallets.map((wallet) => {
            const bal = balances[wallet.id];
            const isRefreshing = refreshingId === wallet.id;
            return (
              <WalletCard
                key={wallet.id}
                wallet={wallet}
                balanceData={bal}
                isRefreshing={isRefreshing}
                onRefresh={() => fetchBalance(wallet.id)}
                onDelete={() => handleDelete(wallet)}
              />
            );
          })}
        </div>
      )}

      <AddWalletDialog open={addOpen} onOpenChange={setAddOpen} onAdded={handleWalletAdded} />
    </div>
  );
}

function WalletCard({ wallet, balanceData, isRefreshing, onRefresh, onDelete }) {
  const chainLabel = wallet.chain === "bitcoin" ? "Bitcoin" : "Solana";
  const chainColor = wallet.chain === "bitcoin" ? "text-amber-400" : "text-purple-400";
  const explorerUrl = wallet.chain === "bitcoin"
    ? `https://mempool.space/address/${wallet.address}`
    : `https://solscan.io/account/${wallet.address}`;

  return (
    <Card className="border-border/40 bg-card" data-testid={`wallet-card-${wallet.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className={`w-5 h-5 ${chainColor}`} strokeWidth={1.5} />
            <div>
              <CardTitle className="text-base font-medium">
                {wallet.label || chainLabel}
              </CardTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-xs text-muted-foreground">
                  {shortenAddress(wallet.address)}
                </span>
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                  <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                </a>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {balanceData && (
              <span className="font-mono text-lg font-medium text-foreground">
                {formatCurrency(balanceData.total_usd)}
              </span>
            )}
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={onRefresh} disabled={isRefreshing}
              data-testid={`refresh-wallet-${wallet.id}`}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-rose-400 hover:text-rose-300"
              onClick={onDelete}
              data-testid={`delete-wallet-${wallet.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {!balanceData ? (
          <div className="py-4 text-center">
            <p className="text-xs text-muted-foreground animate-pulse font-mono">Fetching balances...</p>
          </div>
        ) : balanceData.error ? (
          <div className="py-4 text-center">
            <p className="text-xs text-rose-400">{balanceData.error}</p>
          </div>
        ) : balanceData.tokens.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-xs text-muted-foreground">No tokens found</p>
          </div>
        ) : (
          <div className="overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-4 gap-4 px-3 py-2 text-xs text-muted-foreground border-b border-border/30">
              <span>Token</span>
              <span className="text-right">Price</span>
              <span className="text-right">Amount</span>
              <span className="text-right">USD Value</span>
            </div>
            {/* Token Rows */}
            {balanceData.tokens.map((token, idx) => (
              <div
                key={idx}
                className="grid grid-cols-4 gap-4 px-3 py-2.5 items-center hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {token.icon_url ? (
                    <img src={token.icon_url} alt="" className="w-5 h-5 rounded-full" onError={(e) => e.target.style.display='none'} />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center">
                      <span className="text-[9px] font-bold text-muted-foreground">{(token.symbol || "?")[0]}</span>
                    </div>
                  )}
                  <span className="text-sm font-medium text-foreground">{token.symbol}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground text-right">
                  {token.price > 0 ? formatCurrency(token.price) : "-"}
                </span>
                <span className="font-mono text-xs text-foreground text-right">
                  {token.amount < 0.0001 ? token.amount.toExponential(2) : token.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </span>
                <span className="font-mono text-sm text-foreground text-right font-medium">
                  {token.usd_value > 0.01 ? formatCurrency(token.usd_value) : token.usd_value > 0 ? "<$0.01" : "-"}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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
            <Input
              placeholder={form.chain === "bitcoin" ? "bc1q... or 1A1z..." : "Your Solana address"}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              data-testid="wallet-address-input"
              className="bg-background border-border font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>Label (optional)</Label>
            <Input
              placeholder="e.g. Main Wallet, Cold Storage"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              data-testid="wallet-label-input"
              className="bg-background border-border"
            />
          </div>
          <Button
            type="submit" disabled={submitting}
            className="w-full bg-white text-black hover:bg-neutral-200"
            data-testid="submit-wallet-btn"
          >
            {submitting ? "Adding..." : "Add Wallet"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
