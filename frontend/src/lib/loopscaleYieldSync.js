import { proxyFetch } from "./cors-proxy";

export const LOOPSCALE_WALLET =
  "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM";

const LOOP_FUNDING_TYPE =
  2;

const ACTIVE_FILTER_TYPE =
  0;

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
   * Loopscale documents APYs as fractional values:
   * 0.1747 = 17.47%.
   *
   * Keep support for an already-percent value too.
   */
  return Math.abs(raw) <=
    1
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
    new Date(millis);

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
  if (
    Array.isArray(
      payload?.items
    )
  ) {
    return payload.items;
  }

  /*
   * Older Loopscale response shape:
   * [
   *   {
   *     totalCount,
   *     loanInfos: [...]
   *   }
   * ]
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

function isLoopPosition(
  item
) {
  const ledgers =
    Array.isArray(
      item?.ledgers
    )
      ? item.ledgers
      : [];

  if (
    ledgers.some(
      (
        ledger
      ) =>
        Boolean(
          ledger?.isLoop
        )
    )
  ) {
    return true;
  }

  /*
   * The request itself is filtered to funding type 2 (Loop),
   * so older response shapes may not include isLoop.
   */
  return true;
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
   * Fallback for responses without PnL data points.
   *
   * Net position ~= collateral - debt - accrued borrow interest.
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
  const pnlPoint =
    getPnlPoint(
      item
    );

  const candidates = [
    item?.pnlUsd,
    item?.pnl?.usdPnl,
    pnlPoint?.usdPnl,
  ];

  for (
    const candidate of
    candidates
  ) {
    const value =
      Number(candidate);

    if (
      Number.isFinite(
        value
      )
    ) {
      return value;
    }
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

  /*
   * Aggregate APY is only a fallback. The rate-history netApy
   * is the field that should line up with the Loop position UI.
   */
  return normalizePercent(
    aggregate?.wAvgApy
  );
}

function getCollateralSymbol(
  item
) {
  const identifiers = [
    ...(
      Array.isArray(
        item?.collateralBreakdown
      )
        ? item.collateralBreakdown.map(
            (
              row
            ) =>
              row?.assetIdentifier
          )
        : []
    ),
    ...(
      Array.isArray(
        item?.collateral
      )
        ? item.collateral.map(
            (
              row
            ) =>
              row?.assetIdentifier
          )
        : []
    ),
  ]
    .filter(Boolean)
    .map(
      (
        value
      ) =>
        String(value)
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

function chooseOnycLoop(
  items
) {
  const activeLoops =
    (
      items ||
      []
    )
      .filter(
        (
          item
        ) =>
          !item?.loan
            ?.closed
      )
      .filter(
        isLoopPosition
      );

  if (
    !activeLoops.length
  ) {
    return null;
  }

  /*
   * The account currently has one active ONyc Loop.
   * If more loops are added later, prefer the largest live
   * net position so we do not accidentally pick a dust loan.
   */
  return [
    ...activeLoops,
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
            /*
             * Loopscale enums:
             * filterType 0 = Active
             * orderFundingTypes 2 = Loop
             * assetTypes 0 = normal SPL token
             */
            borrowers: [
              walletAddress,
            ],

            filterType:
              ACTIVE_FILTER_TYPE,

            includePnl:
              true,

            orderFundingTypes:
              LOOP_FUNDING_TYPE,

            assetTypes: [
              0,
            ],

            page:
              1,

            pageSize:
              100,

            sortSide:
              1,

            sortType:
              2,
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
        payload?.error?.message ||
        payload?.message ||
        `Loopscale returned HTTP ${response.status}`
    );
  }

  const items =
    normalizeItems(
      payload
    );

  const item =
    chooseOnycLoop(
      items
    );

  if (
    !item
  ) {
    throw new Error(
      "Loopscale returned no active Loop position for this wallet."
    );
  }

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
      item?.loan?.address ||
        item?.loanAddress ||
        "loopscale-onyc"
    );

  const startTime =
    toIsoFromUnix(
      item?.loan?.startTime
    );

  const priceUsd =
    quantity >
    0
      ? positionValueUsd /
        quantity
      : 0;

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

    dailyNetYieldUsd:
      (
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
      ),

    source:
      "loopscale",

    syncedAt:
      new Date()
        .toISOString(),

    raw:
      item,
  };
}