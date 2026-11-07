import { remoteStorage as localStorage } from "@/lib/serverStore";

export const DAILY_CRYPTO_BASELINE_KEY = "daily_crypto_net_worth_baseline_pst";
export const CRYPTO_LIVE_HISTORY_KEY = "crypto_live_history";
export const WALLET_BALANCE_CACHE_KEY = "crypto_wallet_balance_cache";
export const DEFI_CACHE_KEY = "crypto_defi_cache";
export const MANUAL_DEFI_KEY = "manual_defi_positions";

export function getWalletBalanceCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(WALLET_BALANCE_CACHE_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

export function saveWalletBalanceCache(cache) {
  try {
    localStorage.setItem(WALLET_BALANCE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage unavailable
  }
}

export function setCachedWalletBalance(walletId, data) {
  const cache = getWalletBalanceCache();

  cache[walletId] = {
    savedAt: Date.now(),
    data,
  };

  saveWalletBalanceCache(cache);
}

export function getSavedDefiPositions() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEFI_CACHE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function saveDefiPositions(positions) {
  try {
    localStorage.setItem(DEFI_CACHE_KEY, JSON.stringify(positions || []));
  } catch {
    // localStorage unavailable
  }
}

export function getSavedManualDefiPositions() {
  try {
    const saved = JSON.parse(localStorage.getItem(MANUAL_DEFI_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function saveManualDefiPositions(positions) {
  try {
    localStorage.setItem(MANUAL_DEFI_KEY, JSON.stringify(positions || []));
  } catch {
    // localStorage unavailable
  }
}


export function getSavedCryptoHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(CRYPTO_LIVE_HISTORY_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function saveCryptoHistory(history) {
  try {
    localStorage.setItem(CRYPTO_LIVE_HISTORY_KEY, JSON.stringify(history.slice(-50)));
  } catch {
    // localStorage unavailable
  }
}


export function getPstDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getDailyCryptoChange(currentValue) {
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

export function formatCurrency(v) {
  if (!v && v !== 0) return "$0.00";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(v);
}

export function shortenAddr(a) {
  return a?.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "";
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getDisplayDefiTokens(pos) {
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

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const CHAIN_META = {
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

export const CHAIN_NATIVE = {
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
