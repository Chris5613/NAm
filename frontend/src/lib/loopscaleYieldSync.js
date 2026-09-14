import {
  jupiterPortfolioApi,
} from "./external-apis";

import {
  proxyFetch,
} from "./cors-proxy";

export const LOOPSCALE_WALLET =
  "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM";

export const LOOPSCALE_ONYC_STARTED_AT =
  "2026-09-13T00:00:00-07:00";

/*
 * From the first Loopscale screenshot:
 *
 * $1,001.83 position value
 * +$1.96 P&L
 *
 * Implied starting equity:
 * $999.87
 *
 * Used only if Jupiter does not expose P&L directly.
 */
const LOOPSCALE_INITIAL_EQUITY_USD =
  999.87;

/*
 * Current leg APYs from the Jupiter screenshot.
 *
 * These are FALLBACKS only.
 * If Jupiter exposes live yields in its raw response,
 * the live values are used instead.
 */
const FALLBACK_ONYC_SUPPLY_APY =
  11.54;

const FALLBACK_USDC_BORROW_APY =
  8.33;

function toNumber(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

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

function normalizeText(
  value
) {
  return String(
    value ?? ""
  )
    .trim()
    .toLowerCase();
}

function toPercent(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (
    typeof value ===
      "string" &&
    value.includes("%")
  ) {
    return toNumber(
      value
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

  /*
   * Supports:
   *
   * 0.1154 -> 11.54%
   * 11.54  -> 11.54%
   */
  return Math.abs(
    number
  ) <= 1
    ? number * 100
    : number;
}

function isOnycToken(
  token
) {
  const symbol =
    normalizeText(
      token?.symbol
    );

  const name =
    normalizeText(
      token?.name
    );

  return (
    symbol ===
      "onyc" ||
    symbol.includes(
      "onyc"
    ) ||
    name.includes(
      "onyc"
    )
  );
}

function isUsdcToken(
  token
) {
  const symbol =
    normalizeText(
      token?.symbol
    );

  return (
    symbol ===
      "usdc" ||
    symbol.includes(
      "usdc"
    )
  );
}

function getSuppliedTokens(
  position
) {
  return (
    Array.isArray(
      position?.tokens
    )
      ? position.tokens
      : []
  ).filter(
    (
      token
    ) =>
      normalizeText(
        token?.kind
      ).includes(
        "suppl"
      )
  );
}

function getBorrowedTokens(
  position
) {
  return (
    Array.isArray(
      position?.tokens
    )
      ? position.tokens
      : []
  ).filter(
    (
      token
    ) =>
      normalizeText(
        token?.kind
      ).includes(
        "borrow"
      )
  );
}

function positionHasOnycUsdc(
  position
) {
  const supplied =
    getSuppliedTokens(
      position
    );

  const borrowed =
    getBorrowedTokens(
      position
    );

  return (
    supplied.some(
      isOnycToken
    ) &&
    borrowed.some(
      isUsdcToken
    )
  );
}

function looksLikeLoopscale(
  position
) {
  const text = [
    position?.platform,
    position?.platform_id,
    position?.label,
    position?.type,
    position?.url,
  ]
    .map(
      normalizeText
    )
    .join(" ");

  return text.includes(
    "loopscale"
  );
}

function scorePosition(
  position
) {
  let score =
    0;

  if (
    looksLikeLoopscale(
      position
    )
  ) {
    score +=
      100;
  }

  if (
    positionHasOnycUsdc(
      position
    )
  ) {
    score +=
      100;
  }

  if (
    Number(
      position?.total_value
    ) >
      0
  ) {
    score +=
      10;
  }

  return score;
}

function chooseLoopscalePosition(
  positions
) {
  const scored =
    (
      Array.isArray(
        positions
      )
        ? positions
        : []
    )
      .map(
        (
          position
        ) => ({
          position,

          score:
            scorePosition(
              position
            ),
        })
      )
      .filter(
        (
          row
        ) =>
          row.score >
          0
      )
      .sort(
        (
          a,
          b
        ) =>
          b.score -
          a.score
      );

  const exact =
    scored.find(
      (
        row
      ) =>
        row.score >=
        200
    );

  if (
    exact
  ) {
    return exact.position;
  }

  const named =
    scored.find(
      (
        row
      ) =>
        looksLikeLoopscale(
          row.position
        )
    );

  if (
    named
  ) {
    return named.position;
  }

  const pair =
    scored.find(
      (
        row
      ) =>
        positionHasOnycUsdc(
          row.position
        )
    );

  return (
    pair?.position ||
    null
  );
}

function buildDiagnostic(
  positions
) {
  return (
    positions ||
    []
  )
    .map(
      (
        position
      ) => {
        const tokenText =
          (
            position?.tokens ||
            []
          )
            .map(
              (
                token
              ) =>
                `${
                  token?.symbol ||
                  token?.name ||
                  "?"
                }:${
                  token?.kind ||
                  "?"
                }`
            )
            .join(
              ","
            );

        return [
          position?.platform ||
            "?",

          position?.type ||
            position?.label ||
            "?",

          tokenText ||
            "no-tokens",
        ].join(
          "/"
        );
      }
    )
    .join(
      " | "
    );
}

function tokenValue(
  token
) {
  const direct =
    toNumber(
      token?.value
    );

  if (
    direct !== 0
  ) {
    return direct;
  }

  return (
    toNumber(
      token?.amount
    ) *
    toNumber(
      token?.price
    )
  );
}

async function getRawJupiterPortfolio(
  walletAddress
) {
  try {
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

    if (
      !response.ok
    ) {
      return null;
    }

    return await response.json();
  } catch (
    error
  ) {
    console.warn(
      "[Loopscale] Raw Jupiter lookup failed:",
      error
    );

    return null;
  }
}

function findRawLoopscaleElement(
  payload,
  normalizedPosition
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

  const platform =
    normalizeText(
      normalizedPosition
        ?.platform
    );

  /*
   * First use the platform selected by NAm's
   * existing Jupiter normalizer.
   */
  if (
    platform
  ) {
    const platformMatch =
      elements.find(
        (
          element
        ) =>
          normalizeText(
            element?.platformId
          ) ===
          platform
      );

    if (
      platformMatch
    ) {
      return platformMatch;
    }
  }

  /*
   * Explicit Loopscale name fallback.
   */
  const named =
    elements.find(
      (
        element
      ) =>
        [
          element?.platformId,
          element?.label,
          element?.name,
          element?.data
            ?.link,
        ]
          .map(
            normalizeText
          )
          .join(
            " "
          )
          .includes(
            "loopscale"
          )
    );

  return (
    named ||
    null
  );
}

function findPercentByKeys(
  object,
  keys,
  depth = 0
) {
  if (
    !object ||
    typeof object !==
      "object" ||
    depth >
      5
  ) {
    return 0;
  }

  for (
    const [
      key,
      value,
    ] of Object.entries(
      object
    )
  ) {
    const normalizedKey =
      normalizeText(
        key
      );

    if (
      keys.some(
        (
          wanted
        ) =>
          normalizedKey.includes(
            wanted
          )
      )
    ) {
      const percent =
        toPercent(
          value
        );

      if (
        percent >
          0 &&
        percent <
          500
      ) {
        return percent;
      }
    }
  }

  for (
    const value of
    Object.values(
      object
    )
  ) {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      continue;
    }

    const found =
      findPercentByKeys(
        value,
        keys,
        depth + 1
      );

    if (
      found >
      0
    ) {
      return found;
    }
  }

  return 0;
}

function findPnl(
  object,
  depth = 0
) {
  if (
    !object ||
    typeof object !==
      "object" ||
    depth >
      5
  ) {
    return null;
  }

  const keys = [
    "pnlusd",
    "usdpnl",
    "pnlvalue",
    "profitlossusd",
    "profitusd",
  ];

  for (
    const [
      key,
      value,
    ] of Object.entries(
      object
    )
  ) {
    if (
      keys.includes(
        normalizeText(
          key
        )
      )
    ) {
      const number =
        Number(value);

      if (
        Number.isFinite(
          number
        )
      ) {
        return number;
      }
    }
  }

  for (
    const value of
    Object.values(
      object
    )
  ) {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      continue;
    }

    const found =
      findPnl(
        value,
        depth + 1
      );

    if (
      found !==
      null
    ) {
      return found;
    }
  }

  return null;
}

export async function getLoopscaleOnycSnapshot(
  walletAddress =
    LOOPSCALE_WALLET
) {
  /*
   * IMPORTANT:
   *
   * Reuse NAm's existing Jupiter normalization.
   * This is the exact same parser already used by
   * walletsApi.getDefiPositions().
   */
  const [
    normalizedResult,
    rawResult,
  ] =
    await Promise.allSettled(
      [
        jupiterPortfolioApi.getPositions(
          walletAddress
        ),

        getRawJupiterPortfolio(
          walletAddress
        ),
      ]
    );

  if (
    normalizedResult.status !==
    "fulfilled"
  ) {
    throw normalizedResult.reason;
  }

  const positions =
    normalizedResult.value ||
    [];

  const position =
    chooseLoopscalePosition(
      positions
    );

  if (
    !position
  ) {
    const diagnostic =
      buildDiagnostic(
        positions
      );

    console.log(
      "[Loopscale] Normalized Jupiter positions:",
      positions
    );

    throw new Error(
      diagnostic
        ? `Could not identify Loopscale. Jupiter positions: ${diagnostic}`
        : "Jupiter returned no normalized DeFi positions for this wallet."
    );
  }

  console.log(
    "[Loopscale] NAm Jupiter position:",
    position
  );

  const supplied =
    getSuppliedTokens(
      position
    );

  const borrowed =
    getBorrowedTokens(
      position
    );

  const onyc =
    supplied.find(
      isOnycToken
    ) ||
    supplied[0] ||
    null;

  const usdc =
    borrowed.find(
      isUsdcToken
    ) ||
    borrowed[0] ||
    null;

  const suppliedUsd =
    supplied.reduce(
      (
        sum,
        token
      ) =>
        sum +
        tokenValue(
          token
        ),
      0
    );

  const borrowedUsd =
    borrowed.reduce(
      (
        sum,
        token
      ) =>
        sum +
        tokenValue(
          token
        ),
      0
    );

  /*
   * Prefer Jupiter's own normalized total.
   *
   * For your current position this should be around:
   *
   * $2,849.36 supplied
   * - $1,849.57 borrowed
   * = $999.79 / $999.80 net
   */
  const positionValueUsd =
    toNumber(
      position?.total_value
    ) ||
    Math.max(
      0,
      suppliedUsd -
        borrowedUsd
    );

  const rawPayload =
    rawResult.status ===
      "fulfilled"
      ? rawResult.value
      : null;

  const rawElement =
    findRawLoopscaleElement(
      rawPayload,
      position
    );

  /*
   * Try live Jupiter rates first.
   *
   * If Jupiter does not expose them in the public raw
   * response, use the latest values from your Jupiter
   * Loopscale card until we wire another rate source.
   */
  const liveSupplyApy =
    findPercentByKeys(
      rawElement,
      [
        "supplyapy",
        "depositapy",
        "lendingapy",
        "collateralapy",
      ]
    );

  const liveBorrowApy =
    findPercentByKeys(
      rawElement,
      [
        "borrowapy",
        "borrowrate",
      ]
    );

  const suppliedApy =
    liveSupplyApy ||
    FALLBACK_ONYC_SUPPLY_APY;

  const borrowedApy =
    liveBorrowApy ||
    FALLBACK_USDC_BORROW_APY;

  /*
   * Effective leveraged APY:
   *
   * supply income - borrow cost
   * ---------------------------
   *         equity
   *
   * With your screenshot:
   *
   * $2,849.36 @ 11.54%
   * $1,849.57 @ 8.33%
   *
   * = ~17.48% net APY
   */
  const yearlySupplyIncome =
    suppliedUsd *
    (
      suppliedApy /
      100
    );

  const yearlyBorrowCost =
    borrowedUsd *
    (
      borrowedApy /
      100
    );

  const yearlyNetIncome =
    yearlySupplyIncome -
    yearlyBorrowCost;

  const netApy =
    positionValueUsd >
      0
      ? (
          yearlyNetIncome /
          positionValueUsd
        ) *
        100
      : 0;

  const onycPrice =
    toNumber(
      onyc?.price
    );

  /*
   * Equity-equivalent ONyc amount.
   *
   * We keep the full supplied ONyc separately below.
   */
  const quantity =
    onycPrice >
      0
      ? positionValueUsd /
        onycPrice
      : 0;

  const rawPnl =
    findPnl(
      rawElement
    );

  /*
   * If Jupiter does not expose P&L, use the starting
   * equity implied by your original Loopscale screenshot.
   */
  const pnlUsd =
    rawPnl !==
      null
      ? rawPnl
      : positionValueUsd -
        LOOPSCALE_INITIAL_EQUITY_USD;

  const dailyNetYieldUsd =
    yearlyNetIncome /
    365;

  const snapshot = {
    walletAddress,

    loanAddress:
      String(
        position?.platform_id ||
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
      toNumber(
        onyc?.amount
      ),

    borrowedUsdc:
      toNumber(
        usdc?.amount
      ),

    source:
      "nam_jupiter_portfolio",

    syncedAt:
      new Date()
        .toISOString(),

    raw: {
      normalized:
        position,

      jupiter:
        rawElement,
    },
  };

  console.log(
    "[Loopscale] Live snapshot:",
    snapshot
  );

  return snapshot;
}