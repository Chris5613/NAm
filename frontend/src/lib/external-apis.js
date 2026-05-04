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
// NOTE: The legacy public Jupiter Portfolio endpoint at api.jup.ag/portfolio/* now
// returns 404. We keep the export for backward-compatibility but make it a no-op.
// Wallet balances (incl. Solana) come from CoinStats below.
export const jupiterApi = {
  getPortfolio: async (_walletAddress) => {
    return { positions: [] };
  },
};

// CoinStats — returns an array of token holdings for a wallet on a given chain.
// Docs: https://openapi.coinstats.app/  GET /wallet/balance
const COINSTATS_BASE = "https://openapiv1.coinstats.app";
const COINSTATS_API_KEY = process.env.REACT_APP_COINSTATS_API_KEY;

// Map our internal chain names → the CoinStats connectionId values
// (verified via /wallet/blockchains).
const COINSTATS_CHAIN_MAP = {
  solana: "solana",
  bitcoin: "bitcoin",
  ethereum: "ethereum",
  bsc: "binancesmartchain",
  polygon: "polygon-wallet",
  avalanche: "avalanche-wallet",
  arbitrum: "arbitrum-wallet",
  optimism: "optimism-wallet",
  base: "base-wallet",
  tron: "tron",
  fantom: "fantom-wallet",
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