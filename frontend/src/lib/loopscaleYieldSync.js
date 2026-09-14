import { proxyFetch } from "./cors-proxy";

export const LOOPSCALE_WALLET =
  "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM";

/*
 * You opened this ONyc Loop in September 2026.
 * Keeping the original start month lets Project Income
 * correctly calculate future month-to-month P&L deltas.
 */
export const LOOPSCALE_ONYC_STARTED_AT =
  "2026-09-13T00:00:00-07:00";

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
    !(raw > 0)
  ) {
    return 0;
  }

  /*
   * Supports both:
   *
   * 0.1747 -> 17.47%
   * 17.47  -> 17.47%
   */
  return raw <= 1
    ? raw * 100
    : raw;
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

function isLoopscaleElement(
  element
) {
  const text = [
    element?.platformId,
    element?.name,
    element?.label,
    element?.data?.link,
    element?.data?.contract,
  ]
    .map(
      normalizeText
    )
    .join(" ");

  return text.includes(
    "loopscale"
  );
}

function getLeveragePositions(
  element
) {
  const isolated =
    Array.isArray(
      element?.data
        ?.isolated
        ?.positions
    )
      ? element.data
          .isolated
          .positions
      : [];

  const cross =
    Array.isArray(
      element?.data
        ?.cross
        ?.positions
    )
      ? element.data
          .cross
          .positions
      : [];

  return [
    ...isolated,
    ...cross,
  ];
}

function isOnycPosition(
  position
) {
  const text = [
    position?.name,
    position?.address,
    position?.ref,
  ]
    .map(
      normalizeText
    )
    .join(" ");

  return (
    text.includes(
      "onyc"
    ) ||
    text.includes(
      "onre"
    )
  );
}

function chooseOnycPosition(
  element
) {
  const positions =
    getLeveragePositions(
      element
    );

  if (
    !positions.length
  ) {
    return null;
  }

  return (
    positions.find(
      isOnycPosition
    ) ||
    positions[0]
  );
}

function getElementValue(
  element
) {
  const candidates = [
    element?.value,
    element?.data?.value,
    element?.data
      ?.isolated?.value,
    element?.data
      ?.cross?.value,
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
      ) &&
      value >
        0
    ) {
      return value;
    }
  }

  return 0;
}

function getElementPnl(
  element
) {
  const positions =
    getLeveragePositions(
      element
    );

  if (
    !positions.length
  ) {
    return 0;
  }

  return positions.reduce(
    (
      sum,
      position
    ) =>
      sum +
      (
        Number(
          position?.pnlValue
        ) || 0
      ),
    0
  );
}

function getMarkPrice(
  position
) {
  const price =
    Number(
      position?.markPrice
    );

  return (
    Number.isFinite(
      price
    ) &&
    price >
      0
  )
    ? price
    : 0;
}

function getPositionQuantity(
  positionValueUsd,
  position
) {
  const markPrice =
    getMarkPrice(
      position
    );

  /*
   * This gives us the equity-equivalent ONyc amount,
   * matching Loopscale's:
   *
   * 874.53 ONyc   $1,001.83
   */
  if (
    markPrice >
      0 &&
    positionValueUsd >
      0
  ) {
    return (
      positionValueUsd /
      markPrice
    );
  }

  const size =
    Number(
      position?.size
    );

  return (
    Number.isFinite(
      size
    ) &&
    size >
      0
  )
    ? size
    : 0;
}

async function fetchJupiterPortfolio(
  walletAddress,
  filtered = true
) {
  const query =
    filtered
      ? "?platforms=loopscale"
      : "";

  const response =
    await proxyFetch(
      `/jupiter-portfolio/portfolio/v1/positions/${encodeURIComponent(
        walletAddress
      )}${query}`,
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
        payload?.error ||
        payload?.message ||
        `Jupiter Portfolio returned HTTP ${response.status}`
    );
  }

  return payload;
}

function chooseLoopscaleElement(
  payload
) {
  const elements =
    Array.isArray(
      payload?.elements
    )
      ? payload.elements
      : [];

  if (
    !elements.length
  ) {
    return null;
  }

  /*
   * First choice:
   * explicit Loopscale leverage position.
   */
  const exact =
    elements.find(
      (
        element
      ) =>
        isLoopscaleElement(
          element
        ) &&
        normalizeText(
          element?.type
        ) ===
          "leverage"
    );

  if (
    exact
  ) {
    return exact;
  }

  /*
   * Second choice:
   * anything Jupiter identifies as Loopscale.
   */
  const loopscale =
    elements.find(
      isLoopscaleElement
    );

  if (
    loopscale
  ) {
    return loopscale;
  }

  /*
   * Last-resort fallback:
   * if Jupiter's Loopscale fetcher ran but did not attach
   * the platform name normally, look for a leverage
   * position whose underlying asset says ONyc.
   */
  const onycLeverage =
    elements.find(
      (
        element
      ) =>
        normalizeText(
          element?.type
        ) ===
          "leverage" &&
        getLeveragePositions(
          element
        ).some(
          isOnycPosition
        )
    );

  return (
    onycLeverage ||
    null
  );
}

function getFetcherError(
  payload
) {
  const reports =
    Array.isArray(
      payload?.fetcherReports
    )
      ? payload.fetcherReports
      : [];

  const loopscaleReport =
    reports.find(
      (
        report
      ) =>
        normalizeText(
          report?.id
        ).includes(
          "loopscale"
        )
    );

  if (
    loopscaleReport?.error
  ) {
    return String(
      loopscaleReport.error
    );
  }

  return "";
}

/*
 * Loopscale direct API is used only for metadata now.
 *
 * If it returns nothing, that does NOT break the position.
 * Jupiter remains the primary live source.
 */
async function fetchLoopscaleMetadata(
  walletAddress
) {
  try {
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

              filterType:
                0,

              /*
               * Official Loopscale field:
               * 2 = Loop
               */
              orderFundingType:
                2,

              /*
               * Normal SPL token collateral.
               */
              assetTypes:
                0,

              /*
               * Try the first pagination index.
               */
              page:
                0,

              pageSize:
                LOOPSCALE_PAGE_SIZE,

              sortDirection:
                1,

              sortType:
                2,
            }),
        }
      );

    if (
      !response.ok
    ) {
      return null;
    }

    const payload =
      await response.json();

    let items =
      [];

    if (
      Array.isArray(
        payload
      )
    ) {
      items =
        payload.flatMap(
          (
            entry
          ) =>
            Array.isArray(
              entry?.loanInfos
            )
              ? entry.loanInfos
              : []
        );
    } else if (
      Array.isArray(
        payload?.loanInfos
      )
    ) {
      items =
        payload.loanInfos;
    }

    const active =
      items.find(
        (
          item
        ) =>
          item?.loan
            ?.closed !==
          true
      );

    if (
      !active
    ) {
      return null;
    }

    const startTimeRaw =
      Number(
        active?.loan
          ?.startTime
      );

    const startTime =
      Number.isFinite(
        startTimeRaw
      ) &&
      startTimeRaw >
        0
        ? new Date(
            startTimeRaw >
            10_000_000_000
              ? startTimeRaw
              : startTimeRaw *
                1000
          ).toISOString()
        : null;

    return {
      loanAddress:
        active?.loan
          ?.address ||
        null,

      startTime,

      raw:
        active,
    };
  } catch (
    error
  ) {
    console.warn(
      "Loopscale metadata lookup failed:",
      error
    );

    return null;
  }
}

async function getJupiterLoopscalePosition(
  walletAddress
) {
  /*
   * Start with only Loopscale to keep the response small.
   */
  let payload =
    await fetchJupiterPortfolio(
      walletAddress,
      true
    );

  let element =
    chooseLoopscaleElement(
      payload
    );

  /*
   * If Jupiter's platform filter behaves differently,
   * retry the wallet's full portfolio.
   */
  if (
    !element
  ) {
    payload =
      await fetchJupiterPortfolio(
        walletAddress,
        false
      );

    element =
      chooseLoopscaleElement(
        payload
      );
  }

  if (
    !element
  ) {
    const fetcherError =
      getFetcherError(
        payload
      );

    throw new Error(
      fetcherError
        ? `Jupiter could not load Loopscale: ${fetcherError}`
        : "Jupiter Portfolio did not return the Loopscale ONyc Loop."
    );
  }

  return {
    payload,
    element,
  };
}

export async function getLoopscaleOnycSnapshot(
  walletAddress =
    LOOPSCALE_WALLET
) {
  const [
    jupiterResult,
    metadataResult,
  ] =
    await Promise.allSettled(
      [
        getJupiterLoopscalePosition(
          walletAddress
        ),

        fetchLoopscaleMetadata(
          walletAddress
        ),
      ]
    );

  if (
    jupiterResult.status !==
    "fulfilled"
  ) {
    throw jupiterResult.reason;
  }

  const {
    element,
  } =
    jupiterResult.value;

  const metadata =
    metadataResult.status ===
    "fulfilled"
      ? metadataResult.value
      : null;

  const position =
    chooseOnycPosition(
      element
    );

  const positionValueUsd =
    getElementValue(
      element
    );

  if (
    !(
      positionValueUsd >
      0
    )
  ) {
    throw new Error(
      "Jupiter found Loopscale, but returned a $0 position value."
    );
  }

  const pnlUsd =
    getElementPnl(
      element
    );

  const netApy =
    normalizePercent(
      element?.netApy
    );

  const priceUsd =
    getMarkPrice(
      position
    );

  const quantity =
    getPositionQuantity(
      positionValueUsd,
      position
    );

  const collateralUsd =
    toNumber(
      position
        ?.collateralValue
    ) ||
    toNumber(
      element?.data
        ?.cross
        ?.collateralValue
    );

  const leverage =
    toNumber(
      position?.leverage
    ) ||
    toNumber(
      element?.data
        ?.cross
        ?.leverage
    );

  const loanAddress =
    metadata
      ?.loanAddress ||
    element?.data
      ?.contract ||
    element?.data
      ?.ref ||
    "loopscale-onyc";

  const startTime =
    metadata
      ?.startTime ||
    LOOPSCALE_ONYC_STARTED_AT;

  const dailyNetYieldUsd =
    (
      positionValueUsd *
      (
        netApy /
        100
      )
    ) /
    365;

  return {
    walletAddress,

    loanAddress:
      String(
        loanAddress
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

    startTime,

    collateralUsd,

    leverage,

    principalUsd:
      0,

    interestAccruedUsd:
      0,

    pendingYieldUsd:
      Math.max(
        0,
        pnlUsd
      ),

    dailyNetYieldUsd,

    source:
      "jupiter_portfolio",

    syncedAt:
      new Date()
        .toISOString(),

    raw: {
      jupiter:
        element,

      loopscale:
        metadata?.raw ||
        null,
    },
  };
}