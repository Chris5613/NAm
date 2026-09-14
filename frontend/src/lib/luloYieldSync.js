import {
  proxyFetch,
} from "./cors-proxy";

const USDS_MINT =
  "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA";

const MIN_CASH_FLOW_USD =
  10;

function toDayKey(date) {
  const parsed =
    new Date(date);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  return new Date(
    parsed.getTime() -
      parsed.getTimezoneOffset() *
        60000
  )
    .toISOString()
    .slice(
      0,
      10
    );
}

function firstFiniteNumber(
  ...values
) {
  for (
    const value of values
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

  return 0;
}

function getElapsedDays(
  from,
  to = new Date()
) {
  const fromMs =
    new Date(
      from
    ).getTime();

  const toMs =
    new Date(
      to
    ).getTime();

  if (
    !Number.isFinite(
      fromMs
    ) ||
    !Number.isFinite(
      toMs
    ) ||
    toMs <= fromMs
  ) {
    return 0;
  }

  return (
    toMs -
    fromMs
  ) /
    86400000;
}

function getExpectedYield(
  balance,
  apy,
  elapsedDays
) {
  const safeBalance =
    Math.max(
      0,
      Number(
        balance
      ) || 0
    );

  const safeApy =
    Math.max(
      0,
      Number(
        apy
      ) || 0
    );

  const safeDays =
    Math.max(
      0,
      Number(
        elapsedDays
      ) || 0
    );

  if (
    safeBalance <= 0 ||
    safeApy <= 0 ||
    safeDays <= 0
  ) {
    return 0;
  }

  return (
    safeBalance *
    (
      safeApy /
      100
    ) *
    (
      safeDays /
      365
    )
  );
}

function getInterestDeltaLimit(
  balance,
  apy,
  elapsedDays
) {
  const expected =
    getExpectedYield(
      balance,
      apy,
      elapsedDays
    );

  /*
   * Give the API a very generous tolerance.
   *
   * Real Lulo yield should be nowhere near 8x
   * the expected amount over the same interval.
   *
   * The $2 floor avoids flagging small rounding /
   * delayed-accounting changes.
   */
  return Math.max(
    2,
    (
      expected *
      8
    ) +
      0.25
  );
}

function sanitizeLuloTransactions(
  originalTransactions,
  {
    balance,
    apy,
    now,
  }
) {
  const transactions = [];

  let ignoredArtifactUsd =
    0;

  (
    Array.isArray(
      originalTransactions
    )
      ? originalTransactions
      : []
  ).forEach(
    (
      transaction
    ) => {
      if (
        transaction?.source !==
        "lulo_yield"
      ) {
        transactions.push(
          transaction
        );

        return;
      }

      const amount =
        Number(
          transaction?.amount
        ) || 0;

      if (
        !(amount > 0)
      ) {
        transactions.push(
          transaction
        );

        return;
      }

      const interestFrom =
        Number(
          transaction
            ?.interest_from_usd
        );

      const interestTo =
        Number(
          transaction
            ?.interest_to_usd
        );

      const encodedDelta =
        (
          Number.isFinite(
            interestFrom
          ) &&
          Number.isFinite(
            interestTo
          )
        )
          ? (
              interestTo -
              interestFrom
            )
          : 0;

      const elapsedDays =
        getElapsedDays(
          transaction
            ?.sync_from,
          transaction
            ?.sync_to ||
            transaction
              ?.updated_at ||
            transaction
              ?.created_at ||
            now
        );

      /*
       * Only auto-remove something when we have enough
       * timing information to confidently say the yield
       * jump was impossible.
       */
      if (
        !(elapsedDays > 0)
      ) {
        transactions.push(
          transaction
        );

        return;
      }

      const maxPlausibleDelta =
        getInterestDeltaLimit(
          balance,
          apy,
          elapsedDays
        );

      const deltaMatchesAmount =
        encodedDelta >
          0 &&
        Math.abs(
          encodedDelta -
            amount
        ) <=
          Math.max(
            0.05,
            amount *
              0.05
          );

      const isImpossibleYieldJump =
        amount >
          maxPlausibleDelta &&
        deltaMatchesAmount;

      if (
        isImpossibleYieldJump
      ) {
        /*
         * This is almost certainly an accounting jump
         * caused by principal moving in/out of Lulo.
         *
         * Do not count it as income.
         */
        ignoredArtifactUsd +=
          amount;

        return;
      }

      transactions.push(
        transaction
      );
    }
  );

  return {
    transactions,

    ignoredArtifactUsd:
      Number(
        ignoredArtifactUsd.toFixed(
          8
        )
      ),
  };
}

async function getJson(
  path,
  walletAddress
) {
  const params =
    new URLSearchParams({
      owner:
        walletAddress,

      _:
        String(
          Date.now()
        ),
    });

  const response =
    await proxyFetch(
      `/lulo/${path}?${params.toString()}`,
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

  const contentType =
    response.headers.get(
      "content-type"
    ) || "";

  const raw =
    await response.text();

  if (
    !response.ok
  ) {
    throw new Error(
      `Lulo ${path} returned HTTP ${response.status}: ${raw.slice(
        0,
        220
      )}`
    );
  }

  if (
    !contentType.includes(
      "application/json"
    )
  ) {
    throw new Error(
      `Lulo ${path} returned non-JSON content (${contentType || "unknown"}): ${raw.slice(
        0,
        220
      )}`
    );
  }

  try {
    return JSON.parse(
      raw
    );
  } catch {
    throw new Error(
      `Lulo ${path} returned invalid JSON: ${raw.slice(
        0,
        220
      )}`
    );
  }
}

function fulfilledValue(
  result
) {
  return (
    result?.status ===
    "fulfilled"
      ? result.value
      : null
  );
}

export async function getLuloYieldSnapshot(
  walletAddress
) {
  if (
    !walletAddress
  ) {
    throw new Error(
      "Lulo wallet address is missing."
    );
  }

  const [
    accountResult,
    poolsResult,
    customAccountResult,
  ] =
    await Promise.allSettled(
      [
        getJson(
          "v1/account.getAccount",
          walletAddress
        ),

        getJson(
          "v1/pool.getPools",
          walletAddress
        ),

        getJson(
          "v0/account.getAccount",
          walletAddress
        ),
      ]
    );

  const account =
    fulfilledValue(
      accountResult
    );

  const pools =
    fulfilledValue(
      poolsResult
    );

  const customAccount =
    fulfilledValue(
      customAccountResult
    );

  if (
    accountResult.status ===
    "rejected"
  ) {
    console.warn(
      "Lulo v1 account request failed:",
      accountResult.reason
    );
  }

  if (
    poolsResult.status ===
    "rejected"
  ) {
    console.warn(
      "Lulo pool request failed:",
      poolsResult.reason
    );
  }

  if (
    customAccountResult.status ===
    "rejected"
  ) {
    console.warn(
      "Lulo v0 account request failed:",
      customAccountResult.reason
    );
  }

  if (
    !account &&
    !customAccount
  ) {
    const errors = [
      accountResult,
      customAccountResult,
    ]
      .filter(
        (
          result
        ) =>
          result.status ===
          "rejected"
      )
      .map(
        (
          result
        ) =>
          result.reason
            ?.message
      )
      .filter(
        Boolean
      );

    throw new Error(
      errors.join(
        " | "
      ) ||
        "Lulo account data is unavailable."
    );
  }

  const regularBalanceUsd =
    firstFiniteNumber(
      account
        ?.lusdUsdBalance,

      account
        ?.regularUsdBalance,

      account
        ?.regularBalanceUsd
    );

  const protectedBalanceUsd =
    firstFiniteNumber(
      account
        ?.pusdUsdBalance,

      account
        ?.protectedUsdBalance,

      account
        ?.protectedBalanceUsd
    );

  const tokenBalances =
    Array.isArray(
      customAccount
        ?.tokenBalances
    )
      ? customAccount
          .tokenBalances
      : [];

  const usdsToken =
    tokenBalances.find(
      (
        token
      ) =>
        token?.mint ===
        USDS_MINT
    );

  const usdsBalanceUsd =
    firstFiniteNumber(
      usdsToken
        ?.usdValue,

      usdsToken
        ?.valueUsd,

      usdsToken
        ?.value,

      usdsToken
        ?.balanceUsd
    );

  const customBalanceUsd =
    firstFiniteNumber(
      customAccount
        ?.totalValue,

      customAccount
        ?.totalUsdValue,

      customAccount
        ?.usdValue,

      usdsBalanceUsd
    );

  const v1TotalUsd =
    firstFiniteNumber(
      account
        ?.totalUsdValue,

      account
        ?.totalValue,

      account
        ?.usdValue
    );

  let totalBalanceUsd =
    Math.max(
      0,
      v1TotalUsd
    ) +
    Math.max(
      0,
      customBalanceUsd
    );

  if (
    !(v1TotalUsd > 0)
  ) {
    totalBalanceUsd =
      Math.max(
        0,
        regularBalanceUsd
      ) +
      Math.max(
        0,
        protectedBalanceUsd
      ) +
      Math.max(
        0,
        customBalanceUsd
      );
  }

  if (
    !(totalBalanceUsd > 0)
  ) {
    throw new Error(
      "Lulo returned account data but no usable USD balance."
    );
  }

  const regularApy =
    firstFiniteNumber(
      pools
        ?.regular?.apy
    ) *
    100;

  const protectedApy =
    firstFiniteNumber(
      pools
        ?.protected?.apy
    ) *
    100;

  const usdsApy =
    firstFiniteNumber(
      customAccount
        ?.realtimeAPY,

      customAccount
        ?.apy
    );

  const weightedApy =
    totalBalanceUsd >
    0
      ? (
          (
            regularBalanceUsd *
            regularApy
          ) +
          (
            protectedBalanceUsd *
            protectedApy
          ) +
          (
            customBalanceUsd *
            usdsApy
          )
        ) /
        totalBalanceUsd
      : 0;

  const customInterestEarnedUsd =
    firstFiniteNumber(
      customAccount
        ?.interestEarned,

      customAccount
        ?.totalInterestEarned,

      customAccount
        ?.totalInterest
    );

  const accountInterestEarnedUsd =
    firstFiniteNumber(
      account
        ?.totalInterestEarned,

      account
        ?.interestEarned,

      account
        ?.totalInterest,

      account
        ?.earnedInterest
    );

  const regularInterestEarnedUsd =
    firstFiniteNumber(
      account
        ?.regularInterestEarned,

      account
        ?.regularInterest
    );

  const protectedInterestEarnedUsd =
    firstFiniteNumber(
      account
        ?.protectedInterestEarned,

      account
        ?.protectedInterest
    );

  return {
    walletAddress,

    totalBalanceUsd,

    regularBalanceUsd,

    protectedBalanceUsd,

    usdcBalanceUsd:
      regularBalanceUsd,

    usdsBalanceUsd,

    usdsApy,

    customBalanceUsd,

    customInterestEarnedUsd,

    totalInterestEarnedUsd:
      accountInterestEarnedUsd +
      customInterestEarnedUsd,

    regularInterestEarnedUsd,

    protectedInterestEarnedUsd,

    regularApy,

    protectedApy,

    weightedApy,

    blockTime:
      firstFiniteNumber(
        account
          ?.blockTime,

        customAccount
          ?.blockTime
      ) ||
      null,

    source:
      "lulo_api",

    syncedAt:
      new Date()
        .toISOString(),
  };
}

export function applyLuloYieldSnapshot(
  project,
  snapshot,
  now = new Date()
) {
  if (
    project
      ?.yield_tracking !==
    "lulo_lending"
  ) {
    return project;
  }

  const dayKey =
    toDayKey(
      now
    );

  const totalBalanceUsd =
    Number(
      snapshot
        ?.totalBalanceUsd
    );

  if (
    !Number.isFinite(
      totalBalanceUsd
    ) ||
    totalBalanceUsd <
      0
  ) {
    return project;
  }

  const weightedApy =
    Number(
      snapshot
        ?.weightedApy
    ) ||
    Number(
      project
        ?.lulo_weighted_apy
    ) ||
    0;

  const previousBalance =
    Number(
      project
        ?.lulo_last_balance_usd ??
      project
        ?.lulo_total_balance_usd
    );

  const hasPreviousBalance =
    Number.isFinite(
      previousBalance
    ) &&
    previousBalance >=
      0;

  /*
   * First repair any already-created transaction that
   * represented a principal movement as yield.
   */
  const sanitized =
    sanitizeLuloTransactions(
      project
        ?.transactions,
      {
        balance:
          Math.max(
            totalBalanceUsd,
            hasPreviousBalance
              ? previousBalance
              : 0
          ),

        apy:
          weightedApy,

        now,
      }
    );

  let transactions =
    sanitized.transactions;

  const rawCurrentInterest =
    Number(
      snapshot
        ?.totalInterestEarnedUsd
    );

  const hasRawCurrentInterest =
    Number.isFinite(
      rawCurrentInterest
    ) &&
    rawCurrentInterest >=
      0;

  const oldInterestOffset =
    Number(
      project
        ?.lulo_interest_offset_usd
    ) || 0;

  let interestOffset =
    oldInterestOffset +
    sanitized.ignoredArtifactUsd;

  const previousRawInterest =
    Number(
      project
        ?.lulo_last_raw_interest_usd
    );

  const hasPreviousRawInterest =
    Number.isFinite(
      previousRawInterest
    ) &&
    previousRawInterest >=
      0;

  /*
   * Old versions did not save the raw counter separately.
   *
   * If we just removed one of their bogus transactions,
   * the old lulo_last_interest_usd includes that same bad
   * jump. Subtract it once during the migration.
   */
  const storedPreviousInterest =
    Number(
      project
        ?.lulo_last_interest_usd
    );

  let previousNormalizedInterest =
    hasPreviousRawInterest
      ? Math.max(
          0,
          previousRawInterest -
            oldInterestOffset
        )
      : Number.isFinite(
          storedPreviousInterest
        )
        ? Math.max(
            0,
            storedPreviousInterest -
              sanitized
                .ignoredArtifactUsd
          )
        : 0;

  let detectedArtifactUsd =
    0;

  if (
    hasRawCurrentInterest &&
    hasPreviousRawInterest
  ) {
    const rawInterestDelta =
      rawCurrentInterest -
      previousRawInterest;

    const balanceDelta =
      hasPreviousBalance
        ? (
            totalBalanceUsd -
            previousBalance
          )
        : 0;

    const elapsedDays =
      Math.max(
        getElapsedDays(
          project
            ?.lulo_last_synced_at,
          now
        ),
        1 /
          1440
      );

    const referenceBalance =
      hasPreviousBalance
        ? (
            (
              previousBalance +
              totalBalanceUsd
            ) /
            2
          )
        : totalBalanceUsd;

    const expectedInterest =
      getExpectedYield(
        referenceBalance,
        weightedApy,
        elapsedDays
      );

    const maxNormalInterestDelta =
      getInterestDeltaLimit(
        referenceBalance,
        weightedApy,
        elapsedDays
      );

    const cashFlowThreshold =
      Math.max(
        MIN_CASH_FLOW_USD,
        (
          Math.max(
            referenceBalance,
            0
          ) *
          0.0025
        )
      );

    const withdrawalDetected =
      balanceDelta <
        -cashFlowThreshold;

    const depositDetected =
      balanceDelta >
        cashFlowThreshold;

    /*
     * Withdrawal:
     *
     * A principal withdrawal can cause Lulo's reported
     * lifetime-interest/accounting field to jump upward.
     *
     * Preserve only a small plausible amount of interest
     * that could actually have accrued since the last sync.
     */
    if (
      withdrawalDetected &&
      rawInterestDelta >
        maxNormalInterestDelta
    ) {
      const plausibleInterest =
        Math.max(
          0,
          expectedInterest *
            1.5
        );

      detectedArtifactUsd =
        Math.max(
          0,
          rawInterestDelta -
            plausibleInterest
        );

      interestOffset +=
        detectedArtifactUsd;
    }

    /*
     * Deposit:
     *
     * Some accounting systems can move the raw interest
     * counter downward when more principal is deposited.
     * Offset that reset as well so lifetime earnings stay
     * continuous.
     */
    if (
      depositDetected &&
      rawInterestDelta <
        -maxNormalInterestDelta
    ) {
      interestOffset +=
        rawInterestDelta;

      detectedArtifactUsd +=
        Math.abs(
          rawInterestDelta
        );
    }
  }

  let currentNormalizedInterest =
    hasRawCurrentInterest
      ? Math.max(
          0,
          rawCurrentInterest -
            interestOffset
        )
      : previousNormalizedInterest;

  /*
   * Last safety check.
   *
   * If the normalized interest still jumps by an
   * impossible amount during this tiny sync interval,
   * freeze that portion rather than calling it income.
   */
  if (
    hasRawCurrentInterest
  ) {
    const elapsedDays =
      Math.max(
        getElapsedDays(
          project
            ?.lulo_last_synced_at,
          now
        ),
        1 /
          1440
      );

    const referenceBalance =
      Math.max(
        totalBalanceUsd,
        hasPreviousBalance
          ? previousBalance
          : 0
      );

    const limit =
      getInterestDeltaLimit(
        referenceBalance,
        weightedApy,
        elapsedDays
      );

    const normalizedDelta =
      currentNormalizedInterest -
      previousNormalizedInterest;

    if (
      normalizedDelta >
        (
          limit *
          2
        )
    ) {
      interestOffset +=
        normalizedDelta;

      detectedArtifactUsd +=
        normalizedDelta;

      currentNormalizedInterest =
        previousNormalizedInterest;
    }
  }

  const hasNormalizedInterest =
    Number.isFinite(
      currentNormalizedInterest
    ) &&
    currentNormalizedInterest >=
      0;

  const initialEarned =
    project
      ?.lulo_initial_earned !=
      null &&
    Number.isFinite(
      Number(
        project
          ?.lulo_initial_earned
      )
    )
      ? Number(
          project
            .lulo_initial_earned
        )
      : previousNormalizedInterest;

  if (
    dayKey &&
    hasNormalizedInterest
  ) {
    const interestDelta =
      Number(
        Math.max(
          0,
          currentNormalizedInterest -
            previousNormalizedInterest
        ).toFixed(
          6
        )
      );

    if (
      interestDelta >
      0
    ) {
      const existingIndex =
        transactions.findIndex(
          (
            transaction
          ) =>
            transaction
              ?.source ===
              "lulo_yield" &&
            transaction
              ?.source_date ===
              dayKey
        );

      if (
        existingIndex >=
        0
      ) {
        transactions =
          transactions.map(
            (
              transaction,
              index
            ) =>
              index ===
              existingIndex
                ? {
                    ...transaction,

                    amount:
                      Number(
                        (
                          (
                            Number(
                              transaction
                                ?.amount
                            ) ||
                            0
                          ) +
                          interestDelta
                        ).toFixed(
                          6
                        )
                      ),

                    interest_to_usd:
                      currentNormalizedInterest,

                    raw_interest_to_usd:
                      hasRawCurrentInterest
                        ? rawCurrentInterest
                        : null,

                    sync_to:
                      now.toISOString(),
                  }
                : transaction
          );
      } else {
        transactions.push({
          type:
            "earning",

          amount:
            interestDelta,

          category:
            "Lulo Lending",

          notes:
            `Lulo interest (${dayKey})`,

          date:
            dayKey,

          source:
            "lulo_yield",

          source_date:
            dayKey,

          interest_from_usd:
            previousNormalizedInterest,

          interest_to_usd:
            currentNormalizedInterest,

          raw_interest_to_usd:
            hasRawCurrentInterest
              ? rawCurrentInterest
              : null,

          sync_from:
            project
              ?.lulo_last_synced_at,

          sync_to:
            now.toISOString(),
        });
      }
    }
  }

  const trackedEarned =
    initialEarned +
    transactions
      .filter(
        (
          transaction
        ) =>
          transaction
            ?.source ===
            "lulo_yield"
      )
      .reduce(
        (
          total,
          transaction
        ) =>
          total +
          (
            Number(
              transaction
                ?.amount
            ) ||
            0
          ),
        0
      );

  const configuredInvested =
    Number(
      project
        ?.invested
    ) ||
    0;

  const usesMultiTokenBalance =
    project
      ?.lulo_balance_model ===
    "multi_token_v2";

  const invested =
    usesMultiTokenBalance &&
    configuredInvested >
      0
      ? configuredInvested
      : Math.max(
          0,
          totalBalanceUsd -
            currentNormalizedInterest
        );

  const priorIgnoredArtifacts =
    Number(
      project
        ?.lulo_ignored_interest_artifact_usd
    ) || 0;

  const ignoredThisSync =
    sanitized
      .ignoredArtifactUsd +
    detectedArtifactUsd;

  return {
    ...project,

    invested,

    lulo_balance_model:
      "multi_token_v2",

    transactions,

    lulo_initial_earned:
      initialEarned,

    earned:
      trackedEarned,

    lulo_total_balance_usd:
      totalBalanceUsd,

    lulo_last_balance_usd:
      totalBalanceUsd,

    lulo_regular_balance_usd:
      Number(
        snapshot
          ?.regularBalanceUsd
      ) ||
      0,

    lulo_protected_balance_usd:
      Number(
        snapshot
          ?.protectedBalanceUsd
      ) ||
      0,

    lulo_usdc_balance_usd:
      Number(
        snapshot
          ?.usdcBalanceUsd
      ) ||
      0,

    lulo_usds_balance_usd:
      Number(
        snapshot
          ?.usdsBalanceUsd
      ) ||
      0,

    lulo_usds_apy:
      Number(
        snapshot
          ?.usdsApy
      ) ||
      0,

    lulo_regular_apy:
      Number(
        snapshot
          ?.regularApy
      ) ||
      0,

    lulo_protected_apy:
      Number(
        snapshot
          ?.protectedApy
      ) ||
      0,

    lulo_weighted_apy:
      weightedApy,

    /*
     * IMPORTANT:
     * These two fields are now the NORMALIZED interest,
     * not the unstable raw Lulo accounting counter.
     *
     * Your Project Income page already reads
     * lulo_lifetime_interest_usd, so no JSX change is
     * required.
     */
    lulo_lifetime_interest_usd:
      currentNormalizedInterest,

    lulo_last_interest_usd:
      currentNormalizedInterest,

    lulo_last_raw_interest_usd:
      hasRawCurrentInterest
        ? rawCurrentInterest
        : (
            Number(
              project
                ?.lulo_last_raw_interest_usd
            ) || 0
          ),

    lulo_interest_offset_usd:
      Number(
        interestOffset.toFixed(
          8
        )
      ),

    lulo_ignored_interest_artifact_usd:
      Number(
        (
          priorIgnoredArtifacts +
          ignoredThisSync
        ).toFixed(
          8
        )
      ),

    lulo_last_cash_flow_at:
      ignoredThisSync >
      0.000001
        ? now.toISOString()
        : (
            project
              ?.lulo_last_cash_flow_at ||
            null
          ),

    lulo_last_synced_at:
      now.toISOString(),
  };
}