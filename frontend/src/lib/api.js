import {
  coinGeckoApi,
  finnhubApi,
  ebayApi,
  coinStatsApi,
  coinStatsPortfolioApi,
  bitcoinApi,
} from "./external-apis";
import { localStorage as storage } from "./localStorage";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const updated = all.map((item) =>
      item.id === id ? normalizeId({ ...item, ...data }) : item
    );
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
    const updated = all.map((item) =>
      item.id === id ? normalizeId({ ...item, ...data }) : item
    );
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

    const updated = all.map((item) =>
      item.id === id
        ? normalizeId({
            ...item,
            market_value: price,
            market_value_source: "ebay",
          })
        : item
    );

    storage.setPhones(updated);
    return toResponse(updated.find((item) => item.id === id));
  },

  refreshAllPrices: async () => {
    const all = normalizeItems(storage.getPhones());

    let updated = 0;
    let failed = 0;
    let skipped = 0;
    const refreshed = [];

    for (const phone of all) {
      if (phone.market_value_source === "manual" && phone.market_value > 0) {
        skipped += 1;
        refreshed.push(phone);
        continue;
      }

      try {
        const price = await ebayApi.getAveragePrice(phone.model);

        if (price > 0) {
          updated += 1;
          refreshed.push(
            normalizeId({
              ...phone,
              market_value: price,
              market_value_source: "ebay",
            })
          );
        } else {
          failed += 1;
          refreshed.push(phone);
        }
      } catch {
        failed += 1;
        refreshed.push(phone);
      }

      await new Promise((r) => setTimeout(r, 350));
    }

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
    const cryptoAssets = assets.filter((a) => a.category === "crypto" && a.symbol);
    const stockAssets = assets.filter((a) => a.category === "stocks" && a.symbol);

    let updatedCount = 0;
    const nextAssets = [...assets];

    if (cryptoAssets.length > 0) {
      const coinIds = cryptoAssets.map((a) => a.symbol.toLowerCase());

      try {
        const prices = await coinGeckoApi.getPrice(coinIds.join(","));

        nextAssets.forEach((asset) => {
          if (asset.category === "crypto" && asset.symbol) {
            const price = prices[asset.symbol.toLowerCase()] || 0;

            if (price > 0) {
              asset.current_price = price;
              updatedCount += 1;
            }
          }
        });
      } catch (error) {
        console.warn("Failed to refresh crypto prices:", error);
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
    const updated = all.map((item) =>
      item.id === id ? normalizeId({ ...item, ...data }) : item
    );
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
      return {
        ...project,
        transactions: [...(project.transactions || []), transaction],
      };
    });

    storage.setProjects(next);
    return toResponse(next.find((item) => item.id === id)?.transactions || []);
  },

  addToCategory: async (id, categoryName, deltaEarned) => {
    const all = normalizeItems(storage.getProjects());

    const next = all.map((project) => {
      if (project.id !== id) return project;

      const categories = [...(project.categories || [])];

      const idx = categories.findIndex(
        (c) => (c.name || "").toLowerCase() === (categoryName || "").toLowerCase()
      );

      if (idx >= 0) {
        categories[idx] = {
          ...categories[idx],
          earned: (Number(categories[idx].earned) || 0) + deltaEarned,
        };
      } else {
        categories.push({ name: categoryName, earned: deltaEarned });
      }

      return { ...project, categories };
    });

    storage.setProjects(next);
    return toResponse(next.find((item) => item.id === id) || null);
  },

  updateTransaction: async (txnId, data) => {
    const all = normalizeItems(storage.getProjects());

    let updated = null;
    let prev = null;
    let parentId = null;

    const next = all.map((project) => {
      const txns = project.transactions || [];
      const hit = txns.find((t) => t.id === txnId);

      if (!hit) return project;

      parentId = project.id;
      prev = { ...hit };
      updated = normalizeId({ ...hit, ...data });

      return {
        ...project,
        transactions: txns.map((t) => (t.id === txnId ? updated : t)),
      };
    });

    if (!updated) return toResponse(null);

    storage.setProjects(next);

    if (prev?.source === "gomining" && prev?.source_row_id) {
      const snap = storage.getGoMiningSynced();
      const cur = Number(snap[prev.source_row_id]) || 0;
      const diff = (Number(updated.amount) || 0) - (Number(prev.amount) || 0);
      snap[prev.source_row_id] = Math.max(0, cur + diff);
      storage.setGoMiningSynced(snap);
    }

    if (prev?.source === "nosana" && prev?.source_date) {
      const snap = storage.getNosanaSyncedDates();
      const cur = snap[prev.source_date] || {};

      snap[prev.source_date] = {
        ...cur,
        amount: Number(updated.amount) || 0,
        txn_id: cur.txn_id || updated.id,
      };

      storage.setNosanaSyncedDates(snap);
    }

    if (
      (
        prev?.source === "gomining" ||
        prev?.source === "nosana" ||
        prev?.source === "rollercoin" ||
        prev?.source === "acurast" ||
        prev?.source === "unity_network" ||
        prev?.source === "gomining_gmt" ||
        prev?.source === "gomining_btc"
      ) &&
      parentId
    ) {
      const projects = storage.getProjects();

      const adjusted = projects.map((p) => {
        if (p.id !== parentId) return p;

        const oldEarn = prev.type === "earning" ? Number(prev.amount) || 0 : 0;
        const newEarn = updated.type === "earning" ? Number(updated.amount) || 0 : 0;
        const oldInv = prev.type === "investment" ? Number(prev.amount) || 0 : 0;
        const newInv = updated.type === "investment" ? Number(updated.amount) || 0 : 0;

        return {
          ...p,
          earned: Math.max(0, (Number(p.earned) || 0) + (newEarn - oldEarn)),
          invested: Math.max(0, (Number(p.invested) || 0) + (newInv - oldInv)),
        };
      });

      storage.setProjects(adjusted);
    }

    return toResponse(updated);
  },

  deleteTransaction: async (txnId) => {
    const all = normalizeItems(storage.getProjects());

    let removed = null;
    let parentId = null;

    const next = all.map((project) => {
      const txns = project.transactions || [];
      const hit = txns.find((t) => t.id === txnId);

      if (hit) {
        removed = { ...hit };
        parentId = project.id;
      }

      return {
        ...project,
        transactions: txns.filter((txn) => txn.id !== txnId),
      };
    });

    storage.setProjects(next);

    if (removed?.source === "gomining" && removed?.source_row_id) {
      const snap = storage.getGoMiningSynced();
      const cur = Number(snap[removed.source_row_id]) || 0;
      snap[removed.source_row_id] = Math.max(0, cur - (Number(removed.amount) || 0));
      storage.setGoMiningSynced(snap);
    }

    if (removed?.source === "nosana" && removed?.source_date) {
      const snap = storage.getNosanaSyncedDates();

      if (snap[removed.source_date]) {
        delete snap[removed.source_date];
        storage.setNosanaSyncedDates(snap);
      }
    }

    if (removed?.source === "rollercoin") {
      const rc = storage.getRollerCoinConfig();

      if (rc?.baseline_trx != null) {
        const dec = Number(removed.source_trx_delta) || 0;
        const nextBaseline = Math.max(0, (Number(rc.baseline_trx) || 0) - dec);
        storage.setRollerCoinConfig({ ...rc, baseline_trx: nextBaseline });
      }
    }

    if (removed?.source === "acurast") {
      const ac = storage.getAcurastConfig();

      if (ac?.baseline_acu != null) {
        const dec = Number(removed.source_acu_delta) || 0;
        const nextBaseline = Math.max(0, (Number(ac.baseline_acu) || 0) - dec);
        storage.setAcurastConfig({ ...ac, baseline_acu: nextBaseline });
      }
    }

    if (removed?.source === "unity_network") {
      const un = storage.getUnityNetworkConfig();

      if (un?.baseline_usd != null) {
        const dec = Number(removed.source_usd_delta) || 0;
        const nextBaseline = Math.max(0, (Number(un.baseline_usd) || 0) - dec);
        storage.setUnityNetworkConfig({ ...un, baseline_usd: nextBaseline });
      }
    }

    if (removed?.source === "gomining_gmt") {
      const gm = storage.getGoMiningTokenConfig();

      if (gm?.baseline_gmt != null) {
        const dec = Number(removed.source_gmt_delta) || 0;
        const nextBaseline = Math.max(0, (Number(gm.baseline_gmt) || 0) - dec);
        storage.setGoMiningTokenConfig({ ...gm, baseline_gmt: nextBaseline });
      }
    }

    if (removed?.source === "gomining_btc") {
      const gm = storage.getGoMiningTokenConfig();

      if (gm?.baseline_btc != null) {
        const dec = Number(removed.source_btc_delta) || 0;
        const nextBaseline = Math.max(0, (Number(gm.baseline_btc) || 0) - dec);
        storage.setGoMiningTokenConfig({ ...gm, baseline_btc: nextBaseline });
      }
    }

    if (
      (
        removed?.source === "gomining" ||
        removed?.source === "nosana" ||
        removed?.source === "rollercoin" ||
        removed?.source === "acurast" ||
        removed?.source === "unity_network" ||
        removed?.source === "gomining_gmt" ||
        removed?.source === "gomining_btc"
      ) &&
      removed?.type === "earning" &&
      parentId
    ) {
      const projects = storage.getProjects();

      const adjusted = projects.map((p) => {
        if (p.id !== parentId) return p;

        return {
          ...p,
          earned: Math.max(0, (Number(p.earned) || 0) - (Number(removed.amount) || 0)),
        };
      });

      storage.setProjects(adjusted);
    }

    if (
      (removed?.source === "gomining_gmt" || removed?.source === "gomining_btc") &&
      removed?.type === "investment" &&
      parentId
    ) {
      const projects = storage.getProjects();

      const adjusted = projects.map((p) => {
        if (p.id !== parentId) return p;

        return {
          ...p,
          invested: Math.max(0, (Number(p.invested) || 0) - (Number(removed.amount) || 0)),
        };
      });

      storage.setProjects(adjusted);
    }

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
    if (!wallet) throw new Error("Wallet not found");

    try {
      if (wallet.chain === "bitcoin") {
        const satoshis = await bitcoinApi.getBalance(wallet.address);
        const btcAmount = satoshis / 1e8;
        const btcPrice = await coinGeckoApi.getPrice("bitcoin");

        return toResponse({
          total_usd: btcAmount * btcPrice,
          tokens: [
            {
              id: wallet.address,
              symbol: "BTC",
              name: "Bitcoin",
              amount: btcAmount,
              price: btcPrice,
              usd_value: btcAmount * btcPrice,
              icon_url: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
              chain: "bitcoin",
              category: "wallet",
              protocol: null,
            },
          ],
        });
      }


      const tokenList = await coinStatsApi.getWalletBalance(wallet.address, wallet.chain);

      const tokens = (Array.isArray(tokenList) ? tokenList : []).map((t) => {
        const amount = Number(t.amount ?? t.balance ?? t.quantity ?? 0);
        const price = Number(t.price ?? t.current_price ?? 0);
        const usdValue = Number(t.usd_value ?? t.value ?? amount * price);

        return {
          id: t.id || t.coinId || `${t.symbol || t.name}_${wallet.address}`,
          symbol: t.symbol || t.name || wallet.chain,
          name: t.name || t.symbol || wallet.chain,
          amount,
          price,
          usd_value: usdValue,
          icon_url: t.imgUrl || t.icon || t.image || t.logo || "",
          chain: wallet.chain,
          category: "wallet",
          protocol: null,
        };
      });

      const totalUsd = tokens.reduce((sum, t) => sum + (t.usd_value || 0), 0);

      return toResponse({
        total_usd: totalUsd,
        tokens,
      });
    } catch (error) {
      console.warn(`Balance fetch failed for ${wallet.address}:`, error);
      return toResponse({ total_usd: 0, tokens: [] });
    }
  },

  getDefiPositions: async () => {
  try {
    const data = await coinStatsPortfolioApi.getDefiPortfolio();
    return toResponse(data);
  } catch (error) {
    console.warn("CoinStats DeFi fetch failed:", error);
    return toResponse({ positions: [] });
  }
},

  getCoinStatsBalance: async (address, chain = "solana") => {
    try {
      const data = await coinStatsApi.getWalletBalance(address, chain);
      return toResponse(data);
    } catch (error) {
      console.warn(`CoinStats fetch failed for ${address}:`, error);
      return toResponse([]);
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
    const updated = all.map((item) =>
      item.id === id ? normalizeId({ ...item, ...data }) : item
    );
    storage.setTokens(updated);
    return toResponse(updated.find((item) => item.id === id) || null);
  },

  delete: async (id) => {
    const all = normalizeItems(storage.getTokens());
    const remaining = all.filter((item) => item.id !== id);
    storage.setTokens(remaining);
    return toResponse({ id });
  },

  resolveAndPrice: async (symbol) => {
    const resolved = await coinGeckoApi.resolveSymbol(symbol);
    if (!resolved) return { price: 0, resolved: null };

    const price = await coinGeckoApi.getPrice(resolved.id);
    return { price: Number(price) || 0, resolved };
  },

  refreshAllPrices: async () => {
    const all = normalizeItems(storage.getTokens());

    if (all.length === 0) {
      return toResponse({ updated: 0, total: 0 });
    }

    let updated = 0;
    const next = [];

    for (const t of all) {
      try {
        let coinId = t.coingecko_id;
        let icon = t.icon_url;
        let name = t.name;

        if (!coinId) {
          const r = await coinGeckoApi.resolveSymbol(t.symbol);

          if (r?.id) {
            coinId = r.id;
            if (!icon) icon = r.thumb || icon;
            if (!name) name = r.name || name;
          }
        }

        if (!coinId) {
          next.push(t);
          continue;
        }

        const price = await coinGeckoApi.getPrice(coinId);

        if (price > 0) {
          updated += 1;
          next.push(
            normalizeId({
              ...t,
              price,
              coingecko_id: coinId,
              icon_url: icon,
              name: name || t.name,
            })
          );
        } else {
          next.push(normalizeId({ ...t, coingecko_id: coinId }));
        }
      } catch {
        next.push(t);
      }

      await new Promise((r) => setTimeout(r, 250));
    }

    storage.setTokens(next);
    return toResponse({ updated, total: all.length });
  },

  getPrice: async (symbol) => {
    const { price } = await customTokensApi.resolveAndPrice(symbol);
    return price;
  },
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
      other: 0,
      phones: phones.reduce((sum, p) => sum + (p.market_value || 0), 0),
    };

    assets.forEach((asset) => {
      const value = (asset.quantity || 0) * (asset.current_price || 0);

      if (asset.category === "stocks") breakdown.stocks += value;
      else if (asset.category === "crypto") breakdown.crypto += value;
      else if (asset.category === "cash") breakdown.cash += value;
      else if (asset.category === "debts") breakdown.debts += value;
      else if (asset.category === "other") breakdown.other += value;
    });

    const totalNetWorth =
      breakdown.stocks +
      breakdown.crypto +
      breakdown.cash +
      breakdown.other +
      breakdown.phones -
      breakdown.debts;

    return toResponse({
      total_net_worth: totalNetWorth,
      breakdown,
      last_updated: new Date().toISOString(),
    });
  },

  getHistory: async () => toResponse(storage.getHistory()),

  saveSnapshot: async (source = "manual") => {
    const current = await netWorthApi.getCurrent();

    const snapshot = {
      total_net_worth: current.data.total_net_worth,
      stocks_value: current.data.breakdown.stocks,
      crypto_value: current.data.breakdown.crypto,
      cash_value: current.data.breakdown.cash,
      other_value: current.data.breakdown.other || 0,
      crypto_projects_value: 0,
      debts_value: current.data.breakdown.debts,
      timestamp: new Date().toISOString(),
      source,
    };

    const history = storage.getHistory();
    const nextHistory = [...history, snapshot];
    storage.setHistory(nextHistory);

    return toResponse(snapshot);
  },
};

export const walletSyncApi = {
  refreshAll: async () => {
    const wallets = normalizeItems(storage.getWallets());

    if (wallets.length === 0) {
      return toResponse({ total: 0, chains: [], tokens: [] });
    }

    const customTokens = normalizeItems(storage.getTokens());
    const tokenPrefs = storage.getPrefs();

    const hidden = new Set(
      Object.entries(tokenPrefs)
        .filter(([, p]) => p?.hidden)
        .map(([s]) => s)
    );

    // Sequential to keep us under API rate limits.
    const balances = {};

for (const w of wallets) {
  try {
    const res = await walletsApi.getBalances(w.id);
    balances[w.id] = res.data;

    // CoinStats rate limit protection
    await sleep(2000);
  } catch {
    // silent
  }
}

    const chainBreakdown = {};
    const tokensByChain = {};

    wallets.forEach((w) => {
      (balances[w.id]?.tokens || []).forEach((t) => {
        if (hidden.has(t.symbol)) return;
        if ((t.usd_value || 0) < 0.01) return;

        chainBreakdown[w.chain] = (chainBreakdown[w.chain] || 0) + t.usd_value;

        if (!tokensByChain[w.chain]) {
          tokensByChain[w.chain] = [];
        }

        tokensByChain[w.chain].push({
          symbol: t.symbol,
          name: t.name,
          icon_url: tokenPrefs[t.symbol]?.custom_icon_url || t.icon_url || "",
          amount: t.amount,
          price: t.price,
          usd_value: t.usd_value,
        });
      });
    });

    customTokens.forEach((ct) => {
      if (hidden.has(ct.symbol)) return;

      const v = (ct.amount || 0) * (ct.price || 0);
      if (v < 0.01) return;

      const c = ct.chain || "custom";
      chainBreakdown[c] = (chainBreakdown[c] || 0) + v;

      if (!tokensByChain[c]) {
        tokensByChain[c] = [];
      }

      tokensByChain[c].push({
        symbol: ct.symbol,
        name: ct.name,
        icon_url: ct.icon_url || "",
        amount: ct.amount,
        price: ct.price,
        usd_value: v,
      });
    });

    const total = Object.values(chainBreakdown).reduce((s, v) => s + v, 0);

    const chains = Object.entries(chainBreakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([chain, value]) => ({
        chain,
        value,
        tokens: (tokensByChain[chain] || []).sort((a, b) => b.usd_value - a.usd_value),
      }));

    const cache = {
      total,
      chains,
      tokens: chains.flatMap((c) => c.tokens),
      updated_at: new Date().toISOString(),
    };

    storage.setCryptoCache(cache);
    return toResponse(cache);
  },
};

export const nosTrackingApi = {
  getStatus: async () => toResponse({ enabled: false }),

  configure: async (wallet_address, project_name) =>
    toResponse({ configured: true, wallet_address, project_name }),
};