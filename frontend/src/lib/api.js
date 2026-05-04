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
  delete: (id) => api.delete(`/wallets/${id}`),
  getBalances: (id) => api.get(`/wallets/${id}/balances`),
};

export default api;
