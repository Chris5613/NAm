import { proxyFetch } from "./cors-proxy";

export const LOOPSCALE_WALLET =
  "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM";

export const LOOPSCALE_ONYC_STARTED_AT =
  "2026-09-13T00:00:00-07:00";

const LOOPSCALE_PAGE_SIZE =
  25;

function toNumber(
  value
) {
  if (
    typeof value ===
    "string"
  ) {
    const parsed =
      Number(
        value.replace(
          /[^0-9.-]/g,
          ""
        )
      );

    return Number.isFinite(
      parsed
    )
      ? parsed
      : 0;
  }

  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

function firstFinite(
  ...values
) {
  for (
    const value of
    values
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    const parsed =
      typeof value ===
        "string"
        ? Number(
            value.replace(
              /[^0-9.-]/g,
              ""
            )
          )
        : Number(value);

    if (
      Number.isFinite(
        parsed
      )
    ) {
      return parsed;
    }
  }

  return null;
}

function toPercent(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  if (
    typeof value ===
      "string" &&
    value.includes(
      "%"
    )
  ) {
    return (
      Number(
        value.replace(
          /[^0-9.-]/g,
          ""
        )
      ) || 0
    );
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 0;
  }

  return Math.abs(
    number
  ) <= 1
    ? number * 100
    : number;
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

function toIsoFromUnix(
  value
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    ) ||
    !(number > 0)
  ) {
    return null;
  }

  const millis =
    number >
    10_000_000_000
      ? number
      : number * 1000;

  const date =
    new Date(
      millis
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date.toISOString();
}

function latestActualPoint(
  points
) {
  if (
    !Array.isArray(
      points
    ) ||
    !points.length
  ) {
    return null;
  }

  const actual =
    points.filter(
      (
        point
      ) =>
        point?.isProjection !==
        true
    );

  const pool =
    actual.length
      ? actual
      : points;

  return [
    ...pool,
  ].sort(
    (
      a,
      b
    ) =>
      toNumber(
        b?.date
      ) -
      toNumber(
        a?.date
      )
  )[0];
}

/*
 * -------------------------------------------------------
 * LOOPscale direct API
 * -------------------------------------------------------
 */

function normalizeLoopscaleItems(
  payload
) {
  if (
    Array.isArray(
      payload?.items
    )
  ) {
    return payload.items;
  }

  if (
    Array.isArray(
      payload?.loanInfos
    )
  ) {
    return payload.loanInfos;
  }

  if (
    Array.isArray(
      payload
    )
  ) {
    return payload.flatMap(
      (
        entry
      ) =>
        Array.isArray(
          entry?.loanInfos
        )
          ? entry.loanInfos
          : []
    );
  }

  return [];
}

function isLoopscaleLoop(
  item
) {
  const ledgers =
    Array.isArray(
      item?.ledgers
    )
      ? item.ledgers
      : [];

  return ledgers.some(
    (
      ledger
    ) =>
      Boolean(
        ledger?.isLoop
      )
  );
}

function looksLikeOnyc(
  item
) {
  const values = [
    ...(
      Array.isArray(
        item?.collateral
      )
        ? item.collateral
        : []
    ).flatMap(
      (
        row
      ) => [
        row?.assetIdentifier,
        row?.assetMint,
      ]
    ),

    ...(
      Array.isArray(
        item?.collateralBreakdown
      )
        ? item
            .collateralBreakdown
        : []
    ).map(
      (
        row
      ) =>
        row
          ?.assetIdentifier
    ),
  ];

  return values.some(
    (
      value
    ) =>
      normalizeText(
        value
      ).includes(
        "onyc"
      )
  );
}

function chooseDirectLoop(
  items
) {
  const active =
    (
      items ||
      []
    ).filter(
      (
        item
      ) =>
        item?.loan
          ?.closed !== true
    );

  if (
    !active.length
  ) {
    return null;
  }

  return (
    active.find(
      (
        item
      ) =>
        isLoopscaleLoop(
          item
        ) &&
        looksLikeOnyc(
          item
        )
    ) ||
    active.find(
      isLoopscaleLoop
    ) ||
    active.find(
      looksLikeOnyc
    ) ||
    active[0]
  );
}

function buildDirectSnapshot(
  payload,
  item,
  walletAddress
) {
  const aggregate =
    payload?.aggregate ||
    {};

  const positionPoint =
    latestActualPoint(
      item?.pnl
        ?.positionValueData
        ?.dataPoints
    );

  const pnlPoint =
    latestActualPoint(
      item?.pnl
        ?.pnlData
        ?.dataPoints
    );

  const ratePoint =
    latestActualPoint(
      item?.pnl
        ?.rateHistoryData
        ?.dataPoints
    );

  const positionValueUsd =
    firstFinite(
      positionPoint
        ?.netPositionValueUsd,

      pnlPoint
        ?.netPositionValueUsd
    ) ??
    Math.max(
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

  const quantity =
    firstFinite(
      positionPoint
        ?.netPositionValueTokenAmount,

      pnlPoint
        ?.netPositionValueTokenAmount
    ) || 0;

  const pnlUsd =
    firstFinite(
      item?.pnlUsd,
      item?.pnl
        ?.usdPnl,
      pnlPoint
        ?.usdPnl,
      aggregate?.pnlUsd
    ) || 0;

  const netApy =
    toPercent(
      firstFinite(
        ratePoint
          ?.netApy,
        aggregate
          ?.wAvgApy
      )
    );

  const priceUsd =
    quantity >
    0
      ? positionValueUsd /
        quantity
      : 0;

  const dailyNetYieldUsd =
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
    );

  return {
    walletAddress,

    loanAddress:
      String(
        item?.loan
          ?.address ||
          item?.loanAddress ||
          "loopscale-onyc"
      ),

    asset:
      "ONyc",

    strategy:
      "ONyc Loop",

    quantity,

    priceUsd,

    positionValueUsd,

    pnlUsd,

    netApy,

    startTime:
      toIsoFromUnix(
        item?.loan
          ?.startTime
      ) ||
      LOOPSCALE_ONYC_STARTED_AT,

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

    source:
      "loopscale_direct",

    syncedAt:
      new Date()
        .toISOString(),

    raw:
      item,
  };
}

async function fetchDirectLoopscale(
  walletAddress
) {
  /*
   * Important:
   *
   * Do NOT send filterType here.
   *
   * We previously guessed that 0 meant "active".
   * Instead, retrieve the wallet's loans and select the
   * active ONyc Loop from the response ourselves.
   */
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

            page:
              1,

            pageSize:
              LOOPSCALE_PAGE_SIZE,

            sortSide:
              1,

            sortType:
              1,
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
      `Loopscale returned non-JSON data: ${raw.slice(
        0,
        180
      )}`
    );
  }

  if (
    !response.ok
  ) {
    throw new Error(
      payload?.detail ||
        payload?.error
          ?.message ||
        payload?.message ||
        `Loopscale HTTP ${response.status}`
    );
  }

  const items =
    normalizeLoopscaleItems(
      payload
    );

  const item =
    chooseDirectLoop(
      items
    );

  if (
    !item
  ) {
    throw new Error(
      "Loopscale direct API returned no matching loan."
    );
  }

  return buildDirectSnapshot(
    payload,
    item,
    walletAddress
  );
}

/*
 * -------------------------------------------------------
 * Jupiter Portfolio Borrow/Lend fallback
 * -------------------------------------------------------
 */

function getJupiterTokenInfo(
  payload,
  asset
) {
  const address =
    asset?.data
      ?.address;

  return (
    payload?.tokenInfo?.[
      address
    ] ||
    {}
  );
}

function getAssetSymbol(
  payload,
  asset
) {
  const info =
    getJupiterTokenInfo(
      payload,
      asset
    );

  return String(
    info?.symbol ||
      asset?.data
        ?.symbol ||
      asset?.data
        ?.name ||
      ""
  );
}

function assetAmount(
  asset
) {
  return toNumber(
    asset?.data
      ?.amount
  );
}

function assetPrice(
  asset
) {
  return toNumber(
    asset?.data
      ?.price
  );
}

function assetValue(
  asset
) {
  const direct =
    toNumber(
      asset?.value
    );

  if (
    direct !== 0
  ) {
    return direct;
  }

  return (
    assetAmount(
      asset
    ) *
    assetPrice(
      asset
    )
  );
}

function getAssetApy(
  asset
) {
  const data =
    asset?.data ||
    {};

  const candidates = [
    asset?.apy,
    asset?.yield,
    asset?.rate,
    asset?.supplyApy,
    asset?.borrowApy,

    data?.apy,
    data?.yield,
    data?.rate,
    data?.supplyApy,
    data?.borrowApy,
    data?.depositApy,
    data?.lendingApy,
    data?.apyPct,
    data?.apyPercent,
  ];

  for (
    const candidate of
    candidates
  ) {
    if (
      candidate ===
        null ||
      candidate ===
        undefined
    ) {
      continue;
    }

    const value =
      toPercent(
        candidate
      );

    if (
      value !== 0
    ) {
      return value;
    }
  }

  /*
   * Last fallback: inspect direct fields whose names
   * contain APY or yield.
   */
  const containers = [
    asset,
    data,
  ];

  for (
    const container of
    containers
  ) {
    if (
      !container ||
      typeof container !==
        "object"
    ) {
      continue;
    }

    for (
      const [
        key,
        value,
      ] of Object.entries(
        container
      )
    ) {
      const normalizedKey =
        normalizeText(
          key
        );

      if (
        normalizedKey.includes(
          "apy"
        ) ||
        normalizedKey.includes(
          "yield"
        )
      ) {
        const parsed =
          toPercent(
            value
          );

        if (
          parsed !== 0
        ) {
          return parsed;
        }
      }
    }
  }

  return 0;
}

function getBorrowLendAssets(
  element
) {
  const data =
    element?.data ||
    {};

  return {
    supplied:
      Array.isArray(
        data
          ?.suppliedAssets
      )
        ? data
            .suppliedAssets
        : [],

    borrowed:
      Array.isArray(
        data
          ?.borrowedAssets
      )
        ? data
            .borrowedAssets
        : [],
  };
}

function isOnycAsset(
  payload,
  asset
) {
  return normalizeText(
    getAssetSymbol(
      payload,
      asset
    )
  ).includes(
    "onyc"
  );
}

function isUsdcAsset(
  payload,
  asset
) {
  return normalizeText(
    getAssetSymbol(
      payload,
      asset
    )
  ) ===
    "usdc";
}

function looksLikeLoopscaleElement(
  payload,
  element
) {
  const text = [
    element?.platformId,
    element?.name,
    element?.label,
    element?.data
      ?.link,
  ]
    .map(
      normalizeText
    )
    .join(" ");

  if (
    text.includes(
      "loopscale"
    )
  ) {
    return true;
  }

  /*
   * Very useful fallback:
   *
   * Your actual Loopscale position is:
   * supplied ONyc + borrowed USDC.
   *
   * This catches the position even if Jupiter changes
   * the platform id or label.
   */
  const {
    supplied,
    borrowed,
  } =
    getBorrowLendAssets(
      element
    );

  return (
    supplied.some(
      (
        asset
      ) =>
        isOnycAsset(
          payload,
          asset
        )
    ) &&
    borrowed.some(
      (
        asset
      ) =>
        isUsdcAsset(
          payload,
          asset
        )
    )
  );
}

function findJupiterLoopscale(
  payload
) {
  const elements =
    Array.isArray(
      payload?.elements
    )
      ? payload.elements
      : [];

  return (
    elements.find(
      (
        element
      ) => {
        const type =
          normalizeText(
            element?.type
          );

        return (
          (
            type ===
              "borrowlend" ||
            type ===
              "borrow-lend" ||
            type.includes(
              "borrow"
            ) ||
            normalizeText(
              element?.label
            ).includes(
              "lend"
            )
          ) &&
          looksLikeLoopscaleElement(
            payload,
            element
          )
        );
      }
    ) ||
    elements.find(
      (
        element
      ) =>
        looksLikeLoopscaleElement(
          payload,
          element
        )
    ) ||
    null
  );
}

function buildJupiterSnapshot(
  payload,
  element,
  walletAddress
) {
  const {
    supplied,
    borrowed,
  } =
    getBorrowLendAssets(
      element
    );

  const onyc =
    supplied.find(
      (
        asset
      ) =>
        isOnycAsset(
          payload,
          asset
        )
    ) ||
    supplied[0] ||
    null;

  const usdc =
    borrowed.find(
      (
        asset
      ) =>
        isUsdcAsset(
          payload,
          asset
        )
    ) ||
    borrowed[0] ||
    null;

  const suppliedUsd =
    supplied.reduce(
      (
        sum,
        asset
      ) =>
        sum +
        assetValue(
          asset
        ),
      0
    );

  const borrowedUsd =
    borrowed.reduce(
      (
        sum,
        asset
      ) =>
        sum +
        assetValue(
          asset
        ),
      0
    );

  /*
   * This matches the Jupiter card:
   *
   * Supplied - Borrowed = net Loopscale equity.
   */
  const positionValueUsd =
    toNumber(
      element?.value ??
        element?.data
          ?.value
    ) ||
    Math.max(
      0,
      suppliedUsd -
        borrowedUsd
    );

  const onycPrice =
    assetPrice(
      onyc
    );

  /*
   * Net-equity equivalent amount of ONyc.
   *
   * We don't display the full 2,489 ONyc collateral as
   * your portfolio balance because part of it is financed
   * by the USDC loan.
   */
  const quantity =
    onycPrice >
    0
      ? positionValueUsd /
        onycPrice
      : 0;

  const suppliedApy =
    getAssetApy(
      onyc
    );

  const borrowedApy =
    getAssetApy(
      usdc
    );

  let netApy =
    toPercent(
      element?.netApy ??
        element?.data
          ?.netApy
    );

  /*
   * If Jupiter doesn't provide netApy directly,
   * calculate the Loop APY from the two legs:
   *
   * supply earnings - borrow cost
   * --------------------------------
   *          net equity
   */
  if (
    !(netApy > 0) &&
    positionValueUsd >
      0 &&
    (
      suppliedApy >
        0 ||
      borrowedApy >
        0
    )
  ) {
    const yearlyIncome =
      (
        suppliedUsd *
        (
          suppliedApy /
          100
        )
      ) -
      (
        borrowedUsd *
        (
          borrowedApy /
          100
        )
      );

    netApy =
      (
        yearlyIncome /
        positionValueUsd
      ) *
      100;
  }

  /*
   * Borrow/Lend elements do not always expose P&L.
   * If Jupiter ever adds it, use it automatically.
   * Otherwise YieldFarmingPage's Loopscale history will
   * start tracking from the live position.
   */
  const pnlUsd =
    firstFinite(
      element?.pnlUsd,
      element?.data
        ?.pnlUsd,
      element?.data
        ?.usdPnl
    ) || 0;

  const dailyNetYieldUsd =
    positionValueUsd >
      0 &&
    netApy >
      0
      ? (
          positionValueUsd *
          (
            netApy /
            100
          )
        ) /
        365
      : 0;

  return {
    walletAddress,

    loanAddress:
      String(
        element?.data
          ?.ref ||
          element?.data
            ?.contract ||
          "loopscale-onyc"
      ),

    asset:
      "ONyc",

    strategy:
      "ONyc Loop",

    quantity,

    priceUsd:
      onycPrice,

    positionValueUsd,

    pnlUsd,

    netApy,

    startTime:
      LOOPSCALE_ONYC_STARTED_AT,

    collateralUsd:
      suppliedUsd,

    principalUsd:
      borrowedUsd,

    interestAccruedUsd:
      0,

    pendingYieldUsd:
      Math.max(
        0,
        pnlUsd
      ),

    dailyNetYieldUsd,

    suppliedApy,

    borrowedApy,

    suppliedOnyc:
      assetAmount(
        onyc
      ),

    borrowedUsdc:
      assetAmount(
        usdc
      ),

    source:
      "jupiter_portfolio_borrowlend",

    syncedAt:
      new Date()
        .toISOString(),

    raw:
      element,
  };
}

async function fetchJupiterLoopscale(
  walletAddress
) {
  /*
   * Do NOT use ?platforms=loopscale here.
   *
   * We already know the unfiltered Jupiter portfolio is
   * showing the position, so retrieve everything and
   * select the ONyc/USDC BorrowLend element ourselves.
   */
  const response =
    await proxyFetch(
      `/jupiter-portfolio/portfolio/v1/positions/${encodeURIComponent(
        walletAddress
      )}`,
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
      `Jupiter Portfolio returned non-JSON data: ${raw.slice(
        0,
        180
      )}`
    );
  }

  if (
    !response.ok
  ) {
    throw new Error(
      payload?.detail ||
        payload?.message ||
        `Jupiter Portfolio HTTP ${response.status}`
    );
  }

  const element =
    findJupiterLoopscale(
      payload
    );

  if (
    !element
  ) {
    throw new Error(
      "Jupiter returned the portfolio, but the ONyc/USDC Borrow-Lend element could not be identified."
    );
  }

  return buildJupiterSnapshot(
    payload,
    element,
    walletAddress
  );
}

/*
 * -------------------------------------------------------
 * Main public sync
 * -------------------------------------------------------
 */

export async function getLoopscaleOnycSnapshot(
  walletAddress =
    LOOPSCALE_WALLET
) {
  const [
    directResult,
    jupiterResult,
  ] =
    await Promise.allSettled(
      [
        fetchDirectLoopscale(
          walletAddress
        ),

        fetchJupiterLoopscale(
          walletAddress
        ),
      ]
    );

  /*
   * Prefer Loopscale itself because it gives us the
   * most useful P&L fields.
   */
  if (
    directResult.status ===
      "fulfilled" &&
    Number(
      directResult.value
        ?.positionValueUsd
    ) >
      0
  ) {
    console.log(
      "[Loopscale] direct API:",
      directResult.value
    );

    return directResult.value;
  }

  /*
   * Jupiter clearly sees your ONyc/USDC lending position,
   * so it is our reliable balance/APY fallback.
   */
  if (
    jupiterResult.status ===
      "fulfilled" &&
    Number(
      jupiterResult.value
        ?.positionValueUsd
    ) >
      0
  ) {
    console.log(
      "[Loopscale] Jupiter Borrow/Lend fallback:",
      jupiterResult.value
    );

    return jupiterResult.value;
  }

  const directError =
    directResult.status ===
      "rejected"
      ? directResult.reason
          ?.message
      : "";

  const jupiterError =
    jupiterResult.status ===
      "rejected"
      ? jupiterResult.reason
          ?.message
      : "";

  throw new Error(
    [
      directError
        ? `Loopscale API: ${directError}`
        : "",

      jupiterError
        ? `Jupiter: ${jupiterError}`
        : "",
    ]
      .filter(
        Boolean
      )
      .join(
        " | "
      ) ||
      "Could not load the Loopscale ONyc position."
  );
}