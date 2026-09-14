import {
  proxyFetch,
} from "./cors-proxy";

export const LOOPSCALE_WALLET =
  "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM";

export const LOOPSCALE_ONYC_STARTED_AT =
  "2026-09-13T00:00:00-07:00";

/*
 * First position screenshot:
 *
 * position value: $1,001.83
 * P&L:            +$1.96
 *
 * Starting equity:
 * $999.87
 *
 * Only used if Loopscale does not return P&L directly.
 */
const LOOPSCALE_INITIAL_EQUITY_USD =
  999.87;

/*
 * Last known net APY from Loopscale itself.
 *
 * Only a fallback. Live API values take priority.
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
    const cleaned =
      value.replace(
        /[^0-9.-]/g,
        ""
      );

    const number =
      Number(cleaned);

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

  /*
   * Support both:
   *
   * 0.1747 -> 17.47%
   * 17.47  -> 17.47%
   */
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

function hasMeaningfulPayload(
  payload
) {
  if (
    payload === null ||
    payload === undefined
  ) {
    return false;
  }

  if (
    Array.isArray(
      payload
    )
  ) {
    return (
      payload.length >
      0
    );
  }

  if (
    typeof payload !==
    "object"
  ) {
    return true;
  }

  const keys =
    Object.keys(
      payload
    );

  if (
    !keys.length
  ) {
    return false;
  }

  const obviousArrays = [
    payload?.positions,
    payload?.items,
    payload?.data,
    payload?.portfolioPositions,
  ];

  const presentArrays =
    obviousArrays.filter(
      Array.isArray
    );

  if (
    presentArrays.length
  ) {
    return presentArrays.some(
      (
        array
      ) =>
        array.length >
        0
    );
  }

  return true;
}

async function parseResponse(
  response
) {
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
    return {
      ok: false,

      status:
        response.status,

      payload:
        null,

      error:
        `Non-JSON response: ${raw.slice(
          0,
          180
        )}`,
    };
  }

  if (
    !response.ok
  ) {
    return {
      ok: false,

      status:
        response.status,

      payload,

      error:
        payload?.detail ||
        payload?.error
          ?.message ||
        payload?.error ||
        payload?.message ||
        `HTTP ${response.status}`,
    };
  }

  return {
    ok: true,

    status:
      response.status,

    payload,

    error:
      "",
  };
}

async function fetchPortfolioPositions(
  walletAddress
) {
  /*
   * We know this endpoint accepts a wallet address,
   * but we're making the client tolerant of the exact
   * parameter name.
   */
  const getAttempts = [
    {
      name:
        "walletAddress",

      url:
        `${PORTFOLIO_ENDPOINT}` +
        `?walletAddress=${encodeURIComponent(
          walletAddress
        )}`,
    },

    {
      name:
        "wallet",

      url:
        `${PORTFOLIO_ENDPOINT}` +
        `?wallet=${encodeURIComponent(
          walletAddress
        )}`,
    },

    {
      name:
        "address",

      url:
        `${PORTFOLIO_ENDPOINT}` +
        `?address=${encodeURIComponent(
          walletAddress
        )}`,
    },

    {
      name:
        "owner",

      url:
        `${PORTFOLIO_ENDPOINT}` +
        `?owner=${encodeURIComponent(
          walletAddress
        )}`,
    },
  ];

  const errors =
    [];

  for (
    const attempt of
    getAttempts
  ) {
    try {
      const response =
        await proxyFetch(
          attempt.url,
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

      const result =
        await parseResponse(
          response
        );

      if (
        result.ok &&
        hasMeaningfulPayload(
          result.payload
        )
      ) {
        console.log(
          `[Loopscale] Portfolio endpoint succeeded with ${attempt.name}:`,
          result.payload
        );

        return result.payload;
      }

      errors.push(
        `${attempt.name}: ${
          result.error ||
          "empty response"
        }`
      );
    } catch (
      error
    ) {
      errors.push(
        `${attempt.name}: ${
          error?.message ||
          "request failed"
        }`
      );
    }
  }

  /*
   * Final fallback:
   * POST the wallet address.
   *
   * The query value is intentionally unique so our
   * backend proxy does not reuse a cached POST response.
   */
  try {
    const response =
      await proxyFetch(
        `${PORTFOLIO_ENDPOINT}?namRequest=walletAddress`,
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
              walletAddress,
            }),
        }
      );

    const result =
      await parseResponse(
        response
      );

    if (
      result.ok &&
      hasMeaningfulPayload(
        result.payload
      )
    ) {
      console.log(
        "[Loopscale] Portfolio endpoint succeeded with POST walletAddress:",
        result.payload
      );

      return result.payload;
    }

    errors.push(
      `POST: ${
        result.error ||
        "empty response"
      }`
    );
  } catch (
    error
  ) {
    errors.push(
      `POST: ${
        error?.message ||
        "request failed"
      }`
    );
  }

  throw new Error(
    `Loopscale portfolio endpoint returned no positions. ${errors.join(
      " | "
    )}`
  );
}

function scorePositionObject(
  object,
  path
) {
  if (
    !object ||
    typeof object !==
      "object"
  ) {
    return 0;
  }

  const json =
    safeStringify(
      object
    )
      .toLowerCase();

  const pathText =
    path
      .join(" ")
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
      "loopscale"
    )
  ) {
    score +=
      60;
  }

  if (
    json.includes(
      "loop"
    )
  ) {
    score +=
      20;
  }

  if (
    (
      json.includes(
        "suppl"
      ) ||
      json.includes(
        "collateral"
      )
    ) &&
    (
      json.includes(
        "borrow"
      ) ||
      json.includes(
        "debt"
      )
    )
  ) {
    score +=
      60;
  }

  if (
    json.includes(
      "positionvalue"
    ) ||
    json.includes(
      "netpositionvalue"
    ) ||
    json.includes(
      "equity"
    )
  ) {
    score +=
      30;
  }

  if (
    json.includes(
      "pnl"
    )
  ) {
    score +=
      15;
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
    pathText.includes(
      "position"
    )
  ) {
    score +=
      10;
  }

  return score;
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
        ) => ({
          ...record,

          score:
            scorePositionObject(
              record.value,
              record.path
            ),

          size:
            safeStringify(
              record.value
            ).length,
        })
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

          /*
           * Prefer the smaller matching object.
           * That's usually the actual position rather
           * than the entire API response.
           */
          return (
            a.size -
            b.size
          );
        }
      );

  if (
    scored.length
  ) {
    console.log(
      "[Loopscale] Selected position object:",
      scored[0]
        .value
    );

    return scored[0]
      .value;
  }

  return payload;
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

            path:
              record.path,

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
    scored[0] ||
    null
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

function findNumericByKeys(
  root,
  keys
) {
  const normalizedKeys =
    keys.map(
      normalizeText
    );

  const records =
    collectObjects(
      root
    );

  /*
   * Shallow objects first.
   */
  records.sort(
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
      const normalizedKey =
        normalizeText(
          key
        );

      if (
        !normalizedKeys.includes(
          normalizedKey
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

      if (
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

function buildSnapshot(
  payload,
  walletAddress
) {
  const position =
    findPositionObject(
      payload
    );

  const onycRecord =
    findTokenObject(
      position,
      "ONyc",
      "supplied"
    );

  const usdcRecord =
    findTokenObject(
      position,
      "USDC",
      "borrowed"
    );

  const onyc =
    onycRecord
      ?.object ||
    null;

  const usdc =
    usdcRecord
      ?.object ||
    null;

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

  const directPositionValue =
    findNumericByKeys(
      position,
      [
        "netPositionValueUsd",
        "positionValueUsd",
        "netValueUsd",
        "equityUsd",
        "equityValueUsd",
        "totalValueUsd",
        "portfolioValueUsd",
      ]
    );

  const calculatedValue =
    Math.max(
      0,
      suppliedUsd -
        borrowedUsd
    );

  const positionValueUsd =
    directPositionValue !==
      null &&
    directPositionValue >
      0
      ? directPositionValue
      : calculatedValue;

  if (
    !(positionValueUsd > 0)
  ) {
    console.log(
      "[Loopscale] Unparsed portfolio payload:",
      payload
    );

    throw new Error(
      "Loopscale returned the portfolio position, but NAm could not determine its USD value."
    );
  }

  const directPnl =
    findNumericByKeys(
      position,
      [
        "pnlUsd",
        "usdPnl",
        "pnlValue",
        "profitLossUsd",
        "profitUsd",
        "netPnlUsd",
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

  /*
   * If Loopscale does not give a direct net APY,
   * calculate it from the supplied and borrowed legs.
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
   * Equity-equivalent ONyc.
   *
   * The actual supplied ONyc is stored separately.
   */
  const quantity =
    onycPrice >
      0
      ? positionValueUsd /
        onycPrice
      : 0;

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

  const startTime =
    findStringByKeys(
      position,
      [
        "startTime",
        "createdAt",
        "openedAt",
        "created_at",
      ]
    ) ||
    LOOPSCALE_ONYC_STARTED_AT;

  const yearlyNetIncome =
    positionValueUsd *
    (
      netApy /
      100
    );

  const dailyNetYieldUsd =
    yearlyNetIncome /
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

    priceUsd:
      onycPrice,

    positionValueUsd,

    pnlUsd,

    netApy,

    health:
      health !== null
        ? health
        : 0,

    startTime,

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

  console.log(
    "[Loopscale] Earn portfolio raw response:",
    payload
  );

  const snapshot =
    buildSnapshot(
      payload,
      walletAddress
    );

  console.log(
    "[Loopscale] Live ONyc Loop snapshot:",
    snapshot
  );

  return snapshot;
}