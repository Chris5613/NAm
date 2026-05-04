import { coinGeckoApi, finnhubApi, ebayApi, jupiterApi, coinStatsApi, solanaApi, bitcoinApi } from "./external-apis";
import { localStorage as storage } from "./localStorage";

const createId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
};

const normalizeId = (item) => {
  const id = item.id || item._id || createId();
  return { ...item, id, _id: id };
};

const normalizeItems = (items = []) => items.map((item) => normalizeId(item));
const toResponse = (data) => ({ data });

export const assetsApi = {
  getAll: async () => toResponse(normalizeItems(storage.getAssets())),
  create: async (data) => {
    const asset = normalizeId({ ...data });
    const all = normalizeItems(storage.getAssets());
    storage.setAssets([...all, asset]);
    return toResponse(asset);
  },
  update: async (id, data) => {
    const all = normalizeItems(storage.getAssets());
    const updated = all.map((item) => (item.id === id ? normalizeId({ ...item, ...data }) : item));
    storage.setAssets(updated);
    return toResponse(updated.find((item) => item.id === id) || null);
  },
  delete: async (id) => {
    const all = normalizeItems(storage.getAssets());
    const remaining = all.filter((item) => item.id !== id);
    storage.setAssets(remaining);
    return toResponse({ id });
  },
};

export const cryptoCacheApi = {
  get: async () => toResponse(storage.getCryptoCache()),
  set: async (payload) => {
    const body = typeof payload === "number" ? { total: payload } : payload;
    const current = storage.getCryptoCache();
    const next = { ...current, ...body, updated_at: new Date().toISOString() };
    storage.setCryptoCache(next);
    return toResponse(next);
  },
};

export const phonesApi = {
  list: async () => {
    const phones = normalizeItems(storage.getPhones());
    const totalValue = phones.reduce((sum, phone) => sum + (phone.market_value || 0), 0);
    return toResponse({ phones, total_value: totalValue, count: phones.length });
  },
  create: async (data) => {
    const phone = normalizeId({ ...data });
    const all = normalizeItems(storage.getPhones());
    storage.setPhones([...all, phone]);
    return toResponse(phone);
  },
  update: async (id, data) => {
    const all = normalizeItems(storage.getPhones());
    const updated = all.map((item) => (item.id === id ? normalizeId({ ...item, ...data }) : item));
    storage.setPhones(updated);
    return toResponse(updated.find((item) => item.id === id) || null);
  },
  delete: async (id) => {
    const all = normalizeItems(storage.getPhones());
    const remaining = all.filter((item) => item.id !== id);
    storage.setPhones(remaining);
    return toResponse({ id });
  },
  tags: async () => {
    const phones = normalizeItems(storage.getPhones());
    const seen = new Set();
    const tags = [];
    phones.forEach((phone) => {
      (phone.tags || []).forEach((tag) => {
        const normalizedTag = tag.trim();
        if (!normalizedTag) return;
        const lower = normalizedTag.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          tags.push(normalizedTag);
        }
      });
    });
    return toResponse(tags.sort((a, b) => a.localeCompare(b)));
  },
  refreshPrice: async (id) => {
    const all = normalizeItems(storage.getPhones());
    const phone = all.find((item) => item.id === id);
    if (!phone) throw new Error("Phone not found");
    const price = await ebayApi.getAveragePrice(phone.model);
    const updated = all.map((item) => (item.id === id ? normalizeId({ ...item, market_value: price, market_value_source: 'ebay' }) : item));
    storage.setPhones(updated);
    return toResponse(updated.find((item) => item.id === id));
  },
  refreshAllPrices: async () => {
    const all = normalizeItems(storage.getPhones());
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    const refreshed = await Promise.all(all.map(async (phone) => {
      if (phone.market_value_source === 'manual' && phone.market_value > 0) {
        skipped += 1;
        return phone;
      }
      try {
        const price = await ebayApi.getAveragePrice(phone.model);
        updated += 1;
        return normalizeId({ ...phone, market_value: price, market_value_source: 'ebay' });
      } catch (err) {
        failed += 1;
        return phone;
      }
    }));
    storage.setPhones(refreshed);
    return toResponse({ updated, failed, skipped, total: all.length });
  },
};

export const pricesApi = {
  getCryptoPrice: (coinId) => coinGeckoApi.getPrice(coinId),
  getCryptoInfo: (coinId) => coinGeckoApi.getInfo(coinId),
  searchCrypto: (query) => coinGeckoApi.search(query),
  getStock: (symbol) => finnhubApi.getQuote(symbol),
  searchStock: (query) => finnhubApi.search(query),
  refreshAll: async () => {
    const assets = normalizeItems(storage.getAssets());
    const cryptoAssets = assets.filter((a) => a.category === 'crypto' && a.symbol);
    const stockAssets = assets.filter((a) => a.category === 'stocks' && a.symbol);

    let updatedCount = 0;
    const nextAssets = [...assets];

    if (cryptoAssets.length > 0) {
      const coinIds = cryptoAssets.map((a) => a.symbol.toLowerCase());
      try {
        const prices = await coinGeckoApi.getPrice(coinIds.join(','));
        nextAssets.forEach((asset) => {
          if (asset.category === 'crypto' && asset.symbol) {
            const price = prices[asset.symbol.toLowerCase()] || 0;
            if (price > 0) {
              asset.current_price = price;
              updatedCount += 1;
            }
          }
        });
      } catch (error) {
        console.warn('Failed to refresh crypto prices:', error);
      }
    }

    for (const asset of stockAssets) {
      try {
        const quote = await finnhubApi.getQuote(asset.symbol);
        const price = quote.c || 0;
        if (price > 0) {
          const existing = nextAssets.find((item) => item.id === asset.id);
          if (existing) {
            existing.current_price = price;
            updatedCount += 1;
          }
        }
      } catch (error) {
        console.warn(`Failed to refresh price for ${asset.symbol}:`, error);
      }
    }

    storage.setAssets(normalizeItems(nextAssets));
    return { updatedCount, totalAssets: assets.length };
  },
};

export const projectsApi = {
  getAll: async () => toResponse(normalizeItems(storage.getProjects())),
  create: async (data) => {
    const project = normalizeId({ ...data, transactions: [] });
    const all = normalizeItems(storage.getProjects());
    storage.setProjects([...all, project]);
    return toResponse(project);
  },
  update: async (id, data) => {
    const all = normalizeItems(storage.getProjects());
    const updated = all.map((item) => (item.id === id ? normalizeId({ ...item, ...data }) : item));
    storage.setProjects(updated);
    return toResponse(updated.find((item) => item.id === id) || null);
  },
  delete: async (id) => {
    const all = normalizeItems(storage.getProjects());
    const remaining = all.filter((item) => item.id !== id);
    storage.setProjects(remaining);
    return toResponse({ id });
  },
  getTransactions: async (id) => {
    const project = normalizeItems(storage.getProjects()).find((item) => item.id === id);
    return toResponse(project?.transactions || []);
  },
  addTransaction: async (id, data) => {
    const all = normalizeItems(storage.getProjects());
    const next = all.map((project) => {
      if (project.id !== id) return project;
      const transaction = normalizeId({ ...data });
      return { ...project, transactions: [...(project.transactions || []), transaction] };
    });
    storage.setProjects(next);
    return toResponse(next.find((item) => item.id === id)?.transactions || []);
  },
  deleteTransaction: async (txnId) => {
    const all = normalizeItems(storage.getProjects());
    const next = all.map((project) => ({
      ...project,
      transactions: (project.transactions || []).filter((txn) => txn.id !== txnId),
    }));
    storage.setProjects(next);
    return toResponse({ id: txnId });
  },
};

export const walletsApi = {
  getAll: async () => toResponse(normalizeItems(storage.getWallets())),
  add: async (data) => {
    const wallet = normalizeId({ ...data });
    const all = normalizeItems(storage.getWallets());
    storage.setWallets([...all, wallet]);
    return toResponse(wallet);
  },
  addBulk: async (items) => {
    const all = normalizeItems(storage.getWallets());
    const created = items.map((data) => normalizeId({ ...data }));
    storage.setWallets([...all, ...created]);
    return toResponse(created);
  },
  delete: async (id) => {
    const all = normalizeItems(storage.getWallets());
    const remaining = all.filter((item) => item.id !== id);
    storage.setWallets(remaining);
    return toResponse({ id });
  },
  getBalances: async (id) => {
    const wallet = normalizeItems(storage.getWallets()).find((item) => item.id === id);
    if (!wallet) throw new Error('Wallet not found');
    try {
      if (wallet.chain === 'bitcoin') {
        const satoshis = await bitcoinApi.getBalance(wallet.address);
        const btcAmount = satoshis / 1e8;
        const btcPrice = await coinGeckoApi.getPrice('bitcoin');
        return toResponse({
          total_usd: btcAmount * btcPrice,
          tokens: [{
            id: wallet.address,
            symbol: 'BTC',
            name: 'Bitcoin',
            amount: btcAmount,
            price: btcPrice,
            usd_value: btcAmount * btcPrice,
            icon_url: '',
            chain: 'bitcoin',
          }],
        });
      }

      const data = await coinStatsApi.getWalletBalance(wallet.address, wallet.chain);
      const tokenList = Array.isArray(data.tokens) ? data.tokens : Array.isArray(data.coins) ? data.coins : [];
      const tokens = tokenList.map((t) => {
        const amount = Number(t.amount ?? t.balance ?? t.quantity ?? 0);
        const price = Number(t.price ?? t.current_price ?? 0);
        const usdValue = Number(t.usd_value ?? t.value ?? (amount * price));
        return {
          id: t.id || `${t.symbol || t.name}_${wallet.address}`,
          symbol: t.symbol || t.name || wallet.chain,
          name: t.name || t.symbol || wallet.chain,
          amount,
          price,
          usd_value: usdValue,
          icon_url: t.icon || t.image || t.logo || '',
          chain: wallet.chain,
        };
      });
      const totalUsd = Number(data.total ?? data.total_value ?? data.value ?? tokens.reduce((sum, t) => sum + (t.usd_value || 0), 0));
      return toResponse({ total_usd: totalUsd, tokens });
    } catch (error) {
      console.warn(`Balance fetch failed for ${wallet.address}:`, error);
      return toResponse({ total_usd: 0, tokens: [] });
    }
  },
  getDefiPositions: async (address) => {
    try {
      const data = await jupiterApi.getPortfolio(address);
      return toResponse(data);
    } catch (error) {
      console.warn(`DeFi fetch failed for ${address}:`, error);
      return toResponse([]);
    }
  },
  getCoinStatsBalance: async (address, chain = 'solana') => {
    try {
      const data = await coinStatsApi.getWalletBalance(address, chain);
      return toResponse(data);
    } catch (error) {
      console.warn(`CoinStats fetch failed for ${address}:`, error);
      return toResponse({});
    }
  },
};

export const tokenPrefsApi = {
  getAll: async () => toResponse(Object.values(storage.getPrefs())),
  update: async (symbol, data) => {
    const prefs = { ...storage.getPrefs() };
    prefs[symbol] = { ...prefs[symbol], symbol, ...data };
    storage.setPrefs(prefs);
    return toResponse(prefs[symbol]);
  },
};

export const customTokensApi = {
  getAll: async () => toResponse(normalizeItems(storage.getTokens())),
  create: async (data) => {
    const token = normalizeId({ ...data });
    const all = normalizeItems(storage.getTokens());
    storage.setTokens([...all, token]);
    return toResponse(token);
  },
  update: async (id, data) => {
    const all = normalizeItems(storage.getTokens());
    const updated = all.map((item) => (item.id === id ? normalizeId({ ...item, ...data }) : item));
    storage.setTokens(updated);
    return toResponse(updated.find((item) => item.id === id) || null);
  },
  delete: async (id) => {
    const all = normalizeItems(storage.getTokens());
    const remaining = all.filter((item) => item.id !== id);
    storage.setTokens(remaining);
    return toResponse({ id });
  },
  getPrice: (symbol) => coinGeckoApi.getPrice(symbol),
};

export const netWorthApi = {
  getCurrent: async () => {
    const [assets, phones, cryptoCache] = await Promise.all([
      assetsApi.getAll().then((res) => res.data),
      phonesApi.list().then((res) => res.data.phones || []),
      cryptoCacheApi.get().then((res) => res.data),
    ]);

    const breakdown = {
      stocks: 0,
      crypto: cryptoCache.total || 0,
      cash: 0,
      debts: 0,
      phones: phones.reduce((sum, p) => sum + (p.market_value || 0), 0),
    };

    assets.forEach((asset) => {
      const value = (asset.quantity || 0) * (asset.current_price || 0);
      if (asset.category === 'stocks') breakdown.stocks += value;
      else if (asset.category === 'crypto') breakdown.crypto += value;
      else if (asset.category === 'cash') breakdown.cash += value;
      else if (asset.category === 'debts') breakdown.debts += value;
    });

    const totalNetWorth = breakdown.stocks + breakdown.crypto + breakdown.cash + breakdown.phones - breakdown.debts;
    return toResponse({ total_net_worth: totalNetWorth, breakdown, last_updated: new Date().toISOString() });
  },
  getHistory: async () => toResponse(storage.getHistory()),
  saveSnapshot: async () => {
    const current = await netWorthApi.getCurrent();
    const snapshot = {
      total_net_worth: current.data.total_net_worth,
      stocks_value: current.data.breakdown.stocks,
      crypto_value: current.data.breakdown.crypto,
      cash_value: current.data.breakdown.cash,
      crypto_projects_value: 0,
      debts_value: current.data.breakdown.debts,
      timestamp: new Date().toISOString(),
    };
    const history = storage.getHistory();
    const nextHistory = [...history, snapshot];
    storage.setHistory(nextHistory);
    return toResponse(snapshot);
  },
};

export const nosTrackingApi = {
  getStatus: async () => toResponse({ enabled: false }),
  configure: async (wallet_address, project_name) => toResponse({ configured: true, wallet_address, project_name }),
};
