import { useCallback, useEffect, useMemo, useState } from "react";
import { remoteStorage } from "@/lib/serverStore";
import { projectsApi } from "@/lib/api";
import { getRatexPtonycSnapshot } from "@/lib/ratexYieldSync";
import { getLoopscaleOnycSnapshot } from "@/lib/loopscaleYieldSync";
import { coinGeckoApi } from "@/lib/external-apis";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CircleDollarSign,
  BadgeDollarSign,
  Layers3,
  Percent,
  Trash2,
  TrendingUp,
  Wifi,
  CalendarDays,
  X,
  ChevronLeft,
  ChevronRight,
  Archive,
  CheckCircle2,
  Lock,
} from "lucide-react";

const STORAGE_KEY = "networth_yield_positions";
const LOGO_STORAGE_KEY = "yield_project_logos_v1";
const MONTHLY_BACKFILL_KEY = "yield_monthly_earnings_backfill_v1";
const LULO_MONTHLY_BASELINE_KEY = "yield_lulo_monthly_baselines_v1";
const MONTHLY_SNAPSHOT_KEY = "yield_monthly_snapshots_v1";
const RATEX_HISTORY_KEY = "yield_ratex_position_history_v1";
const LOOPSCALE_HISTORY_KEY = "yield_loopscale_position_history_v1";
const SALAD_TRACKER_KEY = "project_income_salad_tracker_v1";
const ROLLERCOIN_TRACKER_KEY = "project_income_rollercoin_tracker_v2";
const UNETWORK_TRACKER_KEY = "project_income_unetwork_tracker_v1";
const KRYPTEX_TRACKER_KEY = "project_income_kryptex_tracker_v1";
const PROJECT_PAYBACK_KEY = "yield_project_payback_v1";

const PROJECT_INCOME_PORTFOLIO_SUMMARY_KEY =
  "project_income_portfolio_summary_v1";


const MONTHLY_TRACKING_START = "2026-09";
const LULO_SEPTEMBER_2026_OPENING_EARNED = 9.05;
const LULO_MONTHLY_ACCOUNTING_VERSION = 5;
const RATEX_ACCOUNTING_VERSION = 2;
const RATEX_LEGACY_INITIAL_QUANTITY = 606.27;

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

function loadRatexHistory() {
  const parsed =
    readObject(
      RATEX_HISTORY_KEY
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

function saveRatexHistory(value) {
  saveObject(
    RATEX_HISTORY_KEY,
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
    lastLifetimeBalance:
      Number(
        parsed.lastLifetimeBalance
      ) || 0,
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
   * Actual Project Income stays based on Salad's
   * dated earnings when available. If Salad does
   * not provide dated rows, keep using the current
   * live balance for this month's earned amount.
   */
  const monthUsd =
    currentMonthDailyEntries.length >
    0
      ? exactMonthUsd
      : currentBalance;

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

  /*
   * Current month and today's earnings can
   * still use the live TRX price.
   */
  if (
    liveTrxPrice > 0
  ) {
    todayUsd =
      todayTrx *
      liveTrxPrice;

    monthUsd =
      monthTrx *
      liveTrxPrice;

    /*
     * This is the live USD value of all
     * historically tracked earned TRX.
     */
    lifetimeUsd =
      lifetimeTrx *
      liveTrxPrice;
  } else {
    const referenceTrxPrice =
      trackedLifetimeTrx > 0
        ? lifetimeUsd /
          trackedLifetimeTrx
        : 0;

    lifetimeUsd +=
      ROLLERCOIN_HISTORICAL_TRX *
      referenceTrxPrice;
  }

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

  const prefix =
    normalized ===
    "lulo"
      ? "lulo-project-"
      : normalized ===
        "ratex"
        ? "ratex-project-"
        : "";

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

function getRatexPositionKey(
  snapshot
) {
  const mint =
    String(
      snapshot?.mint ||
        "ratex"
    );

  const maturity =
    String(
      snapshot?.maturity ||
        "unknown"
    );

  return `${mint}::${maturity}`;
}

function isRatexMatured(
  value
) {
  if (!value) {
    return false;
  }

  const maturity =
    new Date(value);

  if (
    Number.isNaN(
      maturity.getTime()
    )
  ) {
    return false;
  }

  return (
    new Date().getTime() >=
    maturity.getTime()
  );
}

function createRatexProjectCard(
  snapshot,
  ratexHistory
) {
  if (
    !snapshot ||
    !(
      Number(
        snapshot.quantity
      ) > 0
    ) ||
    isRatexMatured(
      snapshot.maturity
    )
  ) {
    return null;
  }

  const positionKey =
    getRatexPositionKey(
      snapshot
    );

  const trackedPosition =
    ratexHistory?.positions?.[
      positionKey
    ] || null;

  const maturityDate =
    new Date(
      snapshot.maturity
    );

  const now =
    new Date();

  const daysRemaining =
    Number.isNaN(
      maturityDate.getTime()
    )
      ? null
      : Math.max(
          0,
          Math.ceil(
            (
              maturityDate.getTime() -
              now.getTime()
            ) /
              86400000
          )
        );

  const currentValueUsd =
    Number(
      snapshot.currentValueUsd
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
      quantity > 0
        ? currentValueUsd /
          quantity
        : 0
    );

  const maturityValueUsd =
    Number(
      snapshot.maturityValueUsd
    ) || quantity;

  let earnedUsd =
    Number(
      trackedPosition?.lastEarnedUsd
    );

  let adjustedCostBasisUsd =
    Number(
      trackedPosition?.costBasisUsd
    );

  /*
   * If the page is rendering before the history migration effect has
   * finished, calculate the corrected value immediately so a deposit
   * never flashes as "earnings".
   */
  if (
    !trackedPosition ||
    Number(
      trackedPosition.accountingVersion
    ) !==
      RATEX_ACCOUNTING_VERSION
  ) {
    const legacyCostBasis =
      Number(
        snapshot.costBasisUsd
      ) ||
      Number(
        trackedPosition?.costBasisUsd
      ) ||
      0;

    const addedQuantity =
      Math.max(
        0,
        quantity -
          RATEX_LEGACY_INITIAL_QUANTITY
      );

    adjustedCostBasisUsd =
      legacyCostBasis +
      (
        addedQuantity *
        priceUsd
      );

    earnedUsd =
      Math.max(
        0,
        currentValueUsd -
          adjustedCostBasisUsd
      );
  }

  if (
    !Number.isFinite(
      earnedUsd
    )
  ) {
    earnedUsd = 0;
  }

  if (
    !Number.isFinite(
      adjustedCostBasisUsd
    )
  ) {
    adjustedCostBasisUsd =
      Number(
        snapshot.costBasisUsd
      ) || 0;
  }

  const projectedProfitUsd =
    Math.max(
      0,
      maturityValueUsd -
        adjustedCostBasisUsd
    );

  const asset = {
    id:
      positionKey,
    asset:
      "PTONyc",
    allocationSymbol:
      "ONyc",
    strategy:
      "Fixed Yield",
    balance:
      currentValueUsd,
    quantity,
    price:
      priceUsd,
    apy:
      Number(
        snapshot.fixedApy
      ) || 0,
    maturity:
      snapshot.maturity,
    maturityValueUsd,
    projectedProfitUsd,
    remainingYieldUsd:
      Number(
        snapshot.remainingYieldUsd
      ) ||
      Math.max(
        0,
        maturityValueUsd -
          currentValueUsd
      ),
    daysRemaining,
    sourceLabel:
      "RateX",
  };

  return {
    id: `ratex-project-${positionKey}`,
    platform:
      "RateX",
    autoSynced:
      true,
    totalBalance:
      asset.balance,
    weightedApy:
      asset.apy,
    earned:
      earnedUsd,
    lastSyncedAt:
      snapshot.syncedAt ||
      null,
    assets: [
      asset,
    ],
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

function updateLoopscaleHistoryFromSnapshot(
  history,
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
    return history;
  }

  const positionKey =
    getLoopscalePositionKey(
      snapshot
    );

  const currentMonth =
    getCurrentMonthKey();

  const startMonth =
    getMonthKey(
      snapshot.startTime
    );

  const pnlUsd =
    Number(
      snapshot.pnlUsd
    ) || 0;

  const existing =
    history?.positions?.[
      positionKey
    ] || {};

  const monthlyEarnings = {
    ...(
      existing.monthlyEarnings ||
      {}
    ),
  };

  const monthBaselines = {
    ...(
      existing.monthBaselines ||
      {}
    ),
  };

  if (
    !Number.isFinite(
      Number(
        monthBaselines[
          currentMonth
        ]
      )
    )
  ) {
    /*
     * The position was opened this month, so its current Loopscale
     * P&L is this month's income. For a position discovered in a
     * later month, start from the P&L at discovery instead.
     */
    monthBaselines[
      currentMonth
    ] =
      startMonth ===
      currentMonth
        ? 0
        : pnlUsd;
  }

  const baseline =
    Number(
      monthBaselines[
        currentMonth
      ]
    ) || 0;

  monthlyEarnings[
    currentMonth
  ] =
    Number(
      Math.max(
        0,
        pnlUsd -
          baseline
      ).toFixed(
        8
      )
    );

  return {
    ...history,

    positions: {
      ...(
        history?.positions ||
        {}
      ),

      [positionKey]: {
        ...existing,

        key:
          positionKey,

        loanAddress:
          snapshot.loanAddress ||
          positionKey,

        asset:
          snapshot.asset ||
          "ONyc",

        startTime:
          snapshot.startTime ||
          existing.startTime ||
          null,

        lastPnlUsd:
          pnlUsd,

        lastValueUsd:
          Number(
            snapshot.positionValueUsd
          ) || 0,

        lastApy:
          Number(
            snapshot.netApy
          ) || 0,

        lastSyncedAt:
          snapshot.syncedAt ||
          new Date().toISOString(),

        monthBaselines,

        monthlyEarnings,
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

function updateRatexHistoryFromSnapshot(
  current,
  snapshot
) {
  if (
    !snapshot ||
    !snapshot.mint ||
    !snapshot.maturity
  ) {
    return current;
  }

  const next = {
    positions: {
      ...(
        current?.positions ||
        {}
      ),
    },
  };

  const key =
    getRatexPositionKey(
      snapshot
    );

  const now =
    new Date();

  const nowIso =
    now.toISOString();

  const monthKey =
    getCurrentMonthKey();

  const quantity =
    Number(
      snapshot.quantity
    ) || 0;

  const currentValueUsd =
    Number(
      snapshot.currentValueUsd
    ) || 0;

  const priceUsd =
    Number(
      snapshot.priceUsd
    ) ||
    (
      quantity > 0
        ? currentValueUsd /
          quantity
        : 0
    );

  const existing =
    next.positions[
      key
    ];

  if (
    quantity > 0
  ) {
    const previous =
      existing || {
        key,
        platform:
          "RateX",
        asset:
          "PTONyc",
        mint:
          snapshot.mint,
        maturity:
          snapshot.maturity,
        openedAt:
          nowIso,
        status:
          "active",
        monthlyBaselines:
          {},
        monthlyEarnings:
          {},
        lastMonthKey:
          null,
        lastEarnedUsd:
          0,
        quantity:
          0,
        costBasisUsd:
          0,
        principalAddedUsd:
          0,
      };

    const previousQuantity =
      Number(
        previous.quantity
      ) || 0;

    const legacyCostBasis =
      Number(
        snapshot.costBasisUsd
      ) ||
      Number(
        previous.costBasisUsd
      ) ||
      0;

    let adjustedCostBasisUsd =
      Number(
        previous.costBasisUsd
      ) || 0;

    let principalAddedUsd =
      Number(
        previous.principalAddedUsd
      ) || 0;

    const isLegacyRecord =
      Number(
        previous.accountingVersion
      ) !==
        RATEX_ACCOUNTING_VERSION;

    if (
      isLegacyRecord
    ) {
      /*
       * The original RateX position was 606.27 PTONyc bought with
       * $600. Older accounting treated every dollar above that $600
       * as yield, so a later deposit looked like instant earnings.
       *
       * One-time migration:
       *   original lot -> keep the original $600 basis
       *   extra tokens -> treat their current purchase value as principal
       *
       * This immediately repairs the already-inflated September number.
       */
      const addedQuantity =
        Math.max(
          0,
          quantity -
            RATEX_LEGACY_INITIAL_QUANTITY
        );

      const addedPrincipalUsd =
        addedQuantity *
        priceUsd;

      adjustedCostBasisUsd =
        legacyCostBasis +
        addedPrincipalUsd;

      principalAddedUsd =
        Math.max(
          0,
          addedPrincipalUsd
        );
    } else if (
      previousQuantity > 0
    ) {
      const quantityDelta =
        quantity -
        previousQuantity;

      if (
        quantityDelta >
        0.000001
      ) {
        /*
         * New PTONyc appeared in the wallet. This is a deposit /
         * principal addition, NOT yield.
         */
        const addedPrincipalUsd =
          quantityDelta *
          priceUsd;

        adjustedCostBasisUsd +=
          addedPrincipalUsd;

        principalAddedUsd +=
          addedPrincipalUsd;
      } else if (
        quantityDelta <
        -0.000001
      ) {
        /*
         * If tokens leave the position, reduce the tracked cost basis
         * proportionally so the remaining position keeps its true P/L.
         */
        adjustedCostBasisUsd =
          previousQuantity >
          0
            ? adjustedCostBasisUsd *
              (
                quantity /
                previousQuantity
              )
            : 0;
      }
    } else if (
      !(adjustedCostBasisUsd > 0)
    ) {
      adjustedCostBasisUsd =
        currentValueUsd;
    }

    adjustedCostBasisUsd =
      Math.max(
        0,
        adjustedCostBasisUsd
      );

    const earnedUsd =
      Math.max(
        0,
        currentValueUsd -
          adjustedCostBasisUsd
      );

    const baselines = {
      ...(
        previous.monthlyBaselines ||
        {}
      ),
    };

    const monthlyEarnings = {
      ...(
        previous.monthlyEarnings ||
        {}
      ),
    };

    if (
      baselines[
        monthKey
      ] ===
      undefined
    ) {
      if (
        previous.lastMonthKey &&
        previous.lastMonthKey !==
          monthKey
      ) {
        baselines[
          monthKey
        ] =
          Number(
            previous.lastEarnedUsd
          ) || 0;
      } else {
        baselines[
          monthKey
        ] =
          0;
      }
    }

    const baseline =
      Number(
        baselines[
          monthKey
        ]
      ) || 0;

    /*
     * Because deposits increase the cost basis at the same time they
     * increase position value, earnedUsd does not jump when you deposit.
     * Only actual PT appreciation above principal changes this number.
     */
    monthlyEarnings[
      monthKey
    ] =
      Number(
        Math.max(
          0,
          earnedUsd -
            baseline
        ).toFixed(6)
      );

    const matured =
      isRatexMatured(
        snapshot.maturity
      );

    const maturityValueUsd =
      Number(
        snapshot.maturityValueUsd
      ) || quantity;

    const projectedProfitUsd =
      Math.max(
        0,
        maturityValueUsd -
          adjustedCostBasisUsd
      );

    next.positions[
      key
    ] = {
      ...previous,
      accountingVersion:
        RATEX_ACCOUNTING_VERSION,
      key,
      platform:
        "RateX",
      asset:
        "PTONyc",
      mint:
        snapshot.mint,
      maturity:
        snapshot.maturity,
      status:
        matured
          ? "matured"
          : "active",
      completedAt:
        matured
          ? (
              previous.completedAt ||
              nowIso
            )
          : null,
      fixedApy:
        Number(
          snapshot.fixedApy
        ) || 0,
      costBasisUsd:
        Number(
          adjustedCostBasisUsd.toFixed(
            8
          )
        ),
      principalAddedUsd:
        Number(
          principalAddedUsd.toFixed(
            8
          )
        ),
      quantity,
      finalQuantity:
        quantity,
      lastPriceUsd:
        priceUsd,
      lastValueUsd:
        currentValueUsd,
      maturityValueUsd,
      lastEarnedUsd:
        Number(
          earnedUsd.toFixed(
            8
          )
        ),
      projectedProfitUsd:
        Number(
          projectedProfitUsd.toFixed(
            8
          )
        ),
      monthlyBaselines:
        baselines,
      monthlyEarnings,
      lastMonthKey:
        monthKey,
      lastSyncedAt:
        snapshot.syncedAt ||
        nowIso,
    };

    return next;
  }

  if (
    existing &&
    existing.status ===
      "active"
  ) {
    const matured =
      isRatexMatured(
        existing.maturity
      );

    next.positions[
      key
    ] = {
      ...existing,
      status:
        matured
          ? "matured"
          : "closed",
      completedAt:
        nowIso,
      lastSyncedAt:
        snapshot.syncedAt ||
        nowIso,
    };
  }

  return next;
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
  ratexHistory,
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
 * RATEX
 */
Object.values(
  ratexHistory?.positions ||
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
          "RateX",
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

  if (
    saladDaily.length
  ) {
    saladDaily.forEach(
      ([
        date,
        amount,
      ]) => {
        addEarning(
          getMonthKey(
            date
          ),
          "Salad",
          Number(
            amount
          ) || 0
        );
      }
    );
  } else {
    Object.entries(
      saladTracker?.monthlyEarnings ||
        {}
    ).forEach(
      ([
        monthKey,
        amount,
      ]) => {
        addEarning(
          monthKey,
          "Salad",
          amount
        );
      }
    );
  }

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
      const amount =
        monthKey ===
          currentMonthKey &&
        liveTrxPrice > 0
          ? trx *
            liveTrxPrice
          : storedUsd;

      addEarning(
        monthKey,
        "RollerCoin",
        amount
      );
    }
  );

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


function KryptexProjectCard({
  collapsed,
  onToggle,
  tracker,
  connected,
  stats,
  message,
  onRefresh,
  logo,
  onLogoChange,
  totalSpent,
  onTotalSpentChange,
}) {
  const isLive =
    Boolean(
      connected &&
      stats?.reachable
    );

  return (
    <div
      className="
        overflow-hidden
        rounded-2xl
        border
        border-border/60
        bg-card/45
        shadow-sm
        transition-all
        duration-200
        hover:border-border
        hover:bg-card/65
      "
    >
      <button
        type="button"
        onClick={
          onToggle
        }
        className="
          flex
          min-h-[190px]
          w-full
          flex-col
          p-5
          text-left
        "
      >
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <ProjectLogoButton
              platform="Kryptex"
              logo={logo}
              onLogoChange={
                onLogoChange
              }
            />

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="whitespace-nowrap text-2xl font-semibold tracking-tight text-foreground">
                  Kryptex
                </h3>

                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    isLive
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                      : "border-amber-500/25 bg-amber-500/10 text-amber-300"
                  }`}
                >
                  <Wifi className="h-3 w-3" />
                  {isLive
                    ? "LIVE"
                    : "OFFLINE"}
                </span>
              </div>
            </div>
          </div>

          <ChevronRight
            className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
              collapsed
                ? ""
                : "rotate-90"
            }`}
            strokeWidth={1.5}
          />
        </div>

        <div className="mt-auto pt-7">
          <div className="flex flex-wrap items-end gap-3">
            <div className="text-[30px] font-semibold leading-none tracking-tight text-foreground tabular-nums">
              {formatCurrency(
                stats?.currentBalanceUsd
              )}
            </div>

            <ProjectPaybackStatus
              earned={
                stats?.lifetimeUsd
              }
              dailyIncome={
                stats?.dailyUsd
              }
              totalSpent={
                totalSpent
              }
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums text-muted-foreground">
            <span>
              {formatCurrency(
                stats?.dailyUsd
              )}
              /day
            </span>

            <span>·</span>

            <span>
              {formatCurrency(
                stats?.monthlyUsd
              )}
              /month
            </span>

            <span>·</span>

            <span>
              {formatCurrency(
                stats?.yearlyUsd
              )}
              /year
            </span>
          </div>
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-border/50 px-5 py-5">
          <div className="mb-5">
            <ProjectPaybackEditor
              value={
                totalSpent
              }
              onChange={
                onTotalSpentChange
              }
              earned={
                stats?.lifetimeUsd
              }
              dailyIncome={
                stats?.dailyUsd
              }
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Current Balance
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatCurrency(
                  stats?.currentBalanceUsd
                )}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                This Month
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatCurrency(
                  stats?.monthUsd
                )}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Lifetime Earned
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatCurrency(
                  stats?.lifetimeUsd
                )}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Withdrawable
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatCurrency(
                  stats?.withdrawableUsd
                )}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Live Profitability
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatCurrency(
                  stats?.dailyUsd
                )}
                /day
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Last Synced
              </p>
              <p className="mt-1 font-semibold">
                {formatSyncTime(
                  stats?.lastSyncedAt
                )}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
            <p className="text-xs text-muted-foreground">
              {message ||
                (isLive
                  ? "Kryptex extension connected. Balance and mining profitability update automatically."
                  : "Start Kryptex Desktop and make sure the Kryptex extension is enabled.")}
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={
                onRefresh
              }
            >
              Refresh
            </Button>
          </div>
        </div>
      )}
    </div>
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

export default function YieldFarmingPage() {
  const [
    manualPositions,
    setManualPositions,
  ] = useState(
    loadPositions
  );

  const [
    projectPayback,
    setProjectPayback,
  ] = useState(
    loadProjectPayback
  );

  const [
    allProjects,
    setAllProjects,
  ] = useState([]);

  const [
    luloProjects,
    setLuloProjects,
  ] = useState([]);

  const [
    ratexSnapshot,
    setRatexSnapshot,
  ] = useState(null);

  const [
    ratexHistory,
    setRatexHistory,
  ] = useState(
    loadRatexHistory
  );


  const [
    loopscaleSnapshot,
    setLoopscaleSnapshot,
  ] = useState(null);

  const [
    loopscaleHistory,
    setLoopscaleHistory,
  ] = useState(
    loadLoopscaleHistory
  );

  const [
    saladTracker,
    setSaladTracker,
  ] = useState(
    loadSaladTracker
  );

  const [
    saladConnected,
    setSaladConnected,
  ] = useState(false);

  const [
    saladSyncing,
    setSaladSyncing,
  ] = useState(false);

  const [
    saladMessage,
    setSaladMessage,
  ] = useState(
    ""
  );

  const [
    kryptexTracker,
    setKryptexTracker,
  ] = useState(
    loadKryptexTracker
  );

  const [
    kryptexConnected,
    setKryptexConnected,
  ] = useState(false);

  const [
    kryptexMessage,
    setKryptexMessage,
  ] = useState("");

  const [
    unetworkTracker,
    setUnetworkTracker,
  ] = useState(
    loadUnetworkTracker
  );

  const [
    unetworkConnected,
    setUnetworkConnected,
  ] = useState(false);

  const [
    unetworkSyncing,
    setUnetworkSyncing,
  ] = useState(false);

  const [
    unetworkMessage,
    setUnetworkMessage,
  ] = useState("");

  const [
    rollerCoinTracker,
    setRollerCoinTracker,
  ] = useState(
    loadRollerCoinTracker
  );

  const [
    rollerCoinConnected,
    setRollerCoinConnected,
  ] = useState(false);

  const [
    rollerCoinAuthenticated,
    setRollerCoinAuthenticated,
  ] = useState(false);

  const [
    rollerCoinOpen,
    setRollerCoinOpen,
  ] = useState(false);

  const [
    rollerCoinSyncing,
    setRollerCoinSyncing,
  ] = useState(false);

  const [
    rollerCoinMessage,
    setRollerCoinMessage,
  ] = useState("");

  const [
    rollerCoinFrom,
    setRollerCoinFrom,
  ] = useState(
    () =>
      `${getCurrentMonthKey()}-01`
  );

  const [
    rollerCoinTo,
    setRollerCoinTo,
  ] = useState(
    getTodayKey
  );

  const [
    monthlySnapshots,
    setMonthlySnapshots,
  ] = useState(
    loadMonthlySnapshots
  );

  const [
    syncError,
    setSyncError,
  ] = useState("");

  const [
    expandedProjects,
    setExpandedProjects,
  ] = useState(
    () =>
      new Set()
  );

  const [
    selectedMonthKey,
    setSelectedMonthKey,
  ] = useState(
    null
  );

  const [
    selectedYear,
    setSelectedYear,
  ] = useState(
    getCurrentYear
  );

  const [
    projectLogos,
    setProjectLogos,
  ] = useState(
    loadProjectLogos
  );

  const [
    monthlyBackfills,
    setMonthlyBackfills,
  ] = useState(
    loadMonthlyBackfills
  );

  const [
    luloMonthlyBaselines,
    setLuloMonthlyBaselines,
  ] = useState(
    loadLuloMonthlyBaselines
  );

  useEffect(
    () => {
      savePositions(
        manualPositions
      );
    },
    [
      manualPositions,
    ]
  );

  useEffect(() => {
  let cancelled = false;

  const refreshRollerCoinPrice =
    async () => {
      try {
        const price =
          Number(
            await fetchLiveTrxPrice()
          ) || 0;

        if (
          cancelled ||
          !(price > 0)
        ) {
          return;
        }

        setRollerCoinTracker(
          (current) => {
            const previousPrice =
              Number(
                current?.lastTrxPrice
              ) || 0;

            if (
              Math.abs(
                previousPrice -
                  price
              ) <
              0.00000001
            ) {
              return current;
            }

            return {
              ...current,
              lastTrxPrice:
                price,
            };
          }
        );
      } catch (
        error
      ) {
        console.error(
          "Could not refresh RollerCoin TRX price:",
          error
        );
      }
    };

  refreshRollerCoinPrice();

  const timer =
    window.setInterval(
      refreshRollerCoinPrice,
      60_000
    );

  return () => {
    cancelled = true;

    window.clearInterval(
      timer
    );
  };
}, []);

  useEffect(
    () => {
      saveProjectLogos(
        projectLogos
      );
    },
    [
      projectLogos,
    ]
  );

  useEffect(
    () => {
      saveMonthlyBackfills(
        monthlyBackfills
      );
    },
    [
      monthlyBackfills,
    ]
  );

  useEffect(
    () => {
      saveLuloMonthlyBaselines(
        luloMonthlyBaselines
      );
    },
    [
      luloMonthlyBaselines,
    ]
  );

  useEffect(
    () => {
      saveRatexHistory(
        ratexHistory
      );
    },
    [
      ratexHistory,
    ]
  );


  useEffect(
    () => {
      saveLoopscaleHistory(
        loopscaleHistory
      );
    },
    [
      loopscaleHistory,
    ]
  );

  useEffect(
    () => {
      saveSaladTracker(
        saladTracker
      );
    },
    [
      saladTracker,
    ]
  );

  useEffect(
    () => {
      saveKryptexTracker(
        kryptexTracker
      );
    },
    [
      kryptexTracker,
    ]
  );

  useEffect(
    () => {
      saveRollerCoinTracker(
        rollerCoinTracker
      );
    },
    [
      rollerCoinTracker,
    ]
  );

  useEffect(
    () => {
      saveUnetworkTracker(
        unetworkTracker
      );
    },
    [
      unetworkTracker,
    ]
  );

  useEffect(
    () => {
      let cancelled =
        false;

      const refreshPrice =
        async () => {
          const price =
            await fetchLiveTrxPrice();

          if (
            cancelled ||
            !(price > 0)
          ) {
            return;
          }

          setRollerCoinTracker(
            (current) => {
              const previousPrice =
                Number(
                  current?.lastTrxPrice
                ) || 0;

              if (
                Math.abs(
                  previousPrice -
                    price
                ) <
                1e-12
              ) {
                return current;
              }

              return {
                ...current,
                lastTrxPrice:
                  price,
              };
            }
          );
        };

      refreshPrice();

      const timer =
        window.setInterval(
          refreshPrice,
          300000
        );

      return () => {
        cancelled =
          true;

        window.clearInterval(
          timer
        );
      };
    },
    []
  );

  useEffect(
    () => {
      saveMonthlySnapshots(
        monthlySnapshots
      );
    },
    [
      monthlySnapshots,
    ]
  );

  const importRollerCoinPayload =
    useCallback(
      async (
        payload
      ) => {
        const rows =
          Array.isArray(
            payload?.rows
          )
            ? payload.rows
            : [];

        const incomingBalanceTrx =
          Number(
            payload?.current_balance_trx
          );

        const hasLiveBalance =
          Number.isFinite(
            incomingBalanceTrx
          ) &&
          incomingBalanceTrx >=
            0;

        if (
          !rows.length &&
          !hasLiveBalance
        ) {
          setRollerCoinSyncing(
            false
          );

          setRollerCoinMessage(
            "RollerCoin returned no earnings or live TRX balance."
          );

          return;
        }

        let trxPrice = 0;

        try {
          trxPrice =
            Number(
              await fetchLiveTrxPrice()
            ) || 0;
        } catch (
          error
        ) {
          console.error(
            "Could not load TRX price for RollerCoin:",
            error
          );
        }

        const affectedMonths =
          new Set();

        setRollerCoinTracker(
          (current) => {
            const nextDaily = {
              ...(
                current?.daily ||
                {}
              ),
            };

            const priceToUse =
              trxPrice >
              0
                ? trxPrice
                : (
                    Number(
                      current?.lastTrxPrice
                    ) || 0
                  );

            rows.forEach(
              (
                row
              ) => {
                const date =
                  String(
                    row?.date ||
                      ""
                  ).slice(
                    0,
                    10
                  );

                const trx =
                  Number(
                    row?.trx ??
                      row?.sol ??
                      0
                  ) || 0;

                if (
                  !/^\d{4}-\d{2}-\d{2}$/.test(
                    date
                  )
                ) {
                  return;
                }

                affectedMonths.add(
                  date.slice(
                    0,
                    7
                  )
                );

                const previous =
                  nextDaily[
                    date
                  ];

                const sameTrx =
                  previous &&
                  Math.abs(
                    (
                      Number(
                        previous.trx ?? previous.sol
                      ) || 0
                    ) -
                      trx
                  ) <
                    1e-12;

                const rowPrice =
                  sameTrx
                    ? (
                        Number(
                          previous.trxPrice ?? previous.solPrice
                        ) ||
                        priceToUse
                      )
                    : priceToUse;

                nextDaily[
                  date
                ] = {
                  trx,
                  usd:
                    Number(
                      (
                        trx *
                        rowPrice
                      ).toFixed(
                        8
                      )
                    ),
                  trxPrice:
                    rowPrice,
                  syncedAt:
                    payload?.synced_at ||
                    payload?.syncedAt ||
                    new Date().toISOString(),
                };
              }
            );

            /*
             * Current wallet balance now comes directly from
             * the RollerCoin extension's DOM scraper.
             *
             * If a particular sync cannot see the balance,
             * preserve the last successfully scraped balance
             * instead of inventing or hard-coding a value.
             */
            const previousBalance =
              Number(
                current?.currentTrxBalance
              );

            const currentTrxBalance =
              hasLiveBalance
                ? incomingBalanceTrx
                : (
                    Number.isFinite(
                      previousBalance
                    )
                      ? previousBalance
                      : 0
                  );

            return {
              ...current,

              daily:
                nextDaily,

              currentTrxBalance,

              balanceSyncedAt:
                payload?.balance_synced_at ||
                (
                  hasLiveBalance
                    ? (
                        payload?.synced_at ||
                        payload?.syncedAt ||
                        new Date().toISOString()
                      )
                    : (
                        current?.balanceSyncedAt ||
                        null
                      )
                ),

              balanceSource:
                payload?.balance_source ||
                (
                  hasLiveBalance
                    ? "extension"
                    : (
                        current?.balanceSource ||
                        null
                      )
                ),

              lastSyncedAt:
                payload?.synced_at ||
                payload?.syncedAt ||
                new Date().toISOString(),

              lastRange: {
                from:
                  payload?.from ||
                  null,
                to:
                  payload?.to ||
                  null,
              },

              lastTrxPrice:
                priceToUse,
            };
          }
        );

        if (
          affectedMonths.size
        ) {
          setMonthlySnapshots(
            (current) => {
              const next = {
                ...current,
              };

              const currentMonth =
                getCurrentMonthKey();

              affectedMonths.forEach(
                (
                  monthKey
                ) => {
                  if (
                    monthKey <
                    currentMonth
                  ) {
                    delete next[
                      monthKey
                    ];
                  }
                }
              );

              return next;
            }
          );
        }

        setRollerCoinSyncing(
          false
        );

        setRollerCoinMessage(
          trxPrice >
            0
            ? `Imported ${rows.length} RollerCoin day${rows.length === 1 ? "" : "s"} into Project Income.`
            : `Imported ${rows.length} RollerCoin day${rows.length === 1 ? "" : "s"}, but TRX price could not be loaded.`
        );
      },
      []
    );

const requestRollerCoinLatest =
  useCallback(
    () => {
      const from =
        `${getCurrentMonthKey()}-01`;

      const to =
        getTodayKey();

      /*
       * Ask the extension for its latest cached state/status.
       */
      window.postMessage(
        {
          source:
            "rollercoin-app",

          type:
            "REQUEST_LATEST",
        },
        window.location.origin
      );

      window.postMessage(
        {
          source:
            "rollercoin-app",

          type:
            "REQUEST_STATUS",
        },
        window.location.origin
      );

      /*
       * IMPORTANT:
       *
       * Also resync the FULL current month.
       *
       * REQUEST_LATEST can contain only the extension's
       * most recent cached payload. If older days are
       * missing from rollerCoinTracker.daily, simply
       * requesting the latest payload will never restore
       * them.
       *
       * This forces RollerCoin to return every earning
       * day from the 1st of the current month through
       * today.
       */
      window.postMessage(
        {
          source:
            "rollercoin-app",

          type:
            "SYNC_RANGE",

          from,

          to,
        },
        window.location.origin
      );
    },
    []
  );;

  const syncRollerCoinRange =
    useCallback(
      () => {
        if (
          !rollerCoinFrom ||
          !rollerCoinTo
        ) {
          setRollerCoinMessage(
            "Choose both dates first."
          );

          return;
        }

        if (
          rollerCoinFrom >
          rollerCoinTo
        ) {
          setRollerCoinMessage(
            "From date must be before To date."
          );

          return;
        }

        if (
          !rollerCoinConnected
        ) {
          setRollerCoinMessage(
            "RollerCoin extension is not connected to this page."
          );

          requestRollerCoinLatest();

          return;
        }

        setRollerCoinSyncing(
          true
        );

        setRollerCoinMessage(
          "Syncing RollerCoin earnings…"
        );

        window.postMessage(
          {
            source:
              "rollercoin-app",
            type:
              "SYNC_RANGE",
            from:
              rollerCoinFrom,
            to:
              rollerCoinTo,
          },
          window.location.origin
        );
      },
      [
        rollerCoinConnected,
        rollerCoinFrom,
        rollerCoinTo,
        requestRollerCoinLatest,
      ]
    );

  useEffect(
    () => {
      const handleMessage =
        (
          event
        ) => {
          if (
            event.origin !==
              window.location.origin ||
            event.source !==
              window
          ) {
            return;
          }

          const data =
            event.data;

          if (
            data?.source !==
            "rollercoin-ext"
          ) {
            return;
          }

          if (
            data.type ===
            "READY"
          ) {
            setRollerCoinConnected(
              true
            );

            requestRollerCoinLatest();

            return;
          }

          if (
            data.type ===
            "ROLLERCOIN_STATUS"
          ) {
            setRollerCoinConnected(
              true
            );

            setRollerCoinAuthenticated(
              Boolean(
                data.payload?.authenticated
              )
            );

            setRollerCoinOpen(
              Boolean(
                data.payload?.rollercoinOpen
              )
            );

            if (
              data.payload?.lastPayload
            ) {
              importRollerCoinPayload(
                data.payload.lastPayload
              );
            }

            return;
          }

          if (
            data.type ===
              "ROLLERCOIN_PUSH" ||
            data.type ===
              "ROLLERCOIN_SYNC_RESULT"
          ) {
            setRollerCoinConnected(
              true
            );

            if (
              data.payload
            ) {
              importRollerCoinPayload(
                data.payload
              );
            } else {
              setRollerCoinSyncing(
                false
              );
            }

            return;
          }

          if (
            data.type ===
            "ROLLERCOIN_SYNC_ERROR" ||
            data.type ===
            "ROLLERCOIN_ERROR"
          ) {
            setRollerCoinConnected(
              true
            );

            setRollerCoinSyncing(
              false
            );

            setRollerCoinMessage(
              data.error ||
                "RollerCoin sync failed."
            );
          }
        };

      window.addEventListener(
        "message",
        handleMessage
      );

      const firstRequest =
        window.setTimeout(
          requestRollerCoinLatest,
          400
        );

      const secondRequest =
        window.setTimeout(
          requestRollerCoinLatest,
          1400
        );

      const handleFocus =
        () =>
          requestRollerCoinLatest();

      window.addEventListener(
        "focus",
        handleFocus
      );

      return () => {
        window.removeEventListener(
          "message",
          handleMessage
        );

        window.removeEventListener(
          "focus",
          handleFocus
        );

        window.clearTimeout(
          firstRequest
        );

        window.clearTimeout(
          secondRequest
        );
      };
    },
    [
      importRollerCoinPayload,
      requestRollerCoinLatest,
    ]
  );

  const applyProjectData =
    useCallback(
      (projects) => {
        const normalized =
          Array.isArray(
            projects
          )
            ? projects
            : [];

        setAllProjects(
          normalized
        );

        setLuloProjects(
          normalized.filter(
            (project) =>
              project?.yield_tracking ===
              "lulo_lending"
          )
        );
      },
      []
    );

  const refreshProjectsOnly =
    useCallback(
      async () => {
        try {
          const response =
            await projectsApi.getAll();

          applyProjectData(
            response?.data
          );
        } catch (
          error
        ) {
          console.error(
            "Project refresh failed:",
            error
          );
        }
      },
      [
        applyProjectData,
      ]
    );

  useEffect(
    () => {
      const handleRollerCoinSync =
        () => {
          window.setTimeout(
            refreshProjectsOnly,
            150
          );
        };

      window.addEventListener(
        "rollercoin-sync-complete",
        handleRollerCoinSync
      );

      window.addEventListener(
        "focus",
        handleRollerCoinSync
      );

      return () => {
        window.removeEventListener(
          "rollercoin-sync-complete",
          handleRollerCoinSync
        );

        window.removeEventListener(
          "focus",
          handleRollerCoinSync
        );
      };
    },
    [
      refreshProjectsOnly,
    ]
  );

  useEffect(
    () => {
      if (
        !luloProjects.length
      ) {
        return;
      }

      const monthKey =
        getCurrentMonthKey();

      if (
        monthKey <
        MONTHLY_TRACKING_START
      ) {
        return;
      }

      /*
       * Lulo monthly income is tracked as a monotonic total instead of
       * being rebuilt from Lulo's raw lifetime-interest counter.
       *
       * Why: deposits and withdrawals can change Lulo's accounting
       * fields even though no yield was earned. We detect a meaningful
       * principal balance change, preserve the month-to-date income, and
       * simply re-anchor the lifetime-interest counter at the new value.
       *
       * Version 3 also repairs September 2026 to the last known-good
       * amount ($7.76) from immediately before the withdrawal.
       */
      setLuloMonthlyBaselines(
        (current) => {
          let changed =
            false;

          const next = {
            ...current,
          };

          const now =
            new Date();

          const nowIso =
            now.toISOString();

          luloProjects.forEach(
            (project) => {
              if (
                !project?.id
              ) {
                return;
              }

              const lifetimeInterest =
                Number(
                  project.lulo_lifetime_interest_usd
                );

              const balanceUsd =
                Number(
                  project.lulo_total_balance_usd
                );

              if (
                !Number.isFinite(
                  lifetimeInterest
                ) ||
                lifetimeInterest <
                  0 ||
                !Number.isFinite(
                  balanceUsd
                ) ||
                balanceUsd <
                  0
              ) {
                return;
              }

              const projectKey =
                String(
                  project.id
                );

              const projectMonths = {
                ...(
                  next[
                    projectKey
                  ] ||
                  {}
                ),
              };

              const previous =
                projectMonths[
                  monthKey
                ];

              /*
               * One-time migration from the old baseline/remainder
               * accounting. The old September data has already been
               * contaminated by the withdrawal, so re-anchor it now.
               */
              if (
                !previous ||
                Number(
                  previous.version
                ) !==
                  LULO_MONTHLY_ACCOUNTING_VERSION
              ) {
                projectMonths[
                  monthKey
                ] = {
                  version:
                    LULO_MONTHLY_ACCOUNTING_VERSION,
                  monthEarned:
                    monthKey ===
                    "2026-09"
                      ? LULO_SEPTEMBER_2026_OPENING_EARNED
                      : 0,
                  lastLifetimeInterest:
                    lifetimeInterest,
                  lastBalanceUsd:
                    balanceUsd,
                  createdAt:
                    nowIso,
                  lastSyncedAt:
                    nowIso,
                };

                next[
                  projectKey
                ] =
                  projectMonths;

                changed =
                  true;

                return;
              }

              const previousInterest =
                Number(
                  previous.lastLifetimeInterest
                );

              const previousBalance =
                Number(
                  previous.lastBalanceUsd
                );

              let monthEarned =
                Number(
                  previous.monthEarned
                ) || 0;

              const interestDelta =
                Number.isFinite(
                  previousInterest
                )
                  ? (
                      lifetimeInterest -
                      previousInterest
                    )
                  : 0;

              const balanceDelta =
                Number.isFinite(
                  previousBalance
                )
                  ? (
                      balanceUsd -
                      previousBalance
                    )
                  : 0;

              const referenceBalance =
                Math.max(
                  balanceUsd,
                  Number.isFinite(
                    previousBalance
                  )
                    ? previousBalance
                    : 0
                );

              const cashFlowThreshold =
                Math.max(
                  5,
                  referenceBalance *
                    0.0025
                );

              const principalMoved =
                Number.isFinite(
                  previousBalance
                ) &&
                Math.abs(
                  balanceDelta
                ) >=
                  cashFlowThreshold;

              let acceptInterestDelta =
                false;

              if (
                !principalMoved &&
                interestDelta >
                  0
              ) {
                const previousSyncMs =
                  new Date(
                    previous.lastSyncedAt ||
                      previous.createdAt ||
                      nowIso
                  ).getTime();

                const elapsedDays =
                  Number.isFinite(
                    previousSyncMs
                  )
                    ? Math.max(
                        (
                          now.getTime() -
                          previousSyncMs
                        ) /
                          86400000,
                        1 / 1440
                      )
                    : 1 / 1440;

                const apy =
                  Math.max(
                    0,
                    Number(
                      project.lulo_weighted_apy
                    ) || 0
                  );

                const expectedInterest =
                  referenceBalance *
                  (
                    apy /
                    100
                  ) *
                  (
                    elapsedDays /
                    365
                  );

                const plausibleLimit =
                  Math.max(
                    0.5,
                    (
                      expectedInterest *
                      5
                    ) +
                      0.1
                  );

                acceptInterestDelta =
                  interestDelta <=
                  plausibleLimit;
              }

              if (
                acceptInterestDelta
              ) {
                monthEarned +=
                  interestDelta;
              }

              const updated = {
                ...previous,
                version:
                  LULO_MONTHLY_ACCOUNTING_VERSION,
                monthEarned:
                  Number(
                    Math.max(
                      0,
                      monthEarned
                    ).toFixed(
                      6
                    )
                  ),
                lastLifetimeInterest:
                  lifetimeInterest,
                lastBalanceUsd:
                  balanceUsd,
                lastSyncedAt:
                  nowIso,
                lastCashFlowAt:
                  principalMoved
                    ? nowIso
                    : (
                        previous.lastCashFlowAt ||
                        null
                      ),
              };

              if (
                JSON.stringify(
                  updated
                ) !==
                JSON.stringify(
                  previous
                )
              ) {
                projectMonths[
                  monthKey
                ] =
                  updated;

                next[
                  projectKey
                ] =
                  projectMonths;

                changed =
                  true;
              }
            }
          );

          return changed
            ? next
            : current;
        }
      );
    },
    [
      luloProjects,
    ]
  );

  useEffect(
    () => {
      if (
        !luloProjects.length
      ) {
        return;
      }

      const monthKey =
        getCurrentMonthKey();

      if (
        monthKey <
        MONTHLY_TRACKING_START
      ) {
        return;
      }

      /*
       * monthlyBackfills now stores the authoritative Lulo month total.
       * buildProjectIncome() ignores legacy lulo_yield transactions for
       * months that have one of these totals, preventing double counting.
       */
      setMonthlyBackfills(
        (current) => {
          let changed =
            false;

          const next = {
            ...current,
          };

          luloProjects.forEach(
            (project) => {
              if (
                !project?.id
              ) {
                return;
              }

              const projectKey =
                String(
                  project.id
                );

              const tracker =
                luloMonthlyBaselines?.[
                  projectKey
                ]?.[
                  monthKey
                ];

              if (
                !tracker ||
                Number(
                  tracker.version
                ) !==
                  LULO_MONTHLY_ACCOUNTING_VERSION
              ) {
                return;
              }

              const monthEarned =
                Number(
                  tracker.monthEarned
                );

              if (
                !Number.isFinite(
                  monthEarned
                ) ||
                monthEarned <
                  0
              ) {
                return;
              }

              const existing =
                next[
                  projectKey
                ] || {};

              const previousValue =
                Number(
                  existing?.[
                    monthKey
                  ]
                );

              if (
                Number.isFinite(
                  previousValue
                ) &&
                Math.abs(
                  previousValue -
                    monthEarned
                ) <
                  0.000001
              ) {
                return;
              }

              next[
                projectKey
              ] = {
                ...existing,
                [monthKey]:
                  monthEarned,
              };

              changed =
                true;
            }
          );

          return changed
            ? next
            : current;
        }
      );
    },
    [
      luloProjects,
      luloMonthlyBaselines,
    ]
  );

  useEffect(
    () => {
      if (
        !ratexSnapshot
      ) {
        return;
      }

      setRatexHistory(
        (current) => {
          const next =
            updateRatexHistoryFromSnapshot(
              current,
              ratexSnapshot
            );

          if (
            JSON.stringify(
              next
            ) ===
            JSON.stringify(
              current
            )
          ) {
            return current;
          }

          return next;
        }
      );
    },
    [
      ratexSnapshot,
    ]
  );


  useEffect(
    () => {
      if (
        !loopscaleSnapshot
      ) {
        return;
      }

      setLoopscaleHistory(
        (
          current
        ) => {
          const next =
            updateLoopscaleHistoryFromSnapshot(
              current,
              loopscaleSnapshot
            );

          if (
            JSON.stringify(
              next
            ) ===
            JSON.stringify(
              current
            )
          ) {
            return current;
          }

          return next;
        }
      );
    },
    [
      loopscaleSnapshot,
    ]
  );

const importSaladPayload =
  useCallback(
    (payload) => {
      const currentBalance =
        Number(
          payload?.currentBalance
        );

      const lifetimeBalance =
        Number(
          payload?.lifetimeBalance
        );

      if (
        !Number.isFinite(
          currentBalance
        ) ||
        !Number.isFinite(
          lifetimeBalance
        )
      ) {
        setSaladSyncing(
          false
        );

        setSaladMessage(
          "Salad returned an invalid balance payload."
        );

        return;
      }

      const syncedAt =
        payload?.syncedAt ||
        new Date().toISOString();

      const incomingDaily =
        payload?.daily &&
        typeof payload.daily ===
          "object"
          ? payload.daily
          : {};

      setSaladTracker(
        (current) => {
          const daily = {
            ...(
              current?.daily ||
              {}
            ),
          };

          /*
           * Merge any dated Salad earnings supplied
           * by the extension.
           */
          Object.entries(
            incomingDaily
          ).forEach(
            ([
              date,
              amount,
            ]) => {
              const value =
                Number(
                  amount
                ) || 0;

              if (
                /^\d{4}-\d{2}-\d{2}$/.test(
                  String(
                    date
                  )
                ) &&
                value >= 0
              ) {
                daily[
                  date
                ] =
                  value;
              }
            }
          );

          const monthlyEarnings = {
            ...(
              current?.monthlyEarnings ||
              {}
            ),
          };

          /*
           * Build exact monthly totals from
           * dated earnings when available.
           */
          const exactMonthly =
            {};

          Object.entries(
            daily
          ).forEach(
            ([
              date,
              amount,
            ]) => {
              const monthKey =
                String(
                  date
                ).slice(
                  0,
                  7
                );

              exactMonthly[
                monthKey
              ] =
                (
                  Number(
                    exactMonthly[
                      monthKey
                    ]
                  ) || 0
                ) +
                (
                  Number(
                    amount
                  ) || 0
                );
            }
          );

          Object.entries(
            exactMonthly
          ).forEach(
            ([
              monthKey,
              amount,
            ]) => {
              monthlyEarnings[
                monthKey
              ] =
                Number(
                  Number(
                    amount
                  ).toFixed(
                    6
                  )
                );
            }
          );

          const monthKey =
            getCurrentMonthKey();

          /*
           * If Salad provides NO dated earnings,
           * do not try to reconstruct this month's
           * income from lifetime-balance changes.
           *
           * Instead, use the live Salad balance as
           * the current month's earned amount.
           *
           * Example:
           * Available balance = $3.72
           * No explicit withdrawal history
           *
           * This month = $3.72
           * Available = $3.72
           * Withdrawn = $0.00
           */
          if (
            !Object.keys(
              incomingDaily
            ).length
          ) {
            monthlyEarnings[
              monthKey
            ] =
              Number(
                currentBalance.toFixed(
                  6
                )
              );
          }

          /*
           * Save lifetime-balance readings so the
           * projection can use the most recent
           * approximately-one-hour earning change.
           *
           * Keep up to 48 hours of minute-level
           * readings. Repeated timestamps are replaced
           * instead of duplicated.
           */
          const syncedTimestamp =
            new Date(
              syncedAt
            ).getTime();

          const cutoffTimestamp =
            Number.isFinite(
              syncedTimestamp
            )
              ? syncedTimestamp -
                48 *
                  60 *
                  60 *
                  1000
              : Date.now() -
                48 *
                  60 *
                  60 *
                  1000;

          const earningSnapshots =
            (
              Array.isArray(
                current?.earningSnapshots
              )
                ? current.earningSnapshots
                : []
            )
              .filter(
                (entry) => {
                  const timestamp =
                    new Date(
                      entry?.syncedAt
                    ).getTime();

                  return (
                    Number.isFinite(
                      timestamp
                    ) &&
                    timestamp >=
                      cutoffTimestamp
                  );
                }
              )
              .filter(
                (entry) =>
                  entry?.syncedAt !==
                  syncedAt
              );

          earningSnapshots.push({
            syncedAt,
            lifetimeBalance:
              Number(
                lifetimeBalance.toFixed(
                  8
                )
              ),
          });

          earningSnapshots.sort(
            (
              a,
              b
            ) =>
              new Date(
                a.syncedAt
              ).getTime() -
              new Date(
                b.syncedAt
              ).getTime()
          );

          return {
            ...current,

            initialized:
              true,

            startedMonth:
              current?.startedMonth ||
              monthKey,

            currentBalance,

            lifetimeBalance,

            lastBalance:
              currentBalance,

            lastLifetimeBalance:
              lifetimeBalance,

            lastSyncedAt:
              syncedAt,

            /*
             * Salad does not currently give us
             * a reliable explicit withdrawal event.
             *
             * Do NOT infer withdrawals from a drop
             * or mismatch in the available balance.
             */
            lastWithdrawalAt:
              null,

            withdrawals:
              0,

            monthlyEarnings,

            daily,

            earningSnapshots:
              earningSnapshots.slice(
                -2880
              ),
          };
        }
      );

      setSaladConnected(
        true
      );

      setSaladSyncing(
        false
      );

      const dayCount =
        Object.keys(
          incomingDaily
        ).length;

      setSaladMessage(
        dayCount
          ? `Salad synced ${dayCount} earning day${dayCount === 1 ? "" : "s"}.`
          : "Salad balance synced."
      );
    },
    []
  );

  const syncSaladBalance =
    useCallback(
      () => {
        setSaladSyncing(
          true
        );

        setSaladMessage(
          "Syncing Salad earnings…"
        );

        window.postMessage(
          {
            source:
              "salad-app",
            type:
              "SYNC_NOW",
          },
          window.location.origin
        );
      },
      []
    );

  const requestSaladLatest =
    useCallback(
      () => {
        window.postMessage(
          {
            source:
              "salad-app",
            type:
              "REQUEST_LATEST",
          },
          window.location.origin
        );
      },
      []
    );

  useEffect(
    () => {
      const handleMessage =
        (
          event
        ) => {
          if (
            event.origin !==
              window.location.origin ||
            event.source !==
              window
          ) {
            return;
          }

          const data =
            event.data;

          if (
            data?.source !==
            "salad-ext"
          ) {
            return;
          }

          if (
            data.type ===
            "READY"
          ) {
            setSaladConnected(
              true
            );

            requestSaladLatest();

            return;
          }

          if (
            data.type ===
              "SALAD_PUSH" ||
            data.type ===
              "SALAD_SYNC_RESULT"
          ) {
            setSaladConnected(
              true
            );

            if (
              data.payload
            ) {
              importSaladPayload(
                data.payload
              );
            } else {
              setSaladSyncing(
                false
              );
            }

            return;
          }

          if (
            data.type ===
              "SALAD_ERROR" ||
            data.type ===
              "SALAD_SYNC_ERROR"
          ) {
            setSaladConnected(
              true
            );

            setSaladSyncing(
              false
            );

            setSaladMessage(
              data.error ||
                "Salad sync failed. Open Salad and make sure you are signed in."
            );
          }
        };

      window.addEventListener(
        "message",
        handleMessage
      );

      const firstRequest =
        window.setTimeout(
          requestSaladLatest,
          500
        );

      const secondRequest =
        window.setTimeout(
          requestSaladLatest,
          1500
        );

      const handleFocus =
        () =>
          requestSaladLatest();

      window.addEventListener(
        "focus",
        handleFocus
      );

      return () => {
        window.removeEventListener(
          "message",
          handleMessage
        );

        window.removeEventListener(
          "focus",
          handleFocus
        );

        window.clearTimeout(
          firstRequest
        );

        window.clearTimeout(
          secondRequest
        );
      };
    },
    [
      importSaladPayload,
      requestSaladLatest,
    ]
  );


  const importKryptexPayload =
    useCallback(
      (payload) => {
        const status =
          payload?.status ||
          {};

        const currentBalance =
          Number(
            status?.balance_usd
          );

        if (
          !Number.isFinite(
            currentBalance
          ) ||
          currentBalance < 0
        ) {
          setKryptexMessage(
            "Kryptex returned an invalid balance."
          );
          return;
        }

        const syncedAt =
          payload?.synced_at ||
          new Date().toISOString();

        const profitabilityUsdDay =
          Number(
            status?.profitability_usd_day
          ) || 0;

        const withdrawableUsd =
          Number(
            status?.withdrawable_usd
          ) || 0;

        const miners =
          Array.isArray(
            status?.miners
          )
            ? status.miners
            : [];

        setKryptexTracker(
          (current) => {
            const previousBalance =
              Number(
                current?.lastBalance
              );

            const baselineBalance =
              Number.isFinite(
                previousBalance
              )
                ? previousBalance
                : KRYPTEX_OPENING_BALANCE_USD;

            const positiveDelta =
              Math.max(
                0,
                currentBalance -
                  baselineBalance
              );

            const monthKey =
              getCurrentMonthKey();

            const monthlyEarnings = {
              ...(
                current?.monthlyEarnings ||
                {
                  "2026-09":
                    KRYPTEX_OPENING_BALANCE_USD,
                }
              ),
            };

            const existingMonth =
              Number(
                monthlyEarnings[
                  monthKey
                ]
              ) ||
              (
                monthKey ===
                  "2026-09"
                  ? KRYPTEX_OPENING_BALANCE_USD
                  : 0
              );

            monthlyEarnings[
              monthKey
            ] =
              Number(
                (
                  existingMonth +
                  positiveDelta
                ).toFixed(
                  6
                )
              );

            const lifetimeEarnedUsd =
              (
                Number(
                  current?.lifetimeEarnedUsd
                ) ||
                KRYPTEX_OPENING_BALANCE_USD
              ) +
              positiveDelta;

            return {
              ...current,
              initialized: true,
              currentBalance,
              lastBalance:
                currentBalance,
              openingBalanceUsd:
                KRYPTEX_OPENING_BALANCE_USD,
              lifetimeEarnedUsd:
                Number(
                  lifetimeEarnedUsd.toFixed(
                    6
                  )
                ),
              profitabilityUsdDay,
              withdrawableUsd,
              monthlyEarnings,
              lastSyncedAt:
                syncedAt,
              reachable:
                payload?.reachable !==
                false,
              miners,
            };
          }
        );

        setKryptexConnected(
          true
        );

        setKryptexMessage(
          "Kryptex synced."
        );
      },
      []
    );

  const requestKryptexLatest =
    useCallback(
      () => {
        window.postMessage(
          {
            source:
              "kryptex-tracker-app",
            type:
              "REQUEST_LATEST",
          },
          window.location.origin
        );
      },
      []
    );

  useEffect(
    () => {
      const handleMessage =
        (event) => {
          if (
            event.origin !==
              window.location.origin ||
            event.source !==
              window
          ) {
            return;
          }

          const data =
            event.data;

          if (
            data?.source !==
            "kryptex-tracker-ext"
          ) {
            return;
          }

          if (
            data.type ===
            "READY"
          ) {
            setKryptexConnected(
              true
            );

            requestKryptexLatest();
            return;
          }

          if (
            data.type ===
            "KRYPTEX_PUSH"
          ) {
            setKryptexConnected(
              true
            );

            if (
              data.payload
            ) {
              importKryptexPayload(
                data.payload
              );
            }

            return;
          }

          if (
            data.type ===
            "KRYPTEX_STATUS"
          ) {
            setKryptexConnected(
              true
            );

            setKryptexTracker(
              (current) => ({
                ...current,
                reachable: false,
              })
            );

            setKryptexMessage(
              "Kryptex Desktop is not reachable right now. Showing the last synced values."
            );
          }
        };

      window.addEventListener(
        "message",
        handleMessage
      );

      const firstRequest =
        window.setTimeout(
          requestKryptexLatest,
          500
        );

      const secondRequest =
        window.setTimeout(
          requestKryptexLatest,
          1500
        );

      const handleFocus =
        () =>
          requestKryptexLatest();

      window.addEventListener(
        "focus",
        handleFocus
      );

      return () => {
        window.removeEventListener(
          "message",
          handleMessage
        );

        window.removeEventListener(
          "focus",
          handleFocus
        );

        window.clearTimeout(
          firstRequest
        );

        window.clearTimeout(
          secondRequest
        );
      };
    },
    [
      importKryptexPayload,
      requestKryptexLatest,
    ]
  );


  const importUnetworkPayload =
    useCallback(
      (
        payload
      ) => {
        if (
          !payload
        ) {
          return;
        }

        const rawMicros =
          Number(
            payload?.balance_micros ??
              payload?.balanceMicros
          );

        const explicitUsd =
          Number(
            payload?.balance_usd ??
              payload?.balanceUsd
          );

        const currentBalance =
          Number.isFinite(
            explicitUsd
          )
            ? explicitUsd
            : (
                Number.isFinite(
                  rawMicros
                )
                  ? rawMicros /
                    1_000_000
                  : NaN
              );

        if (
          !Number.isFinite(
            currentBalance
          ) ||
          currentBalance <
            0
        ) {
          setUnetworkSyncing(
            false
          );

          setUnetworkMessage(
            "Unetwork returned an invalid balance."
          );

          return;
        }

        const rows =
          Array.isArray(
            payload?.rows
          )
            ? payload.rows
            : [];

        setUnetworkTracker(
          (
            current
          ) => {
            const nextDaily = {
              ...(
                current?.daily ||
                {}
              ),
            };

            const incomingRowsLifetimeUsd =
              rows.reduce(
                (
                  sum,
                  row
                ) =>
                  sum +
                  (
                    Number(
                      row?.usd
                    ) || 0
                  ),
                0
              );

            const currentMonth =
              getCurrentMonthKey();

            const incomingOpeningMonthRowsUsd =
              rows.reduce(
                (
                  sum,
                  row
                ) =>
                  String(
                    row?.date ||
                      ""
                  ).slice(
                    0,
                    7
                  ) ===
                  currentMonth
                    ? sum +
                      (
                        Number(
                          row?.usd
                        ) || 0
                      )
                    : sum,
                0
              );

            /*
             * One-time baseline/migration:
             *
             * The extension can return $1.55 of allocation history
             * while rewards_get_balance says $1.99 is currently
             * available. The live balance proves at least $1.99 has
             * already been earned, so start Unetwork at $1.99.
             *
             * Existing allocation rows become the baseline and are
             * NOT added on top of that $1.99. Only future allocation
             * growth is added afterward.
             */
            const needsBaseline =
              !Boolean(
                current?.baselineInitialized
              );

            const openingEarnedUsd =
              needsBaseline
                ? currentBalance
                : (
                    Number(
                      current
                        ?.openingEarnedUsd
                    ) || 0
                  );

            const allocationsBaselineUsd =
              needsBaseline
                ? incomingRowsLifetimeUsd
                : (
                    Number(
                      current
                        ?.allocationsBaselineUsd
                    ) || 0
                  );

            const openingMonth =
              needsBaseline
                ? currentMonth
                : (
                    current
                      ?.openingMonth ||
                    currentMonth
                  );

            const openingMonthRowsBaselineUsd =
              needsBaseline
                ? incomingOpeningMonthRowsUsd
                : (
                    Number(
                      current
                        ?.openingMonthRowsBaselineUsd
                    ) || 0
                  );

            /*
             * Preferred path:
             * rewards_get_allocations gives us actual dated
             * earnings, so withdrawals never affect income.
             */
            if (
              rows.length
            ) {
              rows.forEach(
                (
                  row
                ) => {
                  const date =
                    String(
                      row?.date ||
                        ""
                    ).slice(
                      0,
                      10
                    );

                  const usd =
                    Number(
                      row?.usd
                    );

                  if (
                    !date ||
                    !Number.isFinite(
                      usd
                    ) ||
                    usd <
                      0
                  ) {
                    return;
                  }

                  nextDaily[
                    date
                  ] = {
                    usd,

                    micros:
                      Number(
                        row?.micros
                      ) || 0,

                    count:
                      Number(
                        row?.count
                      ) || 0,

                    syncedAt:
                      payload?.synced_at ||
                      payload?.syncedAt ||
                      new Date().toISOString(),
                  };
                }
              );
            } else {
              /*
               * Balance-only fallback:
               * first sync counts the available balance once.
               * Later increases are earnings; decreases are
               * withdrawals and never subtract from income.
               */
              const previousBalance =
                Number(
                  current?.lastBalance
                ) || 0;

              const initialized =
                Boolean(
                  current?.initialized
                );

              const positiveDelta =
                initialized
                  ? Math.max(
                      0,
                      currentBalance -
                        previousBalance
                    )
                  : currentBalance;

              if (
                positiveDelta >
                0
              ) {
                const today =
                  getTodayKey();

                const previousEntry =
                  nextDaily[
                    today
                  ];

                const previousUsd =
                  typeof previousEntry ===
                    "number"
                    ? Number(
                        previousEntry
                      ) || 0
                    : Number(
                        previousEntry?.usd
                      ) || 0;

                nextDaily[
                  today
                ] = {
                  usd:
                    Number(
                      (
                        previousUsd +
                        positiveDelta
                      ).toFixed(
                        8
                      )
                    ),

                  micros:
                    0,

                  count:
                    0,

                  syncedAt:
                    payload?.synced_at ||
                    payload?.syncedAt ||
                    new Date().toISOString(),
                };
              }
            }

            const previousBalance =
              Number(
                current?.lastBalance
              ) || 0;

            const withdrawal =
              current?.initialized &&
              currentBalance <
                previousBalance
                ? previousBalance -
                  currentBalance
                : 0;

            return {
              ...current,

              initialized:
                true,

              baselineInitialized:
                true,

              openingEarnedUsd,

              allocationsBaselineUsd,

              openingMonth,

              openingMonthRowsBaselineUsd,

              currentBalance,

              lastBalance:
                currentBalance,

              withdrawals:
                (
                  Number(
                    current?.withdrawals
                  ) || 0
                ) +
                withdrawal,

              daily:
                nextDaily,

              lastSyncedAt:
                payload?.synced_at ||
                payload?.syncedAt ||
                new Date().toISOString(),
            };
          }
        );

        setUnetworkConnected(
          true
        );

        setUnetworkSyncing(
          false
        );

        setUnetworkMessage(
          rows.length
            ? `Synced ${rows.length} Unetwork earning day${rows.length === 1 ? "" : "s"}.`
            : "Unetwork balance synced."
        );
      },
      []
    );

  const requestUnetworkLatest =
    useCallback(
      () => {
        window.postMessage(
          {
            source:
              "unetwork-app",

            type:
              "REQUEST_LATEST",
          },
          window.location.origin
        );

        window.postMessage(
          {
            source:
              "unetwork-app",

            type:
              "REQUEST_STATUS",
          },
          window.location.origin
        );
      },
      []
    );

  const syncUnetworkBalance =
    useCallback(
      () => {
        setUnetworkSyncing(
          true
        );

        setUnetworkMessage(
          "Syncing Unetwork earnings…"
        );

        window.postMessage(
          {
            source:
              "unetwork-app",

            type:
              "SYNC_NOW",
          },
          window.location.origin
        );
      },
      []
    );

  useEffect(
    () => {
      const handleMessage =
        (
          event
        ) => {
          if (
            event.origin !==
              window.location.origin ||
            event.source !==
              window
          ) {
            return;
          }

          const data =
            event.data;

          if (
            data?.source !==
            "unetwork-ext"
          ) {
            return;
          }

          if (
            data.type ===
            "READY"
          ) {
            setUnetworkConnected(
              true
            );

            requestUnetworkLatest();

            return;
          }

          if (
            data.type ===
            "UNETWORK_STATUS"
          ) {
            setUnetworkConnected(
              Boolean(
                data.payload?.unetworkOpen ||
                data.payload?.lastPayload
              )
            );

            if (
              data.payload?.lastPayload
            ) {
              importUnetworkPayload(
                data.payload.lastPayload
              );
            }

            return;
          }

          if (
            data.type ===
              "UNETWORK_PUSH" ||
            data.type ===
              "UNETWORK_SYNC_RESULT"
          ) {
            setUnetworkConnected(
              true
            );

            if (
              data.payload
            ) {
              importUnetworkPayload(
                data.payload
              );
            } else {
              setUnetworkSyncing(
                false
              );
            }

            return;
          }

          if (
            data.type ===
              "UNETWORK_SYNC_ERROR" ||
            data.type ===
              "UNETWORK_ERROR"
          ) {
            setUnetworkConnected(
              true
            );

            setUnetworkSyncing(
              false
            );

            setUnetworkMessage(
              data.error ||
                "Unetwork sync failed. Open Unetwork and make sure you are signed in."
            );
          }
        };

      window.addEventListener(
        "message",
        handleMessage
      );

      const firstRequest =
        window.setTimeout(
          requestUnetworkLatest,
          500
        );

      const secondRequest =
        window.setTimeout(
          requestUnetworkLatest,
          1500
        );

      const handleFocus =
        () =>
          requestUnetworkLatest();

      window.addEventListener(
        "focus",
        handleFocus
      );

      return () => {
        window.removeEventListener(
          "message",
          handleMessage
        );

        window.removeEventListener(
          "focus",
          handleFocus
        );

        window.clearTimeout(
          firstRequest
        );

        window.clearTimeout(
          secondRequest
        );
      };
    },
    [
      importUnetworkPayload,
      requestUnetworkLatest,
    ]
  );

  const syncLivePositions =
    useCallback(
      async () => {
        setSyncError(
          ""
        );

        const errors =
          [];

        try {
          const response =
            await projectsApi.accrueApyTransactions();

          applyProjectData(
            response?.data
          );
        } catch (
          error
        ) {
          console.error(
            "Yield page project sync failed:",
            error
          );

          errors.push(
            `Projects: ${
              error?.message ||
              "sync failed"
            }`
          );

          try {
            const response =
              await projectsApi.getAll();

            applyProjectData(
              response?.data
            );
          } catch {
            setLuloProjects(
              []
            );
          }
        }

        try {
          const snapshot =
            await getRatexPtonycSnapshot();

          setRatexSnapshot(
            snapshot
          );
        } catch (
          error
        ) {
          console.error(
            "Yield page RateX sync failed:",
            error
          );

          errors.push(
            `RateX: ${
              error?.message ||
              "sync failed"
            }`
          );
        }

        try {
          const snapshot =
            await getLoopscaleOnycSnapshot();

          setLoopscaleSnapshot(
            snapshot
          );
        } catch (
          error
        ) {
          console.error(
            "Yield page Loopscale sync failed:",
            error
          );

          errors.push(
            `Loopscale: ${
              error?.message ||
              "sync failed"
            }`
          );
        }

        requestRollerCoinLatest();
        requestSaladLatest();
        requestUnetworkLatest();
        requestKryptexLatest();

        if (
          errors.length
        ) {
          setSyncError(
            errors.join(
              " · "
            )
          );
        }
      },
      [
        applyProjectData,
        requestRollerCoinLatest,
        requestSaladLatest,
        requestUnetworkLatest,
        requestKryptexLatest,
      ]
    );

  useEffect(
    () => {
      syncLivePositions();

      const timer =
        window.setInterval(
          syncLivePositions,
          60_000
        );

      return () =>
        window.clearInterval(
          timer
        );
    },
    [
      syncLivePositions,
    ]
  );

  const saladStats =
    useMemo(
      () =>
        getSaladTrackerStats(
          saladTracker
        ),
      [
        saladTracker,
      ]
    );

  const rollerCoinStats =
    useMemo(
      () =>
        getRollerCoinTrackerStats(
          rollerCoinTracker
        ),
      [
        rollerCoinTracker,
      ]
    );

  const unetworkStats =
    useMemo(
      () =>
        getUnetworkTrackerStats(
          unetworkTracker
        ),
      [
        unetworkTracker,
      ]
    );

  const kryptexStats =
    useMemo(
      () =>
        getKryptexStats(
          kryptexTracker
        ),
      [
        kryptexTracker,
      ]
    );

  const projectCards =
    useMemo(
      () => {
        const autoProjects =
          luloProjects.map(
            createLuloProjectCard
          );

        const ratexProject =
          createRatexProjectCard(
            ratexSnapshot,
            ratexHistory
          );

        const loopscaleProject =
          createLoopscaleProjectCard(
            loopscaleSnapshot
          );

        const manualProjects =
          groupManualPositions(
            manualPositions
          );

        return [
          ...autoProjects,
          ...(
            ratexProject
              ? [
                  ratexProject,
                ]
              : []
          ),
          ...(
            loopscaleProject
              ? [
                  loopscaleProject,
                ]
              : []
          ),
          ...manualProjects,
        ];
      },
      [
        luloProjects,
        ratexSnapshot,
        ratexHistory,
        loopscaleSnapshot,
        manualPositions,
      ]
    );


  const sortedProgramCards =
    useMemo(
      () => {
        const items = [
          ...projectCards.map(
            (
              project
            ) => ({
              type:
                "project",

              key:
                project.id,

              amount:
                Number(
                  project.totalBalance
                ) || 0,

              project,
            })
          ),

          {
            type:
              "rollercoin",

            key:
              "rollercoin-project",

            amount:
              Number(
                rollerCoinStats?.lifetimeUsd
              ) || 0,
          },

          {
            type:
              "salad",

            key:
              "salad-project",

            amount:
              Number(
                saladStats?.currentBalance
              ) || 0,
          },

          {
            type:
              "unetwork",

            key:
              "unetwork-project",

            amount:
              Number(
                unetworkStats?.currentBalance
              ) || 0,
          },
          {
  type:
    "kryptex",

  key:
    "kryptex-project",

  amount:
    Number(
      kryptexStats?.currentBalanceUsd
    ) || 0,
},
        ];

        

        return items.sort(
          (
            a,
            b
          ) =>
            b.amount -
            a.amount
        );
      },
[
  projectCards,
  rollerCoinStats,
  saladStats,
  unetworkStats,
  kryptexStats,
]
    );

  const completedRatexPositions =
    useMemo(
      () =>
        Object.values(
          ratexHistory.positions ||
            {}
        )
          .filter(
            (position) =>
              position.status ===
                "matured" ||
              position.status ===
                "closed"
          )
          .sort(
            (
              a,
              b
            ) =>
              String(
                b.completedAt ||
                  b.maturity ||
                  ""
              ).localeCompare(
                String(
                  a.completedAt ||
                    a.maturity ||
                    ""
                )
              )
          ),
      [
        ratexHistory,
      ]
    );

  const allAssets =
    useMemo(
      () =>
        projectCards.flatMap(
          (project) =>
            project.assets ||
            []
        ),
      [
        projectCards,
      ]
    );

  const liveProjectIncome =
    useMemo(
      () =>
        buildProjectIncome(
          luloProjects,
          ratexHistory,
          loopscaleHistory,
          saladTracker,
          monthlyBackfills,
          rollerCoinTracker,
          unetworkTracker,
          kryptexTracker
        ),
      [
        luloProjects,
        ratexHistory,
        loopscaleHistory,
        saladTracker,
        monthlyBackfills,
        rollerCoinTracker,
        unetworkTracker,
        kryptexTracker,
      ]
    );

  useEffect(
    () => {
      setMonthlySnapshots(
        (current) => {
          const next =
            reconcileMonthlySnapshots(
              current,
              liveProjectIncome
            );

          if (
            JSON.stringify(
              next
            ) ===
            JSON.stringify(
              current
            )
          ) {
            return current;
          }

          return next;
        }
      );
    },
    [
      liveProjectIncome,
    ]
  );

  const projectIncome =
    useMemo(
      () =>
        getEffectiveProjectIncome(
          liveProjectIncome,
          monthlySnapshots
        ),
      [
        liveProjectIncome,
        monthlySnapshots,
      ]
    );

const summary =
  useMemo(
    () => {
      /*
       * Portfolio Balance should equal the sum of the
       * active project cards currently shown on this page.
       *
       * allAssets only includes the asset-backed project
       * cards, so it was leaving out RollerCoin, Salad,
       * Unetwork, and Kryptex.
       */
      const portfolioBalance =
        sortedProgramCards.reduce(
          (
            sum,
            item
          ) =>
            sum +
            (
              Number(
                item?.amount
              ) || 0
            ),
          0
        );

      /*
       * Keep Weighted APY based on the positions that
       * actually expose an APY. Otherwise adding the
       * mining/compute balances to Portfolio Balance would
       * artificially lower the displayed Weighted APY.
       */
      const apyEligibleBalance =
        allAssets.reduce(
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

      const luloAnnualYield =
        projectCards
          .filter(
            (project) =>
              String(
                project?.platform || ""
              ).toLowerCase() ===
              "lulo"
          )
          .reduce(
            (
              total,
              project
            ) =>
              total +
              (
                Number(
                  project?.luloFiveDayAverageUsd
                ) || 0
              ) *
                365,
            0
          );

      const nonLuloAnnualYield =
        allAssets
          .filter(
            (asset) =>
              String(
                asset?.sourceLabel || ""
              ).toLowerCase() !==
              "lulo"
          )
          .reduce(
            (
              sum,
              asset
            ) =>
              sum +
              (
                Number(
                  asset?.balance
                ) || 0
              ) *
                (
                  (
                    Number(
                      asset?.apy
                    ) || 0
                  ) /
                  100
                ),
            0
          );

      /*
       * Sum the exact projections used by the active cards.
       * This keeps the headline Monthly / Yearly Income in
       * sync with what the user can actually see below.
       */
      const projectProjectionTotals =
        projectCards.reduce(
          (
            totals,
            project
          ) => {
            const projections =
              getProjectProjections(
                project
              );

            return {
              monthly:
                totals.monthly +
                (
                  Number(
                    projections?.monthly
                  ) || 0
                ),

              yearly:
                totals.yearly +
                (
                  Number(
                    projections?.yearly
                  ) || 0
                ),
            };
          },
          {
            monthly: 0,
            yearly: 0,
          }
        );

      const rollerCoinMonthlyIncome =
        1 *
        30.4375;

      const rollerCoinYearlyIncome =
        1 *
        365;

      const saladMonthlyIncome =
        Number(
          saladStats?.estimatedMonthlyUsd
        ) || 0;

      const saladYearlyIncome =
        Number(
          saladStats?.estimatedYearlyUsd
        ) || 0;

      const unetworkMonthlyIncome =
        Number(
          unetworkStats?.estimatedMonthlyUsd
        ) || 0;

      const unetworkYearlyIncome =
        Number(
          unetworkStats?.estimatedYearlyUsd
        ) || 0;

      const kryptexMonthlyIncome =
        Number(
          kryptexStats?.monthlyUsd
        ) || 0;

      const kryptexYearlyIncome =
        Number(
          kryptexStats?.yearlyUsd
        ) || 0;

      const monthlyYield =
        projectProjectionTotals.monthly +
        rollerCoinMonthlyIncome +
        saladMonthlyIncome +
        unetworkMonthlyIncome +
        kryptexMonthlyIncome;

      const annualYield =
        projectProjectionTotals.yearly +
        rollerCoinYearlyIncome +
        saladYearlyIncome +
        unetworkYearlyIncome +
        kryptexYearlyIncome;

      const weightedApy =
        apyEligibleBalance > 0
          ? allAssets.reduce(
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
            apyEligibleBalance
          : 0;

      const totalEarned =
        projectCards.reduce(
          (
            sum,
            project
          ) =>
            sum +
            (
              Number(
                project.earned
              ) || 0
            ),
          0
        ) +
        (
          Number(
            rollerCoinStats?.lifetimeUsd
          ) || 0
        ) +
        (
          Number(
            saladStats?.lifetimeUsd
          ) || 0
        ) +
        (
          Number(
            unetworkStats?.lifetimeUsd
          ) || 0
        ) +
        (
          Number(
            kryptexStats?.lifetimeUsd
          ) || 0
        );

      return {
        portfolioBalance,
        weightedApy,
        monthlyYield,
        annualYield,

        activePositions:
          sortedProgramCards.length,

        totalEarned,
      };
    },
    [
      allAssets,
      projectCards,
      sortedProgramCards,
      rollerCoinStats,
      saladStats,
      saladTracker,
      unetworkStats,
      unetworkTracker,
      kryptexStats,
    ]
  );

  /*
   * Make the Project Income page the source of truth for
   * the active project portfolio balance used by Net Worth.
   *
   * This prevents the Crypto tab from independently
   * rebuilding the balance and drifting away from the
   * number shown at the top of this page.
   */
  useEffect(
    () => {
      const next = {
        portfolioBalance:
          Number(
            summary?.portfolioBalance
          ) || 0,

        activePositions:
          Number(
            summary?.activePositions
          ) || 0,

        updatedAt:
          new Date().toISOString(),
      };

      remoteStorage.setItem(
        PROJECT_INCOME_PORTFOLIO_SUMMARY_KEY,
        JSON.stringify(next)
      );

      window.dispatchEvent(
        new CustomEvent(
          "project-income-portfolio-balance-updated",
          {
            detail: next,
          }
        )
      );
    },
    [
      summary?.portfolioBalance,
      summary?.activePositions,
    ]
  );

  function deletePosition(
    id
  ) {
    if (
      !window.confirm(
        "Delete this yield position?"
      )
    ) {
      return;
    }

    setManualPositions(
      (current) =>
        current.filter(
          (position) =>
            position.id !==
            id
        )
    );
  }

  function toggleProject(
    projectId
  ) {
    setExpandedProjects(
      (current) => {
        const next =
          new Set(
            current
          );

        if (
          next.has(
            projectId
          )
        ) {
          next.delete(
            projectId
          );
        } else {
          next.add(
            projectId
          );
        }

        return next;
      }
    );
  }

  function setProjectLogo(
    projectId,
    dataUrl
  ) {
    setProjectLogos(
      (current) => ({
        ...current,
        [projectId]:
          dataUrl,
      })
    );
  }

  function setProjectTotalSpent(
    projectId,
    value
  ) {
    const totalSpent =
      Math.max(
        0,
        Number(value) || 0
      );

    setProjectPayback(
      (current) => {
        const next = {
          ...current,
        };

        if (
          totalSpent > 0
        ) {
          next[
            projectId
          ] = {
            totalSpent,
            updatedAt:
              new Date().toISOString(),
          };
        } else {
          delete next[
            projectId
          ];
        }

        saveProjectPayback(
          next
        );

        return next;
      }
    );
  }

  return (
    <div
      className="space-y-8"
      data-testid="yield-farming-page"
    >
      <section className="border-b border-border/50 pb-8">
        <div className="grid gap-x-12 gap-y-8 md:grid-cols-2 xl:grid-cols-6">
          <Metric
            label="Portfolio Balance"
            value={formatCurrency(
              summary.portfolioBalance
            )}
            icon={
              CircleDollarSign
            }
          />

          <Metric
            label="Total Earned"
            value={formatCurrency(
              summary.totalEarned
            )}
            icon={
              BadgeDollarSign
            }
          />

          <Metric
            label="Weighted APY"
            value={formatPercent(
              summary.weightedApy
            )}
            icon={
              Percent
            }
          />

          <Metric
            label="Estimated Yearly Income"
            value={formatCurrency(
              summary.annualYield
            )}
            icon={
              TrendingUp
            }
          />

          <Metric
            label="Estimated Monthly Income"
            value={formatCurrency(
              summary.monthlyYield
            )}
            icon={
              CalendarDays
            }
          />

          <Metric
            label="Active Positions"
            value={String(
              summary.activePositions
            )}
            icon={
              Layers3
            }
          />
        </div>

        <PortfolioAllocationBar
          projects={
            projectCards
          }
          totalBalance={
            summary.portfolioBalance
          }
          trxBalance={
            Number(
              rollerCoinStats?.lifetimeUsd
            ) || 0
          }
        />
      </section>

      {syncError && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          One or more live sources could not refresh.
          {syncError
            ? ` ${syncError}`
            : ""}
        </div>
      )}

      <section className="space-y-4">
{sortedProgramCards.length ===
0 ? (
          <Card className="border-border/50 bg-card/70">
            <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
              <CircleDollarSign className="mb-3 h-10 w-10 text-muted-foreground" />

              <p className="font-medium">
                No active yield projects
              </p>

              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Live yield positions will appear here automatically.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
  {sortedProgramCards.map(
              (
                item
              ) => {

if (
  item.type ===
  "kryptex"
) {
  return (
    <KryptexProjectCard
      key={
        item.key
      }
      collapsed={
        !expandedProjects.has(
          "kryptex-project"
        )
      }
      onToggle={() =>
        toggleProject(
          "kryptex-project"
        )
      }
      tracker={
        kryptexTracker
      }
      connected={
        kryptexConnected
      }
      stats={
        kryptexStats
      }
      message={
        kryptexMessage
      }
      onRefresh={
        requestKryptexLatest
      }
      logo={
        projectLogos[
          "kryptex-project"
        ] || ""
      }
      onLogoChange={(
        dataUrl
      ) =>
        setProjectLogo(
          "kryptex-project",
          dataUrl
        )
      }
      totalSpent={
        Number(
          projectPayback?.[
            "kryptex-project"
          ]?.totalSpent
        ) || 0
      }
      onTotalSpentChange={(
        value
      ) =>
        setProjectTotalSpent(
          "kryptex-project",
          value
        )
      }
    />
  );
}
                if (
                  item.type ===
                  "project"
                ) {
                  const project =
                    item.project;

                  return (
                    <ProjectCard
                      key={
                        item.key
                      }
                      project={
                        project
                      }
                      collapsed={
                        !expandedProjects.has(
                          project.id
                        )
                      }
                      onToggle={() =>
                        toggleProject(
                          project.id
                        )
                      }
                      onDeletePosition={
                        deletePosition
                      }
                      logo={
                        projectLogos[
                          project.id
                        ] || ""
                      }
                      onLogoChange={(
                        dataUrl
                      ) =>
                        setProjectLogo(
                          project.id,
                          dataUrl
                        )
                      }
                      totalSpent={
                        Number(
                          projectPayback?.[
                            project.id
                          ]?.totalSpent
                        ) || 0
                      }
                      onTotalSpentChange={(
                        value
                      ) =>
                        setProjectTotalSpent(
                          project.id,
                          value
                        )
                      }
                    />
                  );
                }

                if (
                  item.type ===
                  "rollercoin"
                ) {
                  return (
                    <RollerCoinProjectCard
                      key={
                        item.key
                      }
                      tracker={
                        rollerCoinTracker
                      }
                      stats={
                        rollerCoinStats
                      }
                      connected={
                        rollerCoinConnected
                      }
                      authenticated={
                        rollerCoinAuthenticated
                      }
                      rollerCoinOpen={
                        rollerCoinOpen
                      }
                      syncing={
                        rollerCoinSyncing
                      }
                      message={
                        rollerCoinMessage
                      }
                      from={
                        rollerCoinFrom
                      }
                      to={
                        rollerCoinTo
                      }
                      onFromChange={
                        setRollerCoinFrom
                      }
                      onToChange={
                        setRollerCoinTo
                      }
                      onSync={
                        syncRollerCoinRange
                      }
                      onRefresh={
                        requestRollerCoinLatest
                      }
                      logo={
                        projectLogos[
                          "rollercoin-project"
                        ] || ""
                      }
                      onLogoChange={(
                        dataUrl
                      ) =>
                        setProjectLogo(
                          "rollercoin-project",
                          dataUrl
                        )
                      }
                      totalSpent={
                        Number(
                          projectPayback?.[
                            "rollercoin-project"
                          ]?.totalSpent
                        ) || 0
                      }
                      onTotalSpentChange={(
                        value
                      ) =>
                        setProjectTotalSpent(
                          "rollercoin-project",
                          value
                        )
                      }
                    />
                  );
                }

                if (
                  item.type ===
                  "salad"
                ) {
                  return (
                    <SaladProjectCard
                      key={
                        item.key
                      }
                      tracker={
                        saladTracker
                      }
                      connected={
                        saladConnected
                      }
                      stats={
                        saladStats
                      }
                      syncing={
                        saladSyncing
                      }
                      message={
                        saladMessage
                      }
                      onRefresh={
                        syncSaladBalance
                      }
                      logo={
                        projectLogos[
                          "salad-project"
                        ] || ""
                      }
                      onLogoChange={(
                        dataUrl
                      ) =>
                        setProjectLogo(
                          "salad-project",
                          dataUrl
                        )
                      }
                      totalSpent={
                        Number(
                          projectPayback?.[
                            "salad-project"
                          ]?.totalSpent
                        ) || 0
                      }
                      onTotalSpentChange={(
                        value
                      ) =>
                        setProjectTotalSpent(
                          "salad-project",
                          value
                        )
                      }
                    />
                  );
                }

                return (
                  <UnetworkProjectCard
                    key={
                      item.key
                    }
                    tracker={
                      unetworkTracker
                    }
                    connected={
                      unetworkConnected
                    }
                    stats={
                      unetworkStats
                    }
                    syncing={
                      unetworkSyncing
                    }
                    message={
                      unetworkMessage
                    }
                    onRefresh={
                      syncUnetworkBalance
                    }
                    logo={
                      projectLogos[
                        "unetwork-project"
                      ] || ""
                    }
                    onLogoChange={(
                      dataUrl
                    ) =>
                      setProjectLogo(
                        "unetwork-project",
                        dataUrl
                      )
                    }
                    totalSpent={
                      Number(
                        projectPayback?.[
                          "unetwork-project"
                        ]?.totalSpent
                      ) || 0
                    }
                    onTotalSpentChange={(
                      value
                    ) =>
                      setProjectTotalSpent(
                        "unetwork-project",
                        value
                      )
                    }
                  />
                );
              }
            )}
          </div>
        )}
      </section>


      <ProjectIncomeSection
        months={
          projectIncome
        }
        selectedMonthKey={
          selectedMonthKey
        }
        onSelectMonth={
          setSelectedMonthKey
        }
        selectedYear={
          selectedYear
        }
        onSelectYear={
          setSelectedYear
        }
        saladTracker={
          saladTracker
        }
        projectLogos={
          projectLogos
        }
      />

            {completedRatexPositions.length >
        0 && (
        <CompletedPositionsSection
          positions={
            completedRatexPositions
          }
        />
      )}


    </div>


  );
}

function IncomeProjection({
  daily = 0,
  monthly = 0,
  yearly = 0,
}) {
  return (
    <div className="mt-1 flex flex-wrap justify-end gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
      <span>
        {formatCurrency(daily)}/day
      </span>

      <span>·</span>

      <span>
        {formatCurrency(monthly)}/month
      </span>

      <span>·</span>

      <span>
        {formatCurrency(yearly)}/year
      </span>
    </div>
  );
}

function getLuloFiveDayAverage(project) {
  const todayKey = getTodayKey();
  const totalsByDay = new Map();

  const balance =
    Number(project?.totalBalance) ||
    Number(project?.lulo_total_balance_usd) ||
    0;

  const apy =
    Number(project?.weightedApy) ||
    Number(project?.lulo_weighted_apy) ||
    0;

  const expectedDailyIncome =
    balance * (apy / 100) / 365;

  const maximumValidDailyIncome = Math.max(
    2,
    expectedDailyIncome * 8 + 0.25
  );

  (Array.isArray(project?.transactions)
    ? project.transactions
    : []
  ).forEach((transaction) => {
    if (transaction?.source !== "lulo_yield") {
      return;
    }

    const dateKey = String(
      transaction.source_date ||
        transaction.date ||
        transaction.created_at ||
        ""
    ).slice(0, 10);

    const amount = Number(transaction.amount) || 0;

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) ||
      dateKey === todayKey ||
      amount <= 0
    ) {
      return;
    }

    totalsByDay.set(
      dateKey,
      (totalsByDay.get(dateKey) || 0) + amount
    );
  });

  const validDays = [...totalsByDay.entries()]
    .filter(([, amount]) => amount <= maximumValidDailyIncome)
    .sort(([firstDate], [secondDate]) =>
      secondDate.localeCompare(firstDate)
    )
    .slice(0, 5);

  if (!validDays.length) {
    return 0;
  }

  const totalEarned = validDays.reduce(
    (sum, [, amount]) => sum + amount,
    0
  );

  return totalEarned / validDays.length;
}

function getProjectProjections(project) {
  const isLulo =
    String(
      project?.platform || ""
    ).toLowerCase() === "lulo";

  if (isLulo) {
    const daily =
      Number(
        project?.luloFiveDayAverageUsd
      ) ||
      getLuloFiveDayAverage(project);

    return {
      daily,
      monthly: daily * 30.4375,
      yearly: daily * 365,
    };
  }

  const assets = Array.isArray(
    project?.assets
  )
    ? project.assets
    : [];

  const yearly = assets.reduce(
    (sum, asset) =>
      sum +
      (Number(asset?.balance) || 0) *
        ((Number(asset?.apy) || 0) / 100),
    0
  );

  return {
    daily: yearly / 365,
    monthly: yearly / 12,
    yearly,
  };
}

function ProjectPaybackStatus({
  earned,
  dailyIncome,
  totalSpent,
}) {
  const stats =
    getPaybackStats(
      earned,
      dailyIncome,
      totalSpent
    );

  if (
    !stats.configured
  ) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex rounded-full border border-border/60 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          P/L —
        </span>
        <span className="text-[11px] text-muted-foreground">
          Add spent to track break-even
        </span>
      </div>
    );
  }

  const profitable =
    stats.pnl >= 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${
          profitable
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
            : "border-amber-500/25 bg-amber-500/10 text-amber-300"
        }`}
        title={`Lifetime earned ${formatCurrency(
          stats.earned
        )} minus total spent ${formatCurrency(
          stats.spent
        )}`}
      >
        P/L {stats.pnl >= 0 ? "+" : ""}{formatCurrency(
          stats.pnl
        )}
      </span>

      <span
        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums ${
          profitable
            ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
            : "border-border/60 bg-white/[0.03] text-muted-foreground"
        }`}
      >
        {profitable
          ? "In profit"
          : stats.daysToProfit !== null
            ? `${stats.daysToProfit}d to profit`
            : "Break-even unavailable"}
      </span>
    </div>
  );
}

function ProjectPaybackEditor({
  value,
  onChange,
  earned,
  dailyIncome,
}) {
  const [
    draft,
    setDraft,
  ] = useState(
    value > 0
      ? String(value)
      : ""
  );

  useEffect(
    () => {
      setDraft(
        value > 0
          ? String(value)
          : ""
      );
    },
    [
      value,
    ]
  );

  const stats =
    getPaybackStats(
      earned,
      dailyIncome,
      value
    );

  function commit() {
    onChange(
      Math.max(
        0,
        Number(draft) || 0
      )
    );
  }

  return (
    <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Total spent
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Enter everything you have spent on this project. Update it whenever you buy more. P/L uses lifetime earnings, and the break-even estimate uses the current daily income.
          </p>

          {stats.configured && (
            <div className="mt-2 text-[11px] tabular-nums text-muted-foreground">
              Earned {formatCurrency(
                stats.earned
              )} · Remaining {formatCurrency(
                stats.remaining
              )}
            </div>
          )}
        </div>

        <div className="relative w-36 shrink-0">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={draft}
            onChange={(
              event
            ) =>
              setDraft(
                event.target.value
              )
            }
            onBlur={
              commit
            }
            onKeyDown={(
              event
            ) => {
              if (
                event.key ===
                "Enter"
              ) {
                event.currentTarget.blur();
              }
            }}
            placeholder="0.00"
            className="h-9 w-full rounded-lg border border-border/60 bg-background/60 pl-7 pr-3 text-right text-sm font-medium tabular-nums outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/10"
          />
        </div>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  collapsed,
  onToggle,
  onDeletePosition,
  logo,
  onLogoChange,
  totalSpent,
  onTotalSpentChange,
}) {
  const projections =
    getProjectProjections(
      project
    );

  const normalizedPlatform =
    String(
      project?.platform || ""
    ).toLowerCase();

  const isLulo =
    normalizedPlatform ===
    "lulo";

  const hidePayback =
    isLulo ||
    normalizedPlatform ===
      "loopscale";

  return (
    <div
      className="
        overflow-hidden
        rounded-2xl
        border
        border-border/60
        bg-card/45
        shadow-sm
        transition-all
        duration-200
        hover:border-border
        hover:bg-card/65
      "
    >
      <button
        type="button"
        onClick={
          onToggle
        }
        className="
          flex
          min-h-[190px]
          w-full
          flex-col
          p-5
          text-left
        "
      >
        {/* TOP */}

<div className="flex w-full items-center justify-between gap-4">
  <div className="flex min-w-0 flex-1 items-center gap-4">
    <ProjectLogoButton
      platform={project.platform}
      logo={logo}
      onLogoChange={onLogoChange}
    />

    <div className="flex-1">
      <div className="flex items-center gap-2">
        <h3 className="whitespace-nowrap text-2xl font-semibold tracking-tight text-foreground">
          {project.platform}
        </h3>

        {project.autoSynced && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400">
            <Wifi className="h-3 w-3" />
            LIVE
          </span>
        )}
      </div>
    </div>
  </div>

  <ChevronRight
    className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
      collapsed ? "" : "rotate-90"
    }`}
    strokeWidth={1.5}
  />
</div>
        {/* VALUE */}

        <div className="mt-auto pt-7">
          <div className="flex flex-wrap items-end gap-3">
            <div
              className="
                text-[30px]
                font-semibold
                leading-none
                tracking-tight
                text-foreground
                tabular-nums
              "
            >
              {formatCurrency(
                project.totalBalance
              )}
            </div>

            {!hidePayback && (
              <ProjectPaybackStatus
                earned={
                  project.earned
                }
                dailyIncome={
                  projections.daily
                }
                totalSpent={
                  totalSpent
                }
              />
            )}
          </div>

          <div
            className="
              mt-4
              flex
              flex-wrap
              items-center
              gap-x-2
              gap-y-1
              text-sm
              tabular-nums
              text-muted-foreground
            "
          >
            <span>
              {formatCurrency(
                projections.daily
              )}
              /day
            </span>

            <span>·</span>

            <span>
              {formatCurrency(
                projections.monthly
              )}
              /month
            </span>

            <span>·</span>

            <span>
              {formatCurrency(
                projections.yearly
              )}
              /year
            </span>
          </div>
        </div>
      </button>

      {!collapsed && (
        <>
          {!hidePayback && (
            <div className="border-t border-border/40 px-5 py-4">
              <ProjectPaybackEditor
                value={
                  totalSpent
                }
                onChange={
                  onTotalSpentChange
                }
                earned={
                  project.earned
                }
                dailyIncome={
                  projections.daily
                }
              />
            </div>
          )}

          <ProjectPositionsSection
            project={
              project
            }
            onDeletePosition={
              onDeletePosition
            }
          />
        </>
      )}
    </div>
  );
}


function UnetworkProjectCard({
  tracker,
  connected,
  stats,
  syncing,
  message,
  onRefresh,
  logo,
  onLogoChange,
  totalSpent,
  onTotalSpentChange,
}) {
  const [
    expanded,
    setExpanded,
  ] = useState(false);

  return (
    <div
      className="
        overflow-hidden
        rounded-2xl
        border
        border-border/60
        bg-card/45
        shadow-sm
        transition-all
        duration-200
        hover:border-border
        hover:bg-card/65
      "
    >
      <button
        type="button"
        onClick={() =>
          setExpanded(
            (value) =>
              !value
          )
        }
        className="
          flex
          min-h-[190px]
          w-full
          flex-col
          p-5
          text-left
        "
      >
        {/* TOP */}

<div className="flex w-full items-start justify-between gap-4">
  <div className="flex min-w-0 items-center gap-4">
    <ProjectLogoButton
      platform="Unetwork"
      logo={logo}
      onLogoChange={onLogoChange}
    />

    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="truncate text-2xl font-semibold tracking-tight text-foreground">
          Unetwork
        </h3>

        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            connected
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/25 bg-amber-500/10 text-amber-300"
          }`}
        >
          <Wifi className="h-3 w-3" />
          {connected ? "LIVE" : "OFFLINE"}
        </span>
      </div>
    </div>
  </div>

  <ChevronRight
    className={`mt-5 h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
      expanded ? "rotate-90" : ""
    }`}
    strokeWidth={1.5}
  />
</div>

        {/* VALUE */}

        <div className="mt-auto pt-7">
          <div className="flex flex-wrap items-end gap-3">
            <div
              className="
                text-[30px]
                font-semibold
                leading-none
                tracking-tight
                text-foreground
                tabular-nums
              "
            >
{formatCurrency(
  stats?.monthUsd
)}
            </div>

            <ProjectPaybackStatus
              earned={
                stats?.lifetimeUsd
              }
              dailyIncome={
                stats?.estimatedDailyUsd
              }
              totalSpent={
                totalSpent
              }
            />
          </div>

          <div
            className="
              mt-4
              flex
              flex-wrap
              items-center
              gap-x-2
              gap-y-1
              text-sm
              tabular-nums
              text-muted-foreground
            "
          >
            <span>
              {formatCurrency(
                stats?.estimatedDailyUsd
              )}
              /day
            </span>

            <span>·</span>

            <span>
              {formatCurrency(
                stats?.estimatedMonthlyUsd
              )}
              /month
            </span>

            <span>·</span>

            <span>
              {formatCurrency(
                stats?.estimatedYearlyUsd
              )}
              /year
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-5 pb-5 pt-4">
          <div className="mb-4">
            <ProjectPaybackEditor
              value={
                totalSpent
              }
              onChange={
                onTotalSpentChange
              }
              earned={
                stats?.lifetimeUsd
              }
              dailyIncome={
                stats?.estimatedDailyUsd
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                This month
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.monthUsd
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Available
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.currentBalance
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Lifetime earned
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.lifetimeUsd
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Withdrawn
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.withdrawals
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {message ||
                (connected
                  ? "Unetwork extension connected. Balance and dated rewards sync automatically."
                  : "Install the Unetwork Earnings Bridge, open Unetwork, and make sure you are signed in.")}
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={
                onRefresh
              }
              disabled={
                syncing
              }
            >
              {syncing
                ? "Syncing..."
                : "Refresh"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SaladProjectCard({
  tracker,
  connected,
  stats,
  syncing,
  message,
  onRefresh,
  logo,
  onLogoChange,
  totalSpent,
  onTotalSpentChange,
}) {
  const [
    expanded,
    setExpanded,
  ] = useState(false);

  /*
   * Use the tracker projection directly so the Salad card
   * and the page-level income summary always agree.
   */
  const dailyIncome =
    Number(
      stats?.estimatedDailyUsd
    ) || 0;

  const monthlyIncome =
    Number(
      stats?.estimatedMonthlyUsd
    ) ||
    (
      dailyIncome *
      30.4375
    );

  const yearlyIncome =
    Number(
      stats?.estimatedYearlyUsd
    ) ||
    (
      dailyIncome *
      365
    );

  return (
    <div
      className="
        overflow-hidden
        rounded-2xl
        border
        border-border/60
        bg-card/45
        shadow-sm
        transition-all
        duration-200
        hover:border-border
        hover:bg-card/65
      "
    >
      <button
        type="button"
        onClick={() =>
          setExpanded(
            (value) =>
              !value
          )
        }
        className="
          flex
          min-h-[190px]
          w-full
          flex-col
          p-5
          text-left
        "
      >
        {/* TOP */}

<div className="flex w-full items-start justify-between gap-4">
  <div className="flex min-w-0 items-center gap-4">
    <ProjectLogoButton
      platform="Salad"
      logo={logo}
      onLogoChange={onLogoChange}
    />

    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="truncate text-2xl font-semibold tracking-tight text-foreground">
          Salad
        </h3>

        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            connected
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/25 bg-amber-500/10 text-amber-300"
          }`}
        >
          <Wifi className="h-3 w-3" />
          {connected ? "LIVE" : "OFFLINE"}
        </span>
      </div>
    </div>
  </div>

  <ChevronRight
    className={`mt-5 h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
      expanded ? "rotate-90" : ""
    }`}
    strokeWidth={1.5}
  />
</div>

        {/* VALUE */}

        <div className="mt-auto pt-7">
          <div className="flex flex-wrap items-end gap-3">
            <div
              className="
                text-[30px]
                font-semibold
                leading-none
                tracking-tight
                text-foreground
                tabular-nums
              "
            >
              {formatCurrency(
                stats?.currentBalance
              )}
            </div>

            <ProjectPaybackStatus
              earned={
                stats?.lifetimeUsd
              }
              dailyIncome={
                dailyIncome
              }
              totalSpent={
                totalSpent
              }
            />
          </div>

          <div
            className="
              mt-4
              flex
              flex-wrap
              items-center
              gap-x-2
              gap-y-1
              text-sm
              tabular-nums
              text-muted-foreground
            "
          >
            <span>
              {formatCurrency(
                dailyIncome
              )}
              /day
            </span>

            <span>·</span>

            <span>
              {formatCurrency(
                monthlyIncome
              )}
              /month
            </span>

            <span>·</span>

            <span>
              {formatCurrency(
                yearlyIncome
              )}
              /year
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-5 pb-5 pt-4">
          <div className="mb-4">
            <ProjectPaybackEditor
              value={
                totalSpent
              }
              onChange={
                onTotalSpentChange
              }
              earned={
                stats?.lifetimeUsd
              }
              dailyIncome={
                dailyIncome
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                This month
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.monthUsd
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Available
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.currentBalance
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Lifetime earned
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.lifetimeUsd
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Withdrawn
              </div>

              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  stats?.withdrawals
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {message ||
                (connected
                  ? "Salad extension connected. Earnings sync without storing your Salad login in NAm."
                  : "Install the Salad Earnings Bridge, open Salad, and make sure you are signed in.")}
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={
                onRefresh
              }
              disabled={
                syncing
              }
            >
              {syncing
                ? "Syncing..."
                : "Refresh"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RollerCoinProjectCard({
  tracker,
  stats,
  connected,
  authenticated,
  rollerCoinOpen,
  syncing,
  message,
  from,
  to,
  onFromChange,
  onToChange,
  onSync,
  onRefresh,
  logo,
  onLogoChange,
  totalSpent,
  onTotalSpentChange,
}) {
  const [
    expanded,
    setExpanded,
  ] = useState(false);


  const dailyIncome = 1;

const monthlyIncome =
  dailyIncome * 30.4375;

const yearlyIncome =
  dailyIncome * 365;

return (
  <div
    className="
      overflow-hidden
      rounded-2xl
      border
      border-border/60
      bg-card/45
      shadow-sm
      transition-all
      duration-200
      hover:border-border
      hover:bg-card/65
    "
  >
    <button
      type="button"
      onClick={() =>
        setExpanded(
          (current) =>
            !current
        )
      }
      className="
        flex
        min-h-[190px]
        w-full
        flex-col
        p-5
        text-left
      "
    >
<div className="flex w-full items-start justify-between gap-4">
  <div className="flex min-w-0 items-center gap-4">
    <ProjectLogoButton
      platform="RollerCoin"
      logo={logo}
      onLogoChange={onLogoChange}
    />

    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="truncate text-2xl font-semibold tracking-tight text-foreground">
          RollerCoin
        </h3>

        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400">
          <Wifi className="h-3 w-3" />
          LIVE
        </span>
      </div>
    </div>
  </div>

  <ChevronRight
    className={`mt-5 h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
      expanded ? "rotate-90" : ""
    }`}
    strokeWidth={1.5}
  />
</div>

      <div className="mt-auto pt-7">
        <div className="flex flex-wrap items-end gap-3">
          <div
            className="
              text-[30px]
              font-semibold
              leading-none
              tracking-tight
              text-foreground
              tabular-nums
            "
          >
{formatCurrency(
  stats?.currentBalanceUsd
)}
          </div>

          <ProjectPaybackStatus
            earned={
              stats?.lifetimeUsd
            }
            dailyIncome={
              dailyIncome
            }
            totalSpent={
              totalSpent
            }
          />
        </div>

        <div
          className="
            mt-4
            flex
            flex-wrap
            items-center
            gap-x-2
            gap-y-1
            text-sm
            tabular-nums
            text-muted-foreground
          "
        >
          <span>
            {formatCurrency(
              dailyIncome
            )}
            /day
          </span>

          <span>·</span>

          <span>
            {formatCurrency(
              monthlyIncome
            )}
            /month
          </span>

          <span>·</span>

          <span>
            {formatCurrency(
              yearlyIncome
            )}
            /year
          </span>
        </div>
      </div>
    </button>

    {expanded && (
      <div className="border-t border-border/40 px-5 py-4">
        <ProjectPaybackEditor
          value={
            totalSpent
          }
          onChange={
            onTotalSpentChange
          }
          earned={
            stats?.lifetimeUsd
          }
          dailyIncome={
            dailyIncome
          }
        />
      </div>
    )}
  </div>
);
}

function ProjectLogoButton({
  platform,
  logo,
  onLogoChange,
}) {
  const inputId =
    `yield-logo-${String(
      platform ||
        "project"
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )}`;

  function handleFile(
    event
  ) {
    const file =
      event.target
        .files?.[0];

    event.target.value =
      "";

    if (!file) return;

    if (
      !file.type.startsWith(
        "image/"
      )
    ) {
      window.alert(
        "Please choose an image file."
      );

      return;
    }

    if (
      file.size >
      1.5 *
        1024 *
        1024
    ) {
      window.alert(
        "Logo must be smaller than 1.5 MB."
      );

      return;
    }

    const reader =
      new FileReader();

    reader.onload =
      () => {
        if (
          typeof reader.result ===
          "string"
        ) {
          onLogoChange(
            reader.result
          );
        }
      };

    reader.readAsDataURL(
      file
    );
  }

  return (
    <div
      className="shrink-0"
      onClick={(
        event
      ) =>
        event.stopPropagation()
      }
      onKeyDown={(
        event
      ) =>
        event.stopPropagation()
      }
    >
      <input
        id={
          inputId
        }
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={
          handleFile
        }
      />

      <label
        htmlFor={
          inputId
        }
        title={`Change ${platform} logo`}
        aria-label={`Change ${platform} logo`}
        className="
          flex
          h-16
          w-16
          cursor-pointer
          items-center
          justify-center
          overflow-hidden
          rounded-2xl
          border
          border-border/60
          bg-white/[0.04]
          text-base
          font-bold
          tracking-tight
          transition
          hover:border-border
          hover:bg-white/[0.08]
        "
      >
        {logo ? (
          <img
            src={
              logo
            }
            alt={`${platform} logo`}
            className="
              h-full
              w-full
              object-cover
            "
          />
        ) : (
          getInitials(
            platform
          )
        )}
      </label>
    </div>
  );
}

function ProjectPositionsSection({
  project,
  onDeletePosition,
}) {
  return (
    <div className="border-t border-border/40 px-4 pb-4 pt-3">
      <div>
        {project.assets.map(
          (asset) => (
            <PositionRow
              key={
                asset.id
              }
              asset={
                asset
              }
              autoSynced={
                project.autoSynced
              }
              onDeletePosition={
                onDeletePosition
              }
            />
          )
        )}
      </div>
    </div>
  );
}

function PositionRow({
  asset,
  autoSynced,
  onDeletePosition,
}) {
  const yearly =
    (
      Number(
        asset.balance
      ) || 0
    ) *
    (
      (
        Number(
          asset.apy
        ) || 0
      ) /
      100
    );

  const monthly =
    yearly /
    12;

  const daily =
    yearly /
    365;

  return (
    <div className="grid grid-cols-[1.2fr_1.35fr_0.9fr] items-center gap-3 px-3 py-4 md:grid-cols-[1.2fr_1.25fr_1fr_1fr]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-white/[0.04] text-[10px] font-bold">
          {getInitials(
            asset.asset
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">
              {asset.asset ||
                "Position"}
            </span>

            {!autoSynced &&
              asset.manualId && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  title="Delete position"
                  onClick={() =>
                    onDeletePosition(
                      asset.manualId
                    )
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
          </div>
        </div>
      </div>

      <div>
        <div className="font-semibold tabular-nums">
          {formatCurrency(
            asset.balance
          )}
        </div>
      </div>

      <div className="hidden md:block">
        {asset.price !==
          null &&
        asset.price !==
          undefined ? (
          <div className="font-medium tabular-nums">
            {formatCurrency(
              asset.price
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">
            —
          </span>
        )}
      </div>

      <div className="text-right">
        <div className="font-semibold text-emerald-400 tabular-nums">
          {formatPercent(
            asset.apy
          )}{" "}
          APY
        </div>

        <div className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground tabular-nums">
          {asset.maturity ? (
            <>
              matures{" "}
              {formatDate(
                asset.maturity
              )}

              {asset.daysRemaining !==
              null
                ? ` · ${asset.daysRemaining}d left`
                : ""}

              {asset.maturityValueUsd >
              0
                ? ` · ${formatCurrency(
                    asset.maturityValueUsd
                  )} at maturity`
                : ""}
            </>
          ) : (
            <>
              {formatCurrency(
                daily
              )}
              /day ·{" "}
              {formatCurrency(
                monthly
              )}
              /mo ·{" "}
              {formatCurrency(
                yearly
              )}
              /yr
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CompletedPositionsSection({
  positions,
}) {
  return (
    <section className="space-y-4 border-t border-border/50 pt-8">
      <div className="flex items-center gap-2">
        <Archive className="h-4 w-4 text-muted-foreground" />

        <div>
          <h2 className="text-lg font-semibold">
            Completed Positions
          </h2>

          <p className="mt-1 text-xs text-muted-foreground">
            Matured and closed positions stay here for your records.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {positions.map(
          (position) => {
            const matured =
              position.status ===
              "matured";

            const finalValue =
              matured
                ? (
                    Number(
                      position.maturityValueUsd
                    ) ||
                    Number(
                      position.lastValueUsd
                    ) ||
                    0
                  )
                : (
                    Number(
                      position.lastValueUsd
                    ) ||
                    0
                  );

            const earned =
              matured
                ? (
                    Number(
                      position.projectedProfitUsd
                    ) ||
                    Number(
                      position.lastEarnedUsd
                    ) ||
                    0
                  )
                : (
                    Number(
                      position.lastEarnedUsd
                    ) ||
                    0
                  );

            return (
              <div
                key={
                  position.key
                }
                className="rounded-2xl border border-border/50 bg-card/30 px-5 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-white/[0.04] text-xs font-bold">
                      RX
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          RateX
                        </span>

                        <span className="text-sm text-muted-foreground">
                          PTONyc
                        </span>

                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />

                          {matured
                            ? "Matured"
                            : "Closed"}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        {matured
                          ? `Matured ${formatDate(
                              position.maturity
                            )}`
                          : `Closed ${formatDate(
                              position.completedAt
                            )}`}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-right sm:grid-cols-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Cost basis
                      </div>

                      <div className="mt-1 text-sm font-semibold tabular-nums">
                        {formatCurrency(
                          position.costBasisUsd
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Final value
                      </div>

                      <div className="mt-1 text-sm font-semibold tabular-nums">
                        {formatCurrency(
                          finalValue
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Earned
                      </div>

                      <div className="mt-1 text-sm font-semibold tabular-nums text-emerald-400">
                        {formatCurrency(
                          earned
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        APY
                      </div>

                      <div className="mt-1 text-sm font-semibold tabular-nums">
                        {formatPercent(
                          position.fixedApy
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
        )}
      </div>
    </section>
  );
}

function ProjectIncomeSection({
  months,
  selectedMonthKey,
  onSelectMonth,
  selectedYear,
  onSelectYear,
  saladTracker,
  projectLogos,
}) {
  const currentYear =
    getCurrentYear();

  const currentMonthKey =
    getCurrentMonthKey();

  const firstTrackingYear =
    Number(
      MONTHLY_TRACKING_START.slice(
        0,
        4
      )
    );

  const yearMonths =
    Array.from(
      {
        length: 12,
      },
      (
        _,
        index
      ) =>
        `${selectedYear}-${String(
          index + 1
        ).padStart(
          2,
          "0"
        )}`
    ).filter(
      (monthKey) => {
        if (
          monthKey <
          MONTHLY_TRACKING_START
        ) {
          return false;
        }

        if (
          selectedYear ===
          currentYear
        ) {
          return (
            monthKey <=
            currentMonthKey
          );
        }

        return true;
      }
    );

  const monthMap =
    new Map(
      months.map(
        (month) => [
          month.monthKey,
          month,
        ]
      )
    );

  const chartMonths =
    yearMonths.map(
      (monthKey) =>
        monthMap.get(
          monthKey
        ) || {
          monthKey,
          total: 0,
          platforms: [],
          locked:
            monthKey <
            currentMonthKey,
        }
    );

  const maxAmount =
    Math.max(
      1,
      ...chartMonths.map(
        (month) =>
          Number(
            month.total
          ) || 0
      )
    );

  const selectedMonth =
    selectedMonthKey
      ? chartMonths.find(
          (month) =>
            month.monthKey ===
            selectedMonthKey
        )
      : null;

  const yearlyTotal =
    chartMonths.reduce(
      (
        total,
        month
      ) =>
        total +
        (
          Number(
            month.total
          ) || 0
        ),
      0
    );

  function moveYear(
    direction
  ) {
    const targetYear =
      selectedYear +
      direction;

    if (
      targetYear <
        firstTrackingYear ||
      targetYear >
        currentYear
    ) {
      return;
    }

    onSelectMonth(
      null
    );

    onSelectYear(
      targetYear
    );
  }

  return (
    <section className="space-y-4 border-t border-border/50 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />

            <h2 className="text-lg font-semibold">
              Project Income
            </h2>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            Income earned across all tracked projects. Completed months are automatically locked.
          </p>

        </div>

        <div className="flex items-center gap-6">
          <div className="flex h-10 items-center overflow-hidden rounded-lg border border-border/50 bg-white/[0.02]">
            <button
              type="button"
              onClick={() =>
                moveYear(
                  -1
                )
              }
              disabled={
                selectedYear <=
                firstTrackingYear
              }
              className="flex h-full w-10 items-center justify-center text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
              aria-label="Previous year"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex h-full min-w-[88px] items-center justify-center border-x border-border/50 px-5 text-sm font-semibold tabular-nums">
              {selectedYear}
            </div>

            <button
              type="button"
              onClick={() =>
                moveYear(
                  1
                )
              }
              disabled={
                selectedYear >=
                currentYear
              }
              className="flex h-full w-10 items-center justify-center text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
              aria-label="Next year"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              {selectedYear} total
            </div>

            <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-400">
              {formatCurrency(
                yearlyTotal
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/35 px-5 pb-5 pt-6">
        {chartMonths.length ===
        0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            No tracked months for this year.
          </div>
        ) : (
          <div className="flex h-56 items-end gap-2 md:gap-4">
            {chartMonths.map(
              (month) => {
                const amount =
                  Number(
                    month.total
                  ) || 0;

                const height =
                  amount > 0
                    ? Math.max(
                        12,
                        (
                          amount /
                          maxAmount
                        ) *
                          100
                      )
                    : 3;

                return (
                  <button
                    key={
                      month.monthKey
                    }
                    type="button"
                    onClick={() =>
                      onSelectMonth(
                        month.monthKey
                      )
                    }
                    className="group flex min-w-0 flex-1 flex-col items-center justify-end rounded-lg px-1 pt-1 outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                  >
                    <div className="mb-2 flex min-h-6 items-center gap-1 whitespace-nowrap text-[11px] font-semibold tabular-nums text-foreground md:text-xs">
                      {formatCurrency(
                        amount
                      )}

                      {month.locked && (
                        <Lock className="h-2.5 w-2.5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="flex h-36 w-full items-end justify-center">
                      <div
                        className={`w-full max-w-14 rounded-t-md transition-all duration-200 ${
                          amount >
                          0
                            ? month.locked
                              ? "bg-emerald-400/45 group-hover:bg-emerald-400/65"
                              : "bg-emerald-400/75 group-hover:bg-emerald-400"
                            : "bg-white/[0.06] group-hover:bg-white/[0.10]"
                        }`}
                        style={{
                          height:
                            `${height}%`,
                        }}
                      />
                    </div>

                    <div className="mt-3 text-[11px] font-medium text-muted-foreground transition group-hover:text-foreground md:text-xs">
                      {formatShortMonth(
                        month.monthKey
                      )}
                    </div>
                  </button>
                );
              }
            )}
          </div>
        )}
      </div>

      {selectedMonth && (
        <ProjectIncomeModal
          month={
            selectedMonth
          }
          projectLogos={
            projectLogos
          }
          onClose={() =>
            onSelectMonth(
              null
            )
          }
        />
      )}
    </section>
  );
}

function ProjectIncomeModal({
  month,
  projectLogos,
  onClose,
}) {
  const total =
    Number(
      month.total
    ) || 0;

  useEffect(
    () => {
      function handleKeyDown(
        event
      ) {
        if (
          event.key ===
          "Escape"
        ) {
          onClose();
        }
      }

      window.addEventListener(
        "keydown",
        handleKeyDown
      );

      return () =>
        window.removeEventListener(
          "keydown",
          handleKeyDown
        );
    },
    [
      onClose,
    ]
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(
        event
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/50 px-5 py-5">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-lg font-semibold">
                {formatMonthLabel(
                  month.monthKey
                )}
              </div>

              {month.locked && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Final
                </span>
              )}
            </div>

            <div className="mt-1 text-xs text-muted-foreground">
              {month.platforms.length}{" "}
              income{" "}
              {month.platforms.length ===
              1
                ? "source"
                : "sources"}
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="text-right">
              <div className="text-xs text-muted-foreground">
                Project income
              </div>

              <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-400">
                {formatCurrency(
                  total
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={
                onClose
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-5">
          {month.platforms.length ===
          0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No project income was recorded for this month.
            </div>
          ) : (
            <div className="space-y-2">
              {month.platforms.map(
                (
                  platform
                ) => {
                  const share =
                    total >
                    0
                      ? (
                          platform.amount /
                          total
                        ) *
                        100
                      : 0;

                  return (
                    <div
                      key={
                        platform.platform
                      }
                      className="rounded-xl border border-border/50 bg-white/[0.02] px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          {getProjectIncomeLogo(
                            platform.platform,
                            projectLogos
                          ) ? (
                            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border/60 bg-white/[0.04]">
                              <img
                                src={
                                  getProjectIncomeLogo(
                                    platform.platform,
                                    projectLogos
                                  )
                                }
                                alt={`${platform.platform} logo`}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-white/[0.04] text-[10px] font-bold">
                              {getInitials(
                                platform.platform
                              )}
                            </div>
                          )}

                          <span className="truncate font-medium">
                            {
                              platform.platform
                            }
                          </span>
                        </div>

                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatCurrency(
                            platform.amount
                          )}
                        </span>
                      </div>

                      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-emerald-400/70"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(
                                100,
                                share
                              )
                            )}%`,
                          }}
                        />
                      </div>

                      <div className="mt-1.5 text-right text-[10px] tabular-nums text-muted-foreground">
                        {share.toFixed(
                          1
                        )}
                        % of project income
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PortfolioAllocationBar({
  projects,
  totalBalance,
  trxBalance = 0,
}) {
  const coinBalances =
    new Map();

  (
    projects ||
    []
  ).forEach(
    (project) => {
      (
        project.assets ||
        []
      ).forEach(
        (asset) => {
          const balance =
            Number(
              asset.balance
            ) || 0;

          if (
            balance <= 0
          ) {
            return;
          }

          const symbol =
            String(
              asset.allocationSymbol ||
                asset.asset ||
                "Other"
            ).trim() ||
            "Other";

          coinBalances.set(
            symbol,
            (
              coinBalances.get(
                symbol
              ) || 0
            ) +
              balance
          );
        }
      );
    }
  );

  if (
    Number(
      trxBalance
    ) > 0
  ) {
    coinBalances.set(
      "TRX",
      Number(
        trxBalance
      )
    );
  }

  const coins = [
    ...coinBalances.entries(),
  ]
    .map(
      ([
        symbol,
        balance,
      ]) => ({
        symbol,
        balance,
      })
    )
    .sort(
      (
        a,
        b
      ) =>
        b.balance -
        a.balance
    );

  const breakdownTotal =
    coins.reduce(
      (
        sum,
        coin
      ) =>
        sum +
        (
          Number(
            coin.balance
          ) || 0
        ),
      0
    );

  if (
    !coins.length ||
    !(
      breakdownTotal > 0
    )
  ) {
    return null;
  }

  const fallbackClasses = [
    "bg-emerald-400",
    "bg-violet-400",
    "bg-rose-400",
    "bg-cyan-400",
    "bg-yellow-400",
    "bg-pink-400",
  ];

  const getCoinColor =
    (
      symbol,
      index
    ) => {
      const normalized =
        String(
          symbol
        ).toUpperCase();

      if (
        normalized ===
        "USDS"
      ) {
        return "bg-orange-400";
      }

      if (
        normalized ===
        "USDC"
      ) {
        return "bg-blue-400";
      }

      if (
        normalized ===
        "ONYC"
      ) {
        return "bg-yellow-400";
      }

      if (
        normalized ===
        "TRX"
      ) {
        return "bg-red-500";
      }

      return fallbackClasses[
        index %
          fallbackClasses.length
      ];
    };

  return (
    <div className="mt-8">
      <div className="flex h-[3px] w-full overflow-hidden rounded-full bg-white/5">
        {coins.map(
          (
            coin,
            index
          ) => {
            const width =
              (
                coin.balance /
                breakdownTotal
              ) *
              100;

            return (
              <div
                key={
                  coin.symbol
                }
                className={`${getCoinColor(
                  coin.symbol,
                  index
                )} h-full`}
                style={{
                  width:
                    `${width}%`,
                }}
              />
            );
          }
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-7 gap-y-2.5 text-base font-medium text-muted-foreground">
        {coins.map(
          (
            coin,
            index
          ) => (
            <div
              key={
                coin.symbol
              }
              className="flex items-center gap-2"
            >
              <span
                className={`h-3.5 w-3.5 rounded-full ${getCoinColor(
                  coin.symbol,
                  index
                )}`}
              />

              <span>
                {
                  coin.symbol
                }
              </span>

              <span className="tabular-nums text-foreground/95">
                {formatCurrency(
                  coin.balance
                )}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="whitespace-nowrap">
          {label}
        </span>

        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5">
          <Icon
            className="h-3.5 w-3.5"
            strokeWidth={
              1.6
            }
          />
        </span>
      </div>

      <div className="mt-3 text-4xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}