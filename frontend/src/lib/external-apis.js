// External API calls are executed directly in the frontend
import axios from "axios";
import { withCorsProxy, fetchWithCors } from "./cors-proxy";

// CoinGecko API (free, no auth required) - CORS-friendly
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export const coinGeckoApi = {
  getPrice: async (coinId, vsCurrency = "usd") => {
    try {
      const response = await withCorsProxy(`${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}`);
      return response.data[coinId]?.[vsCurrency] || 0;
    } catch (error) {
      console.warn(`CoinGecko price fetch failed for ${coinId}:`, error);
      return 0;
    }
  },

  search: async (query) => {
    try {
      const response = await withCorsProxy(`${COINGECKO_BASE}/search?query=${query}`);
      return response.data.coins || [];
    } catch (error) {
      console.warn(`CoinGecko search failed for ${query}:`, error);
      return [];
    }
  },

  // Resolve a ticker symbol (e.g. "TRX") to CoinGecko's canonical coin id
  // (e.g. "tron"). The simple/price endpoint only accepts ids, so without
  // this step custom tokens added by symbol come back priced at $0.
  // Returns: { id, name, symbol, thumb } or null.
  resolveSymbol: async (symbol) => {
    if (!symbol) return null;
    try {
      const coins = await coinGeckoApi.search(symbol);
      const target = symbol.trim().toLowerCase();
      // Prefer an exact symbol match; CoinGecko returns results sorted by
      // market-cap rank, so the first exact hit is almost always correct.
      const match =
        coins.find((c) => (c.symbol || "").toLowerCase() === target) ||
        coins.find((c) => (c.name || "").toLowerCase() === target) ||
        coins[0] ||
        null;
      if (!match) return null;
      return {
        id: match.id,
        name: match.name,
        symbol: match.symbol,
        thumb: match.thumb || match.large || match.small || "",
      };
    } catch (error) {
      console.warn(`CoinGecko resolveSymbol failed for ${symbol}:`, error);
      return null;
    }
  },

  getInfo: async (coinId) => {
    try {
      const response = await withCorsProxy(`${COINGECKO_BASE}/coins/${coinId}`);
      return response.data || {};
    } catch (error) {
      console.warn(`CoinGecko info fetch failed for ${coinId}:`, error);
      return {};
    }
  },
};

// Finnhub API (requires API key)
const FINNHUB_BASE = "https://finnhub.io/api/v1";
const FINNHUB_KEY = process.env.REACT_APP_FINNHUB_API_KEY;

export const finnhubApi = {
  getQuote: async (symbol) => {
    try {
      const url = `${FINNHUB_BASE}/quote?symbol=${symbol}&token=${FINNHUB_KEY}`;
      const response = await withCorsProxy(url);
      return response.data || {};
    } catch (error) {
      console.warn(`Finnhub quote fetch failed for ${symbol}:`, error);
      return {};
    }
  },

  search: async (query) => {
    try {
      const url = `${FINNHUB_BASE}/search?q=${query}&token=${FINNHUB_KEY}`;
      const response = await withCorsProxy(url);
      return response.data.result || [];
    } catch (error) {
      console.warn(`Finnhub search failed for ${query}:`, error);
      return [];
    }
  },
};

// Jupiter Portfolio API — new endpoint (replaces the old /portfolio/{address} path
// which now 404s). Returns Solana DeFi positions (staking, lending, LP, leverage, …).
// Docs: https://dev.jup.ag/docs/api-reference/portfolio/get-positions
const JUPITER_API_KEY = process.env.REACT_APP_JUPITER_API_KEY;
const JUPITER_PORTFOLIO_BASE = "https://api.jup.ag/portfolio/v1";

// Translate a Jupiter Portfolio "element" → the position shape our UI expects:
// { platform_id, platform, label, total_value, apy, tokens: [...] }
// Jupiter Portfolio returns 5 element shapes (multiple / liquidity / borrowlend /
// leverage / trade), each with assets in different paths. We extract them all.
function buildToken(asset, tokenInfo, networkId, kind = "supplied") {
  if (!asset) return null;
  const data = asset.data || asset;
  const addr = data.address || data.mint || asset.address || "";
  const amount = Number(data.amount ?? asset.amount ?? 0);
  const price = Number(data.price ?? asset.price ?? 0);
  const value = Number(asset.value ?? data.value ?? amount * price);
  const tokInfo = tokenInfo?.[networkId]?.[addr] || {};
  const apy = Number(asset?.attributes?.apy ?? data?.apy ?? 0);
  return {
    address: addr,
    symbol: tokInfo.symbol || data.symbol || asset.symbol || "",
    name: tokInfo.name || data.name || asset.name || "",
    image_uri: tokInfo.logoURI || tokInfo.image || data.image_uri || "",
    amount,
    price,
    value: kind === "borrowed" ? -Math.abs(value) : value,
    apy,
    kind,
  };
}

function mapJupiterElement(el, tokenInfo = {}) {
  const networkId = el?.networkId || "solana";
  const data = el?.data || {};
  const tokens = [];

  const pushAll = (arr, kind = "supplied") => {
    if (!Array.isArray(arr)) return;
    arr.forEach((a) => {
      const t = buildToken(a, tokenInfo, networkId, kind);
      if (t) tokens.push(t);
    });
  };

  switch (el?.type) {
    case "multiple":
      pushAll(data.assets, "supplied");
      pushAll(data.rewardAssets, "reward");
      break;
    case "borrowlend":
      pushAll(data.suppliedAssets, "supplied");
      pushAll(data.borrowedAssets, "borrowed");
      pushAll(data.rewardAssets, "reward");
      break;
    case "liquidity":
      if (Array.isArray(data.liquidities)) {
        data.liquidities.forEach((l) => {
          pushAll(l?.assets, "supplied");
          pushAll(l?.rewardAssets, "reward");
        });
      } else {
        pushAll(data.assets, "supplied");
      }
      break;
    case "leverage":
    case "trade": {
      // Single asset described directly on `data` itself.
      const t = buildToken({ data, value: el.value, attributes: el.attributes }, tokenInfo, networkId, "supplied");
      if (t) tokens.push(t);
      pushAll(data.rewardAssets, "reward");
      break;
    }
    default:
      // Best-effort: scan common asset arrays anywhere.
      pushAll(data.assets, "supplied");
      pushAll(data.suppliedAssets, "supplied");
      pushAll(data.borrowedAssets, "borrowed");
      pushAll(data.rewardAssets, "reward");
      break;
  }

  const totalValue = Number(
    el?.value ??
      tokens.reduce((s, t) => s + (Number.isFinite(t.value) ? t.value : 0), 0),
  );

  // Fallback row so the user can still see a position card with non-zero value
  // even when Jupiter omitted the token breakdown (it happens for some fetchers).
  if (tokens.length === 0 && Math.abs(totalValue) > 0.01) {
    tokens.push({
      address: "",
      symbol: el?.label || el?.name || "Position",
      name: `${el?.name || "Unknown"} - ${el?.label || ""}`.trim(),
      image_uri: "",
      amount: 0,
      price: 0,
      value: totalValue,
      apy: Number(el?.netApy ?? 0),
      kind: "supplied",
    });
  }

  return {
    platform_id: el?.platformId || el?.fetcherId || el?.name || "unknown",
    platform: el?.name || el?.platformId || "Unknown",
    label: el?.label || "",
    total_value: totalValue,
    apy: Number(el?.netApy ?? 0),
    tokens,
  };
}

export const jupiterApi = {
  getPortfolio: async (walletAddress) => {
    if (!walletAddress) return { positions: [] };
    try {
      const url = `${JUPITER_PORTFOLIO_BASE}/positions/${walletAddress}`;
      const response = await fetch(url, {
        headers: JUPITER_API_KEY ? { "x-api-key": JUPITER_API_KEY } : {},
      });
      if (!response.ok) {
        console.warn(`Jupiter portfolio ${response.status} for ${walletAddress}`);
        return { positions: [] };
      }
      const data = await response.json();
      const elements = Array.isArray(data?.elements) ? data.elements : [];
      const tokenInfo = data?.tokenInfo || {};
      // Skip the implicit "Wallet" element — those tokens already come from CoinStats.
      const positions = elements
        .filter((el) => (el?.label || "").toLowerCase() !== "wallet")
        .map((el) => mapJupiterElement(el, tokenInfo))
        .filter((p) => p.total_value > 0.01 || p.tokens.length > 0);
      return { positions };
    } catch (error) {
      console.warn(`Jupiter portfolio fetch failed for ${walletAddress}:`, error);
      return { positions: [] };
    }
  },
};

// CoinStats — returns an array of token holdings for a wallet on a given chain.
// Docs: https://openapi.coinstats.app/  GET /wallet/balance
const COINSTATS_BASE = "https://openapiv1.coinstats.app";
const COINSTATS_API_KEY = import.meta.env.VITE_COINSTATS_KEY?.trim();

// Map our internal chain names → the CoinStats connectionId values
// (verified via /wallet/blockchains).
const COINSTATS_CHAIN_MAP = {
  solana: "solana",
};

export const coinStatsApi = {
  getWalletBalance: async (address, chain = "solana") => {
    try {
      const connectionId = COINSTATS_CHAIN_MAP[chain] || chain;
      const url = `${COINSTATS_BASE}/wallet/balance?address=${encodeURIComponent(address)}&connectionId=${encodeURIComponent(connectionId)}`;
      const response = await fetch(url, {
        headers: COINSTATS_API_KEY ? { "X-API-KEY": COINSTATS_API_KEY } : {},
      });
      if (!response.ok) {
        const text = await response.text();
        console.warn(`CoinStats ${response.status} for ${address} on ${chain}: ${text.slice(0, 200)}`);
        return [];
      }
      const data = await response.json();
      // Endpoint returns an array of token objects.
      return Array.isArray(data) ? data : (data?.tokens || data?.coins || []);
    } catch (error) {
      console.warn(`CoinStats wallet balance fetch failed for ${address}:`, error);
      return [];
    }
  },
};

// Solana RPC - might need CORS proxy for some setups
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

export const solanaApi = {
  getBalance: async (address) => {
    try {
      const response = await withCorsProxy(SOLANA_RPC, {
        method: "POST",
        data: {
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [address],
        },
      });
      return response.data.result?.value || 0;
    } catch (error) {
      console.warn(`Solana balance fetch failed for ${address}:`, error);
      return 0;
    }
  },

  getTokenAccounts: async (address) => {
    try {
      const response = await withCorsProxy(SOLANA_RPC, {
        method: "POST",
        data: {
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenAccountsByOwner",
          params: [address, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }],
        },
      });
      return response.data.result?.value || [];
    } catch (error) {
      console.warn(`Solana token accounts fetch failed for ${address}:`, error);
      return [];
    }
  },
};

// Bitcoin Blockchain.info - needs CORS proxy
const BITCOIN_API = "https://blockchain.info";

export const bitcoinApi = {
  getBalance: async (address) => {
    try {
      const response = await fetchWithCors(`${BITCOIN_API}/balance?active=${address}`);
      const data = typeof response === "string" ? JSON.parse(response) : response;
      return data[address]?.final_balance || 0;
    } catch (error) {
      console.warn(`Bitcoin balance fetch failed for ${address}:`, error);
      return 0;
    }
  },
};

// RapidAPI eBay average selling price.
// Since the app is fully client-side, the key rides in the browser bundle (same
// posture as the other public API keys here). The endpoint sets permissive CORS
// for the browser origin so we can call it directly.
const RAPIDAPI_KEY = process.env.REACT_APP_RAPIDAPI_KEY;
const RAPIDAPI_EBAY_HOST = process.env.REACT_APP_RAPIDAPI_EBAY_HOST || "ebay-average-selling-price.p.rapidapi.com";
const EBAY_CATEGORY_CELL_PHONES = "9355"; // Cell Phones & Smartphones
const EBAY_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

function readEbayCache(key) {
  try {
    const raw = sessionStorage.getItem(`ebay:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - parsed.t > EBAY_CACHE_TTL_MS) return null;
    return parsed.v;
  } catch {
    return null;
  }
}

function writeEbayCache(key, value) {
  try {
    sessionStorage.setItem(`ebay:${key}`, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    /* sessionStorage full / unavailable — non-fatal */
  }
}

export const ebayApi = {
  // Returns the median sold price for `model` on eBay, in USD. 0 if unavailable.
  getAveragePrice: async (model) => {
    const data = await ebayApi.getMarketData(model);
    return data?.median_price || data?.average_price || 0;
  },

  // Full market snapshot (median, avg, min, max, sample size, link to eBay search).
  getMarketData: async (model) => {
    if (!model) return null;
    if (!RAPIDAPI_KEY) {
      console.warn("eBay: REACT_APP_RAPIDAPI_KEY is not set — skipping price lookup.");
      return null;
    }

    const key = model.trim().toLowerCase();
    const cached = readEbayCache(key);
    if (cached) return cached;

    try {
      const response = await fetch(`https://${RAPIDAPI_EBAY_HOST}/findCompletedItems`, {
        method: "POST",
        headers: {
          "X-RapidAPI-Key": RAPIDAPI_KEY,
          "X-RapidAPI-Host": RAPIDAPI_EBAY_HOST,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keywords: model,
          max_search_results: "240",
          category_id: EBAY_CATEGORY_CELL_PHONES,
          remove_outliers: "true",
          site_id: "0",
        }),
      });
      if (!response.ok) {
        let detail = "";
        try { detail = await response.text(); } catch { /* body already consumed */ }
        console.warn(`eBay ${response.status} for "${model}": ${detail.slice(0, 200)}`);
        return null;
      }
      const data = await response.json();
      const result = {
        median_price: Number(data?.median_price ?? 0),
        average_price: Number(data?.average_price ?? 0),
        min_price: Number(data?.min_price ?? 0),
        max_price: Number(data?.max_price ?? 0),
        sample_size: Number(data?.results ?? 0),
        ebay_url: data?.response_url || `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(model)}&LH_Sold=1&LH_Complete=1`,
      };
      writeEbayCache(key, result);
      return result;
    } catch (error) {
      console.warn(`eBay price lookup failed for "${model}":`, error);
      return null;
    }
  },
};

// Nosana dashboard API — official earning history for a node operator.
// Public endpoint, returns per-day USD earnings grouped by month. We use it to
// auto-populate the Investment Overview's Nosana project with rewards (no need
// to track wallet NOS balance changes — this avoids the swap double-dip issue
// since earnings come straight from Nosana's backend).
const NOSANA_API_BASE = "https://dashboard.k8s.prd.nos.ci/api/stats/earning-history";

export const nosanaApi = {
  // Fetch earning history for `address`. `startDate` / `endDate` are ISO
  // YYYY-MM-DD strings. `endDate` is optional (server defaults to today).
  // Returns the raw API payload — see `flattenDailyEarnings` for parsing.
  getEarningHistory: async (address, startDate, endDate, groupBy = "month") => {
    if (!address) throw new Error("Nosana address required");
    if (!startDate) throw new Error("start_date required");
    const params = new URLSearchParams({
      address,
      start_date: startDate,
      group_by: groupBy,
    });
    if (endDate) params.set("end_date", endDate);
    const url = `${NOSANA_API_BASE}?${params.toString()}`;
    const response = await withCorsProxy(url);
    return response.data;
  },

  // Walks the API's `results[*].daily_breakdown` and returns a flat list of
  // { date: 'YYYY-MM-DD', amount: number } entries (summed across markets).
  // Sorted ascending by date.
  flattenDailyEarnings: (apiResponse) => {
    const out = [];
    const results = Array.isArray(apiResponse?.results) ? apiResponse.results : [];
    for (const r of results) {
      const daily = r?.daily_breakdown || {};
      for (const [date, marketMap] of Object.entries(daily)) {
        const sum = Object.values(marketMap || {}).reduce(
          (acc, v) => acc + (Number(v) || 0),
          0,
        );
        if (sum > 0) out.push({ date, amount: sum });
      }
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  },
};