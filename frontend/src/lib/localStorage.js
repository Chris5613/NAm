// Local storage utilities for caching data client-side
const STORAGE_KEYS = {
  ASSETS: 'networth_assets',
  PHONES: 'networth_phones',
  WALLETS: 'networth_wallets',
  PROJECTS: 'networth_projects',
  TOKENS: 'networth_tokens',
  PREFS: 'networth_prefs',
  CRYPTO_CACHE: 'networth_crypto_cache',
  LAST_SYNC: 'networth_last_sync',
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

  getLastSync: () => localStorage.get(STORAGE_KEYS.LAST_SYNC),
  setLastSync: (timestamp) => localStorage.set(STORAGE_KEYS.LAST_SYNC, timestamp),

  // Sync methods
  syncToBackend: async (api) => {
    // Sync all local data to backend
    const assets = localStorage.getAssets();
    const phones = localStorage.getPhones();
    const wallets = localStorage.getWallets();
    const projects = localStorage.getProjects();
    const tokens = localStorage.getTokens();
    const prefs = localStorage.getPrefs();
    const cryptoCache = localStorage.getCryptoCache();

    // This would require backend endpoints to bulk sync
    // For now, just mark as synced
    localStorage.setLastSync(new Date().toISOString());
  },

  loadFromBackend: async (api) => {
    // Load all data from backend and cache locally
    try {
      const [assets, phones, wallets, projects, tokens, prefs, cryptoCache] = await Promise.all([
        api.assetsApi.getAll().then(r => r.data),
        api.phonesApi.list().then(r => r.phones),
        api.walletsApi.getAll().then(r => r.data),
        api.projectsApi.getAll().then(r => r.data),
        api.customTokensApi.getAll().then(r => r.data),
        api.tokenPrefsApi.getAll().then(r => r.data),
        api.cryptoCacheApi.get().then(r => r.data),
      ]);

      localStorage.setAssets(assets);
      localStorage.setPhones(phones);
      localStorage.setWallets(wallets);
      localStorage.setProjects(projects);
      localStorage.setTokens(tokens);
      localStorage.setPrefs(prefs);
      localStorage.setCryptoCache(cryptoCache);
      localStorage.setLastSync(new Date().toISOString());
    } catch (error) {
      console.warn('Failed to load from backend:', error);
    }
  },
};