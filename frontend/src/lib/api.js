import axios from "axios";
import { coinGeckoApi, finnhubApi, ebayApi, jupiterApi, coinStatsApi, solanaApi, bitcoinApi } from "./external-apis";

const BACKEND_URL = "https://nam1-dmte.onrender.com";
const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  timeout: 15000,
});

export const assetsApi = {
  getAll: () => api.get("/assets"),
  create: (data) => api.post("/assets", data),
  update: (id, data) => api.put(`/assets/${id}`, data),
  delete: (id) => api.delete(`/assets/${id}`),
};

export const netWorthApi = {
  getCurrent: async () => {
    // Moved to frontend: calculate net worth from all data
    const [assetsRes, phonesRes, cryptoCacheRes] = await Promise.all([
      assetsApi.getAll(),
      phonesApi.list(),
      cryptoCacheApi.get(),
    ]);
    const assets = assetsRes.data || [];
    const phones = phonesRes.phones || [];
    const cryptoCache = cryptoCacheRes.data || {};

    // Calculate breakdown
    const breakdown = {
      stocks: 0,
      crypto: cryptoCache.total || 0,
      cash: 0,
      debts: 0,
      phones: phones.reduce((sum, p) => sum + (p.market_value || 0), 0),
    };

    for (const asset of assets) {
      const value = (asset.quantity || 0) * (asset.current_price || 0);
      if (asset.category === "stocks") {
        breakdown.stocks += value;
      } else if (asset.category === "crypto") {
        breakdown.crypto += value;
      } else if (asset.category === "cash") {
        breakdown.cash += value;
      } else if (asset.category === "debts") {
        breakdown.debts += value;
      }
    }

    const totalNetWorth = breakdown.stocks + breakdown.crypto + breakdown.cash + breakdown.phones - breakdown.debts;

    return {
      data: {
        total_net_worth: totalNetWorth,
        breakdown,
        last_updated: new Date().toISOString(),
      }
    };
  },
  getHistory: () => api.get("/net-worth/history"),
  saveSnapshot: async () => {
    // Moved to frontend: calculate and save snapshot
    const current = await netWorthApi.getCurrent();
    const snapshot = {
      total_net_worth: current.data.total_net_worth,
      stocks_value: current.data.breakdown.stocks,
      crypto_value: current.data.breakdown.crypto,
      cash_value: current.data.breakdown.cash,
      crypto_projects_value: 0, // deprecated
      debts_value: current.data.breakdown.debts,
      timestamp: new Date().toISOString(),
    };
    return api.post("/net-worth/snapshot", snapshot);
  },
};

export const cryptoCacheApi = {
  get: () => api.get("/crypto/cache"),
  set: (payload) => {
    // Accept either a bare number (legacy) or a full payload { total, chains, tokens }
    const body = typeof payload === "number" ? { total: payload } : payload;
    return api.post("/crypto/cache", body);
  },
};

export const phonesApi = {
  list: () => api.get("/phones"),
  create: (data) => api.post("/phones", data),
  update: (id, data) => api.put(`/phones/${id}`, data),
  delete: (id) => api.delete(`/phones/${id}`),
  tags: () => api.get("/phones/tags"),
  refreshPrice: async (id) => {
    // Moved to frontend: fetch from eBay and update
    const phone = await api.get(`/phones/${id}`).then(res => res.data);
    const price = await ebayApi.getAveragePrice(phone.model);
    return api.put(`/phones/${id}`, { ...phone, market_value: price, market_value_source: 'ebay' });
  },
  refreshAllPrices: async () => {
    // Moved to frontend: fetch all phones, refresh each
    const phones = await api.get("/phones").then(res => res.data.phones || []);
    const updates = phones.map(async (phone) => {
      const price = await ebayApi.getAveragePrice(phone.model);
      return api.put(`/phones/${phone._id}`, { ...phone, market_value: price, market_value_source: 'ebay' });
    });
    return Promise.all(updates);
  },
};

export const pricesApi = {
  getCryptoPrice: (coinId) => coinGeckoApi.getPrice(coinId), // Moved to frontend
  getCryptoInfo: (coinId) => coinGeckoApi.getInfo(coinId), // Moved to frontend
  searchCrypto: (query) => coinGeckoApi.search(query), // Moved to frontend
  getStock: (symbol) => finnhubApi.getQuote(symbol), // Moved to frontend
  searchStock: (query) => finnhubApi.search(query), // Moved to frontend
  refreshAll: async () => {
    // Moved to frontend: fetch all assets, update prices, save back
    const assetsRes = await assetsApi.getAll();
    const assets = assetsRes.data || [];
    const cryptoAssets = assets.filter(a => a.category === "crypto" && a.symbol);
    const stockAssets = assets.filter(a => a.category === "stocks" && a.symbol);

    let updatedCount = 0;

    // Update crypto prices
    if (cryptoAssets.length > 0) {
      const coinIds = cryptoAssets.map(a => a.symbol.toLowerCase());
      try {
        const prices = await coinGeckoApi.getPrice(coinIds.join(','));
        for (const asset of cryptoAssets) {
          const price = prices[asset.symbol.toLowerCase()] || 0;
          if (price > 0) {
            await assetsApi.update(asset.id, { current_price: price });
            updatedCount++;
          }
        }
      } catch (error) {
        console.warn("Failed to refresh crypto prices:", error);
      }
    }

    // Update stock prices
    for (const asset of stockAssets) {
      try {
        const quote = await finnhubApi.getQuote(asset.symbol);
        const price = quote.c || 0;
        if (price > 0) {
          await assetsApi.update(asset.id, { current_price: price });
          updatedCount++;
        }
      } catch (error) {
        console.warn(`Failed to refresh price for ${asset.symbol}:`, error);
      }
    }

    return { updatedCount, totalAssets: assets.length };
  },
};

export const projectsApi = {
  getAll: () => api.get("/projects"),
  create: (data) => api.post("/projects", data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),
  getTransactions: (id) => api.get(`/projects/${id}/transactions`),
  addTransaction: (id, data) => api.post(`/projects/${id}/transactions`, data),
  deleteTransaction: (txnId) => api.delete(`/transactions/${txnId}`),
};

export const walletsApi = {
  getAll: () => api.get("/wallets"),
  add: (data) => api.post("/wallets", data),
  addBulk: (data) => api.post("/wallets/bulk", data),
  delete: (id) => api.delete(`/wallets/${id}`),
  getBalances: async (id) => {
    // Moved to frontend: fetch balance from external APIs
    const wallet = await api.get(`/wallets/${id}`).then(res => res.data);
    let balance = {};
    try {
      if (wallet.chain === "solana") {
        // Get SOL balance
        const solBalance = await solanaApi.getBalance(wallet.address);
        balance.sol = solBalance / 1e9; // Lamports to SOL

        // Get SPL tokens
        const tokenAccounts = await solanaApi.getTokenAccounts(wallet.address);
        const tokens = {};
        for (const account of tokenAccounts) {
          const mint = account.account.data.parsed.info.mint;
          const amount = parseFloat(account.account.data.parsed.info.tokenAmount.uiAmountString || 0);
          if (amount > 0) {
            tokens[mint] = amount;
          }
        }
        balance.tokens = tokens;
      } else if (wallet.chain === "bitcoin") {
        const btcBalance = await bitcoinApi.getBalance(wallet.address);
        balance.btc = btcBalance / 1e8; // Satoshis to BTC
      } else {
        // Use CoinStats for other chains
        const data = await coinStatsApi.getWalletBalance(wallet.address, wallet.chain);
        balance = data;
      }
    } catch (error) {
      console.warn(`Balance fetch failed for ${wallet.address}:`, error);
    }
    return { data: balance };
  },
  getDefiPositions: async (address) => {
    // Moved to frontend: fetch from Jupiter
    try {
      const data = await jupiterApi.getPortfolio(address);
      return { data };
    } catch (error) {
      console.warn(`DeFi fetch failed for ${address}:`, error);
      return { data: [] };
    }
  },
  getCoinStatsBalance: async (address, chain = "solana") => {
    // Moved to frontend
    try {
      const data = await coinStatsApi.getWalletBalance(address, chain);
      return { data };
    } catch (error) {
      console.warn(`CoinStats fetch failed for ${address}:`, error);
      return { data: {} };
    }
  },
};

export const tokenPrefsApi = {
  getAll: () => api.get("/token-prefs"),
  update: (symbol, data) => api.put(`/token-prefs/${symbol}`, data),
};

export const customTokensApi = {
  getAll: () => api.get("/custom-tokens"),
  create: (data) => api.post("/custom-tokens", data),
  update: (id, data) => api.put(`/custom-tokens/${id}`, data),
  delete: (id) => api.delete(`/custom-tokens/${id}`),
  getPrice: (symbol) => coinGeckoApi.getPrice(symbol), // Moved to frontend
};

export const nosTrackingApi = {
  getStatus: () => api.get("/nos-tracking/status"),
  configure: (wallet_address, project_name) => api.post(`/nos-tracking/configure?wallet_address=${wallet_address}&project_name=${project_name}`),
};

export default api;
