// External API calls moved from backend to frontend
import axios from "axios";

// CoinGecko API (free, no auth required)
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export const coinGeckoApi = {
  getPrice: async (coinId, vsCurrency = "usd") => {
    const response = await axios.get(`${COINGECKO_BASE}/simple/price`, {
      params: { ids: coinId, vs_currencies: vsCurrency },
      timeout: 10000,
    });
    return response.data[coinId]?.[vsCurrency] || 0;
  },

  search: async (query) => {
    const response = await axios.get(`${COINGECKO_BASE}/search`, {
      params: { query },
      timeout: 10000,
    });
    return response.data.coins || [];
  },

  getInfo: async (coinId) => {
    const response = await axios.get(`${COINGECKO_BASE}/coins/${coinId}`, {
      timeout: 10000,
    });
    return response.data;
  },
};

// Finnhub API (requires API key)
const FINNHUB_BASE = "https://finnhub.io/api/v1";
const FINNHUB_KEY = process.env.REACT_APP_FINNHUB_API_KEY;

export const finnhubApi = {
  getQuote: async (symbol) => {
    const response = await axios.get(`${FINNHUB_BASE}/quote`, {
      params: { symbol, token: FINNHUB_KEY },
      timeout: 10000,
    });
    return response.data;
  },

  search: async (query) => {
    const response = await axios.get(`${FINNHUB_BASE}/search`, {
      params: { q: query, token: FINNHUB_KEY },
      timeout: 10000,
    });
    return response.data.result || [];
  },
};

// Jupiter API for Solana DeFi positions
const JUPITER_API_KEY = process.env.REACT_APP_JUPITER_API_KEY;
const JUPITER_BASE = "https://api.jup.ag";

export const jupiterApi = {
  getPortfolio: async (walletAddress) => {
    const response = await axios.get(`${JUPITER_BASE}/portfolio/${walletAddress}`, {
      headers: JUPITER_API_KEY ? { "x-api-key": JUPITER_API_KEY } : {},
      timeout: 10000,
    });
    return response.data;
  },
};

// CoinStats API for wallet balances
const COINSTATS_API_KEY = process.env.REACT_APP_COINSTATS_API_KEY;
const COINSTATS_BASE = "https://api.coinstats.app/public/v1";

export const coinStatsApi = {
  getWalletBalance: async (address, chain = "solana") => {
    const response = await axios.get(`${COINSTATS_BASE}/wallets/${address}`, {
      params: { chain },
      headers: { "X-API-KEY": COINSTATS_API_KEY },
      timeout: 10000,
    });
    return response.data;
  },
};

// Solana RPC
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

export const solanaApi = {
  getBalance: async (address) => {
    const response = await axios.post(SOLANA_RPC, {
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address],
    }, { timeout: 10000 });
    return response.data.result?.value || 0;
  },

  getTokenAccounts: async (address) => {
    const response = await axios.post(SOLANA_RPC, {
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [address, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }],
    }, { timeout: 10000 });
    return response.data.result?.value || [];
  },
};

// Bitcoin Blockchain.info
const BITCOIN_API = "https://blockchain.info";

export const bitcoinApi = {
  getBalance: async (address) => {
    const response = await axios.get(`${BITCOIN_API}/balance`, {
      params: { active: address },
      timeout: 10000,
    });
    return response.data[address]?.final_balance || 0;
  },
};

// RapidAPI eBay API (requires API key)
const RAPIDAPI_KEY = process.env.REACT_APP_RAPIDAPI_KEY;
const RAPIDAPI_EBAY_HOST = process.env.REACT_APP_RAPIDAPI_EBAY_HOST || "ebay-average-selling-price.p.rapidapi.com";

export const ebayApi = {
  getAveragePrice: async (model) => {
    if (!model) return 0;
    try {
      const response = await axios.get(`https://${RAPIDAPI_EBAY_HOST}/findCompletedItems`, {
        params: {
          keywords: model,
          max_search_results: "50",
          sort_order: "PricePlusShippingLowest",
        },
        headers: {
          "x-rapidapi-key": RAPIDAPI_KEY,
          "x-rapidapi-host": RAPIDAPI_EBAY_HOST,
        },
        timeout: 15000,
      });
      // Parse the response as per backend logic
      const items = response.data.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
      if (!items.length) return 0;
      const prices = items
        .map(item => parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || 0))
        .filter(price => price > 0);
      if (!prices.length) return 0;
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      return Math.round(avg * 100) / 100; // Round to 2 decimals
    } catch (error) {
      console.warn(`eBay price fetch failed for '${model}':`, error);
      return 0;
    }
  },
};