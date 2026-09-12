import { proxyFetch } from "./cors-proxy";
import { jupiterPriceApi } from "./external-apis";

export const RATEX_WALLET =
  "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM";

export const RATEX_PTONYC_MINT =
  "7FbWfjanKYP9wQQjdDboLZFHiBQaCfhH8JBnazSx9bD5";

export const RATEX_PTONYC_FIXED_APY = 13.207;

export const RATEX_PTONYC_MATURITY =
  "2026-09-29T00:00:00-07:00";

export const RATEX_PTONYC_COST_BASIS_USD = 600;

const TOKEN_PROGRAM_ID =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// Only used if Jupiter Portfolio AND Jupiter Price V3 fail.
const LAST_KNOWN_PTONYC_PRICE = 0.99229;

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(
      value
        .replace(/[$,%]/g, "")
        .replace(/,/g, "")
        .trim()
    );

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function getUsdPrice(value) {
  if (Number.isFinite(Number(value))) {
    return Number(value);
  }

  return Number(
    value?.usdPrice ??
      value?.price ??
      value?.priceUsd ??
      0
  );
}

function normalizePercent(value) {
  if (value == null) {
    return 0;
  }

  const wasPercentString =
    typeof value === "string" &&
    value.includes("%");

  const numeric = toNumber(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  if (wasPercentString) {
    return numeric;
  }

  // Some APIs return 0.1347 for 13.47%.
  if (numeric > 0 && numeric <= 1) {
    return numeric * 100;
  }

  return numeric;
}

function textIncludesRatex(value) {
  return String(value ?? "")
    .toLowerCase()
    .includes("ratex");
}

function textIncludesPtonyc(value) {
  const text = String(value ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

  return (
    text.includes("ptonyc") ||
    text.includes("onyc")
  );
}

function walkObjects(value, callback, parent = null) {
  if (!value || typeof value !== "object") {
    return;
  }

  callback(value, parent);

  if (Array.isArray(value)) {
    value.forEach((item) => {
      walkObjects(item, callback, value);
    });

    return;
  }

  Object.values(value).forEach((child) => {
    if (child && typeof child === "object") {
      walkObjects(child, callback, value);
    }
  });
}

function getObjectAddress(object) {
  return String(
    object?.address ??
      object?.mint ??
      object?.mintAddress ??
      object?.tokenAddress ??
      object?.tokenMint ??
      ""
  );
}

function getObjectSymbol(object) {
  return String(
    object?.symbol ??
      object?.ticker ??
      object?.name ??
      object?.tokenSymbol ??
      object?.tokenName ??
      ""
  );
}

function findRatexTokenNode(ratexElements) {
  const candidates = [];

  ratexElements.forEach((element) => {
    walkObjects(
      element,
      (object, parent) => {
        let score = 0;

        const address =
          getObjectAddress(object);

        const symbol =
          getObjectSymbol(object);

        if (
          address ===
          RATEX_PTONYC_MINT
        ) {
          score += 100;
        }

        if (
          textIncludesPtonyc(
            symbol
          )
        ) {
          score += 30;
        }

        if (
          toNumber(
            object?.price
          ) > 0
        ) {
          score += 10;
        }

        if (
          toNumber(
            object?.amount ??
              object?.balance ??
              object?.quantity
          ) > 0
        ) {
          score += 5;
        }

        if (score > 0) {
          candidates.push({
            object,
            parent,
            element,
            score,
          });
        }
      }
    );
  });

  candidates.sort(
    (a, b) =>
      b.score - a.score
  );

  return candidates[0] || null;
}

function extractPrice(candidate) {
  if (!candidate) {
    return 0;
  }

  const object =
    candidate.object || {};

  const parent =
    candidate.parent || {};

  const directPrice = toNumber(
    object?.price ??
      object?.priceUsd ??
      object?.usdPrice ??
      object?.currentPrice
  );

  if (directPrice > 0) {
    return directPrice;
  }

  const parentPrice = toNumber(
    parent?.price ??
      parent?.priceUsd ??
      parent?.usdPrice ??
      parent?.currentPrice
  );

  if (parentPrice > 0) {
    return parentPrice;
  }

  const amount = toNumber(
    object?.amount ??
      object?.balance ??
      object?.quantity ??
      parent?.amount ??
      parent?.balance ??
      parent?.quantity
  );

  const value = toNumber(
    object?.value ??
      object?.usdValue ??
      object?.valueUsd ??
      parent?.value ??
      parent?.usdValue ??
      parent?.valueUsd
  );

  if (
    amount > 0 &&
    value > 0
  ) {
    return value / amount;
  }

  return 0;
}

function extractQuantity(candidate) {
  if (!candidate) {
    return 0;
  }

  const object =
    candidate.object || {};

  const parent =
    candidate.parent || {};

  return toNumber(
    object?.amount ??
      object?.balance ??
      object?.quantity ??
      object?.tokenAmount ??
      parent?.amount ??
      parent?.balance ??
      parent?.quantity ??
      parent?.tokenAmount
  );
}

function findYieldInObject(root) {
  if (!root) {
    return 0;
  }

  const yieldKeys = new Set([
    "apy",
    "apr",
    "yield",
    "yieldrate",
    "yield_rate",
    "fixedapy",
    "fixed_apy",
    "fixedyield",
    "fixed_yield",
    "annualyield",
    "annual_yield",
  ]);

  let result = 0;

  walkObjects(root, (object) => {
    if (result > 0 || Array.isArray(object)) {
      return;
    }

    Object.entries(object).some(
      ([key, value]) => {
        const normalizedKey =
          key.toLowerCase();

        if (
          !yieldKeys.has(
            normalizedKey
          )
        ) {
          return false;
        }

        const percent =
          normalizePercent(
            value
          );

        if (
          percent > 0 &&
          percent < 1000
        ) {
          result = percent;
          return true;
        }

        return false;
      }
    );
  });

  return result;
}

async function getJupiterPortfolioRatex(
  walletAddress
) {
  const params =
    new URLSearchParams({
      platforms: "ratex",

      // Avoid getting a cached browser response.
      _: String(
        Date.now()
      ),
    });

  const response =
    await proxyFetch(
      `/jupiter-portfolio/portfolio/v1/positions/${encodeURIComponent(
        walletAddress
      )}?${params.toString()}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept:
            "application/json",
        },
      }
    );

  const raw =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Jupiter Portfolio returned ${response.status}: ${raw.slice(
        0,
        250
      )}`
    );
  }

  let payload;

  try {
    payload =
      raw
        ? JSON.parse(raw)
        : {};
  } catch {
    throw new Error(
      `Jupiter Portfolio returned invalid JSON: ${raw.slice(
        0,
        250
      )}`
    );
  }

  const elements =
    Array.isArray(
      payload?.elements
    )
      ? payload.elements
      : [];

  /*
   * We requested platforms=ratex, but still explicitly
   * filter in case the API returns additional elements.
   */
  let ratexElements =
    elements.filter(
      (element) =>
        String(
          element?.platformId ??
            ""
        ).toLowerCase() ===
          "ratex" ||
        textIncludesRatex(
          element?.name
        ) ||
        textIncludesRatex(
          element?.label
        )
    );

  /*
   * If Jupiter already honored platforms=ratex but omitted
   * platformId on the returned object, use those elements.
   */
  if (
    ratexElements.length ===
      0 &&
    elements.length > 0
  ) {
    ratexElements =
      elements;
  }

  if (
    ratexElements.length ===
    0
  ) {
    const fetcherStatus =
      Array.isArray(
        payload?.fetcherReports
      )
        ? payload.fetcherReports
            .map(
              (report) =>
                `${report?.id ?? "unknown"}:${report?.status ?? "unknown"}`
            )
            .join(", ")
        : "";

    throw new Error(
      `Jupiter Portfolio returned no RateX position${
        fetcherStatus
          ? ` (${fetcherStatus})`
          : ""
      }.`
    );
  }

  const tokenCandidate =
    findRatexTokenNode(
      ratexElements
    );

  if (!tokenCandidate) {
    throw new Error(
      "Jupiter Portfolio found RateX but could not locate the PTONyc position."
    );
  }

  const priceUsd =
    extractPrice(
      tokenCandidate
    );

  const quantity =
    extractQuantity(
      tokenCandidate
    );

  /*
   * Look closest to the PTONyc token first.
   * If Jupiter stores the APY higher up on the
   * RateX position, search the full element next.
   */
  let fixedApy =
    findYieldInObject(
      tokenCandidate.object
    );

  if (!(fixedApy > 0)) {
    fixedApy =
      findYieldInObject(
        tokenCandidate.parent
      );
  }

  if (!(fixedApy > 0)) {
    fixedApy =
      findYieldInObject(
        tokenCandidate.element
      );
  }

  return {
    quantity,
    priceUsd,
    fixedApy,
    element:
      tokenCandidate.element,
  };
}

async function getWalletTokenAccounts(
  walletAddress
) {
  const response =
    await proxyFetch(
      "/solana/rpc",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            jsonrpc:
              "2.0",

            id: 1,

            method:
              "getTokenAccountsByOwner",

            params: [
              walletAddress,

              {
                programId:
                  TOKEN_PROGRAM_ID,
              },

              {
                encoding:
                  "jsonParsed",
              },
            ],
          }),
      }
    );

  if (!response.ok) {
    const detail =
      await response
        .text()
        .catch(() => "");

    throw new Error(
      `Solana RPC returned ${response.status}: ${detail.slice(
        0,
        200
      )}`
    );
  }

  const payload =
    await response.json();

  if (payload?.error) {
    throw new Error(
      payload.error
        ?.message ||
        "Solana RPC returned an error"
    );
  }

  return Array.isArray(
    payload?.result
      ?.value
  )
    ? payload.result
        .value
    : [];
}

function getRpcPtonycPosition(
  accounts
) {
  const tokenAccount =
    accounts.find(
      (entry) =>
        entry?.account
          ?.data?.parsed
          ?.info?.mint ===
        RATEX_PTONYC_MINT
    );

  const tokenAmount =
    tokenAccount
      ?.account?.data
      ?.parsed?.info
      ?.tokenAmount;

  return {
    quantity:
      Number(
        tokenAmount
          ?.uiAmountString ??
          tokenAmount
            ?.uiAmount ??
          0
      ) || 0,

    decimals:
      Number(
        tokenAmount
          ?.decimals
      ) || 0,
  };
}

export async function getRatexPtonycSnapshot(
  walletAddress =
    RATEX_WALLET
) {
  /*
   * Jupiter Portfolio and Solana RPC are independent.
   * Run them together so a temporary failure in one
   * doesn't kill the entire RateX position.
   */
  const [
    portfolioResult,
    accountsResult,
  ] =
    await Promise.allSettled([
      getJupiterPortfolioRatex(
        walletAddress
      ),

      getWalletTokenAccounts(
        walletAddress
      ),
    ]);

  let portfolio =
    null;

  if (
    portfolioResult.status ===
    "fulfilled"
  ) {
    portfolio =
      portfolioResult.value;
  } else {
    console.warn(
      "RateX Jupiter Portfolio lookup failed:",
      portfolioResult.reason
    );
  }

  let rpcPosition = {
    quantity: 0,
    decimals: 0,
  };

  if (
    accountsResult.status ===
    "fulfilled"
  ) {
    rpcPosition =
      getRpcPtonycPosition(
        accountsResult.value
      );
  } else {
    console.warn(
      "RateX Solana balance lookup failed:",
      accountsResult.reason
    );
  }

  /*
   * Prefer the on-chain amount because that is the
   * actual quantity in your wallet. Jupiter Portfolio
   * is used as a fallback if RPC is unavailable.
   */
  const quantity =
    rpcPosition.quantity > 0
      ? rpcPosition.quantity
      : Number(
          portfolio?.quantity
        ) || 0;

  if (!(quantity > 0)) {
    return {
      walletAddress,

      mint:
        RATEX_PTONYC_MINT,

      quantity: 0,

      priceUsd: 0,

      priceSource:
        "none",

      currentValueUsd:
        0,

      fixedApy:
        RATEX_PTONYC_FIXED_APY,

      apySource:
        "fallback",

      maturity:
        RATEX_PTONYC_MATURITY,

      maturityValueUsd:
        0,

      costBasisUsd:
        RATEX_PTONYC_COST_BASIS_USD,

      earnedUsd: 0,

      projectedProfitUsd:
        0,

      remainingYieldUsd:
        0,

      source:
        "solana_rpc",

      syncedAt:
        new Date()
          .toISOString(),
    };
  }

  let priceUsd =
    Number(
      portfolio?.priceUsd
    ) || 0;

  let priceSource =
    priceUsd > 0
      ? "jupiter_portfolio"
      : "none";

  /*
   * Price V3 is now only a fallback.
   * It is NOT the primary RateX valuation source.
   */
  if (!(priceUsd > 0)) {
    try {
      const prices =
        await jupiterPriceApi.getPrices([
          RATEX_PTONYC_MINT,
        ]);

      priceUsd =
        getUsdPrice(
          prices?.[
            RATEX_PTONYC_MINT
          ]
        );

      if (priceUsd > 0) {
        priceSource =
          "jupiter_price_v3";
      }
    } catch (error) {
      console.warn(
        "RateX Jupiter Price V3 fallback failed:",
        error
      );
    }
  }

  /*
   * Final display fallback only.
   */
  if (!(priceUsd > 0)) {
    priceUsd =
      LAST_KNOWN_PTONYC_PRICE;

    priceSource =
      "ratex_last_known";
  }

  const portfolioApy =
    Number(
      portfolio?.fixedApy
    ) || 0;

  const fixedApy =
    portfolioApy > 0
      ? portfolioApy
      : RATEX_PTONYC_FIXED_APY;

  const apySource =
    portfolioApy > 0
      ? "jupiter_portfolio"
      : "fallback";

  const currentValueUsd =
    quantity *
    priceUsd;

  /*
   * PT tokens redeem 1:1 at maturity.
   */
  const maturityValueUsd =
    quantity;

  const earnedUsd =
    Math.max(
      0,
      currentValueUsd -
        RATEX_PTONYC_COST_BASIS_USD
    );

  const projectedProfitUsd =
    Math.max(
      0,
      maturityValueUsd -
        RATEX_PTONYC_COST_BASIS_USD
    );

  const remainingYieldUsd =
    Math.max(
      0,
      maturityValueUsd -
        currentValueUsd
    );

  return {
    walletAddress,

    mint:
      RATEX_PTONYC_MINT,

    quantity,

    priceUsd,

    priceSource,

    currentValueUsd,

    fixedApy,

    apySource,

    maturity:
      RATEX_PTONYC_MATURITY,

    maturityValueUsd,

    costBasisUsd:
      RATEX_PTONYC_COST_BASIS_USD,

    earnedUsd,

    projectedProfitUsd,

    remainingYieldUsd,

    source:
      priceSource ===
      "jupiter_portfolio"
        ? "jupiter_portfolio+solana_rpc"
        : "solana_rpc",

    syncedAt:
      new Date()
        .toISOString(),
  };
}