import { useState, useEffect, useCallback, useRef } from "react";
import { walletsApi, tokenPrefsApi, customTokensApi, cryptoCacheApi } from "@/lib/api";
import { coinGeckoApi } from "@/lib/external-apis";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, RefreshCw, Trash2, Wallet, Coins, Layers, Settings, EyeOff, Eye, Image, Pencil } from "lucide-react";

const DAILY_CRYPTO_BASELINE_KEY = "daily_crypto_net_worth_baseline_pst";
const CRYPTO_LIVE_HISTORY_KEY = "crypto_live_history";
const WALLET_BALANCE_CACHE_KEY = "crypto_wallet_balance_cache";
const WALLET_BALANCE_CACHE_TTL_MS = 60 * 60 * 1000; 

const MANUAL_DEFI_POSITIONS = [
  {
    platform_id: "manual-lulo-usdc",
    platform: "Lulo",
    label: "DeFi",
    type: "Lending",
    logo: "https://raw.githubusercontent.com/jup-ag/platform-list/main/img/flexlend.webp",
    url: "https://lulo.fi",
    total_value: 223.56,
    tokens: [
      {
        symbol: "USDC",
        name: "USD Coin",
        amount: 223.56,
        price: 0.99969,
        value: 223.56,
        kind: "supplied",
      },
    ],
    manual: true,
  },
];

function getWalletBalanceCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(WALLET_BALANCE_CACHE_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function saveWalletBalanceCache(cache) {
  try {
    localStorage.setItem(WALLET_BALANCE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage unavailable
  }
}

function getCachedWalletBalance(walletId) {
  const cache = getWalletBalanceCache();
  const entry = cache[walletId];

  if (!entry?.data || !entry?.savedAt) return null;

  const isFresh = Date.now() - entry.savedAt < WALLET_BALANCE_CACHE_TTL_MS;

  return isFresh ? entry.data : null;
}

function setCachedWalletBalance(walletId, data) {
  const cache = getWalletBalanceCache();

  cache[walletId] = {
    savedAt: Date.now(),
    data,
  };

  saveWalletBalanceCache(cache);
}

function getSavedCryptoHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(CRYPTO_LIVE_HISTORY_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveCryptoHistory(history) {
  try {
    localStorage.setItem(CRYPTO_LIVE_HISTORY_KEY, JSON.stringify(history.slice(-50)));
  } catch {
    // localStorage unavailable
  }
}

function getMsUntilNextRefresh(hour = 23, minute = 58) {
  const now = new Date();
  const next = new Date();

  next.setHours(hour, minute, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
}

function getPstDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDailyCryptoChange(currentValue) {
  const value = Number(currentValue) || 0;

  if (value <= 0) {
    return {
      change: 0,
      percentChange: 0,
    };
  }

  const todayKey = getPstDateKey();

  let saved = null;

  try {
    saved = JSON.parse(localStorage.getItem(DAILY_CRYPTO_BASELINE_KEY) || "null");
  } catch {
    saved = null;
  }

  if (!saved || saved.dateKey !== todayKey || Number(saved.baseline) <= 0) {
    localStorage.setItem(
      DAILY_CRYPTO_BASELINE_KEY,
      JSON.stringify({
        dateKey: todayKey,
        baseline: value,
      })
    );

    return {
      change: 0,
      percentChange: 0,
    };
  }

  const baseline = Number(saved.baseline) || 0;
  const change = value - baseline;

  return {
    change,
    percentChange: baseline > 0 ? (change / baseline) * 100 : 0,
  };
}

function formatCurrency(v) {
  if (!v && v !== 0) return "$0.00";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(v);
}

function shortenAddr(a) {
  return a?.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "";
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getDisplayDefiTokens(pos) {
  const typeText = normalizeText(pos.type || pos.label || "");
  const blockedWords = new Set(typeText.split(" ").filter(Boolean));

  return (pos.tokens || []).filter((token) => {
    const symbol = normalizeText(token.symbol);
    const name = normalizeText(token.name);
    const kind = normalizeText(token.kind);

    if (!symbol) return false;

    const fakeLabels = new Set([
      "locked escrow",
      "locked",
      "escrow",
      "farming",
      "vault",
      "farming vault",
      "defi",
      "supplied",
      "deposit",
    ]);

    if (fakeLabels.has(symbol) || fakeLabels.has(name)) return false;
    if (blockedWords.has(symbol) || blockedWords.has(name)) return false;

    return true;
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CHAIN_META = {
  bitcoin: {
    name: "Bitcoin",
    color: "border-amber-500/30 text-amber-400",
    activeBg: "bg-amber-500/15",
    icon: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  },
  solana: {
    name: "Solana",
    color: "border-purple-500/30 text-purple-400",
    activeBg: "bg-purple-500/15",
    icon: "https://assets.coingecko.com/coins/images/4128/small/solana.png",
  },
  ethereum: {
    name: "Ethereum",
    color: "border-blue-500/30 text-blue-400",
    activeBg: "bg-blue-500/15",
    icon: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  },
  bsc: {
    name: "BNB Chain",
    color: "border-yellow-500/30 text-yellow-400",
    activeBg: "bg-yellow-500/15",
    icon: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
  },
  polygon: {
    name: "Polygon",
    color: "border-violet-500/30 text-violet-400",
    activeBg: "bg-violet-500/15",
    icon: "https://assets.coingecko.com/coins/images/4713/small/polygon.png",
  },
  avalanche: {
    name: "Avalanche",
    color: "border-red-500/30 text-red-400",
    activeBg: "bg-red-500/15",
    icon: "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png",
  },
  arbitrum: {
    name: "Arbitrum",
    color: "border-sky-500/30 text-sky-400",
    activeBg: "bg-sky-500/15",
    icon: "https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg",
  },
  optimism: {
    name: "Optimism",
    color: "border-rose-500/30 text-rose-400",
    activeBg: "bg-rose-500/15",
    icon: "https://assets.coingecko.com/coins/images/25244/small/Optimism.png",
  },
  base: {
    name: "Base",
    color: "border-blue-500/30 text-blue-400",
    activeBg: "bg-blue-500/15",
    icon: "https://assets.coingecko.com/asset_platforms/images/131/small/base.jpeg",
  },
  tron: {
    name: "Tron",
    color: "border-red-500/30 text-red-400",
    activeBg: "bg-red-500/15",
    icon: "https://assets.coingecko.com/coins/images/1094/small/tron-logo.png",
  },
  fantom: {
    name: "Fantom",
    color: "border-blue-500/30 text-blue-400",
    activeBg: "bg-blue-500/15",
    icon: "https://assets.coingecko.com/coins/images/4001/small/Fantom_round.png",
  },
};

const CHAIN_NATIVE = {
  bitcoin: { symbol: "BTC", coingecko_id: "bitcoin" },
  solana: { symbol: "SOL", coingecko_id: "solana" },
  ethereum: { symbol: "ETH", coingecko_id: "ethereum" },
  bsc: { symbol: "BNB", coingecko_id: "binancecoin" },
  polygon: { symbol: "MATIC", coingecko_id: "matic-network" },
  avalanche: { symbol: "AVAX", coingecko_id: "avalanche-2" },
  arbitrum: { symbol: "ETH", coingecko_id: "ethereum" },
  optimism: { symbol: "ETH", coingecko_id: "ethereum" },
  base: { symbol: "ETH", coingecko_id: "ethereum" },
  tron: { symbol: "TRX", coingecko_id: "tron" },
  fantom: { symbol: "FTM", coingecko_id: "fantom" },
};

export default function CryptoPage() {
  const [wallets, setWallets] = useState([]);
  const [balances, setBalances] = useState({});
  const [defiPositions, setDefiPositions] = useState([]);
  const [defiLoading, setDefiLoading] = useState(false);
  const [tokenPrefs, setTokenPrefs] = useState({});
  const [customTokens, setCustomTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
const [liveHistory, setLiveHistory] = useState(() => getSavedCryptoHistory());  
  const [activeChain, setActiveChain] = useState(null);
  const [logoEditToken, setLogoEditToken] = useState(null);


  const fetchingRef = useRef(new Set());
  const lastSyncedRef = useRef(null);
  const allDefiPositions = [...defiPositions, ...MANUAL_DEFI_POSITIONS];

  const fetchWallets = useCallback(async () => {
    try {
      const [walletsRes, prefsRes, customRes] = await Promise.all([
        walletsApi.getAll(),
        tokenPrefsApi.getAll(),
        customTokensApi.getAll(),
      ]);

      setWallets(walletsRes.data || []);

      const prefsMap = {};
      (prefsRes.data || []).forEach((p) => {
        prefsMap[p.symbol] = p;
      });

      setTokenPrefs(prefsMap);
      setCustomTokens(customRes.data || []);
    } catch {
      toast.error("Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDefiPortfolio = useCallback(async () => {
    setDefiLoading(true);

    try {
      const res = await walletsApi.getDefiPositions();
      setDefiPositions(res.data?.positions || []);
    } catch (error) {
      console.warn("Failed to load DeFi portfolio:", error);
      setDefiPositions([]);
    } finally {
      setDefiLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWallets();
    fetchDefiPortfolio();
  }, [fetchWallets, fetchDefiPortfolio]);

  useEffect(() => {
    const refresh = () => {
      fetchWallets();
      fetchDefiPortfolio();
    };

    window.addEventListener("crypto-holding-updated", refresh);

    return () => window.removeEventListener("crypto-holding-updated", refresh);
  }, [fetchWallets, fetchDefiPortfolio]);

  useEffect(() => {
    if (wallets.length === 0) return;

    let cancelled = false;

    const fetchWalletBalancesSequentially = async () => {
      for (const w of wallets) {
        if (cancelled) return;
        if (fetchingRef.current.has(w.id)) continue;

        let alreadyFetched = false;

        setBalances((prev) => {
          if (prev[w.id]) {
            alreadyFetched = true;
          }

          return prev;
        });

        if (alreadyFetched) continue;

        fetchingRef.current.add(w.id);

try {
  const cached = getCachedWalletBalance(w.id);

  if (cached) {
    if (!cancelled) {
      setBalances((prev) => ({ ...prev, [w.id]: cached }));
    }

    continue;
  }

  const res = await walletsApi.getBalances(w.id);

  if (!cancelled) {
    setBalances((prev) => ({ ...prev, [w.id]: res.data }));
    setCachedWalletBalance(w.id, res.data);
  }

  await sleep(2000);
} catch (err) {
  console.error(`Balance fetch error for ${w.id}:`, err);
} finally {
  fetchingRef.current.delete(w.id);
}
      }
    };

    fetchWalletBalancesSequentially();

    return () => {
      cancelled = true;
    };
  }, [wallets]);

  const refreshAll = async () => {
    setRefreshing(true);

    const newBalances = {};

    for (const w of wallets) {
      try {
const res = await walletsApi.getBalances(w.id);
newBalances[w.id] = res.data;
setCachedWalletBalance(w.id, res.data);

await sleep(2000);
      } catch {
        // silent
      }
    }

    let freshDefiPositions = [];

    try {
      const defiRes = await walletsApi.getDefiPositions();
      freshDefiPositions = defiRes.data?.positions || [];
      setDefiPositions(freshDefiPositions);
    } catch {
      freshDefiPositions = [];
      setDefiPositions([]);
    }

    setBalances(newBalances);

    const walletTotal = Object.values(newBalances).reduce(
      (s, b) => s + (b?.total_usd || 0),
      0
    );

const manualDefiTotal = MANUAL_DEFI_POSITIONS.reduce(
  (s, p) => s + (Number(p.total_value) || 0),
  0
);

const defiTotal = freshDefiPositions.reduce(
  (s, p) => s + (Number(p.total_value) || 0),
  0
);

const total = walletTotal + defiTotal + manualDefiTotal;

if (total > 0) {
  setLiveHistory((prev) => {
    const next = [
      ...prev,
      {
        time: new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
        value: total,
      },
    ].slice(-50);

    saveCryptoHistory(next);
    return next;
  });
}

    setRefreshing(false);
    toast.success("Refreshed");
  };

  useEffect(() => {
  let intervalId = null;

  const timeoutId = setTimeout(() => {
    refreshAll();

    intervalId = setInterval(() => {
      refreshAll();
    }, 24 * 60 * 60 * 1000);
  }, getMsUntilNextRefresh(23, 58));

  return () => {
    clearTimeout(timeoutId);
    if (intervalId) clearInterval(intervalId);
  };
}, []);

  const toggleHideToken = async (symbol) => {
    const current = tokenPrefs[symbol]?.hidden || false;

    try {
      await tokenPrefsApi.update(symbol, { hidden: !current });

      setTokenPrefs((prev) => ({
        ...prev,
        [symbol]: {
          ...prev[symbol],
          symbol,
          hidden: !current,
        },
      }));

      toast.success(!current ? `${symbol} hidden` : `${symbol} shown`);
    } catch {
      toast.error("Failed to update");
    }
  };

  const setTokenLogo = async (symbol, url) => {
    try {
      await tokenPrefsApi.update(symbol, { custom_icon_url: url });

      setTokenPrefs((prev) => ({
        ...prev,
        [symbol]: {
          ...prev[symbol],
          symbol,
          custom_icon_url: url,
        },
      }));

      setLogoEditToken(null);
      toast.success("Logo updated");
    } catch {
      toast.error("Failed to update");
    }
  };

  const allTokensRaw = [];

  wallets.forEach((w) => {
    balances[w.id]?.tokens?.forEach((t) => {
      allTokensRaw.push({ ...t, chain: w.chain });
    });
  });

  customTokens.forEach((ct) => {
    allTokensRaw.push({
      symbol: ct.symbol,
      usd_value: ct.amount * ct.price,
      chain: ct.chain || "custom",
    });
  });

  const hiddenSymbols = new Set(
    Object.entries(tokenPrefs)
      .filter(([, p]) => p.hidden)
      .map(([s]) => s)
  );

  const visibleTotal = allTokensRaw
    .filter((t) => !hiddenSymbols.has(t.symbol))
    .reduce((s, t) => s + (t.usd_value || 0), 0);

const defiTotalValue = allDefiPositions.reduce(
  (s, p) => s + (Number(p.total_value) || 0),
  0
);

  const grandTotal = visibleTotal + defiTotalValue;

  const dailyCryptoChange = getDailyCryptoChange(grandTotal);
  const cryptoDailyPositive = dailyCryptoChange.change >= 0;

  const chainBreakdown = {};

  wallets.forEach((w) => {
    const tokens = balances[w.id]?.tokens || [];

    const visibleValue = tokens
      .filter((t) => !hiddenSymbols.has(t.symbol))
      .reduce((s, t) => s + (t.usd_value || 0), 0);

    chainBreakdown[w.chain] = (chainBreakdown[w.chain] || 0) + visibleValue;
  });

  customTokens.forEach((ct) => {
    if (!hiddenSymbols.has(ct.symbol)) {
      const ctChain = ct.chain || "custom";
      chainBreakdown[ctChain] =
        (chainBreakdown[ctChain] || 0) + (ct.amount * ct.price);
    }
  });

  if (defiTotalValue > 0) {
    chainBreakdown.solana = (chainBreakdown.solana || 0) + defiTotalValue;
  }

  const sortedChains = Object.entries(chainBreakdown).sort((a, b) => b[1] - a[1]);

  const allTokens = [];

  wallets.forEach((w) => {
    if (activeChain && w.chain !== activeChain) return;

    balances[w.id]?.tokens?.forEach((t) => {
      allTokens.push({ ...t, chain: w.chain });
    });
  });

  customTokens.forEach((ct) => {
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

  allTokens.forEach((t) => {
    const key = `${t.symbol}_${t.category}_${t.protocol || ""}`;

    if (combined[key]) {
      combined[key].amount += t.amount;
      combined[key].usd_value += t.usd_value;
    } else {
      combined[key] = { ...t };
    }
  });

  const combinedTokens = Object.values(combined).sort((a, b) => b.usd_value - a.usd_value);

  const walletTokens = combinedTokens
    .filter((t) => t.category === "wallet" && t.usd_value > 0.01)
    .filter((t) => !tokenPrefs[t.symbol]?.hidden)
    .map((t) => ({
      ...t,
      icon_url: tokenPrefs[t.symbol]?.custom_icon_url || t.icon_url,
    }));

  const hiddenTokens = combinedTokens.filter(
    (t) =>
      t.category === "wallet" &&
      t.usd_value > 0.01 &&
      tokenPrefs[t.symbol]?.hidden
  );

  const walletTotal = walletTokens.reduce((s, t) => s + t.usd_value, 0);

const filteredDefi =
  !activeChain || activeChain === "solana"
    ? allDefiPositions
        .filter((p) => (Number(p.total_value) || 0) > 0.01)
        .sort((a, b) => (Number(b.total_value) || 0) - (Number(a.total_value) || 0))
    : [];

useEffect(() => {
  if (grandTotal <= 0) return;

  setLiveHistory((prev) => {
    if (prev.length > 0) return prev;

    const next = [
      {
        time: new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
        value: grandTotal,
      },
    ];

    saveCryptoHistory(next);
    return next;
  });
}, [grandTotal]);

  useEffect(() => {
    if (loading) return;
    if (wallets.length > 0 && Object.keys(balances).length === 0) return;

    const syncKey = JSON.stringify({
      t: grandTotal,
      c: sortedChains.length,
      d: allDefiPositions.length,
    });

    if (lastSyncedRef.current === syncKey) return;

    lastSyncedRef.current = syncKey;

    const tokensByChain = {};

    wallets.forEach((w) => {
      (balances[w.id]?.tokens || []).forEach((t) => {
        if (hiddenSymbols.has(t.symbol)) return;
        if ((t.usd_value || 0) < 0.01) return;

        if (!tokensByChain[w.chain]) {
          tokensByChain[w.chain] = [];
        }

        tokensByChain[w.chain].push({
          symbol: t.symbol,
          name: t.name || "",
          amount: t.amount || 0,
          price: t.price || 0,
          usd_value: t.usd_value || 0,
          icon_url: tokenPrefs[t.symbol]?.custom_icon_url || t.icon_url || "",
          chain: w.chain,
          category: "wallet",
        });
      });
    });

    customTokens.forEach((ct) => {
      if (hiddenSymbols.has(ct.symbol)) return;

      const value = (ct.amount || 0) * (ct.price || 0);

      if (value < 0.01) return;

      const ch = ct.chain || "custom";

      if (!tokensByChain[ch]) {
        tokensByChain[ch] = [];
      }

      tokensByChain[ch].push({
        symbol: ct.symbol,
        name: ct.name || ct.symbol,
        amount: ct.amount || 0,
        price: ct.price || 0,
        usd_value: value,
        icon_url: tokenPrefs[ct.symbol]?.custom_icon_url || ct.icon_url || "",
        chain: ch,
        category: "wallet",
      });
    });

    if (allDefiPositions.length > 0) {
      if (!tokensByChain.solana) {
        tokensByChain.solana = [];
      }

      allDefiPositions.forEach((p) => {
        const value = Number(p.total_value) || 0;
        if (value < 0.01) return;

        tokensByChain.solana.push({
          symbol: p.platform || "DeFi",
          name: p.type ? `${p.platform} - ${p.type}` : p.platform || "DeFi Position",
          amount: 1,
          price: value,
          usd_value: value,
          icon_url: p.logo || "",
          chain: "solana",
          category: "defi",
          protocol: p.platform || p.platform_id || "Unknown",
          tokens: p.tokens || [],
        });
      });
    }

    Object.keys(tokensByChain).forEach((ch) => {
      const merged = {};

      tokensByChain[ch].forEach((t) => {
        const k = `${t.symbol}_${t.category || "wallet"}_${t.protocol || ""}`;

        if (merged[k]) {
          merged[k].amount += t.amount;
          merged[k].usd_value += t.usd_value;
        } else {
          merged[k] = { ...t };
        }
      });

      tokensByChain[ch] = Object.values(merged).sort((a, b) => b.usd_value - a.usd_value);
    });

    const chainsPayload = sortedChains.map(([chain, value]) => ({
      chain,
      value,
      tokens: tokensByChain[chain] || [],
    }));

    const allTokensFlat = [];

    Object.values(tokensByChain).forEach((arr) => {
      allTokensFlat.push(...arr);
    });

    cryptoCacheApi
      .set({
        total: grandTotal,
        chains: chainsPayload,
        tokens: allTokensFlat,
      })
      .catch(() => {
        // silent
      });
  }, [
    grandTotal,
    loading,
    wallets,
    balances,
    customTokens,
    tokenPrefs,
    defiPositions,
    hiddenSymbols,
    sortedChains,
  ]);

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
        <h1 className="text-4xl font-medium tracking-tight">Crypto</h1>

        <div className="flex items-center gap-2">
          {(wallets.length > 0 || allDefiPositions.length > 0) && (
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAll}
              disabled={refreshing}
              className="border-border/40 hover:bg-secondary"
              data-testid="refresh-all-btn"
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
                strokeWidth={1.5}
              />
              Refresh
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setWalletModalOpen(true)}
            className="border-border/40 hover:bg-secondary"
            data-testid="manage-wallets-btn"
          >
            <Settings className="w-4 h-4 mr-2" strokeWidth={1.5} />
            Wallets
          </Button>
        </div>
      </div>

      {wallets.length === 0 && customTokens.length === 0 && allDefiPositions.length === 0? (
        <Card className="border-border/40 bg-card">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <Wallet className="w-10 h-10 text-muted-foreground mb-4" strokeWidth={1.5} />
            <p className="text-muted-foreground text-sm mb-3">
              No wallets or DeFi positions loaded yet
            </p>

            <Button
              size="sm"
              onClick={() => setWalletModalOpen(true)}
              className="bg-white text-black hover:bg-neutral-200"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Wallets
            </Button>
          </CardContent>
        </Card>
      ) : wallets.length === 0 && customTokens.length > 0 && allDefiPositions.length === 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border/40 bg-card" data-testid="crypto-net-worth">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground mb-1">Net Worth</p>
                <p className="font-mono text-4xl font-bold text-foreground">
                  {formatCurrency(grandTotal)}
                </p>

                <p
                  className={`text-sm font-mono mt-2 ${
                    cryptoDailyPositive ? "text-emerald-500" : "text-rose-500"
                  }`}
                >
                  {cryptoDailyPositive ? "+" : "-"}
                  {formatCurrency(Math.abs(dailyCryptoChange.change))} today (
                  {cryptoDailyPositive ? "+" : "-"}
                  {Math.abs(dailyCryptoChange.percentChange).toFixed(2)}%)
                </p>

                <p className="text-xs text-muted-foreground mt-1">
                  from {customTokens.length} custom token
                  {customTokens.length > 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card">
              <CardContent className="p-6 flex items-center justify-center">
                <Button
                  size="sm"
                  onClick={() => setWalletModalOpen(true)}
                  variant="outline"
                  className="border-border/40"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Wallets for more tracking
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/40 bg-card">
            <CardHeader className="pb-2 border-b border-border/40">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Coins className="w-4 h-4" strokeWidth={1.5} />
                Holdings
              </CardTitle>
            </CardHeader>

            <CardContent className="p-0 divide-y divide-border/40">
              <div className="px-3 py-2 grid grid-cols-4 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/20">
                <span>Token</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Price</span>
                <span className="text-right">Value</span>
              </div>

              {walletTokens.length > 0 ? (
                walletTokens.map((t, i) => (
                  <TokenRow key={`${t.symbol}-${i}`} token={t} />
                ))
              ) : (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No holdings to display
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border/40 bg-card" data-testid="crypto-net-worth">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground mb-1">Net Worth</p>

                <p className="font-mono text-4xl font-bold text-foreground">
                  {formatCurrency(grandTotal)}
                </p>

                <p
                  className={`text-sm font-mono mt-2 ${
                    cryptoDailyPositive ? "text-emerald-500" : "text-rose-500"
                  }`}
                >
                  {cryptoDailyPositive ? "+" : "-"}
                  {formatCurrency(Math.abs(dailyCryptoChange.change))} today (
                  {cryptoDailyPositive ? "+" : "-"}
                  {Math.abs(dailyCryptoChange.percentChange).toFixed(2)}%)
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-card">
              <CardContent className="p-4">
                {liveHistory.length > 1 ? (
                  <ResponsiveContainer width="100%" height={110}>
                    <AreaChart
                      data={liveHistory}
                      margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>

                      <Tooltip
                        contentStyle={{
                          background: "#121214",
                          border: "1px solid #27272A",
                          borderRadius: "6px",
                          fontFamily: "'Space Mono', monospace",
                          fontSize: "11px",
                        }}
                        formatter={(v) => [formatCurrency(v), ""]}
                      />

                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#10B981"
                        strokeWidth={2}
                        fill="url(#cg)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[110px] flex items-center justify-center">
                    <p className="text-xs text-muted-foreground">
                      Chart builds as you refresh
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-3 flex-wrap" data-testid="network-chips">
            <button
              onClick={() => setActiveChain(null)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-md border transition-colors ${
                !activeChain
                  ? "border-white/30 bg-white/10 text-foreground"
                  : "border-border/40 text-muted-foreground hover:border-white/20"
              }`}
              data-testid="network-chip-all"
            >
              <Layers className="w-4 h-4" strokeWidth={1.5} />

              <div>
                <p className="text-xs font-medium text-left">All</p>
                <p className="font-mono text-xs">{formatCurrency(grandTotal)}</p>
              </div>
            </button>

            {sortedChains.map(([chain, value]) => {
              const m = CHAIN_META[chain] || {
                name: chain,
                color: "border-border text-foreground",
                activeBg: "bg-secondary",
                icon: "",
              };

              const pct = grandTotal > 0 ? ((value / grandTotal) * 100).toFixed(0) : 0;
              const active = activeChain === chain;

              return (
                <button
                  key={chain}
                  onClick={() => setActiveChain(active ? null : chain)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-md border transition-colors ${
                    active
                      ? `${m.activeBg} ${m.color}`
                      : "border-border/40 text-muted-foreground hover:border-white/20"
                  }`}
                  data-testid={`network-chip-${chain}`}
                >
                  {m.icon && <img src={m.icon} alt="" className="w-5 h-5 rounded-full" />}

                  <div>
                    <p className="text-xs font-medium text-left">{m.name}</p>
                    <p className="font-mono text-xs">
                      {formatCurrency(value)} <span className="opacity-60">{pct}%</span>
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {walletTokens.length > 0 && (
            <Card className="border-border/40 bg-card" data-testid="holdings-section">
              <CardHeader className="pb-0 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                    <CardTitle className="text-sm font-medium">Holdings</CardTitle>
                  </div>

                  <span className="font-mono text-sm text-foreground">
                    {formatCurrency(walletTotal)}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="px-2 pb-2 pt-2">
                <div className="px-3 py-1.5 grid grid-cols-5 text-xs text-muted-foreground border-b border-border/20">
                  <span>Asset</span>
                  <span className="text-right">Balance</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Value</span>
                  <span></span>
                </div>

                {walletTokens.map((t, i) => (
                  <div
                    key={i}
                    className="px-3 py-2.5 grid grid-cols-5 items-center hover:bg-secondary/30 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setLogoEditToken(t.symbol)}
                        className="relative flex-shrink-0 group/logo"
                        title="Click to set custom logo"
                      >
                        {t.icon_url ? (
                          <img
                            src={t.icon_url}
                            alt=""
                            className="w-6 h-6 rounded-full"
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center border border-border/40">
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {(t.symbol || "?")[0]}
                            </span>
                          </div>
                        )}

                        <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity">
                          <Image className="w-3 h-3 text-white" strokeWidth={2} />
                        </div>
                      </button>

                      <span className="text-sm font-medium text-foreground">{t.symbol}</span>
                    </div>

                    <span className="font-mono text-xs text-foreground text-right">
                      {t.amount < 0.0001
                        ? t.amount.toExponential(2)
                        : t.amount.toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })}
                    </span>

                    <span className="font-mono text-xs text-muted-foreground text-right">
                      {t.price > 0 ? formatCurrency(t.price) : "-"}
                    </span>

                    <span className="font-mono text-sm text-foreground text-right font-medium">
                      {t.usd_value > 0.01 ? formatCurrency(t.usd_value) : "<$0.01"}
                    </span>

                    <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => toggleHideToken(t.symbol)}
                        className="text-muted-foreground hover:text-foreground p-1"
                        title="Hide token"
                        data-testid={`hide-${t.symbol}`}
                      >
                        <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                ))}

                {hiddenTokens.length > 0 && (
                  <div className="px-3 py-2 border-t border-border/20">
                    <p className="text-xs text-muted-foreground mb-1">
                      {hiddenTokens.length} hidden token
                      {hiddenTokens.length > 1 ? "s" : ""}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {hiddenTokens.map((t) => (
                        <button
                          key={t.symbol}
                          onClick={() => toggleHideToken(t.symbol)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded bg-secondary/50"
                          data-testid={`show-${t.symbol}`}
                        >
                          <Eye className="w-3 h-3" /> {t.symbol}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {(filteredDefi.length > 0 || defiLoading) && (
            <Card className="border-border/40 bg-card" data-testid="defi-section">
              <CardHeader className="pb-0 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" strokeWidth={1.5} />
                    <CardTitle className="text-sm font-medium">DeFi Positions</CardTitle>
                  </div>

                  <span className="font-mono text-sm text-foreground">
                    {defiLoading ? "Loading..." : formatCurrency(defiTotalValue)}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="px-2 pb-2 pt-2">
                <div className="px-3 py-1.5 grid grid-cols-4 text-xs text-muted-foreground border-b border-border/20">
                  <span>Protocol</span>
                  <span className="text-right">Type</span>
                  <span className="text-right">Assets</span>
                  <span className="text-right">Value</span>
                </div>

                {filteredDefi.map((pos, idx) => {
                  const displayTokens = getDisplayDefiTokens(pos);

                  return (
                    <div
                      key={`${pos.platform_id || pos.platform}-${idx}`}
                      className="px-3 py-2.5 grid grid-cols-4 items-center hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {pos.logo ? (
                          <img
                            src={pos.logo}
                            alt=""
                            className="w-6 h-6 rounded-full"
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center border border-border/40">
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {(pos.platform || "D")[0]}
                            </span>
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {pos.platform || "DeFi"}
                          </p>
                          {pos.url && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {pos.url}
                            </p>
                          )}
                        </div>
                      </div>

                      <span className="font-mono text-xs text-white text-right">
                        {pos.type || pos.label || "DeFi"}
                      </span>

                      <div className="text-right">
                        {displayTokens.length > 0 ? (
                          <div className="flex flex-col items-end gap-0.5">
                            {displayTokens.slice(0, 4).map((token, tokenIdx) => (
                              <span
                                key={`${token.symbol}-${tokenIdx}`}
                                className="font-mono text-xs text-white"
                              >
                                {Number(token.amount) > 0
                                  ? `${Number(token.amount).toLocaleString(undefined, {
                                      maximumFractionDigits: 4,
                                    })} ${token.symbol}`
                                  : token.symbol}
                              </span>
                            ))}

                            {displayTokens.length > 4 && (
                              <span className="text-[10px] text-white">
                                +{displayTokens.length - 4} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-white">
                            Protocol-level only
                          </span>
                        )}
                      </div>

                      <span className="font-mono text-sm text-foreground text-right font-medium">
                        {formatCurrency(Number(pos.total_value) || 0)}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <WalletManageModal
        open={walletModalOpen}
        onOpenChange={setWalletModalOpen}
        wallets={wallets}
        customTokens={customTokens}
        onUpdate={fetchWallets}
      />

      <LogoEditDialog
        symbol={logoEditToken}
        open={!!logoEditToken}
        onOpenChange={(o) => !o && setLogoEditToken(null)}
        onSave={setTokenLogo}
      />
    </div>
  );
}

function TokenRow({ token }) {
  return (
    <div className="px-3 py-2.5 grid grid-cols-4 items-center hover:bg-secondary/30 transition-colors">
      <div className="flex items-center gap-2">
        {token.icon_url ? (
          <img
            src={token.icon_url}
            alt=""
            className="w-5 h-5 rounded-full"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center">
            <span className="text-[9px] font-bold text-muted-foreground">
              {(token.symbol || "?")[0]}
            </span>
          </div>
        )}

        <span className="text-sm font-medium text-foreground">{token.symbol}</span>
      </div>

      <span className="font-mono text-xs text-foreground text-right">
        {token.amount < 0.0001
          ? token.amount.toExponential(2)
          : token.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </span>

      <span className="font-mono text-xs text-muted-foreground text-right">
        {token.price > 0 ? formatCurrency(token.price) : "-"}
      </span>

      <span className="font-mono text-sm text-foreground text-right font-medium">
        {token.usd_value > 0.01 ? formatCurrency(token.usd_value) : "<$0.01"}
      </span>
    </div>
  );
}

function WalletManageModal({ open, onOpenChange, wallets, customTokens, onUpdate }) {
  const [addresses, setAddresses] = useState("");
  const [chain, setChain] = useState("solana");
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    const lines = addresses
      .split(/[\n,]+/)
      .map((a) => a.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      toast.error("Enter at least one address");
      return;
    }

    setSubmitting(true);

    try {
      const payload = lines.map((addr) => ({
        address: addr,
        chain,
        label: null,
      }));

      await walletsApi.addBulk(payload);
      toast.success(`${lines.length} wallet(s) added`);
      setAddresses("");
      onUpdate();
    } catch {
      toast.error("Failed to add wallets");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (wallet) => {
    await walletsApi.delete(wallet.id);
    toast.success("Removed");
    onUpdate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card border-border sm:max-w-lg max-h-[85vh] overflow-y-auto"
        data-testid="wallet-manage-modal"
      >
        <DialogHeader>
          <DialogTitle>Manage Wallets</DialogTitle>
          <DialogDescription>Add or remove wallet addresses</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Chain</Label>

            <div
              className="grid grid-cols-6 gap-2"
              role="radiogroup"
              aria-label="Chain"
              data-testid="chain-icon-picker"
            >
              {[
                ["solana", "SOL"],
                ["bitcoin", "BTC"],
                ["ethereum", "ETH"],
                ["bsc", "BSC"],
                ["polygon", "MATIC"],
                ["avalanche", "AVAX"],
                ["arbitrum", "ARB"],
                ["optimism", "OP"],
                ["base", "BASE"],
                ["tron", "TRX"],
                ["fantom", "FTM"],
              ].map(([id, sym]) => {
                const m = CHAIN_META[id];
                const active = chain === id;

                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setChain(id)}
                    title={`${m.name} (${sym})`}
                    data-testid={`chain-pick-${id}`}
                    className={`group flex flex-col items-center justify-center gap-1.5 px-2 py-2.5 rounded-md border transition-all ${
                      active
                        ? `${m.activeBg} ${m.color} ring-1 ring-current/40 scale-[1.02]`
                        : "border-border/40 text-muted-foreground hover:border-white/20 hover:bg-secondary/40"
                    }`}
                  >
                    <img
                      src={m.icon}
                      alt=""
                      className={`w-7 h-7 rounded-full transition-transform ${
                        active ? "" : "opacity-70 group-hover:opacity-100"
                      }`}
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />

                    <span className="text-[10px] font-mono tracking-wider">{sym}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Addresses (one per line or comma-separated)</Label>

            <textarea
              className="w-full h-28 px-3 py-2 bg-background border border-border rounded-md text-sm font-mono text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={"Paste wallet addresses here...\nOne per line or comma-separated"}
              value={addresses}
              onChange={(e) => setAddresses(e.target.value)}
              data-testid="wallet-addresses-input"
            />
          </div>

          <Button
            onClick={handleAdd}
            disabled={submitting}
            className="w-full bg-white text-black hover:bg-neutral-200"
            data-testid="submit-wallets-btn"
          >
            {submitting ? "Adding..." : "Add Wallets"}
          </Button>
        </div>

        {wallets.length > 0 && (
          <div className="space-y-2 pt-4 border-t border-border/40">
            <p className="text-xs text-muted-foreground font-medium">
              Connected ({wallets.length})
            </p>

            {wallets.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/30"
              >
                <div className="flex items-center gap-2">
                  <img
                    src={CHAIN_META[w.chain]?.icon || ""}
                    alt=""
                    className="w-4 h-4 rounded-full"
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />

                  <span className="text-xs text-muted-foreground">
                    {CHAIN_META[w.chain]?.name || w.chain}
                  </span>

                  <span className="font-mono text-xs text-foreground">
                    {shortenAddr(w.address)}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-rose-400 hover:text-rose-300"
                  onClick={() => handleDelete(w)}
                  data-testid={`del-wallet-${w.id}`}
                >
                  <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                </Button>
              </div>
            ))}
          </div>
        )}

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
          {url && (
            <img
              src={url}
              alt=""
              className="w-10 h-10 rounded-full mx-auto border border-border"
            />
          )}

          <Input
            placeholder="https://example.com/logo.png"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="bg-background border-border font-mono text-sm"
            data-testid="logo-url-input"
          />

          <Button
            onClick={() => onSave(symbol, url)}
            className="w-full bg-white text-black hover:bg-neutral-200"
            disabled={!url}
            data-testid="save-logo-btn"
          >
            Save Logo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomTokensSection({ customTokens, onUpdate }) {
  const [form, setForm] = useState({
    symbol: "",
    name: "",
    amount: "",
    price: "",
    icon_url: "",
    chain: "solana",
    coingecko_id: "",
  });

  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const priceTimeout = useRef(null);

  const [manualForm, setManualForm] = useState({
    chain: "bitcoin",
    amount: "",
    label: "",
  });

  const [manualSubmitting, setManualSubmitting] = useState(false);

  const resetForm = () => {
    setForm({
      symbol: "",
      name: "",
      amount: "",
      price: "",
      icon_url: "",
      chain: "solana",
      coingecko_id: "",
    });
  };

  const handleAddManual = async () => {
    const amt = parseFloat(manualForm.amount);

    if (!isFinite(amt) || amt <= 0) {
      toast.error("Enter an amount > 0");
      return;
    }

    const native = CHAIN_NATIVE[manualForm.chain];

    if (!native) {
      toast.error("Unsupported chain");
      return;
    }

    setManualSubmitting(true);

    try {
      const price = await coinGeckoApi.getPrice(native.coingecko_id);
      const meta = CHAIN_META[manualForm.chain];

      const labeledName = manualForm.label
        ? `${manualForm.label} ${native.symbol}`
        : `${meta?.name || manualForm.chain} ${native.symbol}`;

      await customTokensApi.create({
        symbol: native.symbol,
        name: labeledName,
        amount: amt,
        price: Number(price) || 0,
        icon_url: meta?.icon || null,
        chain: manualForm.chain,
        coingecko_id: native.coingecko_id,
        is_manual_holding: true,
        label: manualForm.label || null,
      });

      toast.success(`${labeledName} added`);
      setManualForm({ chain: manualForm.chain, amount: "", label: "" });
      onUpdate();
    } catch {
      toast.error("Failed to add manual holding");
    } finally {
      setManualSubmitting(false);
    }
  };

  const fetchPrice = async (symbol) => {
    if (!symbol || symbol.length < 2) return;

    setFetchingPrice(true);

    try {
      const { price, resolved } = await customTokensApi.resolveAndPrice(symbol);

      setForm((prev) => {
        const next = { ...prev };

        if (price > 0) next.price = price.toString();
        if (resolved && !prev.name) next.name = resolved.name;
        if (resolved && !prev.icon_url && resolved.thumb) next.icon_url = resolved.thumb;
        if (resolved) next.coingecko_id = resolved.id;

        return next;
      });
    } catch {
      // silent
    } finally {
      setFetchingPrice(false);
    }
  };

  const handleSymbolChange = (value) => {
    setForm((prev) => ({ ...prev, symbol: value }));

    if (priceTimeout.current) {
      clearTimeout(priceTimeout.current);
    }

    priceTimeout.current = setTimeout(() => fetchPrice(value), 800);
  };

  const handleAdd = async () => {
    if (!form.symbol || !form.amount) {
      toast.error("Symbol and amount required");
      return;
    }

    setSubmitting(true);

    try {
      await customTokensApi.create({
        symbol: form.symbol.toUpperCase(),
        name: form.name || form.symbol,
        amount: parseFloat(form.amount) || 0,
        price: parseFloat(form.price) || 0,
        icon_url: form.icon_url || null,
        chain: form.chain,
        coingecko_id: form.coingecko_id || null,
      });

      toast.success(`${form.symbol} added`);
      resetForm();
      onUpdate();
    } catch {
      toast.error("Failed to add");
    } finally {
      setSubmitting(false);
    }
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
        coingecko_id: form.coingecko_id || null,
      });

      toast.success("Updated");
      setEditingId(null);
      resetForm();
      onUpdate();
    } catch {
      toast.error("Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, symbol) => {
    try {
      await customTokensApi.delete(id);
      toast.success(`${symbol} removed`);
      onUpdate();
    } catch {
      toast.error("Failed to delete");
    }
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
      coingecko_id: token.coingecko_id || "",
    });
  };

  const handleRefreshPrices = async () => {
    setRefreshingPrices(true);

    try {
      const res = await customTokensApi.refreshAllPrices();
      const { updated, total } = res.data || {};

      if (updated > 0) {
        toast.success(`Refreshed ${updated}/${total} custom token prices`);
      } else if (total > 0) {
        toast.error(`Couldn't resolve any prices for ${total} token(s) — check the symbols`);
      } else {
        toast.info("No custom tokens to refresh");
      }

      onUpdate();
    } catch {
      toast.error("Failed to refresh prices");
    } finally {
      setRefreshingPrices(false);
    }
  };

  return (
    <div className="space-y-3 pt-4 border-t border-border/40">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium">Custom Tokens</p>

        {customTokens && customTokens.length > 0 && (
          <Button
            type="button"
            onClick={handleRefreshPrices}
            disabled={refreshingPrices}
            size="sm"
            variant="outline"
            className="h-7 px-2 border-border/40 text-xs"
            data-testid="refresh-custom-prices-btn"
            title="Re-fetch live prices from CoinGecko"
          >
            <RefreshCw
              className={`w-3 h-3 mr-1 ${refreshingPrices ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
            {refreshingPrices ? "Refreshing..." : "Refresh prices"}
          </Button>
        )}
      </div>

      <div
        className="space-y-2 p-3 rounded-md bg-secondary/30 border border-border/30"
        data-testid="manual-holding-section"
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">
            Manual Holdings
          </p>

          <span className="text-[10px] text-muted-foreground/60">
            For exchange or hardware wallets without an address
          </span>
        </div>

        {customTokens?.some((t) => t.is_manual_holding) && (
          <div className="space-y-1">
            {customTokens
              .filter((t) => t.is_manual_holding)
              .map((t) => {
                const meta = CHAIN_META[t.chain];
                const value = (Number(t.amount) || 0) * (Number(t.price) || 0);

                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between px-3 py-2 rounded-md bg-background/40"
                    data-testid={`manual-holding-${t.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {meta?.icon ? (
                        <img
                          src={meta.icon}
                          alt=""
                          className="w-4 h-4 rounded-full flex-shrink-0"
                        />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-secondary flex-shrink-0" />
                      )}

                      <span className="text-xs font-medium text-foreground truncate">
                        {t.label || meta?.name || t.chain}
                      </span>

                      <span className="font-mono text-xs text-muted-foreground">
                        {Number(t.amount).toLocaleString(undefined, {
                          maximumFractionDigits: 8,
                        })}{" "}
                        {t.symbol}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono text-xs text-foreground">
                        ${value.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>

                      <button
                        onClick={() => handleDelete(t.id, t.label || t.symbol)}
                        className="text-rose-400 hover:text-rose-300 p-1"
                        data-testid={`del-manual-${t.id}`}
                        title="Delete manual holding"
                      >
                        <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        <div
          className="grid grid-cols-6 gap-1.5"
          role="radiogroup"
          aria-label="Manual holding chain"
          data-testid="manual-chain-picker"
        >
          {Object.keys(CHAIN_NATIVE).map((id) => {
            const m = CHAIN_META[id];
            const native = CHAIN_NATIVE[id];
            const active = manualForm.chain === id;

            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setManualForm({ ...manualForm, chain: id })}
                title={`${m.name} — ${native.symbol}`}
                data-testid={`manual-chain-${id}`}
                className={`flex flex-col items-center gap-1 px-1 py-1.5 rounded transition-all ${
                  active
                    ? `${m.activeBg} ${m.color} ring-1 ring-current/40`
                    : "border border-transparent text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                <img
                  src={m.icon}
                  alt=""
                  className={`w-5 h-5 rounded-full ${active ? "" : "opacity-70"}`}
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                />

                <span className="text-[9px] font-mono">{native.symbol}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            step="any"
            placeholder={`Amount (${CHAIN_NATIVE[manualForm.chain]?.symbol || "?"})`}
            value={manualForm.amount}
            onChange={(e) =>
              setManualForm({
                ...manualForm,
                amount: e.target.value,
              })
            }
            className="bg-background border-border font-mono text-sm"
            data-testid="manual-amount"
          />

          <Input
            placeholder="Label (optional, e.g. Coinbase)"
            value={manualForm.label}
            onChange={(e) =>
              setManualForm({
                ...manualForm,
                label: e.target.value,
              })
            }
            className="bg-background border-border text-sm"
            data-testid="manual-label"
          />
        </div>

        <Button
          type="button"
          onClick={handleAddManual}
          disabled={manualSubmitting || !manualForm.amount}
          size="sm"
          className="w-full bg-white text-black hover:bg-neutral-200"
          data-testid="manual-add-btn"
        >
          {manualSubmitting
            ? "Adding..."
            : `Add ${CHAIN_NATIVE[manualForm.chain]?.symbol || ""} Holding`}
        </Button>
      </div>

      {customTokens && customTokens.some((ct) => !ct.is_manual_holding) && (
        <div className="space-y-1 mb-3">
          {customTokens
            .filter((ct) => !ct.is_manual_holding)
            .map((ct) => (
              <div
                key={ct.id}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-secondary/30"
              >
                <div className="flex items-center gap-2">
                  {ct.icon_url ? (
                    <img src={ct.icon_url} alt="" className="w-4 h-4 rounded-full" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-secondary flex items-center justify-center">
                      <span className="text-[8px] font-bold text-muted-foreground">
                        {(ct.symbol || "?")[0]}
                      </span>
                    </div>
                  )}

                  <span className="text-xs font-medium text-foreground">{ct.symbol}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {ct.amount} @ ${ct.price}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({CHAIN_META[ct.chain]?.name || ct.chain})
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(ct)}
                    className="text-muted-foreground hover:text-foreground p-1"
                    data-testid={`edit-custom-${ct.id}`}
                  >
                    <Pencil className="w-3 h-3" strokeWidth={1.5} />
                  </button>

                  <button
                    onClick={() => handleDelete(ct.id, ct.symbol)}
                    className="text-rose-400 hover:text-rose-300 p-1"
                    data-testid={`del-custom-${ct.id}`}
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <Input
            placeholder="Symbol (e.g. TRX, ETH)"
            value={form.symbol}
            onChange={(e) => handleSymbolChange(e.target.value)}
            className="bg-background border-border text-sm"
            data-testid="custom-token-symbol"
          />

          {fetchingPrice && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground animate-pulse">
              fetching...
            </span>
          )}
        </div>

        <Select value={form.chain} onValueChange={(v) => setForm({ ...form, chain: v })}>
          <SelectTrigger className="bg-background border-border text-sm">
            <SelectValue />
          </SelectTrigger>

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

      <Input
        placeholder="Name (auto-filled)"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className="bg-background border-border text-sm"
      />

      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          step="any"
          placeholder="Amount"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          className="bg-background border-border font-mono text-sm"
          data-testid="custom-token-amount"
        />

        <Input
          type="number"
          step="any"
          placeholder="Price (auto-filled)"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          className="bg-background border-border font-mono text-sm"
        />
      </div>

      <Input
        placeholder="Icon URL (optional)"
        value={form.icon_url}
        onChange={(e) => setForm({ ...form, icon_url: e.target.value })}
        className="bg-background border-border text-sm"
      />

      {editingId ? (
        <div className="flex gap-2">
          <Button
            onClick={handleEdit}
            disabled={submitting}
            size="sm"
            className="flex-1 bg-white text-black hover:bg-neutral-200"
            data-testid="save-custom-token-btn"
          >
            {submitting ? "Saving..." : "Save Changes"}
          </Button>

          <Button
            onClick={() => {
              setEditingId(null);
              resetForm();
            }}
            size="sm"
            variant="outline"
            className="border-border/40"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          onClick={handleAdd}
          disabled={submitting}
          size="sm"
          className="w-full bg-secondary text-foreground hover:bg-secondary/80"
          data-testid="add-custom-token-btn"
        >
          {submitting ? "Adding..." : "Add Custom Token"}
        </Button>
      )}
    </div>
  );
}