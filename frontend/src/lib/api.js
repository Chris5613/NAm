import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
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
  getCurrent: () => api.get("/net-worth"),
  getHistory: () => api.get("/net-worth/history"),
  saveSnapshot: () => api.post("/net-worth/snapshot"),
};

export const cryptoCacheApi = {
  get: () => api.get("/crypto/cache"),
  set: (payload) => {
    // Accept either a bare number (legacy) or a full payload { total, chains, tokens }
    const body = typeof payload === "number" ? { total: payload } : payload;
    return api.post("/crypto/cache", body);
  },
};

export const pricesApi = {
  getCryptoPrice: (coinId) => api.get(`/prices/crypto/${coinId}`),
  getCryptoInfo: (coinId) => api.get(`/prices/crypto/info/${coinId}`),
  searchCrypto: (query) => api.get(`/prices/crypto/search/${query}`),
  getStockPrice: (symbol) => api.get(`/prices/stock/${symbol}`),
  searchStock: (query) => api.get(`/prices/stock/search/${query}`),
  refreshAll: () => api.post("/prices/refresh"),
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
  getBalances: (id) => api.get(`/wallets/${id}/balances`),
  getDefiPositions: (address) => api.get(`/wallets/solana/defi/${address}`),
  getCoinStatsBalance: (address, chain = "solana") => api.get(`/wallets/coinstats/${address}`, { params: { chain } }),
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
  getPrice: (symbol) => api.get(`/token-price/${symbol}`),
};

export const nosTrackingApi = {
  getStatus: () => api.get("/nos-tracking/status"),
  configure: (wallet_address, project_name) => api.post(`/nos-tracking/configure?wallet_address=${wallet_address}&project_name=${project_name}`),
};

export default api;
