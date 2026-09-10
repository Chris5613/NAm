import { withCorsProxy, fetchWithCors, proxyFetch } from "./cors-proxy";

// Paths below are backend proxy routes, not vendor URLs. Keys live on the server.
const COINGECKO_BASE = "/coingecko";

export const coinGeckoApi = {
  getPrice: async (coinId, vsCurrency = "usd") => {
    try {
      const response = await withCorsProxy(
        `${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}`
      );
      return response.data[coinId]?.[vsCurrency] || 0;
    } catch (error) {
      console.warn(`CoinGecko price fetch failed for ${coinId}:`, error);
      return 0;
    }
  },

  search: async (query) => {
    try {
      const response = await withCorsProxy(`${COINGECKO_BASE}/search?query=${query}`);
      return response.data.coins || [];
    } catch (error) {
      console.warn(`CoinGecko search failed for ${query}:`, error);
      return [];
    }
  },

  resolveSymbol: async (symbol) => {
    if (!symbol) return null;

    try {
      const coins = await coinGeckoApi.search(symbol);
      const target = symbol.trim().toLowerCase();

      const match =
        coins.find((c) => (c.symbol || "").toLowerCase() === target) ||
        coins.find((c) => (c.name || "").toLowerCase() === target) ||
        coins[0] ||
        null;

      if (!match) return null;

      return {
        id: match.id,
        name: match.name,
        symbol: match.symbol,
        thumb: match.thumb || match.large || match.small || "",
      };
    } catch (error) {
      console.warn(`CoinGecko resolveSymbol failed for ${symbol}:`, error);
      return null;
    }
  },

  getInfo: async (coinId) => {
    try {
      const response = await withCorsProxy(`${COINGECKO_BASE}/coins/${coinId}`);
      return response.data || {};
    } catch (error) {
      console.warn(`CoinGecko info fetch failed for ${coinId}:`, error);
      return {};
    }
  },
};

// Finnhub API
const FINNHUB_BASE = "/finnhub";

export const finnhubApi = {
  getQuote: async (symbol) => {
    try {
      const response = await withCorsProxy(`${FINNHUB_BASE}/quote?symbol=${symbol}`);
      return response.data || {};
    } catch (error) {
      console.warn(`Finnhub quote fetch failed for ${symbol}:`, error);
      return {};
    }
  },

  search: async (query) => {
    try {
      const response = await withCorsProxy(`${FINNHUB_BASE}/search?q=${query}`);
      return response.data.result || [];
    } catch (error) {
      console.warn(`Finnhub search failed for ${query}:`, error);
      return [];
    }
  },
};

// CoinStats API
const COINSTATS_BASE = "/coinstats";

const COINSTATS_CHAIN_MAP = {
  solana: "solana",
  ethereum: "ethereum",
  bitcoin: "bitcoin",
  tron: "tron",
  bsc: "binance-smart-chain",
  bnb: "binance-smart-chain",
  polygon: "polygon",
  arbitrum: "arbitrum",
  optimism: "optimism",
  base: "base",
  avalanche: "avalanche",
  fantom: "fantom",
};

export const coinStatsApi = {
  getWalletPortfolio: async (address, chain = "solana") => {
    if (!address) return [];

    try {
      const connectionId = COINSTATS_CHAIN_MAP[chain] || chain;

      const url =
        `${COINSTATS_BASE}/wallet/balance` +
        `?address=${encodeURIComponent(address)}` +
        `&connectionId=${encodeURIComponent(connectionId)}`;

      const response = await proxyFetch(url);

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `CoinStats ${response.status} for ${address} on ${chain}: ${text.slice(0, 300)}`
        );
      }

      const data = await response.json();

      return data;
    } catch (error) {
      console.warn(`CoinStats wallet balance fetch failed for ${address}:`, error);
      throw error;
    }
  },

  getWalletBalance: async (address, chain = "solana") => {
    const data = await coinStatsApi.getWalletPortfolio(address, chain);
    return Array.isArray(data)
      ? data
      : data?.tokens || data?.coins || data?.balances || [];
  },
};

function getNumericValue(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num !== 0) return num;
  }

  return 0;
}

function extractDefiTokensFromList(list, fallbackKind = "supplied") {
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      const token = item?.token || item?.asset || item?.coin || item || {};

const symbol =
  token.symbol ||
  item.symbol ||
  item.ticker ||
  item.coinSymbol ||
  item.coin ||
  item.coinId ||
  token.coinId ||
  item.id ||
  "";

      const name =
        token.name ||
        item.name ||
        item.coinName ||
        symbol;

      const amount = getNumericValue(
        item.amount,
        item.balance,
        item.quantity,
        item.qty,
        item.tokenAmount,
        item.amountInToken,
        item.token_amount,
        item.count,
        token.amount,
        token.balance,
        token.quantity
      );

      const price = getNumericValue(
        item.price,
        item.currentPrice,
        item.current_price,
        item.usdPrice,
        item.priceUsd,
        item.price_usd,
        token.price,
        token.currentPrice,
        token.current_price,
        token.usdPrice
      );

      const value = getNumericValue(
        item.value,
        item.usdValue,
        item.usd_value,
        item.totalValue,
        item.total_value,
        item.amountUsd,
        item.amount_usd,
        item.balanceUsd,
        item.balance_usd,
        item.valueUsd,
        item.value_usd,
        item.usd,
        token.value,
        token.usdValue,
        token.usd_value,
        amount * price
      );

      if (!symbol || symbol === "Asset") return null;

      return {
        symbol,
        name,
        amount,
        price,
        value,
image_uri:
  token.logo ||
  token.icon ||
  token.imgUrl ||
  token.image ||
  item.logo ||
  item.icon ||
  item.imgUrl ||
  item.image ||
  "",
        kind: item.type || item.kind || item.positionType || fallbackKind,
      };
    })
    .filter(Boolean);
}

function extractDefiTokens(protocol) {
  const tokens = [];

  const listSources = [
    ["assets", "supplied"],
    ["tokens", "supplied"],
    ["balances", "supplied"],
    ["positions", "supplied"],
    ["investments", "supplied"],
    ["supplied", "supplied"],
    ["suppliedAssets", "supplied"],
    ["supplied_tokens", "supplied"],
    ["borrowed", "borrowed"],
    ["borrowedAssets", "borrowed"],
    ["borrowed_tokens", "borrowed"],
    ["rewardAssets", "reward"],
    ["rewards", "reward"],
    ["reward_tokens", "reward"],
  ];

  listSources.forEach(([key, kind]) => {
    tokens.push(...extractDefiTokensFromList(protocol?.[key], kind));
  });

  if (Array.isArray(protocol?.investments)) {
  protocol.investments.forEach((investment) => {
    const investmentKind =
      investment.type ||
      investment.title ||
      investment.name ||
      "supplied";

    tokens.push(...extractDefiTokensFromList(investment?.assets, investmentKind));
    tokens.push(...extractDefiTokensFromList(investment?.tokens, investmentKind));
    tokens.push(...extractDefiTokensFromList(investment?.balances, investmentKind));
  });
}

  if (Array.isArray(protocol?.pools)) {
    protocol.pools.forEach((pool) => {
      tokens.push(...extractDefiTokensFromList(pool?.assets, "supplied"));
      tokens.push(...extractDefiTokensFromList(pool?.tokens, "supplied"));
      tokens.push(...extractDefiTokensFromList(pool?.investments, "supplied"));
      tokens.push(...extractDefiTokensFromList(pool?.rewardAssets, "reward"));
      tokens.push(...extractDefiTokensFromList(pool?.rewards, "reward"));
    });
  }

  if (Array.isArray(protocol?.liquidities)) {
    protocol.liquidities.forEach((liquidity) => {
      tokens.push(...extractDefiTokensFromList(liquidity?.assets, "supplied"));
      tokens.push(...extractDefiTokensFromList(liquidity?.tokens, "supplied"));
      tokens.push(...extractDefiTokensFromList(liquidity?.investments, "supplied"));
      tokens.push(...extractDefiTokensFromList(liquidity?.rewardAssets, "reward"));
      tokens.push(...extractDefiTokensFromList(liquidity?.rewards, "reward"));
    });
  }

  const merged = {};

  tokens.forEach((token) => {
    const key = `${token.symbol}_${token.kind}`;

    if (!merged[key]) {
      merged[key] = { ...token };
      return;
    }

    merged[key].amount += Number(token.amount) || 0;
    merged[key].value += Number(token.value) || 0;

    if (!merged[key].price && token.price) {
      merged[key].price = token.price;
    }

    if (!merged[key].image_uri && token.image_uri) {
      merged[key].image_uri = token.image_uri;
    }
  });

  return Object.values(merged).sort((a, b) => (b.value || 0) - (a.value || 0));
}

function toUsdValue(value) {
  if (typeof value === "string") {
    return Number(value.replace(/[^0-9.-]/g, "")) || 0;
  }

  if (value && typeof value === "object") {
    return Number(value.USD ?? value.usd ?? value.Usd ?? 0) || 0;
  }

  return Number(value) || 0;
}

function normalizeDefiPosition(protocol, chain, address) {
  const totalValue = protocol?.totalValue ?? protocol?.total_value ?? protocol?.usd ?? protocol?.value;
  const typeLabels = Array.isArray(protocol?.investments)
    ? protocol.investments
        .map((investment) => investment.type || investment.title || investment.name)
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
    : [];

  return {
    platform_id: protocol?.id || protocol?.protocolId || protocol?.protocol_id || protocol?.protocol || protocol?.name || "unknown",
    platform: protocol?.name || protocol?.protocolName || protocol?.protocol || protocol?.protocolId || "Unknown",
    label: protocol?.label || "DeFi",
    type: typeLabels.length > 0 ? typeLabels.join(" / ") : protocol?.type || "DeFi",
    logo: protocol?.logo || protocol?.icon || "",
    url: protocol?.url || protocol?.website || "",
    total_value: toUsdValue(totalValue),
    total_value_raw: totalValue,
    tokens: extractDefiTokens(protocol),
    chain,
    address,
  };
}

export const coinStatsPortfolioApi = {
  getDefiPortfolio: async (portfolioId = "") => {
    if (!portfolioId) {
      console.warn("CoinStats: portfolio id is not configured.");
      return { positions: [], totalAssets: {} };
    }

    try {
      const url =
        `${COINSTATS_BASE}/portfolio/defi` +
        `?portfolioId=${encodeURIComponent(portfolioId)}`;

      const response = await proxyFetch(url);

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.warn(`CoinStats DeFi ${response.status}: ${text.slice(0, 300)}`);
        return { positions: [], totalAssets: {} };
      }

      const data = await response.json();

      console.log("RAW CoinStats DeFi Portfolio:", data);

      const positions = (data?.protocols || []).map((protocol) => normalizeDefiPosition(protocol));

      return {
        positions,
        totalAssets: data?.totalAssets || {},
      };
    } catch (error) {
      console.warn("CoinStats DeFi portfolio fetch failed:", error);
      return { positions: [], totalAssets: {} };
    }
  },
};

export const getCoinStatsWalletDefiPositions = async (address, chain) => {
  const data = await coinStatsApi.getWalletPortfolio(address, chain);
  const protocols = Array.isArray(data)
    ? []
    : data?.defiPositions || data?.protocols || data?.defi?.positions || [];

  return Array.isArray(protocols)
    ? protocols.map((protocol) => normalizeDefiPosition(protocol, chain, address))
    : [];
};

// Jupiter Price API
const JUPITER_PRICE_BASE = "/jupiter/price/v3";

export const jupiterPriceApi = {
  getPrices: async (mints = []) => {
    const uniqueMints = [...new Set(mints.filter(Boolean))];

    if (uniqueMints.length === 0) return {};

    try {
      const chunks = [];

      for (let i = 0; i < uniqueMints.length; i += 50) {
        chunks.push(uniqueMints.slice(i, i + 50));
      }

      const out = {};

      for (const chunk of chunks) {
        const url = `${JUPITER_PRICE_BASE}?ids=${encodeURIComponent(chunk.join(","))}`;

        const response = await proxyFetch(url);

        if (!response.ok) {
          const text = await response.text();
          console.warn(`Jupiter price ${response.status}: ${text.slice(0, 200)}`);
          continue;
        }

        const data = await response.json();
        Object.assign(out, data || {});
      }

      return out;
    } catch (error) {
      console.warn("Jupiter price fetch failed:", error);
      return {};
    }
  },
};

// Solana RPC fallback/helper
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SOLANA_RPC = "/solana/rpc";
const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEHdkAS6EP8CCpM4TbP9pXdJq4iR";

async function rpc(method, params) {
  const response = await withCorsProxy(SOLANA_RPC, {
    method: "POST",
    data: {
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    },
  });

  if (response.data?.error) {
    throw new Error(response.data.error.message || "Solana RPC error");
  }

  return response.data?.result;
}

export const solanaApi = {
  getBalance: async (address) => {
    try {
      const result = await rpc("getBalance", [address]);
      return result?.value || 0;
    } catch (error) {
      console.warn(`Solana balance fetch failed for ${address}:`, error);
      return 0;
    }
  },

  getTokenAccounts: async (address) => {
    try {
      const fetchByProgram = async (programId) => {
        const result = await rpc("getTokenAccountsByOwner", [
          address,
          { programId },
          { encoding: "jsonParsed" },
        ]);

        return result?.value || [];
      };

      const [classicTokens, token2022Tokens] = await Promise.all([
        fetchByProgram(SPL_TOKEN_PROGRAM),
        fetchByProgram(TOKEN_2022_PROGRAM),
      ]);

      return [...classicTokens, ...token2022Tokens];
    } catch (error) {
      console.warn(`Solana token accounts fetch failed for ${address}:`, error);
      return [];
    }
  },

  getParsedWalletTokens: async (address) => {
    const [lamports, tokenAccounts] = await Promise.all([
      solanaApi.getBalance(address),
      solanaApi.getTokenAccounts(address),
    ]);

    const tokens = [];

    tokens.push({
      mint: SOL_MINT,
      symbol: "SOL",
      name: "Solana",
      amount: lamports / 1e9,
      decimals: 9,
      chain: "solana",
      category: "wallet",
      protocol: null,
    });

    tokenAccounts.forEach((account) => {
      const info = account?.account?.data?.parsed?.info;
      const tokenAmount = info?.tokenAmount;
      const amount = Number(tokenAmount?.uiAmount ?? 0);

      if (!info?.mint || amount <= 0) return;

      tokens.push({
        mint: info.mint,
        symbol: info.mint.slice(0, 4),
        name: info.mint,
        amount,
        decimals: tokenAmount?.decimals ?? 0,
        chain: "solana",
        category: "wallet",
        protocol: null,
      });
    });

    return tokens;
  },
};

// Bitcoin Blockchain.info
const BITCOIN_API = "/bitcoin";

export const bitcoinApi = {
  getBalance: async (address) => {
    try {
      const response = await fetchWithCors(`${BITCOIN_API}/balance?active=${address}`);
      const data = typeof response === "string" ? JSON.parse(response) : response;
      return data[address]?.final_balance || 0;
    } catch (error) {
      console.warn(`Bitcoin balance fetch failed for ${address}:`, error);
      return 0;
    }
  },
};

// RapidAPI eBay average selling price
const EBAY_ENDPOINT = "/ebay/findCompletedItems";

const EBAY_CATEGORY_CELL_PHONES = "9355";
const EBAY_CACHE_TTL_MS = 60 * 60 * 1000;

function readEbayCache(key) {
  try {
    const raw = sessionStorage.getItem(`ebay:${key}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - parsed.t > EBAY_CACHE_TTL_MS) return null;

    return parsed.v;
  } catch {
    return null;
  }
}

function writeEbayCache(key, value) {
  try {
    sessionStorage.setItem(`ebay:${key}`, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    // sessionStorage unavailable — non-fatal
  }
}

export const ebayApi = {
  getAveragePrice: async (model) => {
    const data = await ebayApi.getMarketData(model);
    return data?.median_price || data?.average_price || 0;
  },

  getMarketData: async (model) => {
    if (!model) return null;

    const key = model.trim().toLowerCase();
    const cached = readEbayCache(key);
    if (cached) return cached;

    try {
      const response = await proxyFetch(EBAY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: model,
          max_search_results: "240",
          category_id: EBAY_CATEGORY_CELL_PHONES,
          remove_outliers: "true",
          site_id: "0",
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.warn(`eBay ${response.status} for "${model}": ${detail.slice(0, 200)}`);
        return null;
      }

      const data = await response.json();

      const result = {
        median_price: Number(data?.median_price ?? 0),
        average_price: Number(data?.average_price ?? 0),
        min_price: Number(data?.min_price ?? 0),
        max_price: Number(data?.max_price ?? 0),
        sample_size: Number(data?.results ?? 0),
        ebay_url:
          data?.response_url ||
          `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(
            model
          )}&LH_Sold=1&LH_Complete=1`,
      };

      writeEbayCache(key, result);
      return result;
    } catch (error) {
      console.warn(`eBay price lookup failed for "${model}":`, error);
      return null;
    }
  },
};

// Nosana dashboard API
const NOSANA_API_BASE = "/nosana/stats/earning-history";

export const nosanaApi = {
  getEarningHistory: async (address, startDate, endDate, groupBy = "month") => {
    if (!address) throw new Error("Nosana address required");
    if (!startDate) throw new Error("start_date required");

    const params = new URLSearchParams({
      address,
      start_date: startDate,
      group_by: groupBy,
    });

    if (endDate) params.set("end_date", endDate);

    const url = `${NOSANA_API_BASE}?${params.toString()}`;
    const response = await withCorsProxy(url);

    return response.data;
  },

  flattenDailyEarnings: (apiResponse) => {
    const out = [];
    const results = Array.isArray(apiResponse?.results) ? apiResponse.results : [];

    for (const r of results) {
      const daily = r?.daily_breakdown || {};

      for (const [date, marketMap] of Object.entries(daily)) {
        const sum = Object.values(marketMap || {}).reduce(
          (acc, v) => acc + (Number(v) || 0),
          0
        );

        if (sum > 0) {
          out.push({ date, amount: sum });
        }
      }
    }

    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  },
};

// Clore AI Host API (removed)
