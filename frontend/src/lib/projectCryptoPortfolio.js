import {
  projectsApi,
  walletsApi,
} from "./api";

import {
  localStorage as storage,
} from "./localStorage";

import {
  getRatexPtonycSnapshot,
} from "./ratexYieldSync";

import {
  getLoopscaleOnycSnapshot,
} from "./loopscaleYieldSync";

const PORTFOLIO_CACHE_KEY =
  "project_crypto_portfolio_v1";

const WALLET_BALANCE_CACHE_KEY =
  "crypto_wallet_balance_cache";

const SALAD_TRACKER_KEY =
  "project_income_salad_tracker_v1";

const AUTO_SYNC_INTERVAL_MS =
  5 * 60 * 1000;

let refreshPromise = null;

function number(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function getMonthKey(
  value = new Date()
) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "";
  }

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
}

function transactionAmount(
  transactions,
  monthKey = null
) {
  return (
    Array.isArray(transactions)
      ? transactions
      : []
  ).reduce(
    (sum, transaction) => {
      if (
        transaction?.type &&
        transaction.type !== "earning"
      ) {
        return sum;
      }

      if (
        monthKey &&
        getMonthKey(
          transaction?.date
        ) !== monthKey
      ) {
        return sum;
      }

      return (
        sum +
        number(transaction?.amount)
      );
    },
    0
  );
}

function projectBalance(project) {
  const liveBalance = [
    project?.lulo_total_balance_usd,
    project?.totalBalance,
    project?.currentBalance,
    project?.current_balance,
    project?.balance,
    project?.value,
  ].find(
    (value) =>
      Number.isFinite(
        Number(value)
      ) &&
      Number(value) >= 0
  );

  if (
    liveBalance !== undefined
  ) {
    return number(liveBalance);
  }

  return Math.max(
    0,
    number(project?.invested)
  );
}

function projectEarned(project) {
  const stored = [
    project
      ?.lulo_lifetime_interest_usd,
    project?.lifetimeUsd,
    project?.lifetime_usd,
    project?.earned,
  ].find((value) =>
    Number.isFinite(
      Number(value)
    )
  );

  if (stored !== undefined) {
    return number(stored);
  }

  return transactionAmount(
    project?.transactions
  );
}

function projectMonthEarned(
  project
) {
  const stored = [
    project?.monthUsd,
    project?.month_usd,
  ].find((value) =>
    Number.isFinite(
      Number(value)
    )
  );

  if (stored !== undefined) {
    return number(stored);
  }

  return transactionAmount(
    project?.transactions,
    getMonthKey()
  );
}

function projectApy(project) {
  return number(
    project?.lulo_weighted_apy ??
      project?.weightedApy ??
      project?.weighted_apy ??
      project?.apy
  );
}

function projectAssets(
  project,
  balance,
  apy
) {
  const source =
    Array.isArray(project?.assets)
      ? project.assets
      : Array.isArray(
            project?.positions
          )
        ? project.positions
        : [];

  if (source.length > 0) {
    return source.map(
      (asset, index) => ({
        ...asset,

        id:
          asset?.id ||
          `${
            project?.id ||
            project?.name ||
            "project"
          }-${index}`,

        asset:
          asset?.asset ||
          asset?.symbol ||
          asset?.name ||
          "Position",

        strategy:
          asset?.strategy ||
          asset?.type ||
          "Yield",

        balance: number(
          asset?.balance ??
            asset?.value ??
            asset?.total_value
        ),

        quantity:
          asset?.quantity ??
          asset?.amount ??
          null,

        price:
          asset?.price ??
          asset?.priceUsd ??
          null,

        apy: number(
          asset?.apy ?? apy
        ),
      })
    );
  }

  if (!(balance > 0)) {
    return [];
  }

  return [
    {
      id: `${
        project?.id ||
        project?.name ||
        "project"
      }-position`,

      asset:
        project?.symbol ||
        project?.asset ||
        project?.name ||
        "Position",

      strategy:
        project?.strategy ||
        project?.category ||
        "Yield",

      balance,

      quantity:
        project?.quantity ??
        null,

      price:
        project?.price ??
        null,

      apy,
    },
  ];
}

function toProjectEntry(
  project,
  index
) {
  const balance =
    projectBalance(project);

  const apy =
    projectApy(project);

  const lifetimeUsd =
    projectEarned(project);

  const monthUsd =
    projectMonthEarned(project);

  return {
    id:
      project?.id ||
      `project-${index}`,

    platform:
      project?.platform ||
      project?.name ||
      "Project",

    logo:
      project?.logo ||
      project?.logo_url ||
      "",

    live: Boolean(
      project?.autoSynced ||
        project?.live ||
        project?.yield_tracking ||
        project?.lastSyncedAt ||
        project?.last_synced_at ||
        project
          ?.lulo_last_synced_at
    ),

    balance,
    apy,
    earned: lifetimeUsd,
    lifetimeUsd,
    monthUsd,

    estimatedMonthlyUsd:
      balance > 0 && apy > 0
        ? (
            balance *
            (apy / 100)
          ) / 12
        : 0,

    lastSyncedAt:
      project?.lastSyncedAt ||
      project?.last_synced_at ||
      project
        ?.lulo_last_synced_at ||
      null,

    assets: projectAssets(
      project,
      balance,
      apy
    ),
  };
}

function readWalletBalanceCache() {
  const cache = storage.get(
    WALLET_BALANCE_CACHE_KEY
  );

  return (
    cache &&
    typeof cache === "object"
  )
    ? cache
    : {};
}

function saveWalletBalance(
  walletId,
  data
) {
  const cache =
    readWalletBalanceCache();

  cache[walletId] = {
    savedAt: Date.now(),
    data,
  };

  storage.set(
    WALLET_BALANCE_CACHE_KEY,
    cache
  );
}

function buildBitcoin(
  wallets,
  balanceCache
) {
  const bitcoinWallets = (
    Array.isArray(wallets)
      ? wallets
      : []
  ).filter(
    (wallet) =>
      String(
        wallet?.chain || ""
      ).toLowerCase() ===
      "bitcoin"
  );

  const entries =
    bitcoinWallets.map(
      (wallet) => {
        const balance =
          balanceCache?.[
            wallet.id
          ]?.data || {};

        const token = (
          Array.isArray(
            balance.tokens
          )
            ? balance.tokens
            : []
        ).find(
          (item) =>
            String(
              item?.symbol || ""
            ).toUpperCase() ===
            "BTC"
        );

        const amount = number(
          token?.amount
        );

        const price = number(
          token?.price
        );

        const value = number(
          token?.usd_value ??
            balance?.total_usd ??
            amount * price
        );

        return {
          id: wallet.id,
          walletId: wallet.id,

          label:
            wallet.label ||
            "Bitcoin Wallet",

          address:
            wallet.address || "",

          amount,
          price,
          value,
        };
      }
    );

  const amount = entries.reduce(
    (sum, wallet) =>
      sum + wallet.amount,
    0
  );

  const value = entries.reduce(
    (sum, wallet) =>
      sum + wallet.value,
    0
  );

  const price =
    entries.find(
      (wallet) =>
        wallet.price > 0
    )?.price || 0;

  return {
    amount,
    price,
    value,
    balance: value,
    wallets: entries,
  };
}

function createSaladEntry() {
  const tracker = storage.get(
    SALAD_TRACKER_KEY
  );

  if (
    !tracker ||
    typeof tracker !== "object"
  ) {
    return null;
  }

  const balance = number(
    tracker.currentBalance
  );

  if (
    !tracker.initialized &&
    !(balance > 0)
  ) {
    return null;
  }

  return {
    id: "salad-live",
    platform: "Salad",
    logo: "",
    live: true,
    balance,
    apy: 0,

    earned: number(
      tracker.lifetimeBalance
    ),

    lifetimeUsd: number(
      tracker.lifetimeBalance
    ),

    monthUsd: 0,
    estimatedMonthlyUsd: 0,

    lastSyncedAt:
      tracker.lastSyncedAt ||
      null,

    assets: [
      {
        id: "salad-balance",
        asset: "Salad Balance",
        strategy: "Compute Earnings",
        balance,
        quantity: null,
        price: null,
        apy: 0,
      },
    ],
  };
}

function createRatexEntry(
  snapshot
) {
  const quantity = number(
    snapshot?.quantity
  );

  const balance = number(
    snapshot?.currentValueUsd
  );

  if (
    !(quantity > 0) ||
    !(balance > 0)
  ) {
    return null;
  }

  const price = number(
    snapshot?.priceUsd
  );

  const apy = number(
    snapshot?.fixedApy
  );

  return {
    id: "ratex-live",
    platform: "RateX",
    logo: "",
    live: true,
    balance,
    apy,

    earned: number(
      snapshot?.earnedUsd
    ),

    lifetimeUsd: number(
      snapshot?.earnedUsd
    ),

    monthUsd: 0,

    estimatedMonthlyUsd:
      balance > 0 && apy > 0
        ? (
            balance *
            (apy / 100)
          ) / 12
        : 0,

    lastSyncedAt:
      snapshot?.syncedAt ||
      new Date().toISOString(),

    assets: [
      {
        id: "ratex-ptonyc",
        asset: "PTONyc",
        strategy: "Fixed Yield",
        balance,
        quantity,
        price,
        apy,
      },
    ],
  };
}

function createLoopscaleEntry(
  snapshot
) {
  const balance = number(
    snapshot?.positionValueUsd
  );

  if (!(balance > 0)) {
    return null;
  }

  const quantity = number(
    snapshot?.quantity
  );

  const price = number(
    snapshot?.priceUsd
  );

  const apy = number(
    snapshot?.netApy
  );

  const earned = number(
    snapshot?.pnlUsd
  );

  return {
    id: "loopscale-live",
    platform: "Loopscale",
    logo: "",
    live: true,
    balance,
    apy,
    earned,
    lifetimeUsd: earned,
    monthUsd: 0,

    estimatedMonthlyUsd:
      balance > 0 && apy > 0
        ? (
            balance *
            (apy / 100)
          ) / 12
        : 0,

    lastSyncedAt:
      snapshot?.syncedAt ||
      new Date().toISOString(),

    assets: [
      {
        id: "loopscale-onyc",
        asset: "ONyc",
        strategy: "Loop",
        balance,
        quantity,
        price,
        apy,
      },
    ],
  };
}

function createPortfolio(
  projects,
  wallets,
  balanceCache,
  errors = [],
  externalEntries = []
) {
  const externalNames =
    new Set(
      externalEntries.map(
        (entry) =>
          String(
            entry?.platform || ""
          )
            .trim()
            .toLowerCase()
      )
    );

  const projectEntries = (
    Array.isArray(projects)
      ? projects
      : []
  )
    .filter((project) => {
      const projectName = String(
        project?.platform ||
        project?.name ||
        ""
      )
        .trim()
        .toLowerCase();

      const trackingType = String(
        project?.yield_tracking ||
        ""
      )
        .trim()
        .toLowerCase();

      return (
        project?.inactive !== true &&
        project?.is_inactive !== true &&
        projectName !== "kryptex" &&
        trackingType !== "kryptex"
      );
    })
    .map(toProjectEntry)
    .filter(
      (entry) =>
        !externalNames.has(
          String(
            entry?.platform || ""
          )
            .trim()
            .toLowerCase()
        )
    );

  projectEntries.push(
    ...externalEntries
  );

  const bitcoin =
    buildBitcoin(
      wallets,
      balanceCache
    );

  const projectBalanceTotal =
    projectEntries.reduce(
      (sum, entry) =>
        sum +
        number(entry.balance),
      0
    );

  const totalEarned =
    projectEntries.reduce(
      (sum, entry) =>
        sum +
        number(
          entry.lifetimeUsd
        ),
      0
    );

  const estimatedMonthlyIncome =
    projectEntries.reduce(
      (sum, entry) =>
        sum +
        number(
          entry
            .estimatedMonthlyUsd
        ),
      0
    );

  const weightedApy =
    projectBalanceTotal > 0
      ? projectEntries.reduce(
          (sum, entry) =>
            sum +
            number(
              entry.balance
            ) *
              number(entry.apy),
          0
        ) /
        projectBalanceTotal
      : 0;

  return {
    projectEntries,
    bitcoin,

    summary: {
      projectBalance:
        projectBalanceTotal,

      bitcoinBalance:
        bitcoin.value,

      cryptoTotal:
        projectBalanceTotal +
        bitcoin.value,

      totalEarned,
      weightedApy,
      estimatedMonthlyIncome,

      activePositions:
        projectEntries.length,
    },

    errors,

    updatedAt:
      new Date().toISOString(),
  };
}

function savePortfolio(
  portfolio
) {
  storage.set(
    PORTFOLIO_CACHE_KEY,
    portfolio
  );

  storage.setCryptoCache({
    ...storage.getCryptoCache(),

    total:
      portfolio.summary
        .cryptoTotal,

    projectPortfolio:
      portfolio,

    updated_at:
      portfolio.updatedAt,
  });

  if (
    typeof window !==
    "undefined"
  ) {
    window.dispatchEvent(
      new CustomEvent(
        "project-crypto-updated",
        {
          detail: portfolio,
        }
      )
    );
  }

  return portfolio;
}

export function getStoredProjectCryptoPortfolio() {
  const saved = storage.get(
    PORTFOLIO_CACHE_KEY
  );

  if (
    saved?.summary &&
    Array.isArray(
      saved?.projectEntries
    )
  ) {
    return saved;
  }

  const saladEntry =
    createSaladEntry();

  return createPortfolio(
    storage.getProjects(),
    storage.getWallets(),
    readWalletBalanceCache(),
    [],
    saladEntry
      ? [saladEntry]
      : []
  );
}

export function seedProjectCryptoCache() {
  const previous = storage.get(
    PORTFOLIO_CACHE_KEY
  );

  const savedExternalEntries = (
    Array.isArray(
      previous?.projectEntries
    )
      ? previous.projectEntries
      : []
  ).filter((entry) => {
    const platform = String(
      entry?.platform || ""
    )
      .trim()
      .toLowerCase();

    return (
      platform === "ratex" ||
      platform === "loopscale"
    );
  });

  const saladEntry =
    createSaladEntry();

  const externalEntries = [
    ...savedExternalEntries,

    ...(saladEntry
      ? [saladEntry]
      : []),
  ];

  return savePortfolio(
    createPortfolio(
      storage.getProjects(),
      storage.getWallets(),
      readWalletBalanceCache(),
      [],
      externalEntries
    )
  );
}

export async function refreshProjectCryptoPortfolio() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const errors = [];

    const previous =
      getStoredProjectCryptoPortfolio();

    let projects =
      storage.getProjects();

    let wallets =
      storage.getWallets();

    try {
      const response =
        await projectsApi
          .accrueApyTransactions();

      projects =
        response?.data ||
        projects;
    } catch (error) {
      errors.push(
        error?.message ||
          "Project Income refresh failed"
      );
    }

    const previousRatex =
      previous
        ?.projectEntries
        ?.find(
          (entry) =>
            String(
              entry?.platform || ""
            ).toLowerCase() ===
            "ratex"
        ) || null;

    const previousLoopscale =
      previous
        ?.projectEntries
        ?.find(
          (entry) =>
            String(
              entry?.platform || ""
            ).toLowerCase() ===
            "loopscale"
        ) || null;

    let ratexEntry =
      previousRatex;

    let loopscaleEntry =
      previousLoopscale;

    const [
      ratexResult,
      loopscaleResult,
    ] = await Promise.allSettled([
      getRatexPtonycSnapshot(),
      getLoopscaleOnycSnapshot(),
    ]);

    if (
      ratexResult.status ===
      "fulfilled"
    ) {
      const next =
        createRatexEntry(
          ratexResult.value
        );

      if (next) {
        ratexEntry = next;
      }
    } else {
      errors.push(
        `RateX: ${
          ratexResult.reason
            ?.message ||
          "refresh failed"
        }`
      );
    }

    if (
      loopscaleResult.status ===
      "fulfilled"
    ) {
      const next =
        createLoopscaleEntry(
          loopscaleResult.value
        );

      if (next) {
        loopscaleEntry = next;
      }
    } else {
      errors.push(
        `Loopscale: ${
          loopscaleResult.reason
            ?.message ||
          "refresh failed"
        }`
      );
    }

    try {
      const response =
        await walletsApi.getAll();

      wallets =
        response?.data ||
        wallets;

      const bitcoinWallets =
        wallets.filter(
          (wallet) =>
            String(
              wallet?.chain || ""
            ).toLowerCase() ===
              "bitcoin" &&
            wallet?.id
        );

      await Promise.all(
        bitcoinWallets.map(
          async (wallet) => {
            try {
              const response =
                await walletsApi
                  .getBalances(
                    wallet.id
                  );

              if (
                !response?.data
                  ?.unavailable
              ) {
                saveWalletBalance(
                  wallet.id,
                  response.data
                );
              } else {
                errors.push(
                  `${
                    wallet.label ||
                    "Bitcoin wallet"
                  }: price unavailable`
                );
              }
            } catch (error) {
              errors.push(
                `${
                  wallet.label ||
                  "Bitcoin wallet"
                }: ${
                  error?.message ||
                  "refresh failed"
                }`
              );
            }
          }
        )
      );
    } catch (error) {
      errors.push(
        error?.message ||
          "Bitcoin refresh failed"
      );
    }

    const saladEntry =
      createSaladEntry();

    const externalEntries = [
      ratexEntry,
      loopscaleEntry,
      saladEntry,
    ].filter(Boolean);

    return savePortfolio(
      createPortfolio(
        projects,
        wallets,
        readWalletBalanceCache(),
        errors,
        externalEntries
      )
    );
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export function startProjectCryptoAutoSync() {
  if (
    typeof window ===
    "undefined"
  ) {
    return () => {};
  }

  const refresh = () => {
    refreshProjectCryptoPortfolio()
      .catch((error) => {
        console.warn(
          "Project crypto refresh failed:",
          error
        );
      });
  };

  refresh();

  const interval =
    window.setInterval(
      refresh,
      AUTO_SYNC_INTERVAL_MS
    );

  window.addEventListener(
    "focus",
    refresh
  );

  window.addEventListener(
    "crypto-holding-updated",
    refresh
  );

  window.addEventListener(
    "rollercoin-sync-complete",
    refresh
  );

  window.addEventListener(
    "salad-sync-complete",
    refresh
  );

  return () => {
    window.clearInterval(
      interval
    );

    window.removeEventListener(
      "focus",
      refresh
    );

    window.removeEventListener(
      "crypto-holding-updated",
      refresh
    );

    window.removeEventListener(
      "rollercoin-sync-complete",
      refresh
    );

    window.removeEventListener(
      "salad-sync-complete",
      refresh
    );
  };
}