import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { remoteStorage } from "@/lib/serverStore";
import { projectsApi } from "@/lib/api";
import { getLoopscaleOnycSnapshot } from "@/lib/loopscaleYieldSync";
import { coinGeckoApi } from "@/lib/external-apis";
import { Card, CardContent } from "@/components/ui/card";
import { Area, AreaChart, CartesianGrid, LabelList, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  CheckCircle2,
  Lock,
} from "lucide-react";

const STORAGE_KEY = "networth_yield_positions";
const LOGO_STORAGE_KEY = "yield_project_logos_v1";
const MONTHLY_BACKFILL_KEY = "yield_monthly_earnings_backfill_v1";
const LULO_MONTHLY_BASELINE_KEY = "yield_lulo_monthly_baselines_v1";
const MONTHLY_SNAPSHOT_KEY = "yield_monthly_snapshots_v1";
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
  onDeactivate,
  todayUsd = 0,
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
        bg-[#0e1218]
        shadow-sm
        transition-all
        duration-200
        hover:border-border
        hover:bg-[#151e28]
      "
    >
      <button
        type="button"
        onClick={
          onToggle
        }
        className="flex w-full flex-col px-3.5 py-2.5 text-left"
      >
        <div className="flex w-full min-w-0 items-start gap-2">
          <ProjectLogoButton platform={"Kryptex"} logo={logo} onLogoChange={onLogoChange} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="min-w-0 truncate text-[12px] font-semibold">Kryptex</span>
              <span className={`shrink-0 text-[9px] ${isLive ? "text-emerald-400" : "text-amber-300"}`}>
                ● {isLive ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[14px] font-semibold tabular-nums">{formatCurrency(stats?.currentBalanceUsd)}</div>
          </div>
          <ChevronRight className={`mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground ${collapsed ? "rotate-90" : ""}`}/>
        </div>
      </button>

      {!collapsed && (
        <ProjectDetailsModal title={"Kryptex"} onClose={onToggle} projections={{ daily: stats?.dailyUsd, monthly: stats?.monthlyUsd, yearly: stats?.yearlyUsd }} onDeactivate={onDeactivate}>
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
      </ProjectDetailsModal>
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
    projectExpenses,
    setProjectExpenses,
  ] = useState(
    loadProjectExpenses
  );

  const [inactiveProjectIds, setInactiveProjectIds] = useState(() => {
    const saved = readObject(INACTIVE_PROJECTS_KEY).ids;
    return Array.isArray(saved) ? saved.map(String) : [];
  });
  const deactivateProject = key => setInactiveProjectIds(current => {
    const next = current.includes(String(key)) ? current : [...current, String(key)];
    saveObject(INACTIVE_PROJECTS_KEY, { ids: next });
    return next;
  });
  const reactivateProject = key => setInactiveProjectIds(current => {
    const next = current.filter(id => id !== String(key));
    saveObject(INACTIVE_PROJECTS_KEY, { ids: next });
    return next;
  });
  const [
    allProjects,
    setAllProjects,
  ] = useState(() => {
    const cached = readObject(PROJECT_QUICK_CACHE_KEY).projects;
    return Array.isArray(cached) ? cached : [];
  });

  const [
    luloProjects,
    setLuloProjects,
  ] = useState(() => {
    const cached = readObject(PROJECT_QUICK_CACHE_KEY).projects;
    return Array.isArray(cached) ? cached.filter(project => project?.yield_tracking === "lulo_lending") : [];
  });

  const [
    loopscaleSnapshot,
    setLoopscaleSnapshot,
  ] = useState(() => readObject(PROJECT_QUICK_CACHE_KEY).loopscaleSnapshot || null);

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

                // Incomplete range syncs sometimes return zero or a smaller
                // partial total. Keep the last confirmed mined amount rather
                // than erasing historical chart earnings.
                const priorTrx = Number(previous?.trx ?? previous?.sol);
                if (!Number.isFinite(trx) || trx < 0 ||
                    (Number.isFinite(priorTrx) && priorTrx > 0 &&
                      trx < priorTrx - 1e-9)) {
                  return;
                }
                if (trx === 0 && Number.isFinite(priorTrx) && priorTrx > 0) {
                  return;
                }

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
                  // Keep the historical mining USD valuation for unchanged
                  // TRX rows; market movements remain in portfolio P/L.
                  usd: sameTrx && Number(previous?.usd) > 0
                    ? Number(previous.usd)
                    : Number((trx * rowPrice).toFixed(8)),
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

// Keep cheap cached updates frequent, but fetch the full RollerCoin
// monthly history no more than once per minute.
const lastRollerCoinRangeRequestRef = useRef(0);
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
      const now = Date.now();
      if (now - lastRollerCoinRangeRequestRef.current >= 60000) {
        lastRollerCoinRangeRequestRef.current = now;
        window.postMessage(
          {
            source: "rollercoin-app",
            type: "SYNC_RANGE",
            from,
            to,
          },
          window.location.origin
        );
      }
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
        // A successful fetch refreshes the instant-on-load cache.
        const cache = readObject(PROJECT_QUICK_CACHE_KEY);
        saveObject(PROJECT_QUICK_CACHE_KEY, { ...cache, projects: normalized });
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

              // Preserve accepted yield by observation date. Never infer
              // historical day allocations from a balance snapshot.
              const observedDaily = {
                ...(previous.observedDaily || {}),
              };
              if (acceptInterestDelta) {
                monthEarned += interestDelta;
                const observationDay = getTodayKey();
                observedDaily[observationDay] = Number((
                  (Number(observedDaily[observationDay]) || 0) +
                  interestDelta
                ).toFixed(8));
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
                observedDaily,
                lastLifetimeInterest:
                  lifetimeInterest,
                lastBalanceUsd:
                  balanceUsd,
                // Only advance persistence timestamps for meaningful changes.
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

              // A fresh polling timestamp alone must not rewrite remote
              // settings dozens of times per minute.
              const previousComparable = { ...previous };
              const updatedComparable = { ...updated };
              delete previousComparable.lastSyncedAt;
              delete updatedComparable.lastSyncedAt;
              if (
                JSON.stringify(updatedComparable) !==
                JSON.stringify(previousComparable)
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
          // GET_LATEST and SYNC_NOW may resolve out of order. Do not
          // replace a newer lifetime balance with a stale cached payload.
          const incomingTimestamp = Date.parse(syncedAt);
          const savedTimestamp = Date.parse(current?.lastSyncedAt || "");
          if (
            Number.isFinite(savedTimestamp) &&
            (!Number.isFinite(incomingTimestamp) || incomingTimestamp < savedTimestamp)
          ) {
            return current;
          }
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

          // Carry forward the manually verified Oct 29 midnight–9 AM amount.
          // When the dated history endpoint is missing or stale, count only
          // *new* lifetime earnings observed between successful extension syncs.
          // Keep this cursor in the tracker so refreshes cannot reset it.
          const fixedSaladDay = "2026-10-29";
          const fixedSaladEnd = Date.parse("2026-10-29T09:00:00-07:00");
          const previousLifetime = Number(current?.lastLifetimeBalance);
          const previousSync = Date.parse(current?.lastSyncedAt || "");
          const incomingSync = Date.parse(syncedAt);
          const validNewSync = Number.isFinite(incomingSync) &&
            (!Number.isFinite(previousSync) || incomingSync > previousSync);
          const postMorningDelta = validNewSync &&
            Number.isFinite(previousSync) && previousSync >= fixedSaladEnd &&
            Number.isFinite(previousLifetime)
              ? Math.max(0, lifetimeBalance - previousLifetime)
              : 0;
          const saladPostMorningEarned = Number((
            Math.max(0, Number(current?.saladPostMorningEarned) || 0) +
            postMorningDelta
          ).toFixed(8));
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
           * MONTHLY SALAD ACCOUNTING
           *
           * Use lifetimeBalance instead of available
           * balance or extension daily rows.
           *
           * On the first sync of a new month, save
           * the current lifetime total as that month's
           * opening baseline and start the month at $0.
           *
           * After that:
           * current month income =
           * lifetimeBalance - opening lifetime baseline
           *
           * Because lifetimeBalance does not fall when
           * money is withdrawn, withdrawals cannot make
           * the monthly earnings negative or reset them.
           */
          const previousBaselineMonth =
            current?.monthBaselineMonth ||
            null;

          const previousBaselineLifetime =
            Number(
              current?.monthBaselineLifetimeBalance
            );

          let monthBaselineMonth =
            previousBaselineMonth;

          let monthBaselineLifetimeBalance =
            Number.isFinite(
              previousBaselineLifetime
            )
              ? previousBaselineLifetime
              : null;

          if (
            previousBaselineMonth !==
              monthKey ||
            !Number.isFinite(
              monthBaselineLifetimeBalance
            )
          ) {
            monthBaselineMonth =
              monthKey;

            monthBaselineLifetimeBalance =
              lifetimeBalance;

            monthlyEarnings[
              monthKey
            ] = 0;
          } else {
            monthlyEarnings[
              monthKey
            ] =
              Number(
                Math.max(
                  0,
                  lifetimeBalance -
                    monthBaselineLifetimeBalance
                ).toFixed(
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

            monthBaselineMonth,

            monthBaselineLifetimeBalance,

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

            saladPostMorningEarned,

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

      const handleFocus = () => {
        requestSaladLatest();
        // Refresh the actual Salad API data rather than only rereading
        // the previous extension cache whenever the user returns.
        syncSaladBalance();
      };

      window.addEventListener(
        "focus",
        handleFocus
      );

      // Salad's own tab timer can be throttled or stopped in the background.
      // A dashboard-side sync drives the extension's SYNC_NOW background
      // request while this page remains open, without requiring a reload.
      const liveSaladTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          syncSaladBalance();
        }
      }, 60000);

      return () => {
        window.clearInterval(liveSaladTimer);
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
      syncSaladBalance,
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

        const availableBalance =
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

        /*
         * Count both available and pending Unetwork rewards.
         * The extension may send pending in USD or micros,
         * depending on which endpoint/version it is using.
         */
        const pendingRawMicros =
          Number(
            payload?.pending_balance_micros ??
              payload?.pendingBalanceMicros ??
              payload?.pending_micros ??
              payload?.pendingMicros
          );

        const pendingExplicitUsd =
          Number(
            payload?.pending_balance_usd ??
              payload?.pendingBalanceUsd ??
              payload?.pending_usd ??
              payload?.pendingUsd
          );

        const pendingBalance =
          Number.isFinite(
            pendingExplicitUsd
          )
            ? Math.max(
                0,
                pendingExplicitUsd
              )
            : (
                Number.isFinite(
                  pendingRawMicros
                )
                  ? Math.max(
                      0,
                      pendingRawMicros /
                        1_000_000
                    )
                  : 0
              );

        const currentBalance =
          Number.isFinite(
            availableBalance
          )
            ? availableBalance +
              pendingBalance
            : NaN;

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

                  // Allocation history can be incomplete on later syncs.
                  // Never overwrite a previously confirmed daily total with
                  // a smaller partial response.
                  const previousEntry = nextDaily[date];
                  const previousUsd = typeof previousEntry === "number"
                    ? Number(previousEntry) || 0
                    : Number(previousEntry?.usd) || 0;
                  if (usd < previousUsd) return;
                  nextDaily[date] = {
                    usd,
                    micros: Math.max(
                      Number(previousEntry?.micros) || 0,
                      Number(row?.micros) || 0
                    ),
                    count: Math.max(
                      Number(previousEntry?.count) || 0,
                      Number(row?.count) || 0
                    ),
                    syncedAt: payload?.synced_at ||
                      payload?.syncedAt || new Date().toISOString(),
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

              // Only recognize balance growth above the previous
              // high-water mark. A withdrawal followed by balance
              // recovery must not be counted as fresh earnings.
              const balanceHighWater = initialized
                ? Math.max(
                    Number(current?.balanceHighWater) || 0,
                    previousBalance
                  )
                : currentBalance;
              // Unetwork normally posts its daily rewards at about 7:20 PM
              // America/Los_Angeles. Polling is still continuous: only a
              // real balance increase counts, never an estimated daily credit.
              // The first balance is an opening baseline, not today's income.
              const positiveDelta = initialized
                ? Math.max(0, currentBalance - balanceHighWater)
                : 0;

              if (
                positiveDelta >
                0
              ) {
                // Attribute the actual increase to the Pacific date on
                // which it was seen, including the expected ~7:20 PM post.
                // Do not assign yesterday's income to today just because
                // the extension happened to sync after midnight.
                const observedAt = new Date(
                  payload?.synced_at || payload?.syncedAt || Date.now()
                );
                const today = Number.isNaN(observedAt.getTime())
                  ? getTodayKey()
                  : new Intl.DateTimeFormat("en-CA", {
                      timeZone: "America/Los_Angeles",
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }).format(observedAt);

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

              availableBalance:
                Number.isFinite(
                  availableBalance
                )
                  ? availableBalance
                  : 0,

              pendingBalance,

              lastBalance:
                currentBalance,

              // Persist a high-water mark for balance-only fallbacks.
              balanceHighWater: Math.max(
                Number(current?.balanceHighWater) || 0,
                Number(current?.lastBalance) || 0,
                currentBalance
              ),

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

  const syncLivePositions = useCallback(async () => {
    setSyncError("");
    // Browser-extension updates do not depend on any API request finishing.
    requestRollerCoinLatest();
    requestSaladLatest();
    requestUnetworkLatest();
    requestKryptexLatest();

    const errors = [];
    // Load independent sources concurrently so slow network calls do not
    // delay updates from the other projects.
    await Promise.all([
      (async () => {
        try {
          const response = await projectsApi.accrueApyTransactions();
          if (!Array.isArray(response?.data)) throw new Error("Invalid project response");
          applyProjectData(response.data);
        } catch (error) {
          console.error("Yield page project sync failed:", error);
          errors.push(`Projects: ${error?.message || "sync failed"}`);
          try {
            const response = await projectsApi.getAll();
            if (Array.isArray(response?.data)) applyProjectData(response.data);
          } catch (fallbackError) {
            console.error("Yield page project fallback failed:", fallbackError);
            // Leave cached project cards in place if the connection fails.
          }
        }
      })(),
      (async () => {
        try {
          const snapshot = await getLoopscaleOnycSnapshot();
          if (snapshot) {
            setLoopscaleSnapshot(snapshot);
            const cache = readObject(PROJECT_QUICK_CACHE_KEY);
            saveObject(PROJECT_QUICK_CACHE_KEY, { ...cache, loopscaleSnapshot: snapshot });
          }
        } catch (error) {
          console.error("Yield page Loopscale sync failed:", error);
          errors.push(`Loopscale: ${error?.message || "sync failed"}`);
        }
      })(),
    ]);
    if (errors.length) setSyncError(errors.join(" · "));
  }, [
    applyProjectData,
    requestRollerCoinLatest,
    requestSaladLatest,
    requestUnetworkLatest,
    requestKryptexLatest,
  ]);

  // Keep polling intervals stable even when an extension pushes a new balance.
  // Otherwise every callback change resets the one-minute timer and can
  // indefinitely postpone Lulo's next scheduled accrual.
  const syncLiveRef = useRef(syncLivePositions);
  syncLiveRef.current = syncLivePositions;
  const quickRefreshRef = useRef(refreshProjectsOnly);
  quickRefreshRef.current = refreshProjectsOnly;
  const syncRunningRef = useRef(false);
  const quickRunningRef = useRef(false);

  useEffect(() => {
    let active = true;
    const fullRefresh = async () => {
      if (!active || syncRunningRef.current) return;
      syncRunningRef.current = true;
      try {
        await syncLiveRef.current();
      } finally {
        syncRunningRef.current = false;
      }
    };
    const quickRefresh = async () => {
      if (!active || quickRunningRef.current) return;
      quickRunningRef.current = true;
      try {
        // Request current extension readings whether or not a full API
        // accrual is still running.
        requestRollerCoinLatest();
        requestSaladLatest();
        requestUnetworkLatest();
        requestKryptexLatest();
        await quickRefreshRef.current();
      } finally {
        quickRunningRef.current = false;
      }
    };
    fullRefresh();
    const fullTimer = window.setInterval(fullRefresh, 60000);
    const quickTimer = window.setInterval(quickRefresh, 3000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        quickRefresh();
        fullRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(fullTimer);
      window.clearInterval(quickTimer);
    };
  // The latest callbacks are read from refs; the timers must not restart.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodically reload the page as a fallback for extension messages that
  // only become visible on navigation. Keep it unobtrusive: preserve scroll,
  // skip hidden tabs, and wait until the user is not interacting.
  useEffect(() => {
    const scrollKey = "nam_yield_auto_refresh_scroll_v1";
    const stored = window.sessionStorage.getItem(scrollKey);
    if (stored !== null) {
      window.sessionStorage.removeItem(scrollKey);
      const y = Number(stored);
      if (Number.isFinite(y) && y >= 0) {
        window.requestAnimationFrame(() => window.scrollTo(0, y));
      }
    }
    let lastInteraction = Date.now();
    const markInteraction = () => { lastInteraction = Date.now(); };
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach(type =>
      window.addEventListener(type, markInteraction, { passive: true })
    );
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastInteraction < 30000) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const active = document.activeElement;
      if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
      window.sessionStorage.setItem(scrollKey, String(window.scrollY));
      window.location.reload();
    }, 180000);
    return () => {
      window.clearInterval(timer);
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach(type =>
        window.removeEventListener(type, markInteraction)
      );
    };
  }, []);

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
                rollerCoinStats?.currentBalanceUsd
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
  const activeProgramCards = sortedProgramCards.filter(item => !inactiveProjectIds.includes(String(item.key)));
  const inactiveProgramCards = sortedProgramCards.filter(item => inactiveProjectIds.includes(String(item.key)));

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
          loopscaleHistory,
          saladTracker,
          monthlyBackfills,
          rollerCoinTracker,
          unetworkTracker,
          kryptexTracker
        ),
      [
        luloProjects,
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


  // Version 2 records earnings changes by project rather than storing a
  // single unexplained sum. The original v1 ledger is retained untouched.
  // Monthly aggregates are not proof of when earnings occurred, so first
  // readings (including a newly seen source) establish a baseline only.
  const DAILY_LEDGER_KEY = "yield_daily_earnings_by_source_v2";
  const [earningsClock, setEarningsClock] = useState(() => Date.now());
  const [earningsLedger, setEarningsLedger] = useState(() => {
    const saved = readObject(DAILY_LEDGER_KEY);
    return {
      days: saved.days && typeof saved.days === "object" ? saved.days : {},
      lastMonth: saved.lastMonth || "",
      lastSources: saved.lastSources && typeof saved.lastSources === "object" ? saved.lastSources : {},
      timeline: saved.timeline && typeof saved.timeline === "object" ? saved.timeline : {},
    };
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [earningsChartRange, setEarningsChartRange] = useState("daily");
  const [selectedEarningsPoint, setSelectedEarningsPoint] = useState(null);
  useEffect(() => {
    if (!selectedEarningsPoint) return;
    const closeOnEscape = event => {
      if (event.key === "Escape") setSelectedEarningsPoint(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedEarningsPoint]);
  useEffect(() => {
    const timer = window.setInterval(() => setEarningsClock(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const today = getTodayKey();
    const monthKey = today.slice(0, 7);
    const month = liveProjectIncome.find(entry => entry.monthKey === monthKey);
    const sources = Object.fromEntries((month?.platforms || [])
      .filter(item => Number.isFinite(Number(item.amount)) && Number(item.amount) >= 0)
      .map(item => [String(item.platform).trim(), Number(item.amount)]));
    setEarningsLedger(previous => {
      const sameMonth = previous.lastMonth === monthKey;
      // When a source temporarily disappears from an incomplete sync, keep
      // its last observed baseline to prevent counting old earnings again.
      const lastSources = sameMonth ? { ...previous.lastSources } : {};
      const increments = {};
      for (const [name, amount] of Object.entries(sources)) {
        // RollerCoin's month-to-date USD valuation changes with the TRX
        // market price. Those changes are P/L, not newly mined rewards.
        // Actual dated mining income is rendered from RollerCoin daily rows.
        if (name === "RollerCoin") {
          lastSources[name] = amount;
          continue;
        }
        const prior = lastSources[name];
        if (sameMonth && Number.isFinite(prior) && amount > prior) {
          increments[name] = amount - prior;
        }
        // Do not count a temporary downward correction and subsequent rebound twice.
        lastSources[name] = sameMonth && Number.isFinite(prior) ? Math.max(prior, amount) : amount;
      }
      const todaySources = {
        ...((previous.days[today] && previous.days[today].sources) || {}),
      };
      for (const [name, change] of Object.entries(increments)) {
        todaySources[name] = (Number(todaySources[name]) || 0) + change;
      }
      const days = Object.keys(increments).length
        ? { ...previous.days, [today]: { sources: todaySources } }
        : previous.days;
      // Capture each observed increase with its Pacific-time clock position.
      // The historical daily totals are preserved, but intraday timing starts
      // from this release since the previous ledger did not retain timestamps.
      const pacificTime = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit",
        second: "2-digit", hourCycle: "h23",
      }).formatToParts(new Date());
      const timePart = key => Number(pacificTime.find(part => part.type === key)?.value || 0);
      const hour = timePart("hour") + timePart("minute") / 60 + timePart("second") / 3600;
      const totalIncrease = Object.values(increments).reduce((sum, amount) => sum + amount, 0);
      const priorTimeline = previous.timeline?.[today] || [];
      const timeline = totalIncrease > 0
        ? {
            ...previous.timeline,
            [today]: [...priorTimeline, { hour, amount: Object.values(todaySources).reduce((sum, amount) => sum + (Number(amount) || 0), 0) }].slice(-250),
          }
        : previous.timeline || {};
      const next = { days, lastMonth: monthKey, lastSources, timeline };
      if (JSON.stringify(previous) !== JSON.stringify(next)) {
        saveObject(DAILY_LEDGER_KEY, next);
        return next;
      }
      return previous;
    });
  }, [liveProjectIncome, earningsClock]);

  // Commit Lulo's accepted interest increases to the persistent daily ledger.
  // Keep legacy tracked earnings and the verified opening-day amount; never add
  // the same increment from the monthly ledger a second time.
  useEffect(() => {
    const observedByDay = {};
    Object.values(luloMonthlyBaselines || {}).forEach(months => {
      Object.values(months || {}).forEach(tracker => {
        Object.entries(tracker?.observedDaily || {}).forEach(([day, raw]) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
          const amount = Number(raw);
          if (!Number.isFinite(amount) || amount <= 0) return;
          observedByDay[day] = (observedByDay[day] || 0) + amount;
        });
      });
    });
    if (!Object.keys(observedByDay).length) return;
    setEarningsLedger(previous => {
      let changed = false;
      const days = { ...previous.days };
      for (const [day, amount] of Object.entries(observedByDay)) {
        const existing = days[day]?.sources || {};
        const existingAmount = Math.max(0, Number(existing.Lulo) || 0);
        if (amount <= existingAmount + 0.00000001) continue;
        days[day] = {
          ...days[day],
          sources: { ...existing, Lulo: Number(amount.toFixed(8)) },
        };
        changed = true;
      }
      if (!changed) return previous;
      const next = { ...previous, days };
      saveObject(DAILY_LEDGER_KEY, next);
      return next;
    });
  }, [luloMonthlyBaselines]);

  // Reconcile signed Loopscale daily changes, including decreases.
  useEffect(() => {
    const observedByDay = {};
    Object.values(loopscaleHistory?.positions || {}).forEach(position => {
      Object.entries(position?.observedDaily || {}).forEach(([day, raw]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
        const amount = Number(raw);
        if (!Number.isFinite(amount)) return;
        observedByDay[day] = (observedByDay[day] || 0) + amount;
      });
    });
    if (!Object.keys(observedByDay).length) return;
    setEarningsLedger(previous => {
      let changed = false;
      const days = { ...previous.days };
      for (const [day, amount] of Object.entries(observedByDay)) {
        const existing = days[day]?.sources || {};
        const net = Number(amount.toFixed(8));
        if (Math.abs((Number(existing.Loopscale) || 0) - net) < 0.00000001) continue;
        days[day] = { ...days[day], sources: { ...existing, Loopscale: net } };
        changed = true;
      }
      if (!changed) return previous;
      const next = { ...previous, days };
      saveObject(DAILY_LEDGER_KEY, next);
      return next;
    });
  }, [loopscaleHistory]);

  // Restore the previously recorded RollerCoin earnings for today as a
  // one-time USD reference. Later market moves reprice that reference up
  // or down, rather than silently discarding it when dated rows are absent.
  const ROLLERCOIN_RESTORE_KEY = "yield_rollercoin_restored_daily_anchor_v1";
  const [rollerCoinRestoredAnchors, setRollerCoinRestoredAnchors] = useState(
    () => readObject(ROLLERCOIN_RESTORE_KEY)
  );
  useEffect(() => {
    const today = getTodayKey();
    if (rollerCoinRestoredAnchors?.[today]) return;
    const recorded = Number(earningsLedger.days?.[today]?.sources?.RollerCoin);
    const price = Number(rollerCoinTracker?.lastTrxPrice);
    if (!(recorded > 0) || !(price > 0)) return;
    const next = {
      ...rollerCoinRestoredAnchors,
      [today]: { usd: recorded, trxPrice: price },
    };
    setRollerCoinRestoredAnchors(next);
    saveObject(ROLLERCOIN_RESTORE_KEY, next);
  }, [earningsLedger.days, rollerCoinTracker?.lastTrxPrice, rollerCoinRestoredAnchors]);

  const todayKey = getTodayKey();
  // User-supplied Salad rate for Oct 29, 2026, 12:00 AM–9:00 AM PT only.
  // Fixed historical estimate, NOT a live rate or a future-day default.
  const SALAD_FIXED_DAY = "2026-10-29";
  const SALAD_FIXED_HOURLY_USD = 0.0756;
  const SALAD_FIXED_END_HOUR = 9;
  const SALAD_FIXED_TOTAL = SALAD_FIXED_HOURLY_USD * SALAD_FIXED_END_HOUR;
  // Verified Lulo dashboard screenshot for Oct 29: $0.21 USDC +
  // $0.15 USDS = $0.36 at the time of observation. This is a dated
  // historical floor, not a live per-asset API feed or a future-day rate.
  const LULO_FIXED_DAY = "2026-10-29";
  const LULO_FIXED_TOTAL = 0.36;
  const LULO_FIXED_END_HOUR = 14;
  const sourceTotalsForDay = key => {
    const sources = { ...(earningsLedger.days[key]?.sources || {}) };
    // Live USD value of TRX mined on this date. This can move up OR down
    // with TRX/USD without mislabeling older months' price changes as
    // newly mined TRX. Retain dated TRX counts across incomplete syncs.
    delete sources.RollerCoin;
    const minedEntry = rollerCoinTracker?.daily?.[key];
    const minedTrx = Number(minedEntry?.trx ?? minedEntry?.sol);
    const livePrice = Number(rollerCoinTracker?.lastTrxPrice) ||
      Number(minedEntry?.trxPrice ?? minedEntry?.solPrice) || 0;
    const datedMiningUsd = Number.isFinite(minedTrx) && minedTrx > 0 && livePrice > 0
      ? minedTrx * livePrice
      : 0;
    const anchor = rollerCoinRestoredAnchors?.[key];
    const referencePrice = Number(anchor?.trxPrice);
    const restoredUsd = Number(anchor?.usd);
    const repricedHistory = restoredUsd > 0 && referencePrice > 0 && livePrice > 0
      ? restoredUsd * livePrice / referencePrice
      : 0;
    // Use the previously recorded daily amount when it exceeds the dated
    // API record; do not sum them because both represent RollerCoin.
    // This explicitly restores legacy daily figures, including any earlier
    // month-to-date repricing that was folded into those figures.
    const rollerCoinDailyUsd = Math.max(datedMiningUsd, repricedHistory);
    if (rollerCoinDailyUsd > 0) sources.RollerCoin = rollerCoinDailyUsd;
    if (key === SALAD_FIXED_DAY) {
      // Preserve the verified 00:00–09:00 earnings, then take the later
      // earnings from the extension's dated full-day total when available.
      // The dated amount already includes the morning window, so adding
      // the fixed amount to it would double-count those earnings.
      const datedTotal = Number(saladTracker?.daily?.[key]);
      const observedIncrease = Math.max(0, Number(sources.Salad) || 0);
      const postMorningTotal = SALAD_FIXED_TOTAL +
        Math.max(0, Number(saladTracker?.saladPostMorningEarned) || 0);
      // Dated full-day earnings already include the morning amount.
      // The fallback counts only new lifetime-balance increases after 9 AM.
      sources.Salad = Math.max(
        SALAD_FIXED_TOTAL,
        Number.isFinite(datedTotal) ? datedTotal : 0,
        postMorningTotal,
        observedIncrease
      );
    }
    if (key === LULO_FIXED_DAY) {
      sources.Lulo = Math.max(LULO_FIXED_TOTAL, Number(sources.Lulo) || 0);
    }
    // Lulo's existing performance API provides dated yield observations.
    // Prefer the reported daily amount when present; never add it to the
    // monthly-delta ledger, which may describe the same interest.
    // Keep the existing ledger as a fallback if performance is unavailable.
    const reportedLuloDaily = (luloProjects || []).reduce((total, project) => {
      const matching = (Array.isArray(project?.lulo_daily_performance)
        ? project.lulo_daily_performance : [])
        .filter(row => row?.date === key)
        .reduce((sum, row) => sum + Math.max(0, Number(row?.amount) || 0), 0);
      return total + matching;
    }, 0);
    if (reportedLuloDaily > 0) {
      sources.Lulo = Math.max(
        Math.max(0, Number(sources.Lulo) || 0),
        reportedLuloDaily
      );
    }
    // Signed daily observations override stale positive-only ledger totals.
    const positionsForDay = Object.values(loopscaleHistory?.positions || {})
      .filter(position => Object.prototype.hasOwnProperty.call(position?.observedDaily || {}, key));
    if (positionsForDay.length) {
      sources.Loopscale = positionsForDay.reduce((sum, position) =>
        sum + (Number(position.observedDaily[key]) || 0), 0);
    }
    return sources;
  };
  const dailySourceTotals = sourceTotalsForDay(todayKey);
  const selectedBreakdown = (() => {
    const selection = selectedEarningsPoint;
    if (!selection || selection.range !== earningsChartRange) return null;
    let sources = {};
    let label = "";
    let note = "";
    if (selection.range === "monthly") {
      const month = projectIncome.find(item => item.monthKey === selection.key);
      if (!month) return null;
      sources = Object.fromEntries((month.platforms || [])
        .filter(item => Number.isFinite(Number(item.amount)))
        .map(item => [String(item.platform), Number(item.amount)]));
      label = selection.key;
      note = "Recorded monthly project totals";
    } else {
      if (selection.key > todayKey) return null;
      sources = sourceTotalsForDay(selection.key);
      label = selection.key;
      note = selection.range === "daily"
        ? "Daily project totals currently available; intraday per-project snapshots were not saved"
        : "Recorded earnings for this day";
    }
    const entries = Object.entries(sources)
      .filter(([,amount]) => Number.isFinite(Number(amount)) && Number(amount) !== 0)
      .map(([name, amount]) => ({name, amount: Number(amount)}))
      .sort((a,b) => b.amount-a.amount);
    return { label, note, entries, total: entries.reduce((sum,item)=>sum+item.amount,0) };
  })();
  const todayBreakdown = Object.entries(dailySourceTotals)
    .filter(([,amount]) => Number.isFinite(Number(amount)) && Number(amount) !== 0)
    .map(([name,amount]) => ({ name, amount: Number(amount) }))
    .sort((a,b) => b.amount - a.amount);
  const todayEarnings = todayBreakdown.reduce((sum,item) => sum + item.amount,0);
  const weekMonday = new Date(todayKey + "T12:00:00Z");
  weekMonday.setUTCDate(weekMonday.getUTCDate() - ((weekMonday.getUTCDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekMonday);
    day.setUTCDate(weekMonday.getUTCDate() + index);
    const key = day.toISOString().slice(0,10);
    const sources = sourceTotalsForDay(key);
    const value = Object.keys(sources).length
      ? Object.values(sources).reduce((sum,amount) => sum + (Number(amount)||0),0)
      : null;
    return {
      key,
      day: new Intl.DateTimeFormat("en-US",{weekday:"short",timeZone:"UTC"}).format(day),
      date: new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"UTC"}).format(day),
      value: key > todayKey ? null : (value ?? (key === todayKey ? 0 : null)),
      live: key === todayKey,
    };
  });
  const weekEarnings = weekDays.reduce((total,day) => total+(day.value || 0),0);
  const observedWeekMaximum = Math.max(1,...weekDays.map(day => day.value || 0));
  const pacificClockParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(earningsClock));
  const clockPart = key => Number(pacificClockParts.find(part => part.type === key)?.value || 0);
  const currentHour = clockPart("hour") + clockPart("minute") / 60;
  const todayTimeline = Array.isArray(earningsLedger.timeline?.[todayKey])
    ? earningsLedger.timeline[todayKey] : [];
  const isFixedLuloDay = todayKey === LULO_FIXED_DAY;
  const isFixedSaladDay = todayKey === SALAD_FIXED_DAY;
  const recordedSalad = Math.max(0, Number(earningsLedger.days[todayKey]?.sources?.Salad) || 0);
  const recordedLulo = Math.max(0, Number(earningsLedger.days[todayKey]?.sources?.Lulo) || 0);
  const fixedIncomeAtHour = hour =>
    (isFixedSaladDay ? SALAD_FIXED_TOTAL * Math.min(Math.max(hour, 0) / SALAD_FIXED_END_HOUR, 1) : 0) +
    (isFixedLuloDay ? LULO_FIXED_TOTAL * Math.min(Math.max(hour, 0) / LULO_FIXED_END_HOUR, 1) : 0);
  const fixedHours = (isFixedSaladDay || isFixedLuloDay)
    ? [...new Set([
        0,
        ...Array.from({ length: Math.floor(Math.min(24,currentHour)) + 1 }, (_, hour) => hour),
        ...(isFixedSaladDay ? [SALAD_FIXED_END_HOUR] : []),
        ...(isFixedLuloDay ? [LULO_FIXED_END_HOUR] : []),
      ])].filter(hour => hour <= currentHour).map(hour => ({
        x: hour, value: fixedIncomeAtHour(hour),
      }))
    : [{ x: 0, value: 0 }];
  const observedPoints = todayTimeline
    .filter(point => Number.isFinite(Number(point.hour)) && Number.isFinite(Number(point.amount)))
    .map(point => {
      const hour = Math.max(0, Math.min(24, Number(point.hour)));
      const otherObserved = Math.max(0,
        Number(point.amount) -
        (isFixedSaladDay ? Math.min(recordedSalad, SALAD_FIXED_TOTAL) : 0) -
        (isFixedLuloDay ? Math.min(recordedLulo, LULO_FIXED_TOTAL) : 0)
      );
      return {
        x: hour,
        value: (isFixedSaladDay || isFixedLuloDay ? fixedIncomeAtHour(hour) : 0) + otherObserved,
      };
    });
  // Keep actual observed net earnings, including corrections and losses.
  // Fixed estimates provide a baseline only until an observed value exists
  // at the same hour; never carry an old peak into later observations.
  const dailyPointsByHour = new Map();
  fixedHours.forEach(point => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.value)) return;
    const hour = Math.max(0, Math.min(currentHour, point.x));
    dailyPointsByHour.set(hour, point.value);
  });
  observedPoints.forEach(point => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.value)) return;
    const hour = Math.max(0, Math.min(currentHour, point.x));
    dailyPointsByHour.set(hour, point.value);
  });
  const dailyChartData = [...dailyPointsByHour.entries()]
    .sort(([a],[b]) => a - b)
    .map(([x,value]) => ({ x, value }));
  const lastObserved = dailyChartData[dailyChartData.length - 1];
  if (!lastObserved || currentHour > lastObserved.x) {
    dailyChartData.push({
      x: currentHour,
      value: todayEarnings,
    });
  } else if (lastObserved.x === currentHour) {
    lastObserved.value = todayEarnings;
  }
  const dailyChartMax = Math.max(0.1, todayEarnings, ...dailyChartData.map(point => point.value)) * 1.2;
  const dailyChartMin = Math.min(0, todayEarnings, ...dailyChartData.map(point => point.value)) * 1.2;
  const monthlyChartData = projectIncome
    .filter(month => /^\d{4}-\d{2}$/.test(String(month.monthKey)) && Number.isFinite(Number(month.total)))
    .map(month => ({
      monthKey: month.monthKey,
      label: new Intl.DateTimeFormat("en-US",{month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(month.monthKey+"-15T12:00:00Z")),
      value: Math.max(0,Number(month.total)),
      expenses: Math.max(0,Number(projectExpenses[month.monthKey]) || 0),
    }))
    .sort((a,b) => a.monthKey.localeCompare(b.monthKey));
  const thisMonthEarned = monthlyChartData.find(month => month.monthKey === getCurrentMonthKey())?.value || 0;
  const monthlyChartMax = Math.max(0.1,...monthlyChartData.map(month => month.value))*1.15;


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
      /*
       * Build Portfolio Balance directly from CURRENT balances.
       *
       * RollerCoin MUST use currentBalanceUsd here. Lifetime earned
       * is only for Total Earned and must not remain in the portfolio
       * after a withdrawal.
       */
      const assetProjectBalance =
        projectCards.reduce(
          (
            sum,
            project
          ) =>
            sum +
            (
              Number(
                project?.totalBalance
              ) || 0
            ),
          0
        );

      const portfolioBalance =
        assetProjectBalance +
        (
          Number(
            rollerCoinStats?.currentBalanceUsd
          ) || 0
        ) +
        (
          Number(
            saladStats?.currentBalance
          ) || 0
        ) +
        (
          Number(
            unetworkStats?.currentBalance
          ) || 0
        ) +
        (
          Number(
            kryptexStats?.currentBalanceUsd
          ) || 0
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
      className="min-w-0 space-y-2.5"
      data-testid="yield-farming-page"
    >

      <header className="flex flex-wrap items-center justify-between gap-3 px-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Passive Income</h1>
        <div className="flex flex-wrap items-center gap-3">
        {inactiveProgramCards.length > 0 && (
          <div className="shrink-0">
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="border-[#2b3848] bg-[#0e141c] text-muted-foreground hover:text-white">
                  Inactive projects ({inactiveProgramCards.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Inactive projects ({inactiveProgramCards.length})</DialogTitle>
                </DialogHeader>
                <div className="grid max-h-[60vh] gap-2 overflow-y-auto py-2">
                  {inactiveProgramCards.map(item => (
                    <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/30 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{item.type === "project" ? item.project.platform : item.type === "rollercoin" ? "RollerCoin" : item.type === "unetwork" ? "Unetwork" : item.type === "kryptex" ? "Kryptex" : "Salad"}</div>
                        <div className="text-xs tabular-nums text-muted-foreground">{formatCurrency(item.amount)}</div>
                      </div>
                      <button type="button" onClick={() => reactivateProject(item.key)} className="shrink-0 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10">Reactivate</button>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
        <span className="text-[11px] text-muted-foreground">{weekDays[0].date} – {weekDays[6].date} · Pacific Time</span>
        </div>
      </header>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_minmax(290px,1fr)]">
        <section className="flex min-w-0 flex-col rounded-2xl border border-[#263342] bg-[#0b1017] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold">Earnings {earningsChartRange === "daily" ? "Today" : earningsChartRange === "weekly" ? "This Week" : "This Month"}</h2>
              <div className="mt-2 text-[27px] font-semibold tabular-nums text-emerald-400">{formatCurrency(earningsChartRange === "daily" ? todayEarnings : earningsChartRange === "weekly" ? weekEarnings : thisMonthEarned)}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-[#2b3848] bg-[#0e141c] p-0.5" aria-label="Earnings chart period">
                {["daily", "weekly", "monthly"].map(period => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => { setEarningsChartRange(period); setSelectedEarningsPoint(null); }}
                    aria-pressed={earningsChartRange === period}
                    className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${earningsChartRange === period ? "bg-[#293747] text-white" : "text-muted-foreground hover:text-white"}`}
                  >
                    {period === "daily" ? "Daily" : period === "weekly" ? "Weekly" : "Monthly"}
                  </button>
                ))}
              </div>
              <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />Live
              </div>
            </div>
          </div>
          <div className="mt-3 h-[300px] w-full lg:h-auto lg:min-h-[280px] lg:flex-1">
            <ResponsiveContainer width="100%" height="100%">
              {earningsChartRange === "daily" ? (
                <AreaChart data={dailyChartData} margin={{top:12,right:12,left:-8,bottom:3}}>
                  <defs>
                    <linearGradient id="yieldDailyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#30d991" stopOpacity={0.28}/>
                      <stop offset="100%" stopColor="#30d991" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  {currentHour < 24 && <ReferenceArea x1={currentHour} x2={24} fill="#02070d" fillOpacity={0.38} strokeOpacity={0} ifOverflow="hidden" />}
                  <CartesianGrid vertical={false} stroke="#344454" opacity={0.35} strokeDasharray="3 4"/>
                  <XAxis dataKey="x" type="number" domain={[0,24]} ticks={[0,4,8,12,16,20,24]} axisLine={false} tickLine={false} tick={{fontSize:10,fill:"#91a1b2"}} tickFormatter={hour => hour === 0 ? "12am" : hour === 12 ? "12pm" : hour === 24 ? "12am" : hour < 12 ? hour+"am" : (hour-12)+"pm"}/>
                  <YAxis axisLine={false} tickLine={false} width={51} tick={{fontSize:10,fill:"#91a1b2"}} domain={[dailyChartMin,dailyChartMax]} tickFormatter={v=>"$"+Number(v).toFixed(2)} />
                  <Tooltip cursor={{stroke:"#30d991",strokeDasharray:"3 4"}} contentStyle={{background:"#111b27",border:"1px solid #33465a",borderRadius:10,fontSize:12}} labelFormatter={hour => {
                    const rounded = Math.max(0, Math.min(24,Number(hour)));
                    const hours = Math.floor(rounded);
                    const mins = Math.floor((rounded-hours)*60);
                    return `${String(hours).padStart(2,"0")}:${String(mins).padStart(2,"0")} PT`;
                  }} formatter={value=>[formatCurrency(value),"Recorded today"]}/>
                  <Area type="monotone" dataKey="value" stroke="#30e69b" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" fill="url(#yieldDailyFill)" dot={false} activeDot={{r:4, strokeWidth:2}} isAnimationActive={false}/>
                </AreaChart>
              ) : earningsChartRange === "weekly" ? (
                <AreaChart data={weekDays} margin={{top:28,right:15,left:-8,bottom:3}} onClick={point => { const index = Number(point?.activeTooltipIndex); const day = point?.activePayload?.[0]?.payload?.key || (Number.isInteger(index) ? weekDays[index]?.key : null); if (day && day <= todayKey) setSelectedEarningsPoint({range:"weekly",key:day}); }}>
                  <defs>
                    <linearGradient id="yieldWeeklyLiveFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#30d991" stopOpacity={0.28}/>
                      <stop offset="100%" stopColor="#30d991" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#344454" opacity={0.35} strokeDasharray="3 4"/>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} interval={0} tick={{fontSize:11,fill:"#91a1b2"}} />
                  <YAxis axisLine={false} tickLine={false} width={51} tick={{fontSize:10,fill:"#91a1b2"}} domain={[0,observedWeekMaximum*1.15]} tickFormatter={v=>"$"+Number(v).toFixed(2)} />
                  <Tooltip cursor={{stroke:"#30d991",strokeDasharray:"3 4"}} contentStyle={{background:"#111b27",border:"1px solid #33465a",borderRadius:10,fontSize:12}} labelFormatter={(label,items)=>items?.[0]?.payload?.date || label} formatter={value=>[formatCurrency(value),"Recorded earnings"]} />
                  <Area type="monotone" dataKey="value" name="Earnings" stroke="#30e69b" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" fill="url(#yieldWeeklyLiveFill)"
                    dot={props => {
                      const day = props?.payload?.key;
                      if (!day || day > todayKey || props?.payload?.value == null) return null;
                      return <circle cx={props.cx} cy={props.cy} r={6} fill="#30e69b"
                        stroke="#0c141e" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => setSelectedEarningsPoint({range:"weekly",key:day})}/>;
                    }}
                    activeDot={props => {
                      const day = props?.payload?.key;
                      if (!day || day > todayKey || props?.payload?.value == null) return null;
                      return <circle cx={props.cx} cy={props.cy} r={8} fill="#30e69b"
                        stroke="#0c141e" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => setSelectedEarningsPoint({range:"weekly",key:day})}/>;
                    }}
                    connectNulls={false} isAnimationActive={false}>
                    <LabelList dataKey="value" position="top" offset={12} formatter={value => value == null ? "" : formatCurrency(value)} style={{fill:"#c7f9e5",fontSize:10,fontWeight:600}} />
                  </Area>
                </AreaChart>
              ) : (
                <AreaChart data={monthlyChartData} margin={{top:28,right:15,left:-8,bottom:3}} onClick={point => { const index = Number(point?.activeTooltipIndex); const month = point?.activePayload?.[0]?.payload?.monthKey || (Number.isInteger(index) ? monthlyChartData[index]?.monthKey : null); if (month) setSelectedEarningsPoint({range:"monthly",key:month}); }}>
                  <defs>
                    <linearGradient id="yieldMonthlyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#30d991" stopOpacity={0.28}/>
                      <stop offset="100%" stopColor="#30d991" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#344454" opacity={0.35} strokeDasharray="3 4"/>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize:10,fill:"#91a1b2"}} interval="preserveStartEnd" />
                  <YAxis axisLine={false} tickLine={false} width={51} tick={{fontSize:10,fill:"#91a1b2"}} domain={[0,monthlyChartMax]} tickFormatter={v=>"$"+Number(v).toFixed(0)}/>
                  <Tooltip cursor={{stroke:"#30d991",strokeDasharray:"3 4"}} contentStyle={{background:"#111b27",border:"1px solid #33465a",borderRadius:10,fontSize:12}} formatter={(value,name,props)=>[formatCurrency(value),"Monthly income"]}/>
                  <Area type="monotone" dataKey="value" name="Monthly income" stroke="#30e69b" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" fill="url(#yieldMonthlyFill)"
                    dot={props => {
                      const monthKey = props?.payload?.monthKey;
                      if (!monthKey) return null;
                      return <circle cx={props.cx} cy={props.cy} r={6} fill="#30e69b"
                        stroke="#0c141e" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => setSelectedEarningsPoint({range:"monthly",key:monthKey})}/>;
                    }}
                    activeDot={props => {
                      const monthKey = props?.payload?.monthKey;
                      if (!monthKey) return null;
                      return <circle cx={props.cx} cy={props.cy} r={8} fill="#30e69b"
                        stroke="#0c141e" strokeWidth={2} style={{cursor:"pointer"}}
                        onClick={() => setSelectedEarningsPoint({range:"monthly",key:monthKey})}/>;
                    }}
                    isAnimationActive={false}>
                    <LabelList dataKey="value" position="top" offset={12} formatter={value => value == null ? "" : formatCurrency(value)} style={{fill:"#c7f9e5",fontSize:10,fontWeight:600}} />
                  </Area>
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-2xl border border-[#263342] bg-[#0b1017] p-4">
          <h2 className="text-[16px] font-semibold">Today's Earnings</h2>
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="flex h-36 w-36 items-center justify-center rounded-full" style={{background:`conic-gradient(#36e69b ${Math.max(0,Math.min(100,todayEarnings/Math.max(summary.monthlyYield/30.4375,0.01)*100))}%, #25313d 0)`}}>
              <div className="flex h-[79%] w-[79%] flex-col items-center justify-center rounded-full bg-[#0b1017]">
                <strong className="text-xl font-semibold tabular-nums">{formatCurrency(todayEarnings)}</strong>
                <span className="text-[10px] text-muted-foreground">Today so far</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">{formatCurrency(summary.monthlyYield / 30.4375)} estimated daily</p>
          </div>
          <div className="mt-4 rounded-xl border border-[#2b3848] bg-[#0e141c] px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-[12px] font-semibold">Where today's earnings came from</h3>
              <span className="text-[10px] text-muted-foreground">Net daily P/L</span>
            </div>
            {todayBreakdown.length ? (
              <div className="space-y-2">
                {todayBreakdown.map(source => (
                  <div key={source.name} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground">{source.name}</span>
                    <span className={`shrink-0 font-semibold tabular-nums ${source.amount < 0 ? "text-rose-400" : "text-emerald-400"}`}>{source.name === "Loopscale" && source.amount < 0.01
                      ? `${source.amount.toFixed(6)}`
                      : formatCurrency(source.amount)}</span>
                  </div>
                ))}
                {!todayBreakdown.some(source => source.name === "Loopscale") && (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 text-muted-foreground">Loopscale <span className="text-[10px] opacity-75">("awaiting increase")</span></span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">$0.000000</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-white/10 pt-2 text-xs">
                  <span className="font-medium">Total</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(todayEarnings)}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Loopscale ("awaiting increase")</span>
                  <span className="tabular-nums text-muted-foreground">$0.000000</span>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  No new increases recorded yet. Each source starts from its first observed balance; earlier amounts are not assumed to be earned today.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
      {syncError && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          One or more live sources could not refresh.
          {syncError
            ? ` ${syncError}`
            : ""}
        </div>
      )}

      <section className="space-y-2 rounded-2xl border border-[#252a32] bg-[#0b1017] p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-[15px] font-semibold">Projects ({activeProgramCards.length})</h2>
          <span className="text-[11px] text-muted-foreground">Sorted by balance · {activeProgramCards.length} projects</span>
        </div>
{activeProgramCards.length ===
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
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
  {activeProgramCards.map(
              (
                item
              ) => {

if (
  item.type ===
  "kryptex"
) {
  return (
    <KryptexProjectCard
      todayUsd={Number(dailySourceTotals["Kryptex"]) || 0}
      onDeactivate={() => deactivateProject(item.key)}
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
      todayUsd={Number(dailySourceTotals[project.platform]) || 0}
      onDeactivate={() => deactivateProject(item.key)}
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
      todayUsd={Number(dailySourceTotals["RollerCoin"]) || 0}
      onDeactivate={() => deactivateProject(item.key)}
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
      todayUsd={Number(dailySourceTotals["Salad"]) || 0}
      onDeactivate={() => deactivateProject(item.key)}
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
      todayUsd={Number(dailySourceTotals["Unetwork"]) || 0}
      onDeactivate={() => deactivateProject(item.key)}
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



      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.85fr)_minmax(290px,1fr)]">
        <section className="min-w-0 rounded-2xl border border-[#263342] bg-[#0b1017] px-4 py-3">
          <h2 className="mb-3 text-[13px] font-semibold">Projections</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {label:"Daily",amount:summary.annualYield/365,symbol:"D"},
              {label:"Weekly",amount:summary.annualYield/52.1775,symbol:"W"},
              {label:"Monthly",amount:summary.monthlyYield,symbol:"M"},
              {label:"Yearly",amount:summary.annualYield,symbol:"Y"},
            ].map(item => (
              <div key={item.label} className="min-w-0 rounded-xl border border-[#2b3848] bg-[#0e141c] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#23364b] text-[11px] font-bold text-[#a5c3d7]">{item.symbol}</span>
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted-foreground">{item.label}</div>
                    <div className="truncate text-[clamp(13px,1.2vw,19px)] font-semibold tabular-nums" title={formatCurrency(item.amount)}>{formatCurrency(item.amount)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="min-w-0 rounded-2xl border border-[#263342] bg-[#0b1017] px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">Connection Status</h2>
            <span className="text-[10px] text-muted-foreground">Latest sync</span>
          </div>
          <div className="space-y-1.5">
            {[
              {name:"RollerCoin", connected:rollerCoinConnected, synced:rollerCoinTracker?.lastSyncedAt},
              {name:"Loopscale", connected:Boolean(loopscaleSnapshot), synced:loopscaleSnapshot?.lastSyncedAt || loopscaleSnapshot?.syncedAt},
              {name:"Salad", connected:saladConnected, synced:saladTracker?.lastSyncedAt},
              {name:"Unetwork", connected:unetworkConnected, synced:unetworkTracker?.lastSyncedAt},
            ].map(item => (
              <div key={item.name} className="grid grid-cols-[minmax(0,1fr)_85px_95px] items-center gap-2 border-b border-white/5 py-1 text-[10px] last:border-b-0">
                <span className="truncate font-medium">{item.name}</span>
                <span className="truncate text-muted-foreground">{formatCompactSyncAge(item.synced)}</span>
                <span className={item.connected ? "text-emerald-400" : "text-amber-300"}>
                  ● {item.connected ? "Connected" : "Not connected"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
      {selectedBreakdown && earningsChartRange !== "daily" && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onMouseDown={event => { if (event.target === event.currentTarget) setSelectedEarningsPoint(null); }}>
          <div role="dialog" aria-modal="true" aria-label={`Earnings by project for ${selectedBreakdown.label}`}
            className="w-full max-w-[480px] rounded-2xl border border-[#33465a] bg-[#0b1017] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Earnings by project</h3>
                <p className="mt-1 text-xs text-muted-foreground">{selectedBreakdown.label}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{selectedBreakdown.note}</p>
              </div>
              <button type="button" onClick={() => setSelectedEarningsPoint(null)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-white/10" aria-label="Close earnings breakdown">
                <X className="h-4 w-4"/>
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {selectedBreakdown.entries.length ? selectedBreakdown.entries.map(item => (
                <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-muted-foreground">{item.name}</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(item.amount)}</span>
                </div>
              )) : <p className="text-sm text-muted-foreground">No recorded project earnings for this point.</p>}
              <div className="flex items-center justify-between border-t border-[#33465a] pt-3 text-sm font-semibold">
                <span>Total</span><span className="tabular-nums text-emerald-400">{formatCurrency(selectedBreakdown.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {historyOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" onMouseDown={event=>{if(event.target===event.currentTarget)setHistoryOpen(false)}}>
          <div role="dialog" aria-modal="true" aria-label="Monthly income history" className="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-3">
              <h2 className="text-base font-semibold">Monthly Income History</h2>
              <button type="button" aria-label="Close monthly history" onClick={()=>setHistoryOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-white/10"><X className="h-5 w-5"/></button>
            </div>
            <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
      <ProjectIncomeSection
        months={
          projectIncome
        }
        expenses={
          projectExpenses
        }
        onExpenseChange={(
          monthKey,
          amount
        ) => {
          setProjectExpenses(
            (current) => {
              const next = {
                ...current,
              };

              const normalizedAmount =
                Math.max(
                  0,
                  Number(
                    amount
                  ) || 0
                );

              if (
                normalizedAmount >
                0
              ) {
                next[
                  monthKey
                ] =
                  normalizedAmount;
              } else {
                delete next[
                  monthKey
                ];
              }

              saveProjectExpenses(
                next
              );

              return next;
            }
          );
        }}
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

            </div>
          </div>
        </div>
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
  compact = false,
}) {
  const stats =
    getPaybackStats(
      earned,
      dailyIncome,
      totalSpent
    );

  if (compact && !stats.configured) return null;

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

  if (compact) return (
    <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums ${profitable ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" : "border-amber-500/25 bg-amber-500/10 text-amber-300"}`}>
      P/L {stats.pnl >= 0 ? "+" : ""}{formatCurrency(stats.pnl)}
    </span>
  );

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
      <div className="flex flex-wrap items-start justify-between gap-3">
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

function formatCompactSyncAge(value) {
  if (!value) return "Waiting";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Waiting";
  const mins = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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
  onDeactivate,
  todayUsd = 0,
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
        bg-[#0e1218]
        shadow-sm
        transition-all
        duration-200
        hover:border-border
        hover:bg-[#151e28]
      "
    >
      <button
        type="button"
        onClick={
          onToggle
        }
        className="flex w-full flex-col px-3.5 py-2.5 text-left"
      >
        <div className="flex w-full min-w-0 items-start gap-2">
          <ProjectLogoButton platform={project.platform} logo={logo} onLogoChange={onLogoChange} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="min-w-0 truncate text-[12px] font-semibold">{project.platform}</span>
              <span className={`shrink-0 text-[9px] ${project.autoSynced ? "text-emerald-400" : "text-amber-300"}`}>
                ● {project.autoSynced ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[14px] font-semibold tabular-nums">{formatCurrency(project.totalBalance)}</div>
          </div>
          <ChevronRight className={`mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground ${collapsed ? "rotate-90" : ""}`}/>
        </div>
      </button>

      {!collapsed && (
        <ProjectDetailsModal title={project.platform} onClose={onToggle} projections={{ daily: projections.daily, monthly: projections.monthly, yearly: projections.yearly }} onDeactivate={onDeactivate}>
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
      </ProjectDetailsModal>
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
  onDeactivate,
  todayUsd = 0,
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
        bg-[#0e1218]
        shadow-sm
        transition-all
        duration-200
        hover:border-border
        hover:bg-[#151e28]
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
        className="flex w-full flex-col px-3.5 py-2.5 text-left"
      >
        <div className="flex w-full min-w-0 items-start gap-2">
          <ProjectLogoButton platform={"Unetwork"} logo={logo} onLogoChange={onLogoChange} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="min-w-0 truncate text-[12px] font-semibold">Unetwork</span>
              <span className={`shrink-0 text-[9px] ${connected ? "text-emerald-400" : "text-amber-300"}`}>
                ● {connected ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[14px] font-semibold tabular-nums">{formatCurrency(stats?.currentBalance)}</div>
          </div>
          <ChevronRight className={`mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground ${expanded ? "rotate-90" : ""}`}/>
        </div>
      </button>

      {expanded && (
        <ProjectDetailsModal title={"Unetwork"} onClose={() => setExpanded(false)} onDeactivate={onDeactivate} projections={{ daily: stats?.estimatedDailyUsd, monthly: stats?.estimatedMonthlyUsd, yearly: stats?.estimatedYearlyUsd }}>
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
                Available + pending
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
      </ProjectDetailsModal>
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
  onDeactivate,
  todayUsd = 0,
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
        bg-[#0e1218]
        shadow-sm
        transition-all
        duration-200
        hover:border-border
        hover:bg-[#151e28]
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
        className="flex w-full flex-col px-3.5 py-2.5 text-left"
      >
        <div className="flex w-full min-w-0 items-start gap-2">
          <ProjectLogoButton platform={"Salad"} logo={logo} onLogoChange={onLogoChange} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="min-w-0 truncate text-[12px] font-semibold">Salad</span>
              <span className={`shrink-0 text-[9px] ${connected ? "text-emerald-400" : "text-amber-300"}`}>
                ● {connected ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[14px] font-semibold tabular-nums">{formatCurrency(stats?.currentBalance)}</div>
          </div>
          <ChevronRight className={`mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground ${expanded ? "rotate-90" : ""}`}/>
        </div>
      </button>

      {expanded && (
        <ProjectDetailsModal title={"Salad"} onClose={() => setExpanded(false)} onDeactivate={onDeactivate} projections={{ daily: dailyIncome, monthly: monthlyIncome, yearly: yearlyIncome }}>
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
      </ProjectDetailsModal>
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
  onDeactivate,
  todayUsd = 0,
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
      bg-[#0e1218]
      shadow-sm
      transition-all
      duration-200
      hover:border-border
      hover:bg-[#151e28]
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
      className="flex w-full flex-col px-3.5 py-2.5 text-left"
    >
        <div className="flex w-full min-w-0 items-start gap-2">
          <ProjectLogoButton platform={"RollerCoin"} logo={logo} onLogoChange={onLogoChange} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="min-w-0 truncate text-[12px] font-semibold">RollerCoin</span>
              <span className={`shrink-0 text-[9px] ${connected ? "text-emerald-400" : "text-amber-300"}`}>
                ● {connected ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 tabular-nums"><span className="text-[14px] font-semibold">{formatCurrency(stats?.currentBalanceUsd)}</span><span className="text-[10px] text-muted-foreground">{Number(stats?.currentTrxBalance || 0).toFixed(2)} TRX</span></div>
          </div>
          <ChevronRight className={`mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground ${expanded ? "rotate-90" : ""}`}/>
        </div>
      </button>

    {expanded && (
        <ProjectDetailsModal title={"RollerCoin"} onClose={() => setExpanded(false)} onDeactivate={onDeactivate} projections={{ daily: dailyIncome, monthly: monthlyIncome, yearly: yearlyIncome }}>
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
    </ProjectDetailsModal>
      )}
  </div>
);
}

function ProjectDetailsModal({ title, onClose, onDeactivate, projections, children }) {
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} project details`}
        className="flex max-h-[min(740px,calc(100dvh-24px))] w-full max-w-[520px] min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-[11px] text-muted-foreground">Project details</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onDeactivate && (
              <button type="button" onClick={() => { onDeactivate(); onClose(); }} className="rounded-md border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground">Set inactive</button>
            )}
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title} details`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
          {projections && <div className="grid grid-cols-3 gap-2 border-b border-border/50 px-4 py-3">
            {[["Daily",projections.daily],["Monthly",projections.monthly],["Yearly",projections.yearly]].map(([label,value])=><div key={label} className="min-w-0 rounded-lg bg-white/[0.03] p-2"><p className="text-[10px] text-muted-foreground">{label} estimate</p><p className="mt-1 truncate text-xs font-semibold tabular-nums" title={formatCurrency(value)}>{formatCurrency(value)}</p></div>)}
          </div>}
          {children}
        </div>
      </div>
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
          h-9
          w-9
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

function ProjectIncomeSection({
  months,
  expenses,
  onExpenseChange,
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
      (monthKey) => {
        const incomeMonth =
          monthMap.get(
            monthKey
          ) || {
            monthKey,
            total: 0,
            platforms: [],
            locked:
              monthKey <
              currentMonthKey,
          };

        return {
          ...incomeMonth,
          expense:
            Math.max(
              0,
              Number(
                expenses?.[
                  monthKey
                ]
              ) || 0
            ),
        };
      }
    );

  const maxAmount =
    Math.max(
      1,
      ...chartMonths.flatMap(
        (month) => [
          Number(
            month.total
          ) || 0,
          Number(
            month.expense
          ) || 0,
        ]
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

  const yearlyExpenses =
    chartMonths.reduce(
      (
        total,
        month
      ) =>
        total +
        (
          Number(
            month.expense
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
    <section className="space-y-2 rounded-2xl border border-[#252a32] bg-[#0b1017] p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />

            <h2 className="text-[15px] font-semibold">
              Project Income
            </h2>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            Income earned across all tracked projects. Completed months are automatically locked.
          </p>

        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-8 items-center overflow-hidden rounded-lg border border-border/50 bg-white/[0.02]">
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
              className="flex h-full w-8 items-center justify-center text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
              aria-label="Previous year"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex h-full min-w-[65px] items-center justify-center border-x border-border/50 px-3 text-xs font-semibold tabular-nums">
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
              className="flex h-full w-8 items-center justify-center text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
              aria-label="Next year"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              {selectedYear} total
            </div>

            <div className="mt-0.5 text-[16px] font-semibold tabular-nums text-emerald-400">
              {formatCurrency(
                yearlyTotal
              )}
            </div>

            <div className="mt-0.5 text-[11px] font-medium tabular-nums text-rose-400">
              Expenses {formatCurrency(
                yearlyExpenses
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/35 px-2.5 pb-2 pt-2.5">
        {chartMonths.length ===
        0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            No tracked months for this year.
          </div>
        ) : (
          <div className="flex h-[clamp(112px,17vh,148px)] items-end gap-1 md:gap-2">
            {chartMonths.map(
              (month) => {
                const amount =
                  Number(
                    month.total
                  ) || 0;

                const expense =
                  Number(
                    month.expense
                  ) || 0;

                const incomeHeight =
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

                const expenseHeight =
                  expense > 0
                    ? Math.max(
                        12,
                        (
                          expense /
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
                    className="group flex min-w-0 flex-1 flex-col items-center justify-end rounded-lg px-0.5 pt-1 outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                  >
                    <div className="flex h-[clamp(84px,12vh,112px)] w-full items-end justify-center gap-1 md:gap-1.5">
                      <div className="flex h-full w-[44%] max-w-10 flex-col items-center justify-end">
                        <div className="mb-1 flex min-h-6 items-end justify-center gap-1 whitespace-nowrap text-[10px] font-semibold tabular-nums text-emerald-400 md:text-[11px]">
                          {formatCurrency(
                            amount
                          )}

                          {month.locked && (
                            <Lock className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                          )}
                        </div>

                        <div
                          className={`w-full rounded-t-md transition-all duration-200 ${
                            amount >
                            0
                              ? month.locked
                                ? "bg-emerald-400/45 group-hover:bg-emerald-400/65"
                                : "bg-emerald-400/75 group-hover:bg-emerald-400"
                              : "bg-white/[0.06] group-hover:bg-white/[0.10]"
                          }`}
                          style={{
                            height:
                              `${incomeHeight}%`,
                          }}
                          title={`Income: ${formatCurrency(
                            amount
                          )}`}
                        />
                      </div>

                      <div className="flex h-full w-[44%] max-w-10 flex-col items-center justify-end">
                        <div className="mb-1 flex min-h-6 items-end justify-center whitespace-nowrap text-[10px] font-semibold tabular-nums text-rose-400 md:text-[11px]">
                          {formatCurrency(
                            expense
                          )}
                        </div>

                        <div
                          className={`w-full rounded-t-md transition-all duration-200 ${
                            expense > 0
                              ? "bg-rose-500/75 group-hover:bg-rose-500"
                              : "bg-rose-500/10 group-hover:bg-rose-500/20"
                          }`}
                          style={{
                            height:
                              `${expenseHeight}%`,
                          }}
                          title={`Expenses: ${formatCurrency(
                            expense
                          )}`}
                        />
                      </div>
                    </div>

                    <div className="mt-1.5 text-[10px] font-medium text-muted-foreground transition group-hover:text-foreground md:text-xs">
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
          expense={
            Number(
              selectedMonth.expense
            ) || 0
          }
          onExpenseChange={
            onExpenseChange
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
  expense,
  onExpenseChange,
  projectLogos,
  onClose,
}) {
  const total =
    Number(
      month.total
    ) || 0;

  const [
    expenseInput,
    setExpenseInput,
  ] = useState(
    String(
      Number(
        expense
      ) || ""
    )
  );

  useEffect(
    () => {
      setExpenseInput(
        String(
          Number(
            expense
          ) || ""
        )
      );
    },
    [
      expense,
      month.monthKey,
    ]
  );

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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-4"
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
        className="flex max-h-[min(680px,calc(100dvh-24px))] w-full max-w-[440px] min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xl sm:max-h-[min(680px,calc(100dvh-32px))]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-base font-semibold">
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

          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground">
                Project income
              </div>

              <div className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-400">
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
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin] sm:p-4">
          <div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.05] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">
                  Monthly expenses
                </div>

                <div className="mt-0.5 max-w-[225px] text-[11px] leading-snug text-muted-foreground">
                  Equipment, fees, electricity and other project costs.
                </div>
              </div>

              <div className="w-28 shrink-0 sm:w-32">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Expense total
                </label>

                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    expenseInput
                  }
                  placeholder="0.00"
                  onChange={(
                    event
                  ) =>
                    setExpenseInput(
                      event.target.value
                    )
                  }
                  onBlur={() =>
                    onExpenseChange(
                      month.monthKey,
                      expenseInput
                    )
                  }
                  onKeyDown={(
                    event
                  ) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      event.preventDefault();

                      onExpenseChange(
                        month.monthKey,
                        expenseInput
                      );

                      event.currentTarget.blur();
                    }
                  }}
                  className="h-8 text-right text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-rose-500/15 pt-2 text-xs">
              <span className="text-muted-foreground">
                Net project income
              </span>

              <span
                className={`font-semibold tabular-nums ${
                  total -
                    (
                      Number(
                        expenseInput
                      ) || 0
                    ) >=
                  0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                {formatCurrency(
                  total -
                    (
                      Number(
                        expenseInput
                      ) || 0
                    )
                )}
              </span>
            </div>
          </div>

          {month.platforms.length ===
          0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No project income was recorded for this month.
            </div>
          ) : (
            <div className="space-y-1.5">
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
                      className="rounded-lg border border-border/50 bg-white/[0.02] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {getProjectIncomeLogo(
                            platform.platform,
                            projectLogos
                          ) ? (
                            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-border/60 bg-white/[0.04]">
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
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-white/[0.04] text-[10px] font-bold">
                              {getInitials(
                                platform.platform
                              )}
                            </div>
                          )}

                          <span className="truncate text-sm font-medium">
                            {
                              platform.platform
                            }
                          </span>
                        </div>

                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatCurrency(
                            platform.amount
                          )}
                        </span>
                      </div>

                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
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

                      <div className="mt-1 text-right text-[10px] tabular-nums text-muted-foreground">
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

function Metric({ label, value, icon: Icon }) {
  return (
    <div className="flex min-w-0 flex-col justify-center rounded-xl border border-[#2a3039] bg-[#0e141c] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
        <span className="leading-snug">{label}</span>
      </div>
      <div className="mt-1.5 min-w-0 text-[clamp(16px,1.4vw,21px)] font-semibold leading-tight tracking-tight tabular-nums break-words" title={value}>
        {value}
      </div>
    </div>
  );
}
