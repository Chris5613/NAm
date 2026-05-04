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

// Jupiter API for Solana DeFi positions
const JUPITER_API_KEY = process.env.REACT_APP_JUPITER_API_KEY;
const JUPITER_BASE = "https://api.jup.ag";

export const jupiterApi = {
  getPortfolio: async (walletAddress) => {
    try {
      const url = `${JUPITER_BASE}/portfolio/${walletAddress}`;
      const response = await withCorsProxy(url, {
        headers: JUPITER_API_KEY ? { "x-api-key": JUPITER_API_KEY } : {},
      });
      return response.data || [];
    } catch (error) {
      console.warn(`Jupiter portfolio fetch failed for ${walletAddress}:`, error);
      return [];
    }
  },
};

// CoinStats API for wallet balances - needs CORS proxy
const COINSTATS_API_KEY = process.env.REACT_APP_COINSTATS_API_KEY;
const COINSTATS_BASE = "https://api.coinstats.app/public/v1";

export const coinStatsApi = {
  getWalletBalance: async (address, chain = "solana") => {
    try {
      const url = `${COINSTATS_BASE}/wallets/${address}?chain=${chain}`;
      const response = await withCorsProxy(url, {
        headers: { "X-API-KEY": COINSTATS_API_KEY },
      });
      return response.data || {};
    } catch (error) {
      console.warn(`CoinStats wallet balance fetch failed for ${address}:`, error);
      return {};
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

// RapidAPI eBay API (SECURITY WARNING: API keys should never be exposed in frontend code)
// This endpoint requires a backend proxy for security. Until then, prices cannot be fetched.
const RAPIDAPI_KEY = process.env.REACT_APP_RAPIDAPI_KEY;
const RAPIDAPI_EBAY_HOST = process.env.REACT_APP_RAPIDAPI_EBAY_HOST || "ebay-average-selling-price.p.rapidapi.com";

export const ebayApi = {
  getAveragePrice: async (model) => {
    if (!model) return 0;
    
    // Security: Do not expose API keys in frontend code
    if (RAPIDAPI_KEY) {
      console.warn(
        "⚠️ SECURITY WARNING: API keys detected in frontend environment variables. " +
        "API keys should never be exposed in client-side code. " +
        "Set up a backend endpoint to proxy eBay API requests instead."
      );
    }
    
    // For now, return 0 and suggest using a backend endpoint
    console.info(`eBay price lookup for '${model}' requires a backend endpoint (security limitation).`);
    return 0;
  },
};