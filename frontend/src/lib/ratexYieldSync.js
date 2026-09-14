import { proxyFetch } from "./cors-proxy";
import { jupiterPriceApi } from "./external-apis";

export const RATEX_WALLET =
  "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM";

export const RATEX_PTONYC_MINT =
  "7FbWfjanKYP9wQQjdDboLZFHiBQaCfhH8JBnazSx9bD5";

export const RATEX_PTONYC_FIXED_APY =
  13.207;

export const RATEX_PTONYC_MATURITY =
  "2026-09-29T00:00:00-07:00";

export const RATEX_PTONYC_COST_BASIS_USD =
  600;

const RATEX_SECURITY_ID =
  "ONyc-2609";

const TOKEN_PROGRAM_ID =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const LAST_KNOWN_PTONYC_PRICE =
  0.99385;

function toNumber(value) {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}

function getUsdPrice(value) {
  if (
    Number.isFinite(
      Number(value)
    )
  ) {
    return Number(value);
  }

  return Number(
    value?.usdPrice ??
      value?.price ??
      value?.priceUsd ??
      0
  );
}

function normalizeRatexApy(value) {
  const raw =
    toNumber(value);

  if (!(raw > 0)) {
    return 0;
  }

  return raw <= 1
    ? raw * 100
    : raw;
}

function buildRatexCid() {
  const hex =
    "0123456789abcdef";

  const makePart =
    () =>
      Array.from(
        {
          length: 4,
        },
        () =>
          hex[
            Math.floor(
              Math.random() *
                hex.length
            )
          ]
      ).join("");

  return Array.from(
    {
      length: 12,
    },
    makePart
  ).join("-");
}

async function getWalletPtonycQuantity(
  walletAddress
) {
  const response =
    await proxyFetch(
      "/solana/rpc",
      {
        method:
          "POST",

        cache:
          "no-store",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            jsonrpc:
              "2.0",

            id:
              Date.now(),

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
        .catch(
          () => ""
        );

    throw new Error(
      `Solana RPC returned ${response.status}: ${detail.slice(
        0,
        180
      )}`
    );
  }

  const payload =
    await response.json();

  if (payload?.error) {
    throw new Error(
      payload.error
        ?.message ||
        "Solana RPC returned an error."
    );
  }

  const accounts =
    Array.isArray(
      payload?.result
        ?.value
    )
      ? payload.result
          .value
      : [];

  const tokenAccount =
    accounts.find(
      (
        entry
      ) =>
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

  return (
    Number(
      tokenAmount
        ?.uiAmountString ??
        tokenAmount
          ?.uiAmount ??
        0
    ) || 0
  );
}

function findPtonycAsset(value) {
  if (!value) {
    return null;
  }

  if (
    Array.isArray(
      value
    )
  ) {
    for (
      const item of
      value
    ) {
      const found =
        findPtonycAsset(
          item
        );

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (
    typeof value !==
    "object"
  ) {
    return null;
  }

  const data =
    value?.data;

  if (
    data &&
    typeof data ===
      "object" &&
    String(
      data?.address ??
        data?.mint ??
        ""
    ) ===
      RATEX_PTONYC_MINT &&
    Number(
      data?.price
    ) >
      0
  ) {
    return value;
  }

  for (
    const child of
    Object.values(value)
  ) {
    const found =
      findPtonycAsset(
        child
      );

    if (found) {
      return found;
    }
  }

  return null;
}

async function getJupiterPortfolioPtonycPrice(
  walletAddress
) {
  const params =
    new URLSearchParams({
      platforms:
        "ratex",

      _:
        String(
          Date.now()
        ),
    });

  const response =
    await proxyFetch(
      `/jupiter-portfolio/portfolio/v1/positions/${encodeURIComponent(
        walletAddress
      )}?${params.toString()}`,
      {
        method:
          "GET",

        cache:
          "no-store",

        headers: {
          Accept:
            "application/json",
        },
      }
    );

  if (!response.ok) {
    const detail =
      await response
        .text()
        .catch(
          () => ""
        );

    throw new Error(
      `Jupiter Portfolio returned ${response.status}: ${detail.slice(
        0,
        180
      )}`
    );
  }

  const payload =
    await response.json();

  const asset =
    findPtonycAsset(
      payload?.elements ||
        payload
    );

  const priceUsd =
    Number(
      asset?.data
        ?.price
    ) || 0;

  if (
    !(priceUsd > 0)
  ) {
    throw new Error(
      "Jupiter Portfolio did not return a live PTONyc price."
    );
  }

  return {
    priceUsd,

    portfolioAmount:
      Number(
        asset?.data
          ?.amount
      ) || 0,

    portfolioValueUsd:
      Number(
        asset?.value
      ) || 0,
  };
}

async function getJupiterPriceFallback() {
  try {
    const prices =
      await jupiterPriceApi.getPrices(
        [
          RATEX_PTONYC_MINT,
        ]
      );

    return (
      getUsdPrice(
        prices?.[
          RATEX_PTONYC_MINT
        ]
      ) || 0
    );
  } catch (
    error
  ) {
    console.warn(
      "RateX Jupiter Price V3 fallback failed:",
      error
    );

    return 0;
  }
}

async function getRatexLiveApy() {
  const response =
    await proxyFetch(
      "/ratex/",
      {
        method:
          "POST",

        cache:
          "no-store",

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            serverName:
              "MDSvr",

            method:
              "queryTrade",

            content: {
              cid:
                buildRatexCid(),
            },
          }),
      }
    );

  if (!response.ok) {
    return 0;
  }

  const payload =
    await response.json();

  const data =
    payload?.data ??
    payload;

  const trades =
    Array.isArray(
      data
    )
      ? data
      : (
          data &&
          typeof data ===
            "object"
        )
        ? Object.values(
            data
          )
        : [];

  const market =
    trades.find(
      (
        trade
      ) =>
        String(
          trade?.SecurityID ??
            ""
        )
          .trim()
          .toLowerCase() ===
        RATEX_SECURITY_ID.toLowerCase()
    ) ||
    trades.find(
      (
        trade
      ) => {
        const id =
          String(
            trade?.SecurityID ??
              ""
          ).toLowerCase();

        return (
          id.includes(
            "onyc"
          ) &&
          id.endsWith(
            "-2609"
          )
        );
      }
    );

  return normalizeRatexApy(
    market?.Yield
  );
}

export async function getRatexPtonycSnapshot(
  walletAddress =
    RATEX_WALLET
) {
  const [
    quantityResult,
    portfolioResult,
    apyResult,
  ] =
    await Promise.allSettled(
      [
        getWalletPtonycQuantity(
          walletAddress
        ),

        getJupiterPortfolioPtonycPrice(
          walletAddress
        ),

        getRatexLiveApy(),
      ]
    );

  if (
    quantityResult.status !==
    "fulfilled"
  ) {
    throw quantityResult.reason;
  }

  const quantity =
    Number(
      quantityResult.value
    ) || 0;

  if (!(quantity > 0)) {
    return {
      walletAddress,

      mint:
        RATEX_PTONYC_MINT,

      securityId:
        RATEX_SECURITY_ID,

      quantity:
        0,

      priceUsd:
        0,

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

      earnedUsd:
        0,

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
    0;

  let priceSource =
    "none";

  let portfolioAmount =
    0;

  let portfolioValueUsd =
    0;

  if (
    portfolioResult.status ===
    "fulfilled"
  ) {
    priceUsd =
      Number(
        portfolioResult
          .value
          ?.priceUsd
      ) || 0;

    portfolioAmount =
      Number(
        portfolioResult
          .value
          ?.portfolioAmount
      ) || 0;

    portfolioValueUsd =
      Number(
        portfolioResult
          .value
          ?.portfolioValueUsd
      ) || 0;

    if (
      priceUsd >
      0
    ) {
      priceSource =
        "jupiter_portfolio";
    }
  } else {
    console.warn(
      "RateX Jupiter Portfolio price lookup failed:",
      portfolioResult.reason
    );
  }

  /*
   * Direct Jupiter token price fallback.
   *
   * Still no PT/YT calculations.
   */
  if (
    !(priceUsd > 0)
  ) {
    priceUsd =
      await getJupiterPriceFallback();

    if (
      priceUsd >
      0
    ) {
      priceSource =
        "jupiter_price_v3";
    }
  }

  /*
   * Only used if both live price sources fail.
   */
  if (
    !(priceUsd > 0)
  ) {
    priceUsd =
      LAST_KNOWN_PTONYC_PRICE;

    priceSource =
      "last_known";
  }

  const fixedApy =
    apyResult.status ===
      "fulfilled" &&
    Number(
      apyResult.value
    ) >
      0
      ? Number(
          apyResult.value
        )
      : RATEX_PTONYC_FIXED_APY;

  const apySource =
    apyResult.status ===
      "fulfilled" &&
    Number(
      apyResult.value
    ) >
      0
      ? "ratex_live"
      : "fallback";

  /*
   * THIS IS THE ENTIRE BALANCE CALCULATION:
   *
   * PTONyc quantity × live PTONyc price
   *
   * Nothing else affects the RateX card balance.
   */
  const currentValueUsd =
    quantity *
    priceUsd;

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

    securityId:
      RATEX_SECURITY_ID,

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

    /*
     * Diagnostic values so we can verify Jupiter and
     * Solana agree on the position if needed.
     */
    portfolioAmount,

    portfolioValueUsd,

    source:
      `${priceSource}+solana_rpc`,

    syncedAt:
      new Date()
        .toISOString(),
  };
}