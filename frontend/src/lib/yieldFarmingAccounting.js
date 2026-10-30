// Core project-income calculations and persistence helpers.
// Extracted without changing the original accounting algorithms.
import { remoteStorage } from "@/lib/serverStore";
import { coinGeckoApi } from "@/lib/external-apis";

const STORAGE_KEY = "networth_yield_positions";
const LOGO_STORAGE_KEY = "yield_project_logos_v1";
const MONTHLY_BACKFILL_KEY = "yield_monthly_earnings_backfill_v1";
const LULO_MONTHLY_BASELINE_KEY = "yield_lulo_monthly_baselines_v1";
const MONTHLY_SNAPSHOT_KEY = "yield_monthly_snapshots_v1";
const DAILY_BALANCE_SNAPSHOT_KEY = "yield_daily_project_balance_snapshots_v1";
const DAILY_EARNINGS_CHART_OBSERVATIONS_KEY = "yield_daily_earnings_chart_observations_v1";
const AUTO_RECOVERED_EARNINGS_KEY = "yield_auto_recovered_earnings_v1";
const LOOPSCALE_HISTORY_KEY = "yield_loopscale_position_history_v1";
const SALAD_TRACKER_KEY = "project_income_salad_tracker_v1";
const ROLLERCOIN_TRACKER_KEY = "project_income_rollercoin_tracker_v2";
const UNETWORK_TRACKER_KEY = "project_income_unetwork_tracker_v1";
const KRYPTEX_TRACKER_KEY = "project_income_kryptex_tracker_v1";
const PROJECT_QUICK_CACHE_KEY = "yield_project_quick_cache_v1";
const INACTIVE_PROJECTS_KEY = "yield_inactive_project_ids_v1";
const PROJECT_PAYBACK_KEY = "yield_project_payback_v1";
const PROJECT_EXPENSES_KEY = "project_income_monthly_expenses_v1";

const PROJECT_INCOME_PORTFOLIO_SUMMARY_KEY =
  "project_income_portfolio_summary_v1";


const MONTHLY_TRACKING_START = "2026-09";
const LULO_SEPTEMBER_2026_OPENING_EARNED = 9.05;
const LULO_MONTHLY_ACCOUNTING_VERSION = 5;

const ROLLERCOIN_HISTORICAL_TRX = 69.123738;

const ROLLERCOIN_SEPTEMBER_2026_BASELINE_TRX = 45.443264;

const ROLLERCOIN_SEPTEMBER_2026_BASELINE_END =
  "2026-09-14";

const KRYPTEX_START_DATE =
  "2026-09-18";

const KRYPTEX_OPENING_BALANCE_USD =
  16.47;


function readObject(key) {
  try {
    const raw = remoteStorage.getItem(key);

    if (!raw) return {};

    const parsed = JSON.parse(raw);

    return parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function saveObject(key, value) {
  remoteStorage.setItem(
    key,
    JSON.stringify(value)
  );
}

function loadProjectPayback() {
  return readObject(
    PROJECT_PAYBACK_KEY
  );
}

function saveProjectPayback(value) {
  saveObject(
    PROJECT_PAYBACK_KEY,
    value
  );
}

function loadProjectExpenses() {
  return readObject(
    PROJECT_EXPENSES_KEY
  );
}

function saveProjectExpenses(value) {
  saveObject(
    PROJECT_EXPENSES_KEY,
    value
  );
}

function getPaybackStats(
  earned,
  dailyIncome,
  totalSpent
) {
  const spent =
    Math.max(
      0,
      Number(totalSpent) || 0
    );

  if (spent <= 0) {
    return {
      configured: false,
      spent: 0,
      earned:
        Number(earned) || 0,
      pnl: null,
      remaining: null,
      daysToProfit: null,
    };
  }

  const earnedAmount =
    Number(earned) || 0;

  const daily =
    Math.max(
      0,
      Number(dailyIncome) || 0
    );

  const pnl =
    earnedAmount -
    spent;

  const remaining =
    Math.max(
      0,
      spent -
        earnedAmount
    );

  return {
    configured: true,
    spent,
    earned:
      earnedAmount,
    pnl,
    remaining,
    daysToProfit:
      remaining <= 0
        ? 0
        : daily > 0
          ? Math.ceil(
              remaining /
                daily
            )
          : null,
  };
}

function loadProjectLogos() {
  return readObject(LOGO_STORAGE_KEY);
}

function saveProjectLogos(logos) {
  saveObject(
    LOGO_STORAGE_KEY,
    logos
  );
}

function loadMonthlyBackfills() {
  return readObject(
    MONTHLY_BACKFILL_KEY
  );
}

function saveMonthlyBackfills(value) {
  saveObject(
    MONTHLY_BACKFILL_KEY,
    value
  );
}

function loadLuloMonthlyBaselines() {
  return readObject(
    LULO_MONTHLY_BASELINE_KEY
  );
}

function saveLuloMonthlyBaselines(value) {
  saveObject(
    LULO_MONTHLY_BASELINE_KEY,
    value
  );
}

function loadMonthlySnapshots() {
  return readObject(
    MONTHLY_SNAPSHOT_KEY
  );
}

function saveMonthlySnapshots(value) {
  saveObject(
    MONTHLY_SNAPSHOT_KEY,
    value
  );
}

function loadLoopscaleHistory() {
  const parsed =
    readObject(
      LOOPSCALE_HISTORY_KEY
    );

  return {
    positions:
      parsed.positions &&
      typeof parsed.positions ===
        "object"
        ? parsed.positions
        : {},
  };
}

function saveLoopscaleHistory(
  value
) {
  saveObject(
    LOOPSCALE_HISTORY_KEY,
    value
  );
}

function loadSaladTracker() {
  const parsed =
    readObject(
      SALAD_TRACKER_KEY
    );

  return {
    initialized:
      Boolean(
        parsed.initialized
      ),
    startedMonth:
      parsed.startedMonth ||
      null,
    currentBalance:
      Number(
        parsed.currentBalance
      ) || 0,
    lifetimeBalance:
      Number(
        parsed.lifetimeBalance
      ) || 0,
    lastBalance:
      Number(
        parsed.lastBalance
      ) || 0,

    balanceHighWater:
      Number(parsed.balanceHighWater) ||
      Number(parsed.lastBalance) || 0,
    lastLifetimeBalance:
      Number(
        parsed.lastLifetimeBalance
      ) || 0,
    monthBaselineMonth:
      parsed.monthBaselineMonth ||
      null,
    monthBaselineLifetimeBalance:
      Number.isFinite(
        Number(
          parsed.monthBaselineLifetimeBalance
        )
      )
        ? Number(
            parsed.monthBaselineLifetimeBalance
          )
        : null,
    lastSyncedAt:
      parsed.lastSyncedAt ||
      null,
    lastWithdrawalAt:
      parsed.lastWithdrawalAt ||
      null,
    withdrawals:
      Number(
        parsed.withdrawals
      ) || 0,
    monthlyEarnings:
      parsed.monthlyEarnings &&
      typeof parsed.monthlyEarnings ===
        "object"
        ? parsed.monthlyEarnings
        : {},
    daily:
      parsed.daily &&
      typeof parsed.daily ===
        "object"
        ? parsed.daily
        : {},
    // Preserve post-9 AM live earnings across page reloads.
    saladPostMorningEarned: Math.max(
      0,
      Number(parsed.saladPostMorningEarned) || 0
    ),
    earningSnapshots:
      Array.isArray(
        parsed.earningSnapshots
      )
        ? parsed.earningSnapshots
            .filter(
              (entry) =>
                entry &&
                Number.isFinite(
                  Number(
                    entry.lifetimeBalance
                  )
                ) &&
                !Number.isNaN(
                  new Date(
                    entry.syncedAt
                  ).getTime()
                )
            )
            .slice(-2880)
        : [],
  };
}

function saveSaladTracker(value) {
  saveObject(
    SALAD_TRACKER_KEY,
    value
  );
}

function getSaladTrackerStats(
  tracker
) {
  const currentMonth =
    getCurrentMonthKey();

  const currentBalance =
    Number(
      tracker?.currentBalance
    ) || 0;

  const lifetimeUsd =
    Number(
      tracker?.lifetimeBalance
    ) || 0;

  const currentMonthDailyEntries =
    Object.entries(
      tracker?.daily || {}
    ).filter(
      ([date]) =>
        String(date).slice(
          0,
          7
        ) === currentMonth
    );

  const exactMonthUsd =
    currentMonthDailyEntries.reduce(
      (
        sum,
        [
          ,
          amount,
        ]
      ) =>
        sum +
        (Number(
          amount
        ) || 0),
      0
    );

  /*
   * Current-month Salad income must NEVER be the
   * available balance. The balance can carry money
   * from prior months.
   *
   * Use the month-specific earnings bucket that is
   * built from Salad's lifetime-balance delta.
   */
  const monthUsd =
    Math.max(
      0,
      Number(
        tracker?.monthlyEarnings?.[
          currentMonth
        ]
      ) || 0
    );

  const currentDay =
    Math.max(
      1,
      Number(
        getTodayKey().slice(
          8,
          10
        )
      ) || 1
    );

  /*
   * Projection rate:
   *
   * Use the newest lifetime-balance reading and
   * compare it with the saved reading closest to
   * one hour earlier.
   *
   * We accept a 45-90 minute window and normalize
   * the change back to an hourly rate. This keeps
   * a delayed browser/extension sync from making
   * the estimate artificially high or low.
   *
   * lifetimeBalance is used instead of the
   * withdrawable/current balance so a withdrawal
   * does not look like negative earnings.
   */
  const earningSnapshots =
    (
      Array.isArray(
        tracker?.earningSnapshots
      )
        ? tracker.earningSnapshots
        : []
    )
      .map(
        (entry) => ({
          syncedAt:
            entry?.syncedAt ||
            null,
          timestamp:
            new Date(
              entry?.syncedAt
            ).getTime(),
          lifetimeBalance:
            Number(
              entry?.lifetimeBalance
            ),
        })
      )
      .filter(
        (entry) =>
          Number.isFinite(
            entry.lifetimeBalance
          ) &&
          Number.isFinite(
            entry.timestamp
          )
      )
      .sort(
        (
          a,
          b
        ) =>
          a.timestamp -
          b.timestamp
      );

  let estimatedHourlyUsd =
    null;

  let projectionWindowMinutes =
    null;

  if (
    earningSnapshots.length >=
    2
  ) {
    const latest =
      earningSnapshots[
        earningSnapshots.length -
          1
      ];

    const targetTimestamp =
      latest.timestamp -
      60 * 60 * 1000;

    const candidates =
      earningSnapshots.filter(
        (entry) => {
          const ageMinutes =
            (
              latest.timestamp -
              entry.timestamp
            ) /
            60000;

          return (
            ageMinutes >= 45 &&
            ageMinutes <= 90
          );
        }
      );

    if (
      candidates.length
    ) {
      const comparison =
        candidates.reduce(
          (
            closest,
            entry
          ) =>
            Math.abs(
              entry.timestamp -
                targetTimestamp
            ) <
            Math.abs(
              closest.timestamp -
                targetTimestamp
            )
              ? entry
              : closest
        );

      const elapsedHours =
        (
          latest.timestamp -
          comparison.timestamp
        ) /
        3600000;

      const earnedDelta =
        latest.lifetimeBalance -
        comparison.lifetimeBalance;

      if (
        elapsedHours > 0 &&
        earnedDelta >= 0
      ) {
        estimatedHourlyUsd =
          earnedDelta /
          elapsedHours;

        projectionWindowMinutes =
          elapsedHours *
          60;
      }
    }
  }

  /*
   * Until we have roughly one hour of saved sync
   * history, fall back to the existing month-to-date
   * daily average so the card never drops to $0.
   */
  const fallbackDailyUsd =
    monthUsd /
    currentDay;

  const estimatedDailyUsd =
    estimatedHourlyUsd !==
      null
      ? estimatedHourlyUsd *
        24
      : fallbackDailyUsd;

  return {
    currentBalance,

    lifetimeUsd,

    monthUsd,

    withdrawals: 0,

    estimatedHourlyUsd:
      estimatedHourlyUsd !==
      null
        ? estimatedHourlyUsd
        : estimatedDailyUsd /
          24,

    estimatedDailyUsd,

    estimatedMonthlyUsd:
      estimatedDailyUsd *
      30.4375,

    estimatedYearlyUsd:
      estimatedDailyUsd *
      365,

    projectionSource:
      estimatedHourlyUsd !==
      null
        ? "recent_hour"
        : "month_average",

    projectionWindowMinutes,

    lastSyncedAt:
      tracker?.lastSyncedAt ||
      null,
  };
}

function loadUnetworkTracker() {
  const parsed =
    readObject(
      UNETWORK_TRACKER_KEY
    );

  return {
    initialized:
      Boolean(
        parsed.initialized
      ),

    currentBalance:
      Number(
        parsed.currentBalance
      ) || 0,

    availableBalance:
      Number(
        parsed.availableBalance
      ) || 0,

    pendingBalance:
      Number(
        parsed.pendingBalance
      ) || 0,

    lastBalance:
      Number(
        parsed.lastBalance
      ) || 0,

    withdrawals:
      Number(
        parsed.withdrawals
      ) || 0,

    /*
     * Unetwork's allocation history can be incomplete compared with
     * the live rewards_get_balance value. These fields let us treat
     * the first live balance as the starting earned amount, then add
     * only NEW allocations that appear after that baseline.
     */
    openingEarnedUsd:
      Number(
        parsed.openingEarnedUsd
      ) || 0,

    allocationsBaselineUsd:
      Number(
        parsed.allocationsBaselineUsd
      ) || 0,

    openingMonth:
      parsed.openingMonth ||
      null,

    openingMonthRowsBaselineUsd:
      Number(
        parsed.openingMonthRowsBaselineUsd
      ) || 0,

    baselineInitialized:
      Boolean(
        parsed.baselineInitialized
      ),

    lastSyncedAt:
      parsed.lastSyncedAt ||
      null,

    daily:
      parsed.daily &&
      typeof parsed.daily ===
        "object"
        ? parsed.daily
        : {},
  };
}

function saveUnetworkTracker(
  value
) {
  saveObject(
    UNETWORK_TRACKER_KEY,
    value
  );
}

function getUnetworkMonthTotals(
  tracker
) {
  const totals = {};

  Object.entries(
    tracker?.daily ||
      {}
  ).forEach(
    ([
      date,
      entry,
    ]) => {
      const monthKey =
        String(
          date || ""
        ).slice(
          0,
          7
        );

      if (
        !/^\d{4}-\d{2}$/.test(
          monthKey
        )
      ) {
        return;
      }

      const usd =
        typeof entry ===
          "number"
          ? Number(entry) || 0
          : Number(
              entry?.usd
            ) || 0;

      totals[
        monthKey
      ] =
        (
          Number(
            totals[
              monthKey
            ]
          ) || 0
        ) +
        usd;
    }
  );

  return totals;
}

function getUnetworkTrackerStats(
  tracker
) {
  const monthTotals =
    getUnetworkMonthTotals(
      tracker
    );

  const currentMonth =
    getCurrentMonthKey();

  const rowsLifetimeUsd =
    Object.values(
      monthTotals
    ).reduce(
      (
        sum,
        amount
      ) =>
        sum +
        (
          Number(
            amount
          ) || 0
        ),
      0
    );

  const baselineInitialized =
    Boolean(
      tracker?.baselineInitialized
    );

  const openingEarnedUsd =
    Number(
      tracker?.openingEarnedUsd
    ) || 0;

  const allocationsBaselineUsd =
    Number(
      tracker?.allocationsBaselineUsd
    ) || 0;

  const openingMonth =
    tracker?.openingMonth ||
    null;

  const openingMonthRowsBaselineUsd =
    Number(
      tracker?.openingMonthRowsBaselineUsd
    ) || 0;

  /*
   * The initial live balance is the minimum amount we know the user
   * has already earned. Allocation rows may omit earlier rewards.
   *
   * After that first baseline, only newly appearing allocation
   * earnings are added so we never double-count the original rows.
   */
  /*
   * Lifetime earned should come from the full allocation history.
   * This preserves the real all-time total (for example $200+)
   * instead of resetting lifetime earned to the current $1.99 balance.
   *
   * The opening balance baseline is only for CURRENT MONTH income.
   */
  const lifetimeUsd =
    Math.max(
      rowsLifetimeUsd,
      openingEarnedUsd
    );

  const rawCurrentMonthUsd =
    Number(
      monthTotals[
        currentMonth
      ]
    ) || 0;

  let monthUsd =
    rawCurrentMonthUsd;

  if (
    baselineInitialized &&
    openingMonth ===
      currentMonth
  ) {
    monthUsd =
      openingEarnedUsd +
      Math.max(
        0,
        rawCurrentMonthUsd -
          openingMonthRowsBaselineUsd
      );
  }

  /*
   * Unetwork projection:
   *
   * Use the most recent COMPLETED day's actual
   * allocation earnings instead of a hard-coded
   * $1.00/day estimate.
   *
   * Today's partial earnings are deliberately
   * ignored because the day is still in progress.
   *
   * If no completed-day earning exists yet,
   * fall back to $1.00/day so the card still has
   * a useful projection.
   */
  const todayKey =
    getTodayKey();

  const completedDailyEntries =
    Object.entries(
      tracker?.daily || {}
    )
      .map(
        ([
          date,
          entry,
        ]) => ({
          date:
            String(
              date
            ).slice(
              0,
              10
            ),

          usd:
            typeof entry ===
            "number"
              ? Number(
                  entry
                ) || 0
              : Number(
                  entry?.usd
                ) || 0,
        })
      )
      .filter(
        (entry) =>
          /^\d{4}-\d{2}-\d{2}$/.test(
            entry.date
          ) &&
          entry.date <
            todayKey &&
          Number.isFinite(
            entry.usd
          ) &&
          entry.usd >=
            0
      )
      .sort(
        (
          a,
          b
        ) =>
          b.date.localeCompare(
            a.date
          )
      );

  const latestCompletedDay =
    completedDailyEntries[
      0
    ] || null;

  const estimatedDailyUsd =
    latestCompletedDay
      ? latestCompletedDay.usd
      : 1;

  const estimatedMonthlyUsd =
    estimatedDailyUsd *
    30.4375;

  const estimatedYearlyUsd =
    estimatedDailyUsd *
    365;

  return {
    currentBalance:
      Number(
        tracker?.currentBalance
      ) || 0,

    availableBalance:
      Number(
        tracker?.availableBalance
      ) || 0,

    pendingBalance:
      Number(
        tracker?.pendingBalance
      ) || 0,

    monthUsd,

    lifetimeUsd,

    withdrawals:
      Number(
        tracker?.withdrawals
      ) || 0,

    estimatedDailyUsd,

    estimatedMonthlyUsd,

    estimatedYearlyUsd,

    projectionSource:
      latestCompletedDay
        ? "latest_completed_day"
        : "fallback",

    projectionDate:
      latestCompletedDay?.date ||
      null,

    lastSyncedAt:
      tracker?.lastSyncedAt ||
      null,

    transactionCount:
      Object.keys(
        tracker?.daily ||
          {}
      ).length,
  };
}


function loadRollerCoinTracker() {
  const parsed =
    readObject(
      ROLLERCOIN_TRACKER_KEY
    );

  return {
    daily:
      parsed.daily &&
      typeof parsed.daily ===
        "object"
        ? parsed.daily
        : {},
    lastSyncedAt:
      parsed.lastSyncedAt ||
      null,
    lastRange:
      parsed.lastRange &&
      typeof parsed.lastRange ===
        "object"
        ? parsed.lastRange
        : null,
    lastTrxPrice:
      Number(
        parsed.lastTrxPrice ?? parsed.lastSolPrice
      ) || 0,

    currentTrxBalance:
      Number.isFinite(
        Number(
          parsed.currentTrxBalance
        )
      )
        ? Number(
            parsed.currentTrxBalance
          )
        : 0,

    balanceSyncedAt:
      parsed.balanceSyncedAt ||
      null,

    balanceSource:
      parsed.balanceSource ||
      null,
    walletDaily: parsed.walletDaily && typeof parsed.walletDaily === "object"
      ? parsed.walletDaily : {},
    walletLastObservedTrx: parsed.walletLastObservedTrx !== null &&
      parsed.walletLastObservedTrx !== undefined &&
      Number.isFinite(Number(parsed.walletLastObservedTrx))
      ? Number(parsed.walletLastObservedTrx) : null,
    walletLastObservedAt: parsed.walletLastObservedAt || null,
  };
}

function saveRollerCoinTracker(value) {
  saveObject(
    ROLLERCOIN_TRACKER_KEY,
    value
  );
}

async function fetchLiveTrxPrice() {
  try {
    const price =
      Number(
        await coinGeckoApi.getPrice(
          "tron"
        )
      ) || 0;

    if (price > 0) {
      return price;
    }
  } catch {
    // Try the public fallbacks below.
  }

  try {
    const response =
      await fetch(
        "https://api.coinbase.com/v2/prices/TRX-USD/spot",
        {
          credentials:
            "omit",
        }
      );

    if (response.ok) {
      const data =
        await response.json();

      const price =
        Number(
          data?.data?.amount
        ) || 0;

      if (price > 0) {
        return price;
      }
    }
  } catch {
    // Try Kraken next.
  }

  try {
    const response =
      await fetch(
        "https://api.kraken.com/0/public/Ticker?pair=TRXUSD",
        {
          credentials:
            "omit",
        }
      );

    if (response.ok) {
      const data =
        await response.json();

      const ticker =
        Object.values(
          data?.result ||
            {}
        )[0];

      const price =
        Number(
          ticker?.c?.[0]
        ) || 0;

      if (price > 0) {
        return price;
      }
    }
  } catch {
    // Fall through to zero.
  }

  return 0;
}

function getRollerCoinTrackerStats(
  tracker
) {
  const rows =
    Object.entries(
      tracker?.daily ||
        {}
    );

  const todayKey =
    getTodayKey();

  const currentMonth =
    getCurrentMonthKey();

  let todayUsd = 0;
  let todayTrx = 0;

  let monthUsd = 0;
  let monthTrx = 0;

  let lifetimeUsd = 0;
  let lifetimeTrx = 0;

  rows.forEach(
    ([
      date,
      entry,
    ]) => {
      const usd =
        Number(
          entry?.usd
        ) || 0;

      const trx =
        Number(
          entry?.trx ??
            entry?.sol
        ) || 0;

      lifetimeUsd +=
        usd;

      lifetimeTrx +=
        trx;

      if (
        String(
          date
        ).slice(
          0,
          7
        ) ===
        currentMonth
      ) {
        monthUsd +=
          usd;

        monthTrx +=
          trx;
      }

      if (
        date ===
        todayKey
      ) {
        todayUsd +=
          usd;

        todayTrx +=
          trx;
      }
    }
  );

  const liveTrxPrice =
    Number(
      tracker?.lastTrxPrice
    ) || 0;

  /*
   * Keep lifetime earned TRX separate from
   * the current RollerCoin wallet balance.
   */
  const trackedLifetimeTrx =
    lifetimeTrx;

  lifetimeTrx +=
    ROLLERCOIN_HISTORICAL_TRX;

  /*
   * Current balance is the amount of TRX
   * currently sitting in RollerCoin.
   */
  const storedCurrentTrxBalance =
    Number(
      tracker?.currentTrxBalance
    );

  const currentTrxBalance =
    Number.isFinite(
      storedCurrentTrxBalance
    ) &&
    storedCurrentTrxBalance >=
      0
      ? storedCurrentTrxBalance
      : 0;

  const currentBalanceUsd =
    liveTrxPrice > 0
      ? currentTrxBalance *
        liveTrxPrice
      : 0;

  // Accounting: earned TRX quantity and its USD value at capture
  // remain distinct from current wallet market valuation. A token price
  // update must not rewrite earlier mining income.
  const walletToday = tracker?.walletDaily?.[todayKey];
  if (walletToday) todayTrx = Number(walletToday.trx) || 0;
  const storedWalletEntries = Object.entries(tracker?.walletDaily || {});
  storedWalletEntries.forEach(([date, entry]) => {
    const mined = tracker?.daily?.[date];
    const walletUsd = Number(entry?.usd);
    const walletTrx = Number(entry?.trx);
    const deltaUsd = Number.isFinite(walletUsd) ? walletUsd : 0;
    const deltaTrx = Number.isFinite(walletTrx) ? walletTrx : 0;
    if (mined) {
      lifetimeUsd -= Number(mined?.usd) || 0;
      lifetimeTrx -= Number(mined?.trx ?? mined?.sol) || 0;
      if (date.slice(0, 7) === currentMonth) {
        monthUsd -= Number(mined?.usd) || 0;
        monthTrx -= Number(mined?.trx ?? mined?.sol) || 0;
      }
    }
    lifetimeUsd += deltaUsd;
    lifetimeTrx += deltaTrx;
    if (date.slice(0, 7) === currentMonth) {
      monthUsd += deltaUsd;
      monthTrx += deltaTrx;
    }
  });
  if (walletToday) {
    const storedUsd = Number(walletToday?.usd);
    todayUsd = Number.isFinite(storedUsd)
      ? storedUsd : (Number(walletToday?.trx) || 0) * liveTrxPrice;
  }
  // Historical pre-tracker TRX has no transaction-time USD cost basis.
  // Keep that legacy valuation separate from today's/month's earned USD.
  const historicalReferencePrice = trackedLifetimeTrx > 0
    ? Math.max(0, (lifetimeUsd / trackedLifetimeTrx))
    : liveTrxPrice;
  lifetimeUsd += ROLLERCOIN_HISTORICAL_TRX * historicalReferencePrice;

  return {
    todayUsd,
    todayTrx,

    monthUsd,
    monthTrx,

    lifetimeUsd,
    lifetimeTrx,

    currentTrxBalance,
    currentBalanceUsd,

    liveTrxPrice,

    lastSyncedAt:
      tracker?.balanceSyncedAt ||
      tracker?.lastSyncedAt ||
      null,

    transactionCount:
      rows.length,
  };
}

function loadPositions() {
  try {
    const raw =
      remoteStorage.getItem(
        STORAGE_KEY
      );

    if (!raw) return [];

    const parsed =
      JSON.parse(raw);

    return Array.isArray(
      parsed
    )
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function savePositions(positions) {
  remoteStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      positions
    )
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }
  ).format(
    Number(value) ||
      0
  );
}

function formatPercent(value) {
  return `${(
    Number(value) ||
    0
  ).toFixed(2)}%`;
}

function formatSyncTime(value) {
  if (!value) {
    return "Not synced yet";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Not synced yet";
  }

  return date.toLocaleString(
    [],
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  );
}

function formatDate(value) {
  if (!value) return "—";

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return date.toLocaleDateString(
    [],
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}


function getProjectIncomeLogo(
  platform,
  projectLogos
) {
  const logos =
    projectLogos &&
    typeof projectLogos ===
      "object"
      ? projectLogos
      : {};

  const normalized =
    String(
      platform || ""
    )
      .trim()
      .toLowerCase();

const fixedKeys = {
  rollercoin:
    "rollercoin-project",

  salad:
    "salad-project",

  unetwork:
    "unetwork-project",

  loopscale:
    "loopscale-project",

  kryptex:
    "kryptex-project",
};

  const fixedKey =
    fixedKeys[
      normalized
    ];

  if (
    fixedKey &&
    logos[
      fixedKey
    ]
  ) {
    return logos[
      fixedKey
    ];
  }

  const prefix = normalized === "lulo" ? "lulo-project-" : "";

  if (
    prefix
  ) {
    const match =
      Object.entries(
        logos
      ).find(
        ([
          key,
          value,
        ]) =>
          String(
            key
          ).startsWith(
            prefix
          ) &&
          Boolean(
            value
          )
      );

    if (
      match
    ) {
      return match[1];
    }
  }

  return "";
}

function getInitials(
  value = ""
) {
  const parts =
    String(value)
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (!parts.length) {
    return "?";
  }

  if (
    parts.length === 1
  ) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getMonthKey(value) {
  if (!value) return "";

  const text =
    String(value);

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {
    return text.slice(
      0,
      7
    );
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
    }
  ).format(date);
}

function getCurrentMonthKey() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
    }
  ).format(
    new Date()
  );
}

function getCurrentYear() {
  return Number(
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/Los_Angeles",
        year: "numeric",
      }
    ).format(
      new Date()
    )
  );
}

function getTodayKey() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).format(
    new Date()
  );
}

function formatMonthLabel(
  monthKey
) {
  if (!monthKey) return "";

  const [
    year,
    month,
  ] =
    monthKey
      .split("-")
      .map(Number);

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        "America/Los_Angeles",
      month: "long",
      year: "numeric",
    }
  ).format(
    new Date(
      Date.UTC(
        year,
        month - 1,
        15,
        12
      )
    )
  );
}

function formatShortMonth(
  monthKey
) {
  if (!monthKey) return "";

  const [
    year,
    month,
  ] =
    monthKey
      .split("-")
      .map(Number);

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      timeZone:
        "America/Los_Angeles",
    }
  ).format(
    new Date(
      Date.UTC(
        year,
        month - 1,
        15,
        12
      )
    )
  );
}

function getMonthStart(
  date = new Date()
) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  );
}

function getElapsedMonthDays(
  project,
  now = new Date()
) {
  const monthStart =
    getMonthStart(now);

  const possibleStart =
    project?.start_date ||
    project?.startDate ||
    project?.created_at ||
    project?.createdAt ||
    null;

  let earningStart =
    monthStart;

  if (possibleStart) {
    const parsed =
      new Date(
        possibleStart
      );

    if (
      !Number.isNaN(
        parsed.getTime()
      ) &&
      parsed >
        monthStart &&
      parsed <
        now
    ) {
      earningStart =
        parsed;
    }
  }

  const elapsedMs =
    now.getTime() -
    earningStart.getTime();

  return Math.max(
    0,
    elapsedMs /
      86400000
  );
}

function getTrackedLuloMonthEarnings(
  project,
  monthKey
) {
  const transactions =
    Array.isArray(
      project?.transactions
    )
      ? project.transactions
      : [];

  return transactions
    .filter(
      (
        transaction
      ) => {
        if (
          transaction?.source !==
          "lulo_yield"
        ) {
          return false;
        }

        const amount =
          Number(
            transaction?.amount
          ) || 0;

        if (
          amount <= 0
        ) {
          return false;
        }

        const transactionMonth =
          getMonthKey(
            transaction.source_date ||
              transaction.date ||
              transaction.created_at
          );

        return (
          transactionMonth ===
          monthKey
        );
      }
    )
    .reduce(
      (
        total,
        transaction
      ) =>
        total +
        (
          Number(
            transaction.amount
          ) || 0
        ),
      0
    );
}

function estimateLuloMonthToDate(
  project,
  now = new Date()
) {
  const balance =
    Number(
      project?.lulo_total_balance_usd
    ) || 0;

  const apy =
    Number(
      project?.lulo_weighted_apy
    ) || 0;

  if (
    balance <= 0 ||
    apy <= 0
  ) {
    return 0;
  }

  const elapsedDays =
    getElapsedMonthDays(
      project,
      now
    );

  return (
    balance *
    (apy / 100) *
    (
      elapsedDays /
      365
    )
  );
}

function isRollerCoinProject(
  project
) {
  if (!project) {
    return false;
  }

  if (
    String(
      project.name ||
        ""
    )
      .trim()
      .toLowerCase() ===
    "rollercoin"
  ) {
    return true;
  }

  return (
    Array.isArray(
      project.transactions
    ) &&
    project.transactions.some(
      (
        transaction
      ) =>
        transaction?.source ===
        "rollercoin"
    )
  );
}

function getRollerCoinTransactions(
  projects
) {
  return (
    projects ||
    []
  ).flatMap(
    (project) => {
      if (
        !isRollerCoinProject(
          project
        )
      ) {
        return [];
      }

      return (
        Array.isArray(
          project.transactions
        )
          ? project.transactions
          : []
      ).filter(
        (
          transaction
        ) => {
          if (
            transaction?.source !==
            "rollercoin"
          ) {
            return false;
          }

          const type =
            String(
              transaction?.type ||
                ""
            ).toLowerCase();

          const trxDelta =
            Number(
              transaction?.source_trx_delta
            ) || 0;

          const amount =
            Number(
              transaction?.amount
            ) || 0;

          return (
            (
              !type ||
              type ===
                "earning" ||
              type ===
                "earned"
            ) &&
            trxDelta >
              0 &&
            amount >
              0
          );
        }
      );
    }
  );
}

function getRollerCoinStats(
  projects
) {
  const transactions =
    getRollerCoinTransactions(
      projects
    );

  const todayKey =
    getTodayKey();

  const currentMonth =
    getCurrentMonthKey();

  let todayUsd = 0;
  let todayTrx = 0;
  let monthUsd = 0;
  let monthTrx = 0;
  let lifetimeUsd = 0;
  let lifetimeTrx = 0;
  let lastSyncedAt =
    null;

  transactions.forEach(
    (
      transaction
    ) => {
      const amount =
        Number(
          transaction.amount
        ) || 0;

      const trx =
        Number(
          transaction.source_trx_delta
        ) || 0;

      const dateValue =
        transaction.source_date ||
        transaction.date ||
        transaction.created_at ||
        "";

      const dateKey =
        String(
          dateValue
        ).slice(
          0,
          10
        );

      const monthKey =
        getMonthKey(
          dateValue
        );

      lifetimeUsd +=
        amount;

      lifetimeTrx +=
        trx;

      if (
        monthKey ===
        currentMonth
      ) {
        monthUsd +=
          amount;

        monthTrx +=
          trx;
      }

      if (
        dateKey ===
        todayKey
      ) {
        todayUsd +=
          amount;

        todayTrx +=
          trx;
      }

      const syncValue =
        transaction.sync_to ||
        transaction.updated_at ||
        transaction.created_at ||
        transaction.date ||
        null;

      if (
        syncValue &&
        (
          !lastSyncedAt ||
          new Date(
            syncValue
          ).getTime() >
            new Date(
              lastSyncedAt
            ).getTime()
        )
      ) {
        lastSyncedAt =
          syncValue;
      }
    }
  );

  return {
    todayUsd,
    todayTrx,
    monthUsd,
    monthTrx,
    lifetimeUsd,
    lifetimeTrx,
    lastSyncedAt,
    transactionCount:
      transactions.length,
  };
}

function createLuloProjectCard(project) {
  const assets = [];

  const totalBalance = Number(project.lulo_total_balance_usd) || 0;
  const usdcBalance = Number(project.lulo_usdc_balance_usd) || 0;
  const protectedBalance =
    Number(project.lulo_protected_balance_usd) || 0;

  const savedUsdsBalance =
    Number(project.lulo_usds_balance_usd) || 0;

  const derivedUsdsBalance = Math.max(
    0,
    totalBalance - usdcBalance - protectedBalance
  );

  const usdsBalance =
    savedUsdsBalance > 0
      ? savedUsdsBalance
      : derivedUsdsBalance;

  const weightedApy =
    Number(project.lulo_weighted_apy) || 0;

  const apyDailyIncome =
    totalBalance * (weightedApy / 100) / 365;

  const fiveDayAverage =
    Number(project.lulo_five_day_average_usd) || 0;

  const dailyIncome =
    fiveDayAverage > 0
      ? fiveDayAverage
      : apyDailyIncome;

  const monthlyIncome = dailyIncome * 30.4375;
  const yearlyIncome = dailyIncome * 365;

  if (usdsBalance > 0) {
    assets.push({
      id: `lulo-usds-${project.id}`,
      asset: "USDS",
      strategy: "Lending",
      balance: usdsBalance,
      quantity: usdsBalance,
      price: 1,
      apy:
        Number(project.lulo_usds_apy) ||
        weightedApy ||
        0,
      sourceLabel: "Lulo",
    });
  }

  if (usdcBalance > 0) {
    assets.push({
      id: `lulo-usdc-${project.id}`,
      asset: "USDC",
      strategy: "Lending",
      balance: usdcBalance,
      quantity: usdcBalance,
      price: 1,
      apy:
        Number(project.lulo_regular_apy) || 0,
      sourceLabel: "Lulo",
    });
  }

  if (protectedBalance > 0) {
    assets.push({
      id: `lulo-protected-${project.id}`,
      asset: "Protected",
      strategy: "Protected Lending",
      balance: protectedBalance,
      quantity: protectedBalance,
      price: 1,
      apy:
        Number(project.lulo_protected_apy) || 0,
      sourceLabel: "Lulo",
    });
  }

  if (!assets.length && totalBalance > 0) {
    assets.push({
      id: `lulo-total-${project.id}`,
      asset: "Stablecoins",
      strategy: "Lending",
      balance: totalBalance,
      quantity: null,
      price: null,
      apy: weightedApy,
      sourceLabel: "Lulo",
    });
  }

  return {
    id: `lulo-project-${project.id}`,
    platform: "Lulo",
    autoSynced: true,
    totalBalance,
    weightedApy,
    dailyIncome,
    monthlyIncome,
    yearlyIncome,
    earned:
      Number(project.lulo_lifetime_interest_usd) ||
      Number(project.earned) ||
      0,
    lastSyncedAt:
      project.lulo_last_synced_at || null,
    transactions:
      project.transactions || [],
    assets,
    luloFiveDayAverageUsd:
  Number(
    project.lulo_five_day_average_usd
  ) || 0,
  };
}

function getLoopscalePositionKey(
  snapshot
) {
  return String(
    snapshot?.loanAddress ||
      "loopscale-onyc"
  );
}

function updateLoopscaleHistoryFromSnapshot(history, snapshot) {
  const positionValue = Number(snapshot?.positionValueUsd);
  const pnlUsd = Number(snapshot?.pnlUsd);
  if (!Number.isFinite(positionValue) || positionValue <= 0 ||
      !Number.isFinite(pnlUsd)) {
    return history;
  }

  const positionKey = getLoopscalePositionKey(snapshot);
  const currentMonth = getCurrentMonthKey();
  const startMonth = getMonthKey(snapshot.startTime);
  const existing = history?.positions?.[positionKey] || {};
  const incomingTime = Date.parse(snapshot.syncedAt || "");
  const previousTime = Date.parse(existing.lastSyncedAt || "");

  // Async refreshes can finish out of order. An older snapshot must never
  // roll back the current position or create duplicate observed earnings.
  if (Number.isFinite(previousTime) &&
      (!Number.isFinite(incomingTime) || incomingTime < previousTime)) {
    return history;
  }

  // Attribute changes to the Pacific day they were observed. This is
  // observation timing, not an assertion of the protocol's accrual timestamp.
  const observedDaily = { ...(existing.observedDaily || {}) };
  const previousPnl = Number(existing.lastPnlUsd);
  const previousDay = Number.isFinite(previousTime)
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles", year: "numeric",
        month: "2-digit", day: "2-digit",
      }).format(new Date(previousTime))
    : null;
  const observationDay = Number.isFinite(incomingTime)
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles", year: "numeric",
        month: "2-digit", day: "2-digit",
      }).format(new Date(incomingTime))
    : null;
  if (observationDay && previousDay &&
      Number.isFinite(previousPnl) && incomingTime > previousTime) {
    const increase = pnlUsd - previousPnl;
    if (Math.abs(increase) > 0.000000001) {
      observedDaily[observationDay] = Number((
        (Number(observedDaily[observationDay]) || 0) + increase
      ).toFixed(8));
    }
  }

  const monthlyEarnings = { ...(existing.monthlyEarnings || {}) };
  const monthBaselines = { ...(existing.monthBaselines || {}) };
  const existingBaseline = monthBaselines[currentMonth];
  const hasBaseline = existingBaseline !== null &&
    existingBaseline !== undefined &&
    Number.isFinite(Number(existingBaseline));

  if (!hasBaseline) {
    // If we observed this loan last month, use the last observed cumulative
    // P/L as the new opening baseline. This avoids losing everything accrued
    // between monthly refreshes, but that interval cannot be precisely dated.
    // For a newly discovered older loan, the first reading is the baseline.
    const previousMonth = getMonthKey(existing.lastSyncedAt);
    const priorPnl = Number(existing.lastPnlUsd);
    monthBaselines[currentMonth] = startMonth === currentMonth
      ? 0
      : previousMonth && previousMonth < currentMonth && Number.isFinite(priorPnl)
        ? priorPnl
        : pnlUsd;
  }

  const baseline = Number(monthBaselines[currentMonth]);
  monthlyEarnings[currentMonth] = Number(
    (pnlUsd - baseline).toFixed(8)
  );

  // Record observation timestamps for reconciliation without pretending the
  // API supplies exact timestamps for the interest accrued between polls.
  const observations = Array.isArray(existing.observations)
    ? existing.observations.slice(-1439)
    : [];
  if (Number.isFinite(incomingTime) &&
      (!observations.length ||
        observations[observations.length - 1].syncedAt !== snapshot.syncedAt)) {
    observations.push({ syncedAt: snapshot.syncedAt, pnlUsd });
  }

  return {
    ...history,
    positions: {
      ...(history?.positions || {}),
      [positionKey]: {
        ...existing,
        key: positionKey,
        loanAddress: snapshot.loanAddress || positionKey,
        asset: snapshot.asset || "ONyc",
        startTime: snapshot.startTime || existing.startTime || null,
        lastPnlUsd: pnlUsd,
        lastValueUsd: positionValue,
        lastApy: Number(snapshot.netApy) || 0,
        lastSyncedAt: snapshot.syncedAt || new Date().toISOString(),
        monthBaselines,
        monthlyEarnings,
        observations,
        observedDaily,
      },
    },
  };
}

function createLoopscaleProjectCard(
  snapshot
) {
  if (
    !snapshot ||
    !(
      Number(
        snapshot.positionValueUsd
      ) >
      0
    )
  ) {
    return null;
  }

  const positionValueUsd =
    Number(
      snapshot.positionValueUsd
    ) || 0;

  const quantity =
    Number(
      snapshot.quantity
    ) || 0;

  const priceUsd =
    Number(
      snapshot.priceUsd
    ) ||
    (
      quantity >
      0
        ? positionValueUsd /
          quantity
        : 0
    );

  const netApy =
    Number(
      snapshot.netApy
    ) || 0;

  const pnlUsd =
    Number(
      snapshot.pnlUsd
    ) || 0;

  const asset = {
    id:
      `loopscale-${getLoopscalePositionKey(
        snapshot
      )}`,

    asset:
      "ONyc",

    allocationSymbol:
      "ONyc",

    strategy:
      "Loop",

    balance:
      positionValueUsd,

    quantity,

    price:
      priceUsd,

    apy:
      netApy,

    sourceLabel:
      "Loopscale",
  };

  return {
    id:
      "loopscale-project",

    platform:
      "Loopscale",

    autoSynced:
      true,

    totalBalance:
      positionValueUsd,

    weightedApy:
      netApy,

    /*
     * Loopscale's pnlUsd is flow-adjusted by its API, so deposits
     * and withdrawals do not get counted as earnings.
     */
    earned:
      pnlUsd,

    lastSyncedAt:
      snapshot.syncedAt ||
      null,

    assets: [
      asset,
    ],
  };
}

function groupManualPositions(
  positions
) {
  const grouped =
    new Map();

  positions.forEach(
    (position) => {
      const platform =
        String(
          position.platform ||
            "Other"
        ).trim() ||
        "Other";

      const key =
        platform.toLowerCase();

      if (
        !grouped.has(
          key
        )
      ) {
        grouped.set(
          key,
          {
            id: `manual-project-${key}`,
            platform,
            autoSynced:
              false,
            lastSyncedAt:
              null,
            assets: [],
          }
        );
      }

      grouped
        .get(key)
        .assets.push({
          id:
            position.id,
          manualId:
            position.id,
          asset:
            position.asset ||
            "Position",
          strategy:
            position.strategy ||
            "Yield",
          balance:
            Number(
              position.balance
            ) || 0,
          quantity:
            null,
          price:
            null,
          apy:
            Number(
              position.apy
            ) || 0,
          earned:
            Number(
              position.earned
            ) || 0,
          startDate:
            position.startDate ||
            "",
          sourceLabel:
            platform,
        });
    }
  );

  return Array.from(
    grouped.values()
  ).map(
    (project) => {
      const totalBalance =
        project.assets.reduce(
          (
            sum,
            asset
          ) =>
            sum +
            (
              Number(
                asset.balance
              ) || 0
            ),
          0
        );

      const earned =
        project.assets.reduce(
          (
            sum,
            asset
          ) =>
            sum +
            (
              Number(
                asset.earned
              ) || 0
            ),
          0
        );

      const weightedApy =
        totalBalance >
        0
          ? project.assets.reduce(
              (
                sum,
                asset
              ) =>
                sum +
                (
                  Number(
                    asset.balance
                  ) || 0
                ) *
                  (
                    Number(
                      asset.apy
                    ) || 0
                  ),
              0
            ) /
            totalBalance
          : 0;

      return {
        ...project,
        totalBalance,
        weightedApy,
        earned,
      };
    }
  );
}

function loadKryptexTracker() {
  const parsed =
    readObject(
      KRYPTEX_TRACKER_KEY
    );

  const monthlyEarnings =
    parsed.monthlyEarnings &&
    typeof parsed.monthlyEarnings ===
      "object"
      ? parsed.monthlyEarnings
      : {
          "2026-09":
            KRYPTEX_OPENING_BALANCE_USD,
        };

  return {
    initialized:
      Boolean(
        parsed.initialized
      ),

    currentBalance:
      Number(
        parsed.currentBalance
      ) ||
      KRYPTEX_OPENING_BALANCE_USD,

    lastBalance:
      Number(
        parsed.lastBalance
      ) ||
      KRYPTEX_OPENING_BALANCE_USD,

    openingBalanceUsd:
      KRYPTEX_OPENING_BALANCE_USD,

    lifetimeEarnedUsd:
      Number(
        parsed.lifetimeEarnedUsd
      ) ||
      KRYPTEX_OPENING_BALANCE_USD,

    profitabilityUsdDay:
      Number(
        parsed.profitabilityUsdDay
      ) || 0,

    withdrawableUsd:
      Number(
        parsed.withdrawableUsd
      ) || 0,

    monthlyEarnings,

    lastSyncedAt:
      parsed.lastSyncedAt ||
      null,

    reachable:
      Boolean(
        parsed.reachable
      ),

    miners:
      Array.isArray(
        parsed.miners
      )
        ? parsed.miners
        : [],
  };
}

function saveKryptexTracker(
  value
) {
  saveObject(
    KRYPTEX_TRACKER_KEY,
    value
  );
}

function getKryptexStats(
  tracker
) {
  const currentBalanceUsd =
    Number(
      tracker?.currentBalance
    ) ||
    KRYPTEX_OPENING_BALANCE_USD;

  const dailyUsd =
    Number(
      tracker?.profitabilityUsdDay
    ) || 0;

  const monthlyUsd =
    dailyUsd *
    30.4375;

  const yearlyUsd =
    dailyUsd *
    365;

  const currentMonth =
    getCurrentMonthKey();

  const monthUsd =
    Number(
      tracker?.monthlyEarnings?.[
        currentMonth
      ]
    ) || 0;

  const lifetimeUsd =
    Number(
      tracker?.lifetimeEarnedUsd
    ) ||
    KRYPTEX_OPENING_BALANCE_USD;

  return {
    currentBalanceUsd,
    openingBalanceUsd:
      KRYPTEX_OPENING_BALANCE_USD,
    earnedSinceBaseline:
      Math.max(
        0,
        lifetimeUsd -
          KRYPTEX_OPENING_BALANCE_USD
      ),
    lifetimeUsd,
    monthUsd,
    dailyUsd,
    monthlyUsd,
    yearlyUsd,
    withdrawableUsd:
      Number(
        tracker?.withdrawableUsd
      ) || 0,
    lastSyncedAt:
      tracker?.lastSyncedAt ||
      null,
    reachable:
      Boolean(
        tracker?.reachable
      ),
    miners:
      Array.isArray(
        tracker?.miners
      )
        ? tracker.miners
        : [],
  };
}

function buildProjectIncome(
  luloProjects,
  loopscaleHistory,
  saladTracker,
  monthlyBackfills,
  rollerCoinTracker,
  unetworkTracker,
  kryptexTracker
) {
  const monthMap =
    new Map();

  function addEarning(
    monthKey,
    platform,
    amount
  ) {
    const numericAmount =
      Number(amount) ||
      0;

    if (
      !monthKey ||
      monthKey <
        MONTHLY_TRACKING_START ||
      numericAmount <=
        0
    ) {
      return;
    }

    if (
      !monthMap.has(
        monthKey
      )
    ) {
      monthMap.set(
        monthKey,
        {
          monthKey,
          total: 0,
          platforms:
            new Map(),
        }
      );
    }

    const month =
      monthMap.get(
        monthKey
      );

    month.total +=
      numericAmount;

    month.platforms.set(
      platform,
      (
        month.platforms.get(
          platform
        ) || 0
      ) +
        numericAmount
    );
  }

(
  luloProjects ||
  []
).forEach(
  (project) => {
    const projectBackfills =
      monthlyBackfills?.[
        String(
          project.id
        )
      ] || {};

    const authoritativeMonths =
      new Set(
        Object.keys(
          projectBackfills
        )
      );

    const transactions =
      Array.isArray(
        project?.transactions
      )
        ? project.transactions
        : [];

    transactions.forEach(
      (
        transaction
      ) => {
        if (
          transaction?.source !==
          "lulo_yield"
        ) {
          return;
        }

        const amount =
          Number(
            transaction?.amount
          ) || 0;

        if (
          amount <= 0
        ) {
          return;
        }

        const monthKey =
          getMonthKey(
            transaction.source_date ||
              transaction.date ||
              transaction.created_at
          );

        if (
          authoritativeMonths.has(
            monthKey
          )
        ) {
          return;
        }

        addEarning(
          monthKey,
          "Lulo",
          amount
        );
      }
    );

    Object.entries(
      projectBackfills
    ).forEach(
      ([
        monthKey,
        amount,
      ]) => {
        addEarning(
          monthKey,
          "Lulo",
          amount
        );
      }
    );
  }
);

/*
 * LOOPSCALE
 */
Object.values(
  loopscaleHistory?.positions ||
    {}
).forEach(
  (position) => {
    Object.entries(
      position.monthlyEarnings ||
        {}
    ).forEach(
      ([
        monthKey,
        amount,
      ]) => {
        addEarning(
          monthKey,
          "Loopscale",
          amount
        );
      }
    );
  }
);

  const saladDaily =
    Object.entries(
      saladTracker?.daily ||
        {}
    );

  const saladDailyMonths =
    new Set();

  const saladCurrentMonth =
    getCurrentMonthKey();

  saladDaily.forEach(
    ([
      date,
      amount,
    ]) => {
      const monthKey =
        getMonthKey(
          date
        );

      if (
        !monthKey ||
        monthKey ===
          saladCurrentMonth
      ) {
        return;
      }

      saladDailyMonths.add(
        monthKey
      );

      addEarning(
        monthKey,
        "Salad",
        Number(
          amount
        ) || 0
      );
    }
  );

  /*
   * For months that have no dated Salad rows,
   * fall back to the tracked monthly bucket.
   * This is especially important at the start
   * of a new month, when the prior available
   * balance must NOT be counted again.
   */
  Object.entries(
    saladTracker?.monthlyEarnings ||
      {}
  ).forEach(
    ([
      monthKey,
      amount,
    ]) => {
      if (
        saladDailyMonths.has(
          monthKey
        )
      ) {
        return;
      }

      const value =
        Math.max(
          0,
          Number(
            amount
          ) || 0
        );

      if (
        value <= 0
      ) {
        return;
      }

      addEarning(
        monthKey,
        "Salad",
        value
      );
    }
  );

  /*
   * ROLLERCOIN
   *
   * September 1-14, 2026 has been manually verified
   * from RollerCoin's earnings table:
   *
   * 45.443264 TRX
   *
   * The extension has not consistently returned all
   * historical September rows, so use that verified
   * amount as the baseline.
   *
   * Any synced earnings AFTER September 14 are added
   * on top of the baseline.
   *
   * For later months, use synced daily rows normally.
   */

  const currentMonthKey =
    getCurrentMonthKey();

  const liveTrxPrice =
    Number(
      rollerCoinTracker?.lastTrxPrice
    ) || 0;

  const rollerCoinMonths =
    {};

  Object.entries(
    rollerCoinTracker?.daily ||
      {}
  ).forEach(
    ([
      date,
      entry,
    ]) => {
      const monthKey =
        getMonthKey(
          date
        );

      if (
        !monthKey
      ) {
        return;
      }

      /*
       * September 1-14 is already covered
       * by the verified baseline below.
       *
       * Skip those rows so they cannot be
       * double-counted.
       */
      if (
        monthKey ===
          "2026-09" &&
        String(
          date
        ) <=
          ROLLERCOIN_SEPTEMBER_2026_BASELINE_END
      ) {
        return;
      }

      if (
        !rollerCoinMonths[
          monthKey
        ]
      ) {
        rollerCoinMonths[
          monthKey
        ] = {
          trx: 0,
          storedUsd: 0,
        };
      }

      const trx =
        Number(
          entry?.trx ??
            entry?.sol
        ) || 0;

      const storedUsd =
        Number(
          entry?.usd
        ) || 0;

      rollerCoinMonths[
        monthKey
      ].trx +=
        trx;

      rollerCoinMonths[
        monthKey
      ].storedUsd +=
        storedUsd;
    }
  );

  /*
   * Seed September with the verified
   * Sept 1-14 earnings.
   */
  if (
    !rollerCoinMonths[
      "2026-09"
    ]
  ) {
    rollerCoinMonths[
      "2026-09"
    ] = {
      trx: 0,
      storedUsd: 0,
    };
  }

  rollerCoinMonths[
    "2026-09"
  ].trx +=
    ROLLERCOIN_SEPTEMBER_2026_BASELINE_TRX;

  Object.entries(
    rollerCoinMonths
  ).forEach(
    ([
      monthKey,
      values,
    ]) => {
      const trx =
        Number(
          values?.trx
        ) || 0;

      const storedUsd =
        Number(
          values?.storedUsd
        ) || 0;

      /*
       * Current month uses the latest TRX price.
       *
       * Older months stay fixed using their
       * stored USD values.
       */
      // Preserve previously recorded monthly earnings; only replace
      // dates with a confirmed wallet reading to avoid double counting.
      const legacyCoveredUsd = Object.entries(rollerCoinTracker?.daily || {})
        .filter(([date]) => date.slice(0, 7) === monthKey &&
          !(date in (rollerCoinTracker?.walletDaily || {})) &&
          !(monthKey === "2026-09" && date <= ROLLERCOIN_SEPTEMBER_2026_BASELINE_END))
        .reduce((sum, [, row]) => sum + (Number(row?.usd) || 0), 0);
      const walletUsd = Object.entries(rollerCoinTracker?.walletDaily || {})
        .filter(([date]) => date.slice(0, 7) === monthKey)
        .reduce((sum, [, entry]) => sum +
          (Number.isFinite(Number(entry?.usd)) && entry?.usd != null
            ? Number(entry.usd) : (Number(entry?.trx) || 0) * liveTrxPrice), 0);
      const hasWalletMonth = Object.keys(rollerCoinTracker?.walletDaily || {})
        .some(day => day.slice(0, 7) === monthKey);
      const historicalBaselineUsd = monthKey === "2026-09"
        ? Math.max(0, storedUsd - legacyCoveredUsd) : 0;
      const amount = hasWalletMonth
        ? historicalBaselineUsd + legacyCoveredUsd + walletUsd
        : storedUsd;

      addEarning(
        monthKey,
        "RollerCoin",
        amount
      );
    }
  );

  // When the earnings API has no dated rows, wallet observations still
  // produce the current month's RollerCoin income.
  const walletCurrentMonthEntries = Object.entries(rollerCoinTracker?.walletDaily || {})
    .filter(([day]) => day.slice(0, 7) === currentMonthKey);
  if (walletCurrentMonthEntries.length && !rollerCoinMonths[currentMonthKey]) {
    addEarning(currentMonthKey, "RollerCoin",
      walletCurrentMonthEntries.reduce((sum, [, entry]) =>
        sum + (entry?.usd != null && Number.isFinite(Number(entry.usd))
          ? Number(entry.usd) : (Number(entry?.trx) || 0) * liveTrxPrice), 0));
  }

  const unetworkMonthTotals =
    getUnetworkMonthTotals(
      unetworkTracker
    );

  const unetworkBaselineInitialized =
    Boolean(
      unetworkTracker
        ?.baselineInitialized
    );

  const unetworkOpeningMonth =
    unetworkTracker
      ?.openingMonth ||
    null;

  Object.entries(
    unetworkMonthTotals
  ).forEach(
    ([
      monthKey,
      rawAmount,
    ]) => {
      let amount =
        Number(
          rawAmount
        ) || 0;

      if (
        unetworkBaselineInitialized &&
        monthKey ===
          unetworkOpeningMonth
      ) {
        amount =
          (
            Number(
              unetworkTracker
                ?.openingEarnedUsd
            ) || 0
          ) +
          Math.max(
            0,
            amount -
              (
                Number(
                  unetworkTracker
                    ?.openingMonthRowsBaselineUsd
                ) || 0
              )
          );
      }

      addEarning(
        monthKey,
        "Unetwork",
        amount
      );
    }
  );

  if (
    unetworkBaselineInitialized &&
    unetworkOpeningMonth &&
    !Object.prototype.hasOwnProperty.call(
      unetworkMonthTotals,
      unetworkOpeningMonth
    )
  ) {
    addEarning(
      unetworkOpeningMonth,
      "Unetwork",
      Number(
        unetworkTracker
          ?.openingEarnedUsd
      ) || 0
    );
  }

/*
 * KRYPTEX
 *
 * The extension supplies the live balance and
 * profitability. The dashboard records only
 * positive balance changes as new earnings.
 *
 * September 2026 starts with the requested
 * $16.47 opening baseline.
 */
{
  const monthlyEarnings =
    kryptexTracker?.monthlyEarnings &&
    typeof kryptexTracker.monthlyEarnings ===
      "object"
      ? kryptexTracker.monthlyEarnings
      : {
          "2026-09":
            KRYPTEX_OPENING_BALANCE_USD,
        };

  Object.entries(
    monthlyEarnings
  ).forEach(
    ([
      monthKey,
      amount,
    ]) => {
      addEarning(
        monthKey,
        "Kryptex",
        Number(
          amount
        ) || 0
      );
    }
  );
}

  return Array.from(
    monthMap.values()
  )
    .map(
      (month) => ({
        monthKey:
          month.monthKey,

        total:
          Number(
            month.total.toFixed(
              6
            )
          ),

        platforms:
          Array.from(
            month.platforms.entries()
          )
            .map(
              ([
                platform,
                amount,
              ]) => ({
                platform,

                amount:
                  Number(
                    amount.toFixed(
                      6
                    )
                  ),
              })
            )
            .sort(
              (
                a,
                b
              ) =>
                b.amount -
                a.amount
            ),
      })
    )
    .sort(
      (
        a,
        b
      ) =>
        a.monthKey.localeCompare(
          b.monthKey
        )
    );
}


function reconcileMonthlySnapshots(
  currentSnapshots,
  liveMonths
) {
  const currentMonthKey =
    getCurrentMonthKey();

  const next = {
    ...(
      currentSnapshots ||
      {}
    ),
  };

  Object.keys(
    next
  ).forEach(
    (monthKey) => {
      if (
        monthKey <
          currentMonthKey &&
        !next[
          monthKey
        ]?.locked
      ) {
        next[
          monthKey
        ] = {
          ...next[
            monthKey
          ],
          locked:
            true,
          lockedAt:
            new Date().toISOString(),
        };
      }
    }
  );

  (
    liveMonths ||
    []
  ).forEach(
    (month) => {
      if (
        month.monthKey <
        currentMonthKey
      ) {
        if (
          !next[
            month.monthKey
          ]
        ) {
          next[
            month.monthKey
          ] = {
            ...month,
            locked:
              true,
            lockedAt:
              new Date().toISOString(),
            updatedAt:
              new Date().toISOString(),
          };
        }

        return;
      }

      if (
        month.monthKey ===
        currentMonthKey
      ) {
        next[
          month.monthKey
        ] = {
          ...month,
          locked:
            false,
          lockedAt:
            null,
          updatedAt:
            new Date().toISOString(),
        };
      }
    }
  );

  if (
    !next[
      currentMonthKey
    ]
  ) {
    next[
      currentMonthKey
    ] = {
      monthKey:
        currentMonthKey,
      total: 0,
      platforms: [],
      locked:
        false,
      lockedAt:
        null,
      updatedAt:
        new Date().toISOString(),
    };
  }

  return next;
}

function getEffectiveProjectIncome(
  liveMonths,
  snapshots
) {
  const currentMonthKey =
    getCurrentMonthKey();

  const result =
    new Map();

  Object.values(
    snapshots ||
      {}
  ).forEach(
    (snapshot) => {
      if (
        !snapshot?.monthKey
      ) {
        return;
      }

      result.set(
        snapshot.monthKey,
        snapshot
      );
    }
  );

  (
    liveMonths ||
    []
  ).forEach(
    (month) => {
      const saved =
        result.get(
          month.monthKey
        );

      if (
        month.monthKey ===
          currentMonthKey ||
        !saved ||
        !saved.locked
      ) {
        result.set(
          month.monthKey,
          {
            ...month,
            locked:
              false,
          }
        );
      }
    }
  );

  return Array.from(
    result.values()
  ).sort(
    (
      a,
      b
    ) =>
      a.monthKey.localeCompare(
        b.monthKey
      )
  );
}

export {
  STORAGE_KEY,
  LOGO_STORAGE_KEY,
  MONTHLY_BACKFILL_KEY,
  LULO_MONTHLY_BASELINE_KEY,
  MONTHLY_SNAPSHOT_KEY,
  DAILY_BALANCE_SNAPSHOT_KEY,
  DAILY_EARNINGS_CHART_OBSERVATIONS_KEY,
  AUTO_RECOVERED_EARNINGS_KEY,
  LOOPSCALE_HISTORY_KEY,
  SALAD_TRACKER_KEY,
  ROLLERCOIN_TRACKER_KEY,
  UNETWORK_TRACKER_KEY,
  KRYPTEX_TRACKER_KEY,
  PROJECT_QUICK_CACHE_KEY,
  INACTIVE_PROJECTS_KEY,
  PROJECT_PAYBACK_KEY,
  PROJECT_EXPENSES_KEY,
  PROJECT_INCOME_PORTFOLIO_SUMMARY_KEY,
  MONTHLY_TRACKING_START,
  LULO_SEPTEMBER_2026_OPENING_EARNED,
  LULO_MONTHLY_ACCOUNTING_VERSION,
  ROLLERCOIN_HISTORICAL_TRX,
  ROLLERCOIN_SEPTEMBER_2026_BASELINE_TRX,
  ROLLERCOIN_SEPTEMBER_2026_BASELINE_END,
  KRYPTEX_START_DATE,
  KRYPTEX_OPENING_BALANCE_USD,
  readObject,
  saveObject,
  loadProjectPayback,
  saveProjectPayback,
  loadProjectExpenses,
  saveProjectExpenses,
  getPaybackStats,
  loadProjectLogos,
  saveProjectLogos,
  loadMonthlyBackfills,
  saveMonthlyBackfills,
  loadLuloMonthlyBaselines,
  saveLuloMonthlyBaselines,
  loadMonthlySnapshots,
  saveMonthlySnapshots,
  loadLoopscaleHistory,
  saveLoopscaleHistory,
  loadSaladTracker,
  saveSaladTracker,
  getSaladTrackerStats,
  loadUnetworkTracker,
  saveUnetworkTracker,
  getUnetworkMonthTotals,
  getUnetworkTrackerStats,
  loadRollerCoinTracker,
  saveRollerCoinTracker,
  fetchLiveTrxPrice,
  getRollerCoinTrackerStats,
  loadPositions,
  savePositions,
  formatCurrency,
  formatPercent,
  formatSyncTime,
  formatDate,
  getProjectIncomeLogo,
  getInitials,
  getMonthKey,
  getCurrentMonthKey,
  getCurrentYear,
  getTodayKey,
  formatMonthLabel,
  formatShortMonth,
  getMonthStart,
  getElapsedMonthDays,
  getTrackedLuloMonthEarnings,
  estimateLuloMonthToDate,
  isRollerCoinProject,
  getRollerCoinTransactions,
  getRollerCoinStats,
  createLuloProjectCard,
  getLoopscalePositionKey,
  updateLoopscaleHistoryFromSnapshot,
  createLoopscaleProjectCard,
  groupManualPositions,
  loadKryptexTracker,
  saveKryptexTracker,
  getKryptexStats,
  buildProjectIncome,
  reconcileMonthlySnapshots,
  getEffectiveProjectIncome
};
