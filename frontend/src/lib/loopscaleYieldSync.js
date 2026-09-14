import { proxyFetch } from "./cors-proxy";

export const LOOPSCALE_WALLET =
  "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM";

export const LOOPSCALE_ONYC_STARTED_AT =
  "2026-09-13T00:00:00-07:00";

function toNumber(
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

  return Math.abs(
    number
  ) <= 1
    ? number * 100
    : number;
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

  return null;
}

function getTokenInfoMap(
  payload
) {
  return (
    payload?.tokenInfo
      ?.solana ||
    payload?.tokenInfo ||
    {}
  );
}

function getTokenInfo(
  payload,
  asset
) {
  const address =
    asset?.data
      ?.address;

  if (
    !address
  ) {
    return {};
  }

  const map =
    getTokenInfoMap(
      payload
    );

  return (
    map?.[
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
    getTokenInfo(
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

function getAssetName(
  payload,
  asset
) {
  const info =
    getTokenInfo(
      payload,
      asset
    );

  return String(
    info?.name ||
      asset?.data
        ?.name ||
      getAssetSymbol(
        payload,
        asset
      )
  );
}

function getAssetAmount(
  asset
) {
  return toNumber(
    asset?.data
      ?.amount
  );
}

function getAssetPrice(
  asset
) {
  return toNumber(
    asset?.data
      ?.price
  );
}

function getAssetValue(
  asset
) {
  const direct =
    firstFinite(
      asset?.value,
      asset?.data
        ?.value,
      asset?.data
        ?.usdValue,
      asset?.data
        ?.valueUsd
    );

  if (
    direct !== null
  ) {
    return direct;
  }

  return (
    getAssetAmount(
      asset
    ) *
    getAssetPrice(
      asset
    )
  );
}

function getAssetApy(
  asset,
  kind
) {
  const data =
    asset?.data ||
    {};

  const candidates =
    kind ===
    "borrowed"
      ? [
          asset?.borrowApy,
          asset?.borrowAPY,
          asset?.apy,
          asset?.yield,
          asset?.rate,

          data?.borrowApy,
          data?.borrowAPY,
          data?.apy,
          data?.yield,
          data?.rate,
          data?.interestRate,
          data?.borrowRate,
        ]
      : [
          asset?.supplyApy,
          asset?.supplyAPY,
          asset?.depositApy,
          asset?.apy,
          asset?.yield,
          asset?.rate,

          data?.supplyApy,
          data?.supplyAPY,
          data?.depositApy,
          data?.apy,
          data?.yield,
          data?.rate,
          data?.interestRate,
          data?.supplyRate,
        ];

  for (
    const candidate of
    candidates
  ) {
    const percent =
      toPercent(
        candidate
      );

    if (
      percent >
      0
    ) {
      return percent;
    }
  }

  /*
   * Future-proof fallback.
   *
   * Jupiter occasionally changes field names.
   * Search the immediate asset object for anything
   * containing APY or yield.
   */
  for (
    const container of
    [
      asset,
      data,
    ]
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
      const name =
        normalizeText(
          key
        );

      if (
        !name.includes(
          "apy"
        ) &&
        !name.includes(
          "yield"
        )
      ) {
        continue;
      }

      const percent =
        toPercent(
          value
        );

      if (
        percent >
        0
      ) {
        return percent;
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

  const supplied =
    Array.isArray(
      data
        ?.suppliedAssets
    )
      ? data
          .suppliedAssets
      : [];

  const borrowed =
    Array.isArray(
      data
        ?.borrowedAssets
    )
      ? data
          .borrowedAssets
      : [];

  return {
    supplied,
    borrowed,
  };
}

function isOnycAsset(
  payload,
  asset
) {
  const symbol =
    normalizeText(
      getAssetSymbol(
        payload,
        asset
      )
    );

  const name =
    normalizeText(
      getAssetName(
        payload,
        asset
      )
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

function isUsdcAsset(
  payload,
  asset
) {
  const symbol =
    normalizeText(
      getAssetSymbol(
        payload,
        asset
      )
    );

  return (
    symbol ===
      "usdc" ||
    symbol.includes(
      "usdc"
    )
  );
}

function elementText(
  element
) {
  return [
    element?.platformId,
    element?.name,
    element?.label,
    element?.type,
    element?.data
      ?.link,
    element?.data
      ?.ref,
  ]
    .map(
      normalizeText
    )
    .join(" ");
}

function isLoopscaleByName(
  element
) {
  return elementText(
    element
  ).includes(
    "loopscale"
  );
}

function isOnycUsdcBorrowLend(
  payload,
  element
) {
  const {
    supplied,
    borrowed,
  } =
    getBorrowLendAssets(
      element
    );

  const hasOnyc =
    supplied.some(
      (
        asset
      ) =>
        isOnycAsset(
          payload,
          asset
        )
    );

  const hasUsdc =
    borrowed.some(
      (
        asset
      ) =>
        isUsdcAsset(
          payload,
          asset
        )
    );

  return (
    hasOnyc &&
    hasUsdc
  );
}

function findLoopscaleElement(
  payload
) {
  const elements =
    Array.isArray(
      payload?.elements
    )
      ? payload.elements
      : [];

  /*
   * Best match:
   * explicitly named Loopscale AND ONyc/USDC.
   */
  const exact =
    elements.find(
      (
        element
      ) =>
        isLoopscaleByName(
          element
        ) &&
        isOnycUsdcBorrowLend(
          payload,
          element
        )
    );

  if (
    exact
  ) {
    return exact;
  }

  /*
   * Jupiter already shows your position as:
   *
   * Supplied: ONyc
   * Borrowed: USDC
   *
   * So this is a strong identifier even if
   * platformId is renamed internally.
   */
  const tokenPair =
    elements.find(
      (
        element
      ) =>
        isOnycUsdcBorrowLend(
          payload,
          element
        )
    );

  if (
    tokenPair
  ) {
    return tokenPair;
  }

  /*
   * Final fallback:
   * anything Jupiter names Loopscale.
   */
  return (
    elements.find(
      isLoopscaleByName
    ) ||
    null
  );
}

function findPnlRecursive(
  value,
  depth = 0
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    depth >
      5
  ) {
    return null;
  }

  const priorityKeys = [
    "pnlUsd",
    "usdPnl",
    "pnlValue",
    "profitUsd",
    "profitLossUsd",
  ];

  for (
    const key of
    priorityKeys
  ) {
    if (
      Object.prototype
        .hasOwnProperty.call(
          value,
          key
        )
    ) {
      const number =
        Number(
          value[
            key
          ]
        );

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
    const child of
    Object.values(
      value
    )
  ) {
    if (
      !child ||
      typeof child !==
        "object"
    ) {
      continue;
    }

    const result =
      findPnlRecursive(
        child,
        depth + 1
      );

    if (
      result !== null
    ) {
      return result;
    }
  }

  return null;
}

function buildSnapshot(
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
        getAssetValue(
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
        getAssetValue(
          asset
        ),
      0
    );

  const directValue =
    firstFinite(
      element?.value,
      element?.data
        ?.value,
      element?.totalValue,
      element?.data
        ?.totalValue
    );

  /*
   * Jupiter screenshot:
   *
   * supplied  $2,849.36
   * borrowed -$1,849.57
   * -------------------
   * equity      $999.79
   *
   * Jupiter displayed $999.80 due to rounding.
   */
  const positionValueUsd =
    directValue !==
      null &&
    directValue >
      0
      ? directValue
      : Math.max(
          0,
          suppliedUsd -
            borrowedUsd
        );

  const onycPrice =
    getAssetPrice(
      onyc
    );

  /*
   * Net-equity-equivalent ONyc amount.
   *
   * Do NOT use the full 2,489 ONyc supplied amount as
   * the portfolio balance because most of that position
   * is financed with borrowed USDC.
   */
  const quantity =
    onycPrice >
    0
      ? positionValueUsd /
        onycPrice
      : 0;

  const suppliedApy =
    getAssetApy(
      onyc,
      "supplied"
    );

  const borrowedApy =
    getAssetApy(
      usdc,
      "borrowed"
    );

  let netApy =
    toPercent(
      firstFinite(
        element?.netApy,
        element?.apy,
        element?.data
          ?.netApy,
        element?.data
          ?.apy
      )
    );

  /*
   * Calculate effective Loop APY from the two legs
   * if Jupiter does not supply a net APY directly.
   *
   * Based on your current Jupiter card:
   *
   * supplied ONyc yield
   * minus
   * USDC borrow cost
   *
   * divided by your actual equity.
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

  const detectedPnl =
    findPnlRecursive(
      element
    );

  const pnlUsd =
    detectedPnl !==
      null
      ? detectedPnl
      : 0;

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
      getAssetAmount(
        onyc
      ),

    borrowedUsdc:
      getAssetAmount(
        usdc
      ),

    source:
      "jupiter_portfolio_loopscale",

    syncedAt:
      new Date()
        .toISOString(),

    raw:
      element,
  };
}

async function fetchJupiterPortfolio(
  walletAddress
) {
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
        `Jupiter Portfolio returned HTTP ${response.status}`
    );
  }

  return payload;
}

export async function getLoopscaleOnycSnapshot(
  walletAddress =
    LOOPSCALE_WALLET
) {
  const payload =
    await fetchJupiterPortfolio(
      walletAddress
    );

  const element =
    findLoopscaleElement(
      payload
    );

  if (
    !element
  ) {
    /*
     * Leave very useful diagnostics in the console if
     * Jupiter changes its position structure again.
     */
    console.log(
      "[Loopscale] Jupiter elements:",
      payload?.elements
    );

    console.log(
      "[Loopscale] Jupiter tokenInfo:",
      payload?.tokenInfo
    );

    throw new Error(
      "Jupiter returned the wallet portfolio, but NAm could not locate the Loopscale ONyc/USDC position."
    );
  }

  const snapshot =
    buildSnapshot(
      payload,
      element,
      walletAddress
    );

  console.log(
    "[Loopscale] Live snapshot:",
    snapshot
  );

  return snapshot;
}