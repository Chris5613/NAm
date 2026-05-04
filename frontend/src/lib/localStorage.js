// Local storage utilities for caching data client-side
const STORAGE_KEYS = {
  ASSETS: 'networth_assets',
  PHONES: 'networth_phones',
  WALLETS: 'networth_wallets',
  PROJECTS: 'networth_projects',
  TOKENS: 'networth_tokens',
  PREFS: 'networth_prefs',
  CRYPTO_CACHE: 'networth_crypto_cache',
  HISTORY: 'networth_history',
  LIVE_HISTORY: 'networth_live_history',
  GOMINING: 'networth_gomining',
  GOMINING_SYNCED: 'networth_gomining_synced',
};

export const localStorage = {
  // Generic storage methods
  get: (key) => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.warn(`Error reading from localStorage:`, error);
      return null;
    }
  },

  set: (key, value) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`Error writing to localStorage:`, error);
      return false;
    }
  },

  remove: (key) => {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn(`Error removing from localStorage:`, error);
      return false;
    }
  },

  // Specific data methods
  getAssets: () => localStorage.get(STORAGE_KEYS.ASSETS) || [],
  setAssets: (assets) => localStorage.set(STORAGE_KEYS.ASSETS, assets),

  getPhones: () => localStorage.get(STORAGE_KEYS.PHONES) || [],
  setPhones: (phones) => localStorage.set(STORAGE_KEYS.PHONES, phones),

  getWallets: () => localStorage.get(STORAGE_KEYS.WALLETS) || [],
  setWallets: (wallets) => localStorage.set(STORAGE_KEYS.WALLETS, wallets),

  getProjects: () => localStorage.get(STORAGE_KEYS.PROJECTS) || [],
  setProjects: (projects) => localStorage.set(STORAGE_KEYS.PROJECTS, projects),

  getTokens: () => localStorage.get(STORAGE_KEYS.TOKENS) || [],
  setTokens: (tokens) => localStorage.set(STORAGE_KEYS.TOKENS, tokens),

  getPrefs: () => localStorage.get(STORAGE_KEYS.PREFS) || {},
  setPrefs: (prefs) => localStorage.set(STORAGE_KEYS.PREFS, prefs),

  getCryptoCache: () => localStorage.get(STORAGE_KEYS.CRYPTO_CACHE) || { total: 0, chains: [], tokens: [] },
  setCryptoCache: (cache) => localStorage.set(STORAGE_KEYS.CRYPTO_CACHE, cache),

  getHistory: () => localStorage.get(STORAGE_KEYS.HISTORY) || [],
  setHistory: (history) => localStorage.set(STORAGE_KEYS.HISTORY, history),

  getLiveHistory: () => localStorage.get(STORAGE_KEYS.LIVE_HISTORY) || [],
  setLiveHistory: (points) => localStorage.set(STORAGE_KEYS.LIVE_HISTORY, points),

  getGoMining: () => localStorage.get(STORAGE_KEYS.GOMINING) || [],
  setGoMining: (rows) => localStorage.set(STORAGE_KEYS.GOMINING, rows),

  // Map of { rowId: lastSyncedReward } — used to detect deltas to push into the
  // GoMining investment project on save.
  getGoMiningSynced: () => localStorage.get(STORAGE_KEYS.GOMINING_SYNCED) || {},
  setGoMiningSynced: (snapshot) => localStorage.set(STORAGE_KEYS.GOMINING_SYNCED, snapshot),

};