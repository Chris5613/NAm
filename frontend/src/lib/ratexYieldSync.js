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

function getUsdPrice(
  value
) {
  if (
    Number.isFinite(
      Number(value)
    )
  ) {
    return Number(
      value
    );
  }

  return Number(
    value?.usdPrice ??
      value?.price ??
      value?.priceUsd ??
      0
  );
}

function isValidYtPrice(
  value
) {
  const number =
    toNumber(
      value
    );

  return (
    number > 0 &&
    number < 1
  );
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

async function ratexRpc(
  serverName,
  method,
  content = {}
) {
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

  let payload =
    null;

  try {
    payload =
      raw
        ? JSON.parse(
            raw
          )
        : null;
  } catch {
    throw new Error(
      `RateX returned non-JSON data: ${raw.slice(
        0,
        200
      )}`
    );
  }

  if (
    !response.ok
  ) {
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
        `RateX RPC ${method} returned code ${payload.code}`
    );
  }

  return (
    payload?.data ??
    payload
  );
}

function normalizeRatexApy(
  value
) {
  const raw =
    toNumber(
      value
    );

  if (
    !(raw > 0)
  ) {
    return 0;
  }

  if (
    raw <= 1
  ) {
    return (
      raw *
      100
    );
  }

  return raw;
}

function getSecurityId(
  trade
) {
  return String(
    trade?.SecurityID ??
      trade?.securityId ??
      trade?.symbol ??
      ""
  )
    .trim()
    .toLowerCase();
}

async function getRatexLiveMarket() {
  const result =
    await ratexRpc(
      "MDSvr",
      "queryTrade"
    );

  const trades =
    Array.isArray(
      result
    )
      ? result
      : Array.isArray(
          result?.trades
        )
        ? result.trades
        : Array.isArray(
            result?.data
          )
          ? result.data
          : (
              result &&
              typeof result ===
                "object"
            )
            ? Object.values(
                result
              )
            : [];

  if (
    !trades.length
  ) {
    throw new Error(
      "RateX queryTrade returned no markets."
    );
  }

  const exactId =
    RATEX_SECURITY_ID.toLowerCase();

  let candidates =
    trades.filter(
      (
        trade
      ) =>
        getSecurityId(
          trade
        ) === exactId
    );

  if (
    !candidates.length
  ) {
    candidates =
      trades.filter(
        (
          trade
        ) => {
          const id =
            getSecurityId(
              trade
            );

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
  }

  if (
    !candidates.length
  ) {
    throw new Error(
      `RateX could not find ${RATEX_SECURITY_ID}.`
    );
  }

  /*
   * Prefer the RateX row that actually has a valid
   * SettlePrice.
   *
   * RateX uses SettlePrice for the YT settlement price.
   * LastPrice is NOT what we want for the displayed
   * PTONyc valuation.
   */
  const market =
    candidates.find(
      (
        trade
      ) =>
        isValidYtPrice(
          trade?.SettlePrice
        )
    ) ||
    candidates.find(
      (
        trade
      ) =>
        isValidYtPrice(
          trade?.LastPrice
        )
    ) ||
    candidates[0];

  const settlePrice =
    toNumber(
      market?.SettlePrice
    );

  const lastPrice =
    toNumber(
      market?.LastPrice
    );

  let ytPrice =
    0;

  let marketPriceSource =
    "none";

  if (
    isValidYtPrice(
      settlePrice
    )
  ) {
    ytPrice =
      settlePrice;

    marketPriceSource =
      "ratex_settle_price";
  } else if (
    isValidYtPrice(
      lastPrice
    )
  ) {
    /*
     * LastPrice is only a fallback.
     */
    ytPrice =
      lastPrice;

    marketPriceSource =
      "ratex_last_price";
  }

  if (
    !(ytPrice > 0)
  ) {
    throw new Error(
      `RateX returned no valid YT price for ${RATEX_SECURITY_ID}.`
    );
  }

  /*
   * PT + YT = 1
   *
   * Example:
   *
   * YT = 0.00615
   * PT = 1 - 0.00615
   * PT = 0.99385
   */
  const ptPrice =
    1 -
    ytPrice;

  if (
    !(ptPrice > 0) ||
    ptPrice > 1
  ) {
    throw new Error(
      `RateX returned invalid derived PT price ${ptPrice}.`
    );
  }

  const fixedApy =
    normalizeRatexApy(
      market?.Yield
    );

  return {
    securityId:
      String(
        market?.SecurityID ??
          RATEX_SECURITY_ID
      ),

    priceUsd:
      ptPrice,

    ptPrice,

    ytPrice,

    settlePrice,

    lastPrice,

    marketPriceSource,

    fixedApy,

    indexPrice:
      toNumber(
        market?.IndexPrice
      ),

    availableLiquidity:
      toNumber(
        market?.AvaLiquidity
      ),

    raw:
      market,
  };
}

async function getWalletTokenAccounts(
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
        200
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
        "Solana RPC returned an error."
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

async function getJupiterFallbackPrice() {
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
      "RateX Jupiter fallback price lookup failed:",
      error
    );

    return 0;
  }
}

export async function getRatexPtonycSnapshot(
  walletAddress =
    RATEX_WALLET
) {
  const [
    accountsResult,
    ratexResult,
  ] =
    await Promise.allSettled(
      [
        getWalletTokenAccounts(
          walletAddress
        ),

        getRatexLiveMarket(),
      ]
    );

  let quantity =
    0;

  if (
    accountsResult.status ===
    "fulfilled"
  ) {
    quantity =
      getRpcPtonycPosition(
        accountsResult.value
      ).quantity;
  } else {
    console.warn(
      "RateX Solana balance lookup failed:",
      accountsResult.reason
    );
  }

  if (
    !(quantity > 0)
  ) {
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

  let liveMarket =
    null;

  let priceUsd =
    0;

  let fixedApy =
    RATEX_PTONYC_FIXED_APY;

  let priceSource =
    "none";

  let apySource =
    "fallback";

  if (
    ratexResult.status ===
    "fulfilled"
  ) {
    liveMarket =
      ratexResult.value;

    if (
      Number(
        liveMarket
          ?.priceUsd
      ) >
      0
    ) {
      priceUsd =
        Number(
          liveMarket
            .priceUsd
        );

      priceSource =
        liveMarket
          ?.marketPriceSource ||
        "ratex_live";
    }

    if (
      Number(
        liveMarket
          ?.fixedApy
      ) >
      0
    ) {
      fixedApy =
        Number(
          liveMarket
            .fixedApy
        );

      apySource =
        "ratex_live";
    }
  } else {
    console.warn(
      "RateX live market lookup failed:",
      ratexResult.reason
    );
  }

  /*
   * Jupiter only runs if RateX itself fails.
   */
  if (
    !(priceUsd > 0)
  ) {
    const jupiterPrice =
      await getJupiterFallbackPrice();

    if (
      jupiterPrice >
      0
    ) {
      priceUsd =
        jupiterPrice;

      priceSource =
        "jupiter_price_v3";
    }
  }

  /*
   * Absolute final fallback.
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

    securityId:
      liveMarket
        ?.securityId ||
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

    ratexPtPrice:
      liveMarket
        ?.ptPrice ??
      null,

    ratexYtPrice:
      liveMarket
        ?.ytPrice ??
      null,

    ratexSettlePrice:
      liveMarket
        ?.settlePrice ??
      null,

    ratexLastPrice:
      liveMarket
        ?.lastPrice ??
      null,

    ratexIndexPrice:
      liveMarket
        ?.indexPrice ??
      null,

    ratexLiquidity:
      liveMarket
        ?.availableLiquidity ??
      null,

    source:
      priceSource.startsWith(
        "ratex_"
      )
        ? "solana_rpc+ratex_live"
        : "solana_rpc",

    syncedAt:
      new Date()
        .toISOString(),
  };
}