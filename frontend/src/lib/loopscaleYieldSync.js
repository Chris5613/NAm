import {
  proxyFetch,
} from "./cors-proxy";

export const LOOPSCALE_WALLET =
  "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM";

export const LOOPSCALE_ONYC_STARTED_AT =
  "2026-09-13T00:00:00-07:00";

/*
 * First Loopscale screenshot:
 *
 * Position value: $1,001.83
 * P&L:            +$1.96
 *
 * Implied starting equity:
 * $999.87
 *
 * Used only if Loopscale does not return P&L directly.
 */
const LOOPSCALE_INITIAL_EQUITY_USD =
  999.87;

/*
 * Used only if the API response does not expose
 * a live net APY.
 */
const FALLBACK_NET_APY =
  17.47;

const PORTFOLIO_ENDPOINT =
  "/loopscale/v1/markets/earn/portfolio/positions";

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
    const number =
      Number(
        value.replace(
          /[^0-9.-]/g,
          ""
        )
      );

    return Number.isFinite(
      number
    )
      ? number
      : 0;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
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

function safeStringify(
  value
) {
  try {
    return JSON.stringify(
      value
    );
  } catch {
    return "";
  }
}

async function fetchPortfolioPositions(
  walletAddress
) {
  /*
   * The Loopscale API error explicitly tells us
   * this endpoint expects a JSON field named:
   *
   * wallet
   */
  const response =
    await proxyFetch(
      `${PORTFOLIO_ENDPOINT}?wallet=${encodeURIComponent(
        walletAddress
      )}&t=${Date.now()}`,
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
            wallet:
              walletAddress,
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
        200
      )}`
    );
  }

  if (
    !response.ok
  ) {
    const detail =
      payload?.detail ||
      payload?.error
        ?.message ||
      payload?.error ||
      payload?.message ||
      raw.slice(
        0,
        200
      );

    throw new Error(
      `Loopscale portfolio API returned ${response.status}: ${detail}`
    );
  }

  console.log(
    "[Loopscale] Raw portfolio response:",
    payload
  );

  return payload;
}

function collectObjects(
  value,
  path = [],
  output = []
) {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return output;
  }

  output.push({
    value,
    path,
  });

  if (
    Array.isArray(
      value
    )
  ) {
    value.forEach(
      (
        child,
        index
      ) => {
        collectObjects(
          child,
          [
            ...path,
            String(index),
          ],
          output
        );
      }
    );

    return output;
  }

  Object.entries(
    value
  ).forEach(
    ([
      key,
      child,
    ]) => {
      if (
        child &&
        typeof child ===
          "object"
      ) {
        collectObjects(
          child,
          [
            ...path,
            key,
          ],
          output
        );
      }
    }
  );

  return output;
}

function candidateSymbolText(
  object
) {
  return [
    object?.symbol,
    object?.tokenSymbol,
    object?.assetSymbol,
    object?.asset,
    object?.token,
    object?.name,
    object?.assetName,
    object?.tokenName,
    object?.assetIdentifier,
    object?.ticker,
  ]
    .filter(
      (
        value
      ) =>
        typeof value ===
        "string"
    )
    .join(" ")
    .toLowerCase();
}

function findTokenObject(
  root,
  symbol,
  kind
) {
  const records =
    collectObjects(
      root
    );

  const wantedSymbol =
    normalizeText(
      symbol
    );

  const wantedKind =
    normalizeText(
      kind
    );

  const scored =
    records
      .map(
        (
          record
        ) => {
          const object =
            record.value;

          const symbolText =
            candidateSymbolText(
              object
            );

          const json =
            safeStringify(
              object
            )
              .toLowerCase();

          const pathText =
            record.path
              .join(" ")
              .toLowerCase();

          const kindText = [
            object?.kind,
            object?.type,
            object?.side,
            object?.role,
            object?.positionType,
            object?.category,
            pathText,
          ]
            .map(
              normalizeText
            )
            .join(" ");

          let score =
            0;

          if (
            symbolText ===
            wantedSymbol
          ) {
            score +=
              120;
          } else if (
            symbolText.includes(
              wantedSymbol
            )
          ) {
            score +=
              100;
          } else if (
            json.includes(
              wantedSymbol
            )
          ) {
            score +=
              30;
          }

          if (
            wantedKind ===
              "supplied" &&
            (
              kindText.includes(
                "suppl"
              ) ||
              kindText.includes(
                "deposit"
              ) ||
              kindText.includes(
                "collateral"
              )
            )
          ) {
            score +=
              60;
          }

          if (
            wantedKind ===
              "borrowed" &&
            (
              kindText.includes(
                "borrow"
              ) ||
              kindText.includes(
                "debt"
              ) ||
              kindText.includes(
                "loan"
              )
            )
          ) {
            score +=
              60;
          }

          if (
            object?.amount !==
              undefined ||
            object?.balance !==
              undefined ||
            object?.quantity !==
              undefined
          ) {
            score +=
              10;
          }

          if (
            object?.price !==
              undefined ||
            object?.priceUsd !==
              undefined ||
            object?.usdPrice !==
              undefined
          ) {
            score +=
              10;
          }

          if (
            object?.value !==
              undefined ||
            object?.valueUsd !==
              undefined ||
            object?.usdValue !==
              undefined
          ) {
            score +=
              10;
          }

          return {
            object,

            score,
          };
        }
      )
      .filter(
        (
          record
        ) =>
          record.score >=
          50
      )
      .sort(
        (
          a,
          b
        ) =>
          b.score -
          a.score
      );

  return (
    scored[0]
      ?.object ||
    null
  );
}

function findNumericByKeys(
  root,
  keys
) {
  const wanted =
    keys.map(
      normalizeText
    );

  const records =
    collectObjects(
      root
    ).sort(
      (
        a,
        b
      ) =>
        a.path.length -
        b.path.length
    );

  for (
    const record of
    records
  ) {
    if (
      !record.value ||
      Array.isArray(
        record.value
      )
    ) {
      continue;
    }

    for (
      const [
        key,
        value,
      ] of Object.entries(
        record.value
      )
    ) {
      if (
        !wanted.includes(
          normalizeText(
            key
          )
        )
      ) {
        continue;
      }

      const number =
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
          number
        )
      ) {
        return number;
      }
    }
  }

  return null;
}

function findPercentByKeys(
  root,
  keys
) {
  const value =
    findNumericByKeys(
      root,
      keys
    );

  if (
    value ===
    null
  ) {
    return 0;
  }

  return toPercent(
    value
  );
}

function firstValue(
  object,
  keys
) {
  if (
    !object ||
    typeof object !==
      "object"
  ) {
    return null;
  }

  for (
    const key of
    keys
  ) {
    if (
      object[
        key
      ] !==
        undefined &&
      object[
        key
      ] !==
        null
    ) {
      return object[
        key
      ];
    }
  }

  return null;
}

function extractTokenAmount(
  object
) {
  return toNumber(
    firstValue(
      object,
      [
        "amount",
        "balance",
        "quantity",
        "tokenAmount",
        "uiAmount",
        "suppliedAmount",
        "borrowedAmount",
        "collateralAmount",
        "principalAmount",
      ]
    )
  );
}

function extractTokenPrice(
  object
) {
  return toNumber(
    firstValue(
      object,
      [
        "priceUsd",
        "usdPrice",
        "price",
        "markPrice",
        "tokenPrice",
      ]
    )
  );
}

function extractTokenValue(
  object
) {
  const direct =
    firstValue(
      object,
      [
        "valueUsd",
        "usdValue",
        "amountUsd",
        "balanceUsd",
        "totalValueUsd",
        "value",
      ]
    );

  if (
    direct !==
    null
  ) {
    return toNumber(
      direct
    );
  }

  return (
    extractTokenAmount(
      object
    ) *
    extractTokenPrice(
      object
    )
  );
}

function findPositionObject(
  payload
) {
  const records =
    collectObjects(
      payload
    );

  const scored =
    records
      .map(
        (
          record
        ) => {
          const json =
            safeStringify(
              record.value
            )
              .toLowerCase();

          let score =
            0;

          if (
            json.includes(
              "onyc"
            )
          ) {
            score +=
              100;
          }

          if (
            json.includes(
              "usdc"
            )
          ) {
            score +=
              80;
          }

          if (
            json.includes(
              "loop"
            )
          ) {
            score +=
              40;
          }

          if (
            json.includes(
              "collateral"
            )
          ) {
            score +=
              30;
          }

          if (
            json.includes(
              "borrow"
            )
          ) {
            score +=
              30;
          }

          if (
            json.includes(
              "apy"
            )
          ) {
            score +=
              15;
          }

          if (
            json.includes(
              "pnl"
            )
          ) {
            score +=
              15;
          }

          return {
            value:
              record.value,

            score,

            size:
              json.length,
          };
        }
      )
      .filter(
        (
          record
        ) =>
          record.score >
          0
      )
      .sort(
        (
          a,
          b
        ) => {
          if (
            b.score !==
            a.score
          ) {
            return (
              b.score -
              a.score
            );
          }

          return (
            a.size -
            b.size
          );
        }
      );

  return (
    scored[0]
      ?.value ||
    payload
  );
}

function findStringByKeys(
  root,
  keys
) {
  const wanted =
    keys.map(
      normalizeText
    );

  const records =
    collectObjects(
      root
    );

  for (
    const record of
    records
  ) {
    if (
      !record.value ||
      Array.isArray(
        record.value
      )
    ) {
      continue;
    }

    for (
      const [
        key,
        value,
      ] of Object.entries(
        record.value
      )
    ) {
      if (
        wanted.includes(
          normalizeText(
            key
          )
        ) &&
        typeof value ===
          "string" &&
        value
      ) {
        return value;
      }
    }
  }

  return null;
}

function getTokenApy(
  object,
  kind
) {
  if (
    !object
  ) {
    return 0;
  }

  if (
    kind ===
    "supplied"
  ) {
    return findPercentByKeys(
      object,
      [
        "supplyApy",
        "depositApy",
        "lendingApy",
        "collateralApy",
        "apy",
        "yield",
      ]
    );
  }

  return findPercentByKeys(
    object,
    [
      "borrowApy",
      "borrowRate",
      "debtApy",
      "apy",
      "yield",
    ]
  );
}

function buildSnapshot(
  payload,
  walletAddress
) {
  const position =
    findPositionObject(
      payload
    );

  const onyc =
    findTokenObject(
      position,
      "ONyc",
      "supplied"
    );

  const usdc =
    findTokenObject(
      position,
      "USDC",
      "borrowed"
    );

  const suppliedOnyc =
    extractTokenAmount(
      onyc
    );

  const borrowedUsdc =
    extractTokenAmount(
      usdc
    );

  const onycPrice =
    extractTokenPrice(
      onyc
    );

  const usdcPrice =
    extractTokenPrice(
      usdc
    );

  const suppliedUsd =
    extractTokenValue(
      onyc
    );

  const borrowedUsd =
    extractTokenValue(
      usdc
    );

  const directValue =
    findNumericByKeys(
      position,
      [
        "netPositionValueUsd",
        "positionValueUsd",
        "netValueUsd",
        "equityUsd",
        "equityValueUsd",
        "portfolioValueUsd",
        "totalValueUsd",
      ]
    );

  const calculatedValue =
    Math.max(
      0,
      suppliedUsd -
        borrowedUsd
    );

  const positionValueUsd =
    directValue !==
      null &&
    directValue >
      0
      ? directValue
      : calculatedValue;

  if (
    !(positionValueUsd > 0)
  ) {
    console.log(
      "[Loopscale] Raw unparsed portfolio:",
      payload
    );

    throw new Error(
      "Loopscale returned data, but NAm could not determine the position value."
    );
  }

  const directPnl =
    findNumericByKeys(
      position,
      [
        "pnlUsd",
        "usdPnl",
        "pnlValue",
        "netPnlUsd",
        "profitLossUsd",
        "profitUsd",
      ]
    );

  const pnlUsd =
    directPnl !==
      null
      ? directPnl
      : positionValueUsd -
        LOOPSCALE_INITIAL_EQUITY_USD;

  let netApy =
    findPercentByKeys(
      position,
      [
        "netApy",
        "effectiveApy",
        "positionApy",
        "loopApy",
      ]
    );

  const suppliedApy =
    getTokenApy(
      onyc,
      "supplied"
    );

  const borrowedApy =
    getTokenApy(
      usdc,
      "borrowed"
    );

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

    netApy =
      (
        (
          yearlySupplyIncome -
          yearlyBorrowCost
        ) /
        positionValueUsd
      ) *
      100;
  }

  if (
    !(netApy > 0)
  ) {
    netApy =
      FALLBACK_NET_APY;
  }

  /*
   * Equity-equivalent ONyc balance.
   */
  const quantity =
    onycPrice >
      0
      ? positionValueUsd /
        onycPrice
      : suppliedOnyc;

  const health =
    findNumericByKeys(
      position,
      [
        "health",
        "healthPercent",
        "healthFactor",
        "healthScore",
      ]
    );

  const loanAddress =
    findStringByKeys(
      position,
      [
        "loanAddress",
        "positionAddress",
        "positionId",
        "loanId",
        "id",
      ]
    ) ||
    "loopscale-onyc";

  const yearlyNetIncome =
    positionValueUsd *
    (
      netApy /
      100
    );

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

    priceUsd:
      onycPrice,

    positionValueUsd,

    pnlUsd,

    netApy,

    health:
      health !==
      null
        ? health
        : 0,

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

    dailyNetYieldUsd:
      yearlyNetIncome /
      365,

    suppliedApy,

    borrowedApy,

    suppliedOnyc,

    borrowedUsdc,

    onycPrice,

    usdcPrice,

    source:
      "loopscale_earn_portfolio",

    syncedAt:
      new Date()
        .toISOString(),

    raw:
      position,
  };
}

export async function getLoopscaleOnycSnapshot(
  walletAddress =
    LOOPSCALE_WALLET
) {
  const payload =
    await fetchPortfolioPositions(
      walletAddress
    );

  const snapshot =
    buildSnapshot(
      payload,
      walletAddress
    );

  console.log(
    "[Loopscale] Live ONyc Loop:",
    snapshot
  );

  return snapshot;
}