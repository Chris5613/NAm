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

const TOKEN_PROGRAM_ID =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const USDC_DECIMALS = 6;

// Only used if both live Jupiter price methods fail.
const LAST_KNOWN_PTONYC_PRICE =
  0.99229;

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
        body: JSON.stringify({
          jsonrpc: "2.0",
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
        160
      )}`
    );
  }

  const payload =
    await response.json();

  if (payload?.error) {
    throw new Error(
      payload.error?.message ||
        "Solana RPC returned an error"
    );
  }

  return Array.isArray(
    payload?.result?.value
  )
    ? payload.result.value
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
        Number(decimals) ||
          0
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

  if (!response.ok) {
    const detail =
      await response
        .text()
        .catch(() => "");

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

  if (!(outAmount > 0)) {
    return 0;
  }

  return (
    outAmount /
    10 ** USDC_DECIMALS
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
        entry?.account?.data
          ?.parsed?.info
          ?.mint ===
        RATEX_PTONYC_MINT
    );

  const tokenAmount =
    tokenAccount?.account
      ?.data?.parsed?.info
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

  if (!(quantity > 0)) {
    return {
      walletAddress,
      mint:
        RATEX_PTONYC_MINT,

      quantity: 0,
      priceUsd: 0,
      currentValueUsd: 0,

      fixedApy:
        RATEX_PTONYC_FIXED_APY,

      maturity:
        RATEX_PTONYC_MATURITY,

      maturityValueUsd: 0,
      earnedUsd: 0,
      projectedProfitUsd: 0,
      remainingYieldUsd: 0,

      source:
        "solana_rpc",

      syncedAt:
        new Date().toISOString(),
    };
  }

  let priceUsd = 0;

  let priceSource =
    "jupiter_price";

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
  } catch (error) {
    console.warn(
      "RateX PTONyc Jupiter price lookup failed:",
      error
    );
  }

  /*
   * Jupiter's normal price endpoint can miss RateX PT tokens.
   * If that happens, ask Jupiter for a live swap quote for
   * exactly 1 PTONyc -> USDC and use that as the current price.
   */
  if (!(priceUsd > 0)) {
    try {
      priceUsd =
        await getJupiterQuotePrice(
          decimals
        );

      if (priceUsd > 0) {
        priceSource =
          "jupiter_quote";
      }
    } catch (error) {
      console.warn(
        "RateX PTONyc Jupiter quote lookup failed:",
        error
      );
    }
  }

  /*
   * Last resort only so the position still displays if
   * Jupiter is temporarily unavailable.
   */
  if (!(priceUsd > 0)) {
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

    fixedApy:
      RATEX_PTONYC_FIXED_APY,

    maturity:
      RATEX_PTONYC_MATURITY,

    maturityValueUsd,

    costBasisUsd:
      RATEX_PTONYC_COST_BASIS_USD,

    earnedUsd,

    projectedProfitUsd,

    remainingYieldUsd,

    source:
      "solana_rpc",

    syncedAt:
      new Date().toISOString(),
  };
}