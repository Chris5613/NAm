const LULO_API_BASE =
  "/api/market/lulo";

const USDS_MINT =
  "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA";

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

async function getJson(
  path,
  walletAddress
) {
  const url =
    `${LULO_API_BASE}/${path}` +
    `?owner=${encodeURIComponent(
      walletAddress
    )}` +
    `&_=${Date.now()}`;

  const response =
    await fetch(
      url,
      {
        credentials:
          "include",

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
        200
      )}`
    );
  }

  if (
    !contentType.includes(
      "application/json"
    )
  ) {
    throw new Error(
      `Lulo ${path} returned non-JSON content (${contentType || "unknown content type"}): ${raw.slice(
        0,
        200
      )}`
    );
  }

  try {
    return JSON.parse(
      raw
    );
  } catch (
    error
  ) {
    throw new Error(
      `Lulo ${path} returned invalid JSON: ${raw.slice(
        0,
        200
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
    !account &&
    !customAccount
  ) {
    const errors = [
      accountResult,
      customAccountResult,
    ]
      .filter(
        (result) =>
          result.status ===
          "rejected"
      )
      .map(
        (result) =>
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
      (token) =>
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

  if (
    !(totalBalanceUsd > 0)
  ) {
    throw new Error(
      "Lulo returned account data, but no usable USD balance was found."
    );
  }

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

  const transactions = [
    ...(
      project
        .transactions ||
      []
    ),
  ];

  const currentInterest =
    Number(
      snapshot
        ?.totalInterestEarnedUsd
    );

  const hasCurrentInterest =
    Number.isFinite(
      currentInterest
    ) &&
    currentInterest >=
      0;

  const previousInterest =
    Number(
      project
        .lulo_last_interest_usd
    );

  const hasBaseline =
    Number.isFinite(
      previousInterest
    ) &&
    previousInterest >=
      0;

  const initialEarned =
    project
      .lulo_initial_earned !=
      null &&
    Number.isFinite(
      Number(
        project
          .lulo_initial_earned
      )
    )
      ? Number(
          project
            .lulo_initial_earned
        )
      : (
          hasBaseline
            ? 0
            : (
                hasCurrentInterest
                  ? currentInterest
                  : 0
              )
        );

  if (
    dayKey &&
    hasCurrentInterest
  ) {
    const interestDelta =
      hasBaseline
        ? Number(
            Math.max(
              0,
              currentInterest -
                previousInterest
            ).toFixed(
              6
            )
          )
        : 0;

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
              .source ===
              "lulo_yield" &&
            transaction
              .source_date ===
              dayKey
        );

      if (
        existingIndex >=
        0
      ) {
        transactions[
          existingIndex
        ] = {
          ...transactions[
            existingIndex
          ],

          amount:
            Number(
              (
                (
                  Number(
                    transactions[
                      existingIndex
                    ].amount
                  ) ||
                  0
                ) +
                interestDelta
              ).toFixed(
                6
              )
            ),

          interest_to_usd:
            currentInterest,

          sync_to:
            now.toISOString(),
        };
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
            hasBaseline
              ? previousInterest
              : currentInterest,

          interest_to_usd:
            currentInterest,

          sync_from:
            project
              .lulo_last_synced_at,

          sync_to:
            now.toISOString(),
        });
      }
    }
  }

  const getTrackedEarned =
    (items) =>
      initialEarned +
      items
        .filter(
          (
            transaction
          ) =>
            transaction
              .source ===
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
                  .amount
              ) ||
              0
            ),
          0
        );

  const configuredInvested =
    Number(
      project
        .invested
    ) ||
    0;

  const usesMultiTokenBalance =
    project
      .lulo_balance_model ===
    "multi_token_v2";

  const invested =
    usesMultiTokenBalance &&
    configuredInvested >
      0
      ? configuredInvested
      : Math.max(
          0,
          totalBalanceUsd -
            (
              hasCurrentInterest
                ? currentInterest
                : 0
            )
        );

  return {
    ...project,

    invested,

    lulo_balance_model:
      "multi_token_v2",

    transactions,

    lulo_initial_earned:
      initialEarned,

    earned:
      getTrackedEarned(
        transactions
      ),

    lulo_total_balance_usd:
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
      Number(
        snapshot
          ?.weightedApy
      ) ||
      0,

    lulo_lifetime_interest_usd:
      hasCurrentInterest
        ? currentInterest
        : (
            Number(
              project
                .lulo_lifetime_interest_usd
            ) ||
            0
          ),

    lulo_last_interest_usd:
      hasCurrentInterest
        ? currentInterest
        : (
            Number(
              project
                .lulo_last_interest_usd
            ) ||
            0
          ),

    lulo_last_synced_at:
      now.toISOString(),
  };
}