import { withCorsProxy, fetchWithCors } from "./cors-proxy";

// CoinGecko API (free, no auth required) - CORS-friendly
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

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
const FINNHUB_BASE = "https://finnhub.io/api/v1";
const FINNHUB_KEY = process.env.REACT_APP_FINNHUB_API_KEY;

export const finnhubApi = {
  getQuote: async (symbol) => {
    try {
      const url = `${FINNHUB_BASE}/quote?symbol=${symbol}&token=${FINNHUB_KEY}`;
      const response = await withCorsProxy(url);
      return response.data || {};
    } catch (error) {
      console.warn(`Finnhub quote fetch failed for ${symbol}:`, error);
      return {};
    }
  },

  search: async (query) => {
    try {
      const url = `${FINNHUB_BASE}/search?q=${query}&token=${FINNHUB_KEY}`;
      const response = await withCorsProxy(url);
      return response.data.result || [];
    } catch (error) {
      console.warn(`Finnhub search failed for ${query}:`, error);
      return [];
    }
  },
};

// Jupiter Portfolio API
const JUPITER_API_KEY = process.env.REACT_APP_JUPITER_API_KEY;
const JUPITER_PORTFOLIO_BASE = "https://api.jup.ag/portfolio/v1";

function buildToken(asset, tokenInfo, networkId, kind = "supplied") {
  if (!asset) return null;

  const data = asset.data || asset;
  const addr = data.address || data.mint || asset.address || "";
  const amount = Number(data.amount ?? asset.amount ?? 0);
  const price = Number(data.price ?? asset.price ?? 0);
  const value = Number(asset.value ?? data.value ?? amount * price);
  const tokInfo = tokenInfo?.[networkId]?.[addr] || {};
  const apy = Number(asset?.attributes?.apy ?? data?.apy ?? 0);

  return {
    address: addr,
    symbol: tokInfo.symbol || data.symbol || asset.symbol || "",
    name: tokInfo.name || data.name || asset.name || "",
    image_uri: tokInfo.logoURI || tokInfo.image || data.image_uri || "",
    amount,
    price,
    value: kind === "borrowed" ? -Math.abs(value) : value,
    apy,
    kind,
  };
}

function mapJupiterElement(el, tokenInfo = {}) {
  const networkId = el?.networkId || "solana";
  const data = el?.data || {};
  const tokens = [];

  const pushAll = (arr, kind = "supplied") => {
    if (!Array.isArray(arr)) return;

    arr.forEach((a) => {
      const t = buildToken(a, tokenInfo, networkId, kind);
      if (t) tokens.push(t);
    });
  };

  switch (el?.type) {
    case "multiple":
      pushAll(data.assets, "supplied");
      pushAll(data.rewardAssets, "reward");
      break;

    case "borrowlend":
      pushAll(data.suppliedAssets, "supplied");
      pushAll(data.borrowedAssets, "borrowed");
      pushAll(data.rewardAssets, "reward");
      break;

    case "liquidity":
      if (Array.isArray(data.liquidities)) {
        data.liquidities.forEach((l) => {
          pushAll(l?.assets, "supplied");
          pushAll(l?.rewardAssets, "reward");
        });
      } else {
        pushAll(data.assets, "supplied");
      }
      break;

    case "leverage":
    case "trade": {
      const t = buildToken(
        { data, value: el.value, attributes: el.attributes },
        tokenInfo,
        networkId,
        "supplied"
      );
      if (t) tokens.push(t);
      pushAll(data.rewardAssets, "reward");
      break;
    }

    default:
      pushAll(data.assets, "supplied");
      pushAll(data.suppliedAssets, "supplied");
      pushAll(data.borrowedAssets, "borrowed");
      pushAll(data.rewardAssets, "reward");
      break;
  }

  const totalValue = Number(
    el?.value ?? tokens.reduce((s, t) => s + (Number.isFinite(t.value) ? t.value : 0), 0)
  );

  if (tokens.length === 0 && Math.abs(totalValue) > 0.01) {
    tokens.push({
      address: "",
      symbol: el?.label || el?.name || "Position",
      name: `${el?.name || "Unknown"} - ${el?.label || ""}`.trim(),
      image_uri: "",
      amount: 0,
      price: 0,
      value: totalValue,
      apy: Number(el?.netApy ?? 0),
      kind: "supplied",
    });
  }

  return {
    platform_id: el?.platformId || el?.fetcherId || el?.name || "unknown",
    platform: el?.name || el?.platformId || "Unknown",
    label: el?.label || "",
    total_value: totalValue,
    apy: Number(el?.netApy ?? 0),
    tokens,
  };
}

export const jupiterApi = {
  getPortfolio: async (walletAddress) => {
    if (!walletAddress) return { positions: [] };

    try {
      const url = `${JUPITER_PORTFOLIO_BASE}/positions/${walletAddress}`;

      const response = await fetch(url, {
        headers: JUPITER_API_KEY ? { "x-api-key": JUPITER_API_KEY } : {},
      });

      if (!response.ok) {
        console.warn(`Jupiter portfolio ${response.status} for ${walletAddress}`);
        return { positions: [] };
      }

      const data = await response.json();
      const elements = Array.isArray(data?.elements) ? data.elements : [];
      const tokenInfo = data?.tokenInfo || {};

      const positions = elements
        .filter((el) => (el?.label || "").toLowerCase() !== "wallet")
        .map((el) => mapJupiterElement(el, tokenInfo))
        .filter((p) => p.total_value > 0.01 || p.tokens.length > 0);

      return { positions };
    } catch (error) {
      console.warn(`Jupiter portfolio fetch failed for ${walletAddress}:`, error);
      return { positions: [] };
    }
  },
};

// Jupiter Price API
const JUPITER_PRICE_BASE = "https://api.jup.ag/price/v3";
const SOL_MINT = "So11111111111111111111111111111111111111112";

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

        const response = await fetch(url, {
          headers: JUPITER_API_KEY ? { "x-api-key": JUPITER_API_KEY } : {},
        });

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

// Moralis DeFi API
const MORALIS_API_KEY = process.env.REACT_APP_MORALIS_API_KEY;
const MORALIS_DEFI_BASE = "https://api.moralis.com/v1";

function mapMoralisPosition(position) {
  const protocol =
    position?.protocol?.name ||
    position?.protocol_name ||
    position?.protocol ||
    "Unknown";

  const label =
    position?.position_label ||
    position?.label ||
    position?.type ||
    position?.position_type ||
    "DeFi Position";

  const tokens = [];

  const pushToken = (asset, kind = "supplied") => {
    if (!asset) return;

    const amount = Number(
      asset.amount ?? asset.balance ?? asset.quantity ?? asset.token_amount ?? 0
    );

    const price = Number(
      asset.usd_price ?? asset.price_usd ?? asset.price ?? 0
    );

    const value = Number(
      asset.usd_value ?? asset.value_usd ?? asset.value ?? amount * price
    );

    tokens.push({
      address: asset.token_address || asset.address || asset.mint || "",
      symbol: asset.symbol || asset.token_symbol || "",
      name: asset.name || asset.token_name || "",
      image_uri: asset.logo || asset.logo_url || asset.thumbnail || "",
      amount,
      price,
      value: kind === "borrowed" ? -Math.abs(value) : value,
      kind,
    });
  };

  const supplied =
    position?.supplied ||
    position?.supplied_tokens ||
    position?.supply ||
    position?.assets ||
    [];

  const borrowed =
    position?.borrowed ||
    position?.borrowed_tokens ||
    position?.debt ||
    [];

  const rewards =
    position?.rewards ||
    position?.reward_tokens ||
    [];

  if (Array.isArray(supplied)) supplied.forEach((t) => pushToken(t, "supplied"));
  if (Array.isArray(borrowed)) borrowed.forEach((t) => pushToken(t, "borrowed"));
  if (Array.isArray(rewards)) rewards.forEach((t) => pushToken(t, "reward"));

  const totalValue = Number(
    position?.usd_value ??
      position?.total_usd_value ??
      position?.net_usd_value ??
      tokens.reduce((sum, t) => sum + (Number(t.value) || 0), 0)
  );

  return {
    platform_id: protocol.toLowerCase().replace(/\s+/g, "_"),
    platform: protocol,
    label,
    total_value: totalValue,
    apy: Number(position?.apy ?? position?.net_apy ?? 0),
    tokens,
    raw: position,
  };
}

export const moralisDefiApi = {
  getPositions: async (walletAddress) => {
    if (!walletAddress) return { positions: [] };

    if (!MORALIS_API_KEY) {
      console.warn("Moralis API key missing: REACT_APP_MORALIS_API_KEY");
      return { positions: [] };
    }

    try {
      const url = `${MORALIS_DEFI_BASE}/wallets/${walletAddress}/defi/positions?chain=solana`;

      const response = await fetch(url, {
        headers: {
          "X-API-Key": MORALIS_API_KEY,
          accept: "application/json",
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.warn(`Moralis DeFi ${response.status}: ${text.slice(0, 300)}`);
        return { positions: [] };
      }

      const data = await response.json();

      const rawPositions = Array.isArray(data)
        ? data
        : data?.positions || data?.result || data?.data || [];

      const positions = rawPositions
        .map(mapMoralisPosition)
        .filter((p) => Math.abs(Number(p.total_value) || 0) > 0.01 || p.tokens.length > 0);

      return { positions };
    } catch (error) {
      console.warn(`Moralis DeFi fetch failed for ${walletAddress}:`, error);
      return { positions: [] };
    }
  },
};

// Solana RPC
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
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
const BITCOIN_API = "https://blockchain.info";

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
const RAPIDAPI_KEY = process.env.REACT_APP_RAPIDAPI_KEY;
const RAPIDAPI_EBAY_HOST =
  process.env.REACT_APP_RAPIDAPI_EBAY_HOST ||
  "ebay-average-selling-price.p.rapidapi.com";

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

    if (!RAPIDAPI_KEY) {
      console.warn("eBay: REACT_APP_RAPIDAPI_KEY is not set.");
      return null;
    }

    const key = model.trim().toLowerCase();
    const cached = readEbayCache(key);
    if (cached) return cached;

    try {
      const response = await fetch(`https://${RAPIDAPI_EBAY_HOST}/findCompletedItems`, {
        method: "POST",
        headers: {
          "X-RapidAPI-Key": RAPIDAPI_KEY,
          "X-RapidAPI-Host": RAPIDAPI_EBAY_HOST,
          "Content-Type": "application/json",
        },
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
const NOSANA_API_BASE = "https://dashboard.k8s.prd.nos.ci/api/stats/earning-history";

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

        if (sum > 0) out.push({ date, amount: sum });
      }
    }

    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  },
};