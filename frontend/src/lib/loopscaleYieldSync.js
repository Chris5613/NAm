import { proxyFetch } from "./cors-proxy";

export const LOOPSCALE_WALLET =
  "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM";

const ACTIVE_FILTER_TYPE =
  0;

const LOOPSCALE_PAGE_SIZE =
  25;

function toNumber(
  value
) {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}

function normalizePercent(
  value
) {
  const raw =
    toNumber(value);

  if (
    !Number.isFinite(
      raw
    )
  ) {
    return 0;
  }

  /*
   * Loopscale returns APY values as fractions.
   *
   * 0.1747 = 17.47%
   */
  return Math.abs(
    raw
  ) <= 1
    ? raw * 100
    : raw;
}

function toIsoFromUnix(
  value
) {
  const raw =
    toNumber(value);

  if (
    !(raw > 0)
  ) {
    return null;
  }

  const millis =
    raw >
    10_000_000_000
      ? raw
      : raw * 1000;

  const date =
    new Date(
      millis
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}

function latestPoint(
  points
) {
  const rows =
    Array.isArray(
      points
    )
      ? points.filter(
          Boolean
        )
      : [];

  if (
    !rows.length
  ) {
    return null;
  }

  const actualRows =
    rows.filter(
      (
        row
      ) =>
        row?.isProjection !==
        true
    );

  const pool =
    actualRows.length
      ? actualRows
      : rows;

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

function normalizeItems(
  payload
) {
  /*
   * Current Loopscale response.
   */
  if (
    Array.isArray(
      payload?.items
    )
  ) {
    return payload.items;
  }

  /*
   * Older response format.
   */
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

  if (
    Array.isArray(
      payload?.loanInfos
    )
  ) {
    return payload.loanInfos;
  }

  return [];
}

function getPositionValuePoint(
  item
) {
  return latestPoint(
    item?.pnl
      ?.positionValueData
      ?.dataPoints
  );
}

function getPnlPoint(
  item
) {
  return latestPoint(
    item?.pnl
      ?.pnlData
      ?.dataPoints
  );
}

function getRatePoint(
  item
) {
  return latestPoint(
    item?.pnl
      ?.rateHistoryData
      ?.dataPoints
  );
}

function isLoopPosition(
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

function isActivePosition(
  item
) {
  if (
    item?.loan?.closed ===
    true
  ) {
    return false;
  }

  return true;
}

function getNetPositionValueUsd(
  item
) {
  const positionPoint =
    getPositionValuePoint(
      item
    );

  const pnlPoint =
    getPnlPoint(
      item
    );

  /*
   * This is Loopscale's own net position value.
   * Prefer it over doing our own collateral - debt math.
   */
  const direct =
    toNumber(
      positionPoint
        ?.netPositionValueUsd
    ) ||
    toNumber(
      pnlPoint
        ?.netPositionValueUsd
    );

  if (
    direct >
    0
  ) {
    return direct;
  }

  /*
   * Fallback only.
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
        item?.interestAccruedUsd
      )
  );
}

function getNetPositionTokenAmount(
  item
) {
  const positionPoint =
    getPositionValuePoint(
      item
    );

  const pnlPoint =
    getPnlPoint(
      item
    );

  return (
    toNumber(
      positionPoint
        ?.netPositionValueTokenAmount
    ) ||
    toNumber(
      pnlPoint
        ?.netPositionValueTokenAmount
    ) ||
    0
  );
}

function getPnlUsd(
  item
) {
  /*
   * Loopscale exposes pnlUsd directly.
   * This already adjusts for net inflows/outflows.
   */
  const direct =
    Number(
      item?.pnlUsd
    );

  if (
    Number.isFinite(
      direct
    )
  ) {
    return direct;
  }

  const nested =
    Number(
      item?.pnl?.usdPnl
    );

  if (
    Number.isFinite(
      nested
    )
  ) {
    return nested;
  }

  const pnlPoint =
    getPnlPoint(
      item
    );

  const point =
    Number(
      pnlPoint?.usdPnl
    );

  if (
    Number.isFinite(
      point
    )
  ) {
    return point;
  }

  return 0;
}

function getNetApyPct(
  item,
  aggregate
) {
  const ratePoint =
    getRatePoint(
      item
    );

  const pointApy =
    Number(
      ratePoint?.netApy
    );

  if (
    Number.isFinite(
      pointApy
    )
  ) {
    return normalizePercent(
      pointApy
    );
  }

  return normalizePercent(
    aggregate?.wAvgApy
  );
}

function chooseLoopPosition(
  items
) {
  const active =
    (
      items ||
      []
    ).filter(
      isActivePosition
    );

  if (
    !active.length
  ) {
    return null;
  }

  /*
   * First prefer positions Loopscale itself marks as Loops.
   */
  const loops =
    active.filter(
      isLoopPosition
    );

  const candidates =
    loops.length
      ? loops
      : active;

  /*
   * If more than one exists, use the largest active position.
   */
  return [
    ...candidates,
  ].sort(
    (
      a,
      b
    ) =>
      getNetPositionValueUsd(
        b
      ) -
      getNetPositionValueUsd(
        a
      )
  )[0];
}

function getCollateralSymbol(
  item
) {
  const collateral =
    Array.isArray(
      item?.collateral
    )
      ? item.collateral
      : [];

  const breakdown =
    Array.isArray(
      item?.collateralBreakdown
    )
      ? item.collateralBreakdown
      : [];

  const identifiers = [
    ...collateral.map(
      (
        row
      ) =>
        row?.assetIdentifier
    ),

    ...breakdown.map(
      (
        row
      ) =>
        row?.assetIdentifier
    ),
  ]
    .filter(
      Boolean
    )
    .map(
      (
        value
      ) =>
        String(
          value
        )
    );

  const onyc =
    identifiers.find(
      (
        value
      ) =>
        value
          .toLowerCase()
          .includes(
            "onyc"
          )
    );

  return onyc
    ? "ONyc"
    : "ONyc";
}

export async function getLoopscaleOnycSnapshot(
  walletAddress =
    LOOPSCALE_WALLET
) {
  /*
   * Intentionally use a MINIMAL filter.
   *
   * The previous version added orderFundingTypes and assetTypes.
   * Those filters were causing Loopscale to return no positions.
   *
   * We fetch the wallet's active loans and identify the Loop
   * from ledgers[].isLoop instead.
   */
  const requestBody = {
    borrowers: [
      walletAddress,
    ],

    filterType:
      ACTIVE_FILTER_TYPE,

    includePnl:
      true,

    page:
      1,

    pageSize:
      LOOPSCALE_PAGE_SIZE,

    sortSide:
      1,

    sortType:
      2,
  };

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
          JSON.stringify(
            requestBody
          ),
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
        `Loopscale returned HTTP ${response.status}`
    );
  }

  const items =
    normalizeItems(
      payload
    );

  console.log(
    "[Loopscale] active loans:",
    items
  );

  if (
    !items.length
  ) {
    throw new Error(
      `Loopscale returned 0 active loans for wallet ${walletAddress}.`
    );
  }

  const item =
    chooseLoopPosition(
      items
    );

  if (
    !item
  ) {
    throw new Error(
      "Loopscale returned loans, but none could be selected as an active position."
    );
  }

  console.log(
    "[Loopscale] selected position:",
    item
  );

  const aggregate =
    payload?.aggregate ||
    null;

  const positionValueUsd =
    getNetPositionValueUsd(
      item
    );

  const quantity =
    getNetPositionTokenAmount(
      item
    );

  const pnlUsd =
    getPnlUsd(
      item
    );

  const netApy =
    getNetApyPct(
      item,
      aggregate
    );

  const loanAddress =
    String(
      item?.loan
        ?.address ||
        item?.loanAddress ||
        "loopscale-onyc"
    );

  const startTime =
    toIsoFromUnix(
      item?.loan
        ?.startTime
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

    loanAddress,

    asset:
      getCollateralSymbol(
        item
      ),

    strategy:
      "ONyc Loop",

    quantity,

    priceUsd,

    positionValueUsd,

    pnlUsd,

    netApy,

    startTime,

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
        item?.interestAccruedUsd
      ),

    pendingYieldUsd:
      toNumber(
        item?.pendingYieldUsd
      ),

    dailyNetYieldUsd,

    source:
      "loopscale",

    syncedAt:
      new Date()
        .toISOString(),

    raw:
      item,
  };
}