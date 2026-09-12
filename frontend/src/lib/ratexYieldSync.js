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

const USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const USDC_DECIMALS = 6;

const LAST_KNOWN_PTONYC_PRICE = 0.99229;

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

function buildRatexCid() {
  const hex =
    "0123456789abcdef";

  const part = () =>
    Array.from(
      { length: 4 },
      () =>
        hex[
          Math.floor(
            Math.random() *
              hex.length
          )
        ]
    ).join("");

  return Array.from(
    { length: 12 },
    part
  ).join("-");
}

async function ratexRpc(
  serverName,
  method,
  content = {}
) {
  const response =
    await proxyFetch(
      "/ratex/",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body:
          JSON.stringify({
            serverName,

            method,

            content: {
              cid:
                buildRatexCid(),

              ...content,
            },
          }),
      }
    );

  const raw =
    await response.text();

  let payload = null;

  try {
    payload =
      raw
        ? JSON.parse(raw)
        : null;
  } catch {
    throw new Error(
      `RateX returned non-JSON content: ${raw.slice(
        0,
        180
      )}`
    );
  }

  if (!response.ok) {
    throw new Error(
      payload?.detail ||
        payload?.message ||
        `RateX returned HTTP ${response.status}`
    );
  }

  if (
    payload &&
    typeof payload ===
      "object" &&
    !Array.isArray(
      payload
    ) &&
    payload.code != null &&
    Number(
      payload.code
    ) !== 0
  ) {
    throw new Error(
      payload.msg ||
        payload.message ||
        `RateX RPC ${method} failed with code ${payload.code}`
    );
  }

  return (
    payload?.data ??
    payload
  );
}

function normalizeText(
  value
) {
  return String(
    value ?? ""
  )
    .trim()
    .toLowerCase();
}

function getSecurityId(
  row
) {
  return String(
    row?.symbol ??
      row?.symbol_name ??
      row?.SecurityID ??
      ""
  ).trim();
}

function getTargetRatexSuffix() {
  const maturity =
    new Date(
      RATEX_PTONYC_MATURITY
    );

  return `${String(
    maturity.getFullYear()
  ).slice(-2)}${String(
    maturity.getMonth() + 1
  ).padStart(
    2,
    "0"
  )}`;
}

async function getRatexLiveMarket() {
  const snapshot =
    await ratexRpc(
      "MDSvr",
      "queryTrade"
    );

  const trades =
    Array.isArray(
      snapshot
    )
      ? snapshot
      : [];

  const targetSuffix =
    getTargetRatexSuffix();

  const trade =
    trades.find(
      (row) => {
        const securityId =
          getSecurityId(
            row
          );

        return (
          normalizeText(
            securityId
          ).includes(
            "onyc"
          ) &&
          securityId.endsWith(
            `-${targetSuffix}`
          )
        );
      }
    );

  if (!trade) {
    throw new Error(
      `Could not find the live RateX ONyc-${targetSuffix} market.`
    );
  }

  const securityId =
    getSecurityId(
      trade
    );

  const ytPrice =
    Number(
      trade?.LastPrice
    );

  if (
    !Number.isFinite(
      ytPrice
    ) ||
    ytPrice < 0 ||
    ytPrice > 1
  ) {
    throw new Error(
      `RateX returned an invalid ONyc YT price for ${securityId}.`
    );
  }

  /*
   * RateX reports the YT market price.
   * PT price = 1 - YT price.
   */
  const ptPrice =
    1 - ytPrice;

  const rawYield =
    Number(
      trade?.Yield
    );

  const fixedApy =
    Number.isFinite(
      rawYield
    )
      ? rawYield <= 1
        ? rawYield *
          100
        : rawYield
      : 0;

  return {
    securityId,

    priceUsd:
      ptPrice,

    fixedApy,

    ytPrice,

    indexPrice:
      Number(
        trade?.IndexPrice
      ) || 0,

    availableLiquidity:
      Number(
        trade?.AvaLiquidity
      ) || 0,
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

  if (
    !response.ok
  ) {
    const detail =
      await response
        .text()
        .catch(
          () => ""
        );

    throw new Error(
      `Solana RPC returned ${response.status}: ${detail.slice(
        0,
        160
      )}`
    );
  }

  const payload =
    await response.json();

  if (
    payload?.error
  ) {
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

async function getJupiterQuotePrice(
  decimals = 6
) {
  const inputAmount =
    BigInt(10) **
    BigInt(
      Math.max(
        0,
        Number(
          decimals
        ) || 0
      )
    );

  const params =
    new URLSearchParams({
      inputMint:
        RATEX_PTONYC_MINT,

      outputMint:
        USDC_MINT,

      amount:
        inputAmount.toString(),

      slippageBps:
        "50",

      restrictIntermediateTokens:
        "true",
    });

  const response =
    await proxyFetch(
      `/jupiter/swap/v1/quote?${params.toString()}`
    );

  if (
    !response.ok
  ) {
    const detail =
      await response
        .text()
        .catch(
          () => ""
        );

    throw new Error(
      `Jupiter quote returned ${response.status}: ${detail.slice(
        0,
        160
      )}`
    );
  }

  const quote =
    await response.json();

  const outAmount =
    Number(
      quote?.outAmount
    ) || 0;

  if (
    !(outAmount > 0)
  ) {
    return 0;
  }

  return (
    outAmount /
    10 **
      USDC_DECIMALS
  );
}

export async function getRatexPtonycSnapshot(
  walletAddress =
    RATEX_WALLET
) {
  const accounts =
    await getWalletTokenAccounts(
      walletAddress
    );

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

  const quantity =
    Number(
      tokenAmount
        ?.uiAmountString ??
        tokenAmount
          ?.uiAmount ??
        0
    ) || 0;

  const decimals =
    Number(
      tokenAmount
        ?.decimals
    ) || 0;

  if (
    !(quantity > 0)
  ) {
    return {
      walletAddress,

      mint:
        RATEX_PTONYC_MINT,

      quantity: 0,

      priceUsd: 0,

      currentValueUsd:
        0,

      fixedApy:
        RATEX_PTONYC_FIXED_APY,

      maturity:
        RATEX_PTONYC_MATURITY,

      maturityValueUsd:
        0,

      earnedUsd: 0,

      projectedProfitUsd:
        0,

      remainingYieldUsd:
        0,

      source:
        "solana_rpc",

      priceSource:
        "none",

      syncedAt:
        new Date()
          .toISOString(),
    };
  }

  let priceUsd =
    0;

  let fixedApy =
    RATEX_PTONYC_FIXED_APY;

  let priceSource =
    "none";

  let ratexMarket =
    null;

  /*
   * PRIMARY:
   * RateX's own live
   * market feed.
   */
  try {
    ratexMarket =
      await getRatexLiveMarket();

    if (
      ratexMarket
        .priceUsd >
      0
    ) {
      priceUsd =
        ratexMarket
          .priceUsd;

      priceSource =
        "ratex_live";
    }

    if (
      ratexMarket
        .fixedApy >
      0
    ) {
      fixedApy =
        ratexMarket
          .fixedApy;
    }
  } catch (
    error
  ) {
    console.warn(
      "RateX live market lookup failed:",
      error
    );
  }

  /*
   * FALLBACK 1:
   * Jupiter price API.
   */
  if (
    !(priceUsd > 0)
  ) {
    try {
      const prices =
        await jupiterPriceApi.getPrices(
          [
            RATEX_PTONYC_MINT,
          ]
        );

      priceUsd =
        getUsdPrice(
          prices?.[
            RATEX_PTONYC_MINT
          ]
        );

      if (
        priceUsd >
        0
      ) {
        priceSource =
          "jupiter_price";
      }
    } catch (
      error
    ) {
      console.warn(
        "RateX PTONyc Jupiter price lookup failed:",
        error
      );
    }
  }

  /*
   * FALLBACK 2:
   * Jupiter swap quote.
   */
  if (
    !(priceUsd > 0)
  ) {
    try {
      priceUsd =
        await getJupiterQuotePrice(
          decimals
        );

      if (
        priceUsd >
        0
      ) {
        priceSource =
          "jupiter_quote";
      }
    } catch (
      error
    ) {
      console.warn(
        "RateX PTONyc Jupiter quote lookup failed:",
        error
      );
    }
  }

  /*
   * LAST RESORT.
   */
  if (
    !(priceUsd > 0)
  ) {
    priceUsd =
      LAST_KNOWN_PTONYC_PRICE;

    priceSource =
      "ratex_last_known";
  }

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

    quantity,

    priceUsd,

    priceSource,

    currentValueUsd,

    fixedApy,

    maturity:
      RATEX_PTONYC_MATURITY,

    maturityValueUsd,

    costBasisUsd:
      RATEX_PTONYC_COST_BASIS_USD,

    earnedUsd,

    projectedProfitUsd,

    remainingYieldUsd,

    ratexSecurityId:
      ratexMarket
        ?.securityId ||
      null,

    ratexYtPrice:
      ratexMarket
        ?.ytPrice ??
      null,

    ratexIndexPrice:
      ratexMarket
        ?.indexPrice ??
      null,

    source:
      priceSource ===
      "ratex_live"
        ? "solana_rpc+ratex_rpc"
        : "solana_rpc",

    syncedAt:
      new Date()
        .toISOString(),
  };
}