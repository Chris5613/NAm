import { useEffect, useState } from "react";
import { cryptoCacheApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";

const CHAIN_META = {
  bitcoin: { name: "Bitcoin", icon: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png" },
  solana: { name: "Solana", icon: "https://assets.coingecko.com/coins/images/4128/small/solana.png" },
  ethereum: { name: "Ethereum", icon: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" },
  bsc: { name: "BNB Chain", icon: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png" },
  polygon: { name: "Polygon", icon: "https://assets.coingecko.com/coins/images/4713/small/polygon.png" },
  avalanche: { name: "Avalanche", icon: "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png" },
  arbitrum: { name: "Arbitrum", icon: "https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg" },
  optimism: { name: "Optimism", icon: "https://assets.coingecko.com/coins/images/25244/small/Optimism.png" },
  base: { name: "Base", icon: "https://assets.coingecko.com/asset_platforms/images/131/small/base.jpeg" },
  tron: { name: "Tron", icon: "https://assets.coingecko.com/coins/images/1094/small/tron-logo.png" },
  fantom: { name: "Fantom", icon: "https://assets.coingecko.com/coins/images/4001/small/Fantom_round.png" },
  custom: { name: "Other", icon: "" },
};

function formatCurrency(v) {
  if (!v && v !== 0) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);
}

export default function CryptoBreakdown() {
  const [cache, setCache] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedChain, setExpandedChain] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await cryptoCacheApi.get();
        if (!cancelled) setCache(res.data);
      } catch {
        if (!cancelled) setCache({ total: 0, chains: [], tokens: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Card className="border-border/40 bg-card">
        <CardContent className="p-6 text-center text-muted-foreground text-sm">Loading crypto breakdown…</CardContent>
      </Card>
    );
  }

  const chains = (cache?.chains || []).filter(c => (c.value || 0) > 0.01);
  const total = cache?.total || 0;

  if (chains.length === 0) {
    return (
      <Card className="border-border/40 bg-card">
        <CardContent className="p-6 text-center text-muted-foreground text-sm">
          No crypto data yet. Open the Crypto tab and add a wallet to populate this breakdown.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3" data-testid="crypto-breakdown">
      {chains.map((c) => {
        const meta = CHAIN_META[c.chain] || { name: c.chain, icon: "" };
        const pct = total > 0 ? ((c.value / total) * 100).toFixed(1) : "0.0";
        const isExpanded = expandedChain === c.chain;
        const tokens = (c.tokens || []).filter(t => (t.usd_value || 0) > 0.01);
        return (
          <div key={c.chain}>
            <Card
              className="border-border/40 bg-card hover:border-white/10 transition-colors cursor-pointer"
              data-testid={`chain-box-${c.chain}`}
              onClick={() => setExpandedChain(isExpanded ? null : c.chain)}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                    )}
                    {meta.icon ? (
                      <img src={meta.icon} alt="" className="w-7 h-7 rounded-full object-contain" onError={e => (e.target.style.display = "none")} />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
                        <Layers className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />
                      </div>
                    )}
                    <span className="font-medium text-foreground text-lg">{meta.name}</span>
                    <span className="text-xs font-mono text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded">
                      {pct}%
                    </span>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Tokens</p>
                      <p className="font-mono text-sm text-foreground">{tokens.length}</p>
                    </div>
                    <div className="text-right min-w-[120px]">
                      <p className="text-xs text-muted-foreground">Value</p>
                      <p className="font-mono text-sm font-bold text-foreground">{formatCurrency(c.value)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {isExpanded && tokens.length > 0 && (
              <div className="ml-10 mt-2 mb-2 space-y-1.5" data-testid={`chain-tokens-${c.chain}`}>
                {tokens.map((t, i) => (
                  <Card key={`${t.symbol}-${i}`} className="border-border/20 bg-secondary/40">
                    <CardContent className="px-5 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {t.icon_url ? (
                          <img src={t.icon_url} alt="" className="w-5 h-5 rounded-full" onError={e => (e.target.style.display = "none")} />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center">
                            <span className="text-[9px] font-bold text-muted-foreground">{(t.symbol || "?")[0]}</span>
                          </div>
                        )}
                        <span className="text-sm font-medium text-foreground">{t.symbol}</span>
                        {t.name && <span className="text-xs text-muted-foreground">{t.name}</span>}
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="font-mono text-xs text-muted-foreground">
                          {t.amount < 0.0001 ? (t.amount || 0).toExponential(2) : (t.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground min-w-[80px] text-right">
                          {t.price > 0 ? formatCurrency(t.price) : "-"}
                        </span>
                        <span className="font-mono text-sm text-foreground min-w-[100px] text-right font-medium">
                          {formatCurrency(t.usd_value)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {isExpanded && tokens.length === 0 && (
              <div className="ml-10 mt-2 mb-2">
                <Card className="border-border/20 bg-secondary/40">
                  <CardContent className="px-5 py-3">
                    <p className="text-xs text-muted-foreground">No token details cached yet. Open the Crypto tab and refresh.</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
