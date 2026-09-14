import { proxyFetch } from "./cors-proxy";

export const LOOPSCALE_WALLET =
  "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM";

const ONYC_MINT =
  "5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5";

const USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const ONYC_DECIMALS = 9;

const PAGE_SIZE = 25;

function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function unixToIso(value) {
  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return null;
  }

  const milliseconds =
    number > 10_000_000_000
      ? number
      : number * 1000;

  const date =
    new Date(milliseconds);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date.toISOString();
}

function normalizeItems(payload) {
  if (
    Array.isArray(
      payload?.items
    )
  ) {
    return payload.items;
  }

  return [];
}

function isMatchingOnycLoop(
  item,
  walletAddress
) {
  if (!item) {
    return false;
  }

  if (
    item?.loan?.closed ===
    true
  ) {
    return false;
  }

  if (
    item?.loan?.borrower !==
    walletAddress
  ) {
    return false;
  }

  if (
    Number(
      item?.loanType
    ) !== 2
  ) {
    return false;
  }

  const ledgers =
    Array.isArray(
      item?.ledgers
    )
      ? item.ledgers
      : [];

  const collateral =
    Array.isArray(
      item?.collateral
    )
      ? item.collateral
      : [];

  const hasLoopLedger =
    ledgers.some(
      (ledger) =>
        Number(
          ledger?.isLoop
        ) === 1
    );

  const hasUsdcPrincipal =
    ledgers.some(
      (ledger) =>
        ledger
          ?.principalMint ===
        USDC_MINT
    );

  const hasOnycCollateral =
    collateral.some(
      (asset) =>
        asset?.assetMint ===
          ONYC_MINT ||
        asset
          ?.assetIdentifier ===
          ONYC_MINT
    );

  return (
    hasLoopLedger &&
    hasUsdcPrincipal &&
    hasOnycCollateral
  );
}

function chooseLoop(
  items,
  walletAddress
) {
  const exact =
    items.find(
      (item) =>
        isMatchingOnycLoop(
          item,
          walletAddress
        )
    );

  if (exact) {
    return exact;
  }

  /*
   * Safe fallback if Loopscale changes one
   * of the identifying fields later.
   */
  return (
    items.find(
      (item) =>
        item?.loan
          ?.borrower ===
          walletAddress &&
        item?.loan
          ?.closed !== true
    ) ||
    null
  );
}

function getOnycCollateral(
  item
) {
  const collateral =
    Array.isArray(
      item?.collateral
    )
      ? item.collateral
      : [];

  return (
    collateral.find(
      (asset) =>
        asset?.assetMint ===
          ONYC_MINT ||
        asset
          ?.assetIdentifier ===
          ONYC_MINT
    ) ||
    collateral[0] ||
    null
  );
}

function getLoopLedger(
  item
) {
  const ledgers =
    Array.isArray(
      item?.ledgers
    )
      ? item.ledgers
      : [];

  return (
    ledgers.find(
      (ledger) =>
        Number(
          ledger?.isLoop
        ) === 1
    ) ||
    ledgers[0] ||
    null
  );
}

function getOnycAmount(
  item
) {
  const collateral =
    getOnycCollateral(
      item
    );

  const rawAmount =
    toNumber(
      collateral?.amount
    );

  return (
    rawAmount /
    10 ** ONYC_DECIMALS
  );
}

function getOnycPriceUsd(
  item
) {
  const quantity =
    getOnycAmount(
      item
    );

  const collateralUsd =
    toNumber(
      item?.collateralUsd
    );

  if (
    quantity <= 0
  ) {
    return 0;
  }

  return (
    collateralUsd /
    quantity
  );
}

function getPositionValueUsd(
  item
) {
  /*
   * Your equity is:
   *
   * collateral
   * - borrowed principal
   * - accrued borrow interest
   */
  return Math.max(
    0,
    toNumber(
      item?.collateralUsd
    ) -
      toNumber(
        item?.principalUsd
      ) -
      toNumber(
        item
          ?.interestAccruedUsd
      )
  );
}

function getDisplayedPnlUsd(
  item
) {
  /*
   * IMPORTANT:
   *
   * Loopscale returns two different P&L numbers.
   *
   * item.pnlUsd
   * ≈ $0.81
   *
   * item.pnl.usdPnl
   * ≈ $1.98
   *
   * The second one matches the P&L shown by the
   * Loopscale UI, so that is what NAm should use.
   */
  const uiPnl =
    Number(
      item?.pnl
        ?.usdPnl
    );

  if (
    Number.isFinite(
      uiPnl
    )
  ) {
    return uiPnl;
  }

  const fallback =
    Number(
      item?.pnlUsd
    );

  return Number.isFinite(
    fallback
  )
    ? fallback
    : 0;
}

function getNetDailyIncome(
  aggregate,
  item
) {
  if (aggregate) {
    return (
      toNumber(
        aggregate
          ?.dailyCollateralYieldUsd
      ) -
      toNumber(
        aggregate
          ?.dailyInterestUsd
      ) -
      toNumber(
        aggregate
          ?.dailyPrincipalYieldUsd
      )
    );
  }

  /*
   * Fallback calculation if aggregate disappears.
   */
  const collateralUsd =
    toNumber(
      item?.collateralUsd
    );

  const principalUsd =
    toNumber(
      item?.principalUsd
    );

  const supplyApy =
    toNumber(
      item
        ?.collateralYieldPct
    );

  const ledger =
    getLoopLedger(
      item
    );

  /*
   * Loopscale ledger APY:
   *
   * 83300 = 8.33%
   *
   * scale = 1,000,000
   */
  const borrowApy =
    toNumber(
      ledger?.apy
    ) /
    1_000_000;

  const yearlySupply =
    collateralUsd *
    supplyApy;

  const yearlyBorrow =
    principalUsd *
    borrowApy;

  return (
    yearlySupply -
    yearlyBorrow
  ) / 365;
}

function getNetApy(
  aggregate,
  item,
  positionValueUsd
) {
  if (
    positionValueUsd <= 0
  ) {
    return 0;
  }

  const dailyNetIncome =
    getNetDailyIncome(
      aggregate,
      item
    );

  return (
    (
      dailyNetIncome *
      365
    ) /
    positionValueUsd
  ) * 100;
}

export async function getLoopscaleOnycSnapshot(
  walletAddress =
    LOOPSCALE_WALLET
) {
  const response =
    await proxyFetch(
      "/loopscale/v1/markets/loans/info",
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
            borrowers: [
              walletAddress,
            ],

            includePnl:
              true,

            /*
             * Loopscale pagination starts at 0.
             *
             * This was the major issue in the
             * earlier implementation.
             */
            page:
              0,

            pageSize:
              PAGE_SIZE,
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
        ? JSON.parse(raw)
        : null;
  } catch {
    throw new Error(
      `Loopscale returned non-JSON data: ${raw.slice(
        0,
        180
      )}`
    );
  }

  if (!response.ok) {
    throw new Error(
      payload?.detail ||
        payload?.error
          ?.message ||
        payload?.message ||
        `Loopscale returned HTTP ${response.status}`
    );
  }

  const items =
    normalizeItems(
      payload
    );

  if (!items.length) {
    throw new Error(
      "Loopscale returned no loans for this wallet."
    );
  }

  const item =
    chooseLoop(
      items,
      walletAddress
    );

  if (!item) {
    throw new Error(
      "Loopscale returned loans, but the ONyc Loop could not be identified."
    );
  }

  const aggregate =
    payload?.aggregate ||
    null;

  const positionValueUsd =
    getPositionValueUsd(
      item
    );

  const onycPriceUsd =
    getOnycPriceUsd(
      item
    );

  const suppliedOnyc =
    getOnycAmount(
      item
    );

  /*
   * This matches Loopscale's displayed
   * net-position-equivalent ONyc amount.
   */
  const quantity =
    onycPriceUsd > 0
      ? positionValueUsd /
        onycPriceUsd
      : 0;

  const pnlUsd =
    getDisplayedPnlUsd(
      item
    );

  const dailyNetYieldUsd =
    getNetDailyIncome(
      aggregate,
      item
    );

  const netApy =
    getNetApy(
      aggregate,
      item,
      positionValueUsd
    );

  const ledger =
    getLoopLedger(
      item
    );

  const suppliedApy =
    toNumber(
      item
        ?.collateralYieldPct
    ) * 100;

  const borrowedApy =
    (
      toNumber(
        ledger?.apy
      ) /
      1_000_000
    ) * 100;

  const snapshot = {
    walletAddress,

    loanAddress:
      String(
        item?.loan
          ?.address ||
          ""
      ),

    loanId:
      item?.loan
        ?.id ??
      null,

    asset:
      "ONyc",

    strategy:
      "ONyc Loop",

    quantity,

    priceUsd:
      onycPriceUsd,

    positionValueUsd,

    pnlUsd,

    netApy,

    startTime:
      unixToIso(
        item?.loan
          ?.startTime
      ),

    collateralUsd:
      toNumber(
        item?.collateralUsd
      ),

    principalUsd:
      toNumber(
        item?.principalUsd
      ),

    interestAccruedUsd:
      toNumber(
        item
          ?.interestAccruedUsd
      ),

    pendingYieldUsd:
      toNumber(
        item
          ?.pendingYieldUsd
      ),

    dailyNetYieldUsd,

    suppliedApy,

    borrowedApy,

    suppliedOnyc,

    borrowedUsdc:
      toNumber(
        item?.principalUsd
      ),

    health:
      null,

    source:
      "loopscale",

    syncedAt:
      new Date()
        .toISOString(),

    snapshotTs:
      payload
        ?.snapshotTs ||
      null,

    raw:
      item,
  };

  console.log(
    "[Loopscale] Live snapshot:",
    snapshot
  );

  return snapshot;
}