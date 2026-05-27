import { coinGeckoApi, finnhubApi, moralisDefiApi, jupiterPriceApi, solanaApi, bitcoinApi } from "./external-apis";
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

  // Update (or create) a sub-category's earned amount for a project.
  // Called by integrations after posting a transaction so the breakdown
  // auto-populates without manual user input.
  addToCategory: async (id, categoryName, deltaEarned) => {
    const all = normalizeItems(storage.getProjects());
    const next = all.map((project) => {
      if (project.id !== id) return project;
      const categories = [...(project.categories || [])];
      const idx = categories.findIndex(
        (c) => (c.name || "").toLowerCase() === (categoryName || "").toLowerCase(),
      );
      if (idx >= 0) {
        categories[idx] = { ...categories[idx], earned: (Number(categories[idx].earned) || 0) + deltaEarned };
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
      return { ...project, transactions: txns.map((t) => (t.id === txnId ? updated : t)) };
    });
    if (!updated) return toResponse(null);
    storage.setProjects(next);
    // If this is a GoMining auto-synced txn, keep the synced snapshot honest:
    // adjust the row's last-synced reward by (newAmount - oldAmount).
    if (prev?.source === 'gomining' && prev?.source_row_id) {
      const snap = storage.getGoMiningSynced();
      const cur = Number(snap[prev.source_row_id]) || 0;
      const diff = (Number(updated.amount) || 0) - (Number(prev.amount) || 0);
      snap[prev.source_row_id] = Math.max(0, cur + diff);
      storage.setGoMiningSynced(snap);
    }
    // Mirror the same accounting for Nosana auto-synced txns — the
    // synced-dates map needs to track the new amount so the next auto-sync
    // doesn't re-apply a phantom delta.
    if (prev?.source === 'nosana' && prev?.source_date) {
      const snap = storage.getNosanaSyncedDates();
      const cur = snap[prev.source_date] || {};
      snap[prev.source_date] = {
        ...cur,
        amount: Number(updated.amount) || 0,
        txn_id: cur.txn_id || updated.id,
      };
      storage.setNosanaSyncedDates(snap);
    }
    // Keep project.earned in sync only for GoMining auto-synced txns
    // (manual transactions don't bump earned on insert, so we shouldn't on update either).
    // For the GoMining Integrations card, also handle type='investment'
    // (boost spend) so editing a boost amount keeps project.invested honest.
    if ((prev?.source === 'gomining' || prev?.source === 'nosana' || prev?.source === 'rollercoin' || prev?.source === 'acurast' || prev?.source === 'unity_network' || prev?.source === 'gomining_gmt' || prev?.source === 'gomining_btc') && parentId) {
      const projects = storage.getProjects();
      const adjusted = projects.map((p) => {
        if (p.id !== parentId) return p;
        const oldEarn = prev.type === 'earning' ? (Number(prev.amount) || 0) : 0;
        const newEarn = updated.type === 'earning' ? (Number(updated.amount) || 0) : 0;
        const oldInv = prev.type === 'investment' ? (Number(prev.amount) || 0) : 0;
        const newInv = updated.type === 'investment' ? (Number(updated.amount) || 0) : 0;
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
      if (hit) { removed = { ...hit }; parentId = project.id; }
      return { ...project, transactions: txns.filter((txn) => txn.id !== txnId) };
    });
    storage.setProjects(next);
    // Reverse the synced snapshot for GoMining auto-syncs so the GoMining
    // tab re-arms the pending badge and lets you re-sync if desired.
    if (removed?.source === 'gomining' && removed?.source_row_id) {
      const snap = storage.getGoMiningSynced();
      const cur = Number(snap[removed.source_row_id]) || 0;
      snap[removed.source_row_id] = Math.max(0, cur - (Number(removed.amount) || 0));
      storage.setGoMiningSynced(snap);
    }
    // For Nosana, drop the date from the synced map entirely so the next
    // auto-sync re-applies that day (matches the user's intent: "I deleted
    // this so re-fetch it cleanly next run").
    if (removed?.source === 'nosana' && removed?.source_date) {
      const snap = storage.getNosanaSyncedDates();
      if (snap[removed.source_date]) {
        delete snap[removed.source_date];
        storage.setNosanaSyncedDates(snap);
      }
    }
    // RollerCoin: the baseline IS the source of truth (no external API).
    // Deleting a synced txn means "that earning never happened" — so we
    // lower baseline_trx by the txn's TRX delta. The next balance update
    // will re-detect the delta (with the up-to-date price) and re-sync.
    if (removed?.source === 'rollercoin') {
      const rc = storage.getRollerCoinConfig();
      if (rc?.baseline_trx != null) {
        const dec = Number(removed.source_trx_delta) || 0;
        const nextBaseline = Math.max(0, (Number(rc.baseline_trx) || 0) - dec);
        storage.setRollerCoinConfig({ ...rc, baseline_trx: nextBaseline });
      }
    }
    // Acurast mirrors RollerCoin's baseline-as-source-of-truth pattern,
    // tracking ACU tokens with live USD pricing. Deleting a synced txn
    // lowers baseline_acu by the txn's ACU delta so the next "Update
    // balance" re-detects (and re-prices) the same delta cleanly.
    if (removed?.source === 'acurast') {
      const ac = storage.getAcurastConfig();
      if (ac?.baseline_acu != null) {
        const dec = Number(removed.source_acu_delta) || 0;
        const nextBaseline = Math.max(0, (Number(ac.baseline_acu) || 0) - dec);
        storage.setAcurastConfig({ ...ac, baseline_acu: nextBaseline });
      }
    }
    // Unity Network: same baseline-as-source-of-truth pattern but in plain
    // USD. Deleting a synced txn lowers baseline_usd so the next "Update
    // balance" re-arms the same delta.
    if (removed?.source === 'unity_network') {
      const un = storage.getUnityNetworkConfig();
      if (un?.baseline_usd != null) {
        const dec = Number(removed.source_usd_delta) || 0;
        const nextBaseline = Math.max(0, (Number(un.baseline_usd) || 0) - dec);
        storage.setUnityNetworkConfig({ ...un, baseline_usd: nextBaseline });
      }
    }
    // GoMining (Integrations card) — both earning AND investment txns share
    // the signed-delta reversal formula `new_baseline = current - delta`,
    // so the same code path works for boost txns (negative delta) and
    // earning txns (positive delta). GMT and BTC have separate baselines.
    if (removed?.source === 'gomining_gmt') {
      const gm = storage.getGoMiningTokenConfig();
      if (gm?.baseline_gmt != null) {
        const dec = Number(removed.source_gmt_delta) || 0;
        const nextBaseline = Math.max(0, (Number(gm.baseline_gmt) || 0) - dec);
        storage.setGoMiningTokenConfig({ ...gm, baseline_gmt: nextBaseline });
      }
    }
    if (removed?.source === 'gomining_btc') {
      const gm = storage.getGoMiningTokenConfig();
      if (gm?.baseline_btc != null) {
        const dec = Number(removed.source_btc_delta) || 0;
        const nextBaseline = Math.max(0, (Number(gm.baseline_btc) || 0) - dec);
        storage.setGoMiningTokenConfig({ ...gm, baseline_btc: nextBaseline });
      }
    }
    // Decrement project.earned only for GoMining/Nosana/RollerCoin/Acurast/Unity Network/GoMining-token auto-synced earning
    // txns (manual earnings don't bump earned on insert, so we shouldn't on
    // delete either).
    if ((removed?.source === 'gomining' || removed?.source === 'nosana' || removed?.source === 'rollercoin' || removed?.source === 'acurast' || removed?.source === 'unity_network' || removed?.source === 'gomining_gmt' || removed?.source === 'gomining_btc') && removed?.type === 'earning' && parentId) {
      const projects = storage.getProjects();
      const adjusted = projects.map((p) => {
        if (p.id !== parentId) return p;
        return { ...p, earned: Math.max(0, (Number(p.earned) || 0) - (Number(removed.amount) || 0)) };
      });
      storage.setProjects(adjusted);
    }
    // Boost spends are stored as type='investment' on the GoMining token
    // sources. Deleting one rolls back project.invested by the same USD
    // amount so the project reflects only currently-deployed capital.
    if ((removed?.source === 'gomining_gmt' || removed?.source === 'gomining_btc') && removed?.type === 'investment' && parentId) {
      const projects = storage.getProjects();
      const adjusted = projects.map((p) => {
        if (p.id !== parentId) return p;
        return { ...p, invested: Math.max(0, (Number(p.invested) || 0) - (Number(removed.amount) || 0)) };
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
            icon_url: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
            chain: 'bitcoin',
            category: 'wallet',
            protocol: null,
          }],
        });
      }

if (wallet.chain === "solana") {
  const rawTokens = await solanaApi.getParsedWalletTokens(wallet.address);

  const prices = await jupiterPriceApi.getPrices(
    rawTokens.map((t) => t.mint),
  );

  const tokens = rawTokens
    .map((t) => {
      const priceInfo = prices?.[t.mint] || {};
      const price = Number(priceInfo.usdPrice ?? 0);
      const usdValue = t.amount * price;

      return {
        id: t.mint,
        mint: t.mint,
        symbol: t.symbol,
        name: t.name,
        amount: t.amount,
        price,
        usd_value: usdValue,
        icon_url: "",
        chain: "solana",
        category: "wallet",
        protocol: null,
      };
    })
    .filter((t) => t.amount > 0 && t.usd_value >= 0.01);

  const totalUsd = tokens.reduce((sum, t) => sum + (t.usd_value || 0), 0);

  return toResponse({
    total_usd: totalUsd,
    tokens,
  });
}
    } catch (error) {
      console.warn(`Balance fetch failed for ${wallet.address}:`, error);
      return toResponse({ total_usd: 0, tokens: [] });
    }
  },
getDefiPositions: async (address) => {
  try {
    const data = await moralisDefiApi.getPositions(address);
    return toResponse(data);
  } catch (error) {
    console.warn(`DeFi fetch failed for ${address}:`, error);
    return toResponse({ positions: [] });
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
  // Resolve symbol → coin id, then fetch price + return enrichment metadata
  // (name, icon) so the form can auto-fill everything in one step.
  resolveAndPrice: async (symbol) => {
    const resolved = await coinGeckoApi.resolveSymbol(symbol);
    if (!resolved) return { price: 0, resolved: null };
    const price = await coinGeckoApi.getPrice(resolved.id);
    return { price: Number(price) || 0, resolved };
  },
  // Re-price every stored custom token. Persists each token's `coingecko_id`
  // on first resolve so subsequent refreshes skip the search hop.
  refreshAllPrices: async () => {
    const all = normalizeItems(storage.getTokens());
    if (all.length === 0) return toResponse({ updated: 0, total: 0 });
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
        if (!coinId) { next.push(t); continue; }
        const price = await coinGeckoApi.getPrice(coinId);
        if (price > 0) {
          updated += 1;
          next.push(normalizeId({ ...t, price, coingecko_id: coinId, icon_url: icon, name: name || t.name }));
        } else {
          next.push(normalizeId({ ...t, coingecko_id: coinId }));
        }
      } catch {
        next.push(t);
      }
      // Stay polite with CoinGecko's free-tier rate limit.
      await new Promise((r) => setTimeout(r, 250));
    }
    storage.setTokens(next);
    return toResponse({ updated, total: all.length });
  },
  // Kept for backwards compat (was used directly elsewhere) — now goes through
  // the symbol resolver so a bare ticker like "TRX" actually returns a price.
  getPrice: async (symbol) => {
    const { price } = await customTokensApi.resolveAndPrice(symbol);
    return price;
  },
};

export const netWorthApi = {
  getCurrent: async () => {
const [assets, cryptoCache] = await Promise.all([
  assetsApi.getAll().then((res) => res.data),
  cryptoCacheApi.get().then((res) => res.data),
]);

const phones = [];
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
      if (asset.category === 'stocks') breakdown.stocks += value;
      else if (asset.category === 'crypto') breakdown.crypto += value;
      else if (asset.category === 'cash') breakdown.cash += value;
      else if (asset.category === 'debts') breakdown.debts += value;
      else if (asset.category === 'other') breakdown.other += value;
    });

    const totalNetWorth = breakdown.stocks + breakdown.crypto + breakdown.cash + breakdown.other + breakdown.phones - breakdown.debts;
    return toResponse({ total_net_worth: totalNetWorth, breakdown, last_updated: new Date().toISOString() });
  },
  getHistory: async () => toResponse(storage.getHistory()),
  saveSnapshot: async (source = 'manual') => {
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
      source, // 'auto' | 'manual' — used by the history chart to render markers
    };
    const history = storage.getHistory();
    const nextHistory = [...history, snapshot];
    storage.setHistory(nextHistory);
    return toResponse(snapshot);
  },
};

// Live-refresh wallet balances + write to crypto_cache. Used by the dashboard's
// "real-time" loop so the net-worth chart picks up crypto price moves even when
// the user isn't on the Crypto page.
export const walletSyncApi = {
  refreshAll: async () => {
    const wallets = normalizeItems(storage.getWallets());
    if (wallets.length === 0) return toResponse({ total: 0, chains: [], tokens: [] });
    const customTokens = normalizeItems(storage.getTokens());
    const tokenPrefs = storage.getPrefs();
    const hidden = new Set(
      Object.entries(tokenPrefs)
        .filter(([, p]) => p?.hidden)
        .map(([s]) => s),
    );

    // Sequential to keep us under CoinStats rate limits.
    const balances = {};
    for (const w of wallets) {
      try {
        const res = await walletsApi.getBalances(w.id);
        balances[w.id] = res.data;
      } catch { /* silent */ }
    }
    const solWallets = wallets.filter((w) => w.chain === 'solana');
    const allDefi = [];
    for (const w of solWallets) {
      try {
        const res = await walletsApi.getDefiPositions(w.address);
        if (Array.isArray(res.data?.positions)) allDefi.push(...res.data.positions);
      } catch { /* silent */ }
    }

    const chainBreakdown = {};
    const tokensByChain = {};
    wallets.forEach((w) => {
      (balances[w.id]?.tokens || []).forEach((t) => {
        if (hidden.has(t.symbol)) return;
        if ((t.usd_value || 0) < 0.01) return;
        chainBreakdown[w.chain] = (chainBreakdown[w.chain] || 0) + t.usd_value;
        if (!tokensByChain[w.chain]) tokensByChain[w.chain] = [];
        tokensByChain[w.chain].push({
          symbol: t.symbol,
          name: t.name,
          icon_url: tokenPrefs[t.symbol]?.custom_icon_url || t.icon_url || '',
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
      const c = ct.chain || 'custom';
      chainBreakdown[c] = (chainBreakdown[c] || 0) + v;
      if (!tokensByChain[c]) tokensByChain[c] = [];
      tokensByChain[c].push({
        symbol: ct.symbol,
        name: ct.name,
        icon_url: ct.icon_url || '',
        amount: ct.amount,
        price: ct.price,
        usd_value: v,
      });
    });
const defiTotal = allDefi.reduce((s, p) => s + (p.total_value || 0), 0);

if (defiTotal > 0) {
  chainBreakdown.solana = (chainBreakdown.solana || 0) + defiTotal;
}

if (allDefi.length > 0) {
  if (!tokensByChain.solana) tokensByChain.solana = [];

  allDefi.forEach((p) => {
    const value = Number(p.total_value) || 0;
    if (value < 0.01) return;

    tokensByChain.solana.push({
      symbol: p.platform || "DeFi",
      name: p.label ? `${p.platform} - ${p.label}` : p.platform || "DeFi Position",
      icon_url: "",
      amount: 1,
      price: value,
      usd_value: value,
      category: "defi",
      protocol: p.platform || p.platform_id || "Unknown",
      tokens: p.tokens || [],
      apy: p.apy || 0,
    });
  });
}

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
  configure: async (wallet_address, project_name) => toResponse({ configured: true, wallet_address, project_name }),
};
