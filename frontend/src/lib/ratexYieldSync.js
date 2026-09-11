import { proxyFetch } from "./cors-proxy";
import { jupiterPriceApi } from "./external-apis";

export const RATEX_WALLET = "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM";
export const RATEX_PTONYC_MINT = "7FbWfjanKYP9wQQjdDboLZFHiBQaCfhH8JBnazSx9bD5";
export const RATEX_PTONYC_FIXED_APY = 13.207;
export const RATEX_PTONYC_MATURITY = "2026-09-29T00:00:00-07:00";
export const RATEX_PTONYC_COST_BASIS_USD = 600;

const TOKEN_PROGRAM_ID =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const LAST_KNOWN_PTONYC_PRICE = 0.99285;

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

async function getWalletTokenAccounts(walletAddress) {
  const response = await proxyFetch("/solana/rpc", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        walletAddress,
        {
          programId: TOKEN_PROGRAM_ID,
        },
        {
          encoding: "jsonParsed",
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response
      .text()
      .catch(() => "");

    throw new Error(
      `Solana RPC returned ${response.status}: ${detail.slice(0, 160)}`
    );
  }

  const payload = await response.json();

  if (payload?.error) {
    throw new Error(
      payload.error?.message ||
        "Solana RPC returned an error"
    );
  }

  return Array.isArray(payload?.result?.value)
    ? payload.result.value
    : [];
}

export async function getRatexPtonycSnapshot(
  walletAddress = RATEX_WALLET
) {
  const accounts =
    await getWalletTokenAccounts(walletAddress);

  const tokenAccount = accounts.find(
    (entry) =>
      entry?.account?.data?.parsed?.info?.mint ===
      RATEX_PTONYC_MINT
  );

  const quantity =
    Number(
      tokenAccount?.account?.data?.parsed?.info
        ?.tokenAmount?.uiAmountString ??
        tokenAccount?.account?.data?.parsed?.info
          ?.tokenAmount?.uiAmount ??
        0
    ) || 0;

  if (!(quantity > 0)) {
    return {
      walletAddress,
      mint: RATEX_PTONYC_MINT,

      quantity: 0,
      priceUsd: 0,
      currentValueUsd: 0,

      fixedApy: RATEX_PTONYC_FIXED_APY,
      maturity: RATEX_PTONYC_MATURITY,

      maturityValueUsd: 0,
      earnedUsd: 0,
      projectedProfitUsd: 0,
      remainingYieldUsd: 0,

      source: "solana_rpc",
      syncedAt: new Date().toISOString(),
    };
  }

  let priceUsd = 0;
  let priceSource = "jupiter";

  try {
    const prices =
      await jupiterPriceApi.getPrices([
        RATEX_PTONYC_MINT,
      ]);

    priceUsd = getUsdPrice(
      prices?.[RATEX_PTONYC_MINT]
    );
  } catch (error) {
    console.warn(
      "RateX PTONyc Jupiter price lookup failed:",
      error
    );
  }

  /*
   * Jupiter may not index every RateX PT market.
   *
   * If a live price cannot be found, use the last
   * observed RateX price temporarily.
   *
   * The actual PTONyc quantity is still being read
   * live from the wallet through Solana RPC.
   */
  if (!(priceUsd > 0)) {
    priceUsd = LAST_KNOWN_PTONYC_PRICE;
    priceSource = "ratex_last_known";
  }

  const currentValueUsd =
    quantity * priceUsd;

  /*
   * At maturity, the PT position is expected to
   * converge toward roughly $1-equivalent per PT.
   *
   * Example:
   *
   * 606.27 PTONyc
   * ≈ $606.27 maturity value
   */
  const maturityValueUsd = quantity;

  /*
   * Your original RateX deposit / cost basis.
   *
   * Current earned:
   * current market value - initial cost basis
   */
  const earnedUsd = Math.max(
    0,
    currentValueUsd -
      RATEX_PTONYC_COST_BASIS_USD
  );

  /*
   * Total profit expected once the position reaches
   * maturity.
   */
  const projectedProfitUsd = Math.max(
    0,
    maturityValueUsd -
      RATEX_PTONYC_COST_BASIS_USD
  );

  /*
   * Amount of fixed yield still remaining between
   * today's PT market value and maturity value.
   */
  const remainingYieldUsd = Math.max(
    0,
    maturityValueUsd -
      currentValueUsd
  );

  return {
    walletAddress,
    mint: RATEX_PTONYC_MINT,

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

    source: "solana_rpc",

    syncedAt:
      new Date().toISOString(),
  };
}