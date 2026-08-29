// Local storage utilities for caching data client-side
export const STORAGE_KEYS = {
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
  NOSANA_CONFIG: 'networth_nosana_config',
  NOSANA_SYNCED_DATES: 'networth_nosana_synced_dates',
  KRYPTEX_CONFIG: 'networth_kryptex_config',
  KRYPTEX_EXTENSION: 'networth_kryptex_extension',
  ROLLERCOIN_CONFIG: 'networth_rollercoin_config',
  ACURAST_CONFIG: 'networth_acurast_config',
  UNITY_NETWORK_CONFIG: 'networth_unity_network_config',
  UNITY_NETWORK_EXTENSION: 'networth_unity_network_extension',
  GOMINING_TOKEN_CONFIG: 'networth_gomining_token_config',
  ACU_PRICE_CACHE: 'networth_acu_price_cache',
  GOMINING_PRICE_CACHE: 'networth_gomining_price_cache',
  TRX_PRICE_CACHE: 'networth_trx_price_cache',
  CUSTOM_INTEGRATIONS: 'networth_custom_integrations',
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

  // Nosana node configuration: { node_address, project_name, enabled, last_synced_at }.
  // Used by the auto-sync scheduler (23:45 UTC daily) to fetch earnings from
  // the Nosana dashboard API and post them to the Investment Overview.
  getNosanaConfig: () => localStorage.get(STORAGE_KEYS.NOSANA_CONFIG) || null,
  setNosanaConfig: (config) => localStorage.set(STORAGE_KEYS.NOSANA_CONFIG, config),

  // Map of { 'YYYY-MM-DD': { amount: number, txn_id: string } } — tracks which
  // calendar days have already been synced to the Nosana investment project so
  // a re-sync is idempotent. Same-day amounts get updated (today's data grows
  // throughout the day).
  getNosanaSyncedDates: () => localStorage.get(STORAGE_KEYS.NOSANA_SYNCED_DATES) || {},
  setNosanaSyncedDates: (map) => localStorage.set(STORAGE_KEYS.NOSANA_SYNCED_DATES, map),

  // Kryptex Desktop local-service integration. The total USD balance is used
  // as a delta baseline; latest_status contains read-only miner telemetry.
  getKryptexConfig: () => localStorage.get(STORAGE_KEYS.KRYPTEX_CONFIG) || null,
  setKryptexConfig: (config) => localStorage.set(STORAGE_KEYS.KRYPTEX_CONFIG, config),

  // Kryptex browser-extension bridge state — lets the deployed site receive
  // local Kryptex data without a backend (extension has host_permissions for
  // 127.0.0.1:8107, which the page itself cannot reach directly).
  getKryptexExtension: () => localStorage.get(STORAGE_KEYS.KRYPTEX_EXTENSION) || null,
  setKryptexExtension: (state) => localStorage.set(STORAGE_KEYS.KRYPTEX_EXTENSION, state),

  // RollerCoin is manual — there's no public API, so the user types their
  // current TRX balance in periodically. We track:
  //   { baseline_trx, project_name, enabled, last_updated_at }
  // Every time the user enters a new balance we compute delta and (on
  // confirm) add an earning transaction for the positive delta × live TRX
  // price. Negative deltas (withdrawals/swaps) silently lower the baseline.
  getRollerCoinConfig: () => localStorage.get(STORAGE_KEYS.ROLLERCOIN_CONFIG) || null,
  setRollerCoinConfig: (config) => localStorage.set(STORAGE_KEYS.ROLLERCOIN_CONFIG, config),

  // Acurast Phone Farm — manual, ACU-token denominated. Mirrors the
  // RollerCoin/TRX flow exactly (baseline + delta + earning/withdrawal
  // classification) but with the Acurast (ACU) CoinGecko price feed.
  //   { baseline_acu, project_name, enabled, last_updated_at }
  // Earnings post to a "Phone Farm" investment project by default.
  getAcurastConfig: () => localStorage.get(STORAGE_KEYS.ACURAST_CONFIG) || null,
  setAcurastConfig: (config) => localStorage.set(STORAGE_KEYS.ACURAST_CONFIG, config),

  // Unity Network — manual, USD-denominated. Like Acurast but skips the
  // token-price hop because Unity Network surfaces a single USD figure
  // directly. Earnings post to the same "Phone Farm" investment project
  // as Acurast for a consolidated phone-farm P&L line.
  //   { baseline_usd, project_name, enabled, last_updated_at }
  getUnityNetworkConfig: () => localStorage.get(STORAGE_KEYS.UNITY_NETWORK_CONFIG) || null,
  setUnityNetworkConfig: (config) => localStorage.set(STORAGE_KEYS.UNITY_NETWORK_CONFIG, config),

  // Unity Nodes Chrome-extension auto-sync state. Tracks what the extension
  // most recently pushed so we can render it on the card and stay idempotent
  // when polling the backend inbox.
  //   {
  //     last_applied_synced_at,        // extension's synced_at we last applied
  //     last_applied_received_at,      // server received_at when we applied
  //     last_applied_lifetime_usd,     // baseline at apply time
  //     last_today_date,               // YYYY-MM-DD of the latest reading
  //     last_today_usd,                // payload.total_usd (today's earnings)
  //     last_balance_usd,              // payload.balance_usd snapshot
  //     last_lifetime_usd,             // payload.lifetime_usd snapshot
  //     last_device_count,
  //     last_email,
  //     last_seen_at,                  // when frontend last successfully fetched
  //     auto_sync_enabled,             // user toggle on the card (default true)
  //   }
  getUnityNetworkExtension: () => localStorage.get(STORAGE_KEYS.UNITY_NETWORK_EXTENSION) || null,
  setUnityNetworkExtension: (state) => localStorage.set(STORAGE_KEYS.UNITY_NETWORK_EXTENSION, state),

  // GoMining (Integrations card) — separate from the GoMining tab's per-row
  // reward sync. Tracks the user's account-level GMT + BTC balances with a
  // boost-spend pathway that records GMT decreases as additional invested
  // capital (not withdrawals).
  //   { baseline_gmt, baseline_btc, project_name, enabled, last_updated_at }
  // Posts to a "GoMining" investment project by default.
  getGoMiningTokenConfig: () => localStorage.get(STORAGE_KEYS.GOMINING_TOKEN_CONFIG) || null,
  setGoMiningTokenConfig: (config) => localStorage.set(STORAGE_KEYS.GOMINING_TOKEN_CONFIG, config),

  // Cached ACU price from CoinGecko — used as fallback when rate-limited.
  //   { price, fetched_at }
  getAcuPriceCache: () => localStorage.get(STORAGE_KEYS.ACU_PRICE_CACHE) || null,
  setAcuPriceCache: (cache) => localStorage.set(STORAGE_KEYS.ACU_PRICE_CACHE, cache),

  // Cached GoMining prices (GMT + BTC) — used as fallback when rate-limited.
  //   { gmt, btc, fetched_at }
  getGoMiningPriceCache: () => localStorage.get(STORAGE_KEYS.GOMINING_PRICE_CACHE) || null,
  setGoMiningPriceCache: (cache) => localStorage.set(STORAGE_KEYS.GOMINING_PRICE_CACHE, cache),

  // Cached TRX price — used as fallback when rate-limited.
  //   { price, fetched_at }
  getTrxPriceCache: () => localStorage.get(STORAGE_KEYS.TRX_PRICE_CACHE) || null,
  setTrxPriceCache: (cache) => localStorage.set(STORAGE_KEYS.TRX_PRICE_CACHE, cache),

  // Custom integrations list
  getCustomIntegrations: () => localStorage.get(STORAGE_KEYS.CUSTOM_INTEGRATIONS) || [],
  setCustomIntegrations: (list) => localStorage.set(STORAGE_KEYS.CUSTOM_INTEGRATIONS, list),

};