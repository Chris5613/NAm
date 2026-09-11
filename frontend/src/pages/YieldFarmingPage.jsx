import { useCallback, useEffect, useMemo, useState } from "react";
import { remoteStorage } from "@/lib/serverStore";
import { projectsApi } from "@/lib/api";
import { getRatexPtonycSnapshot } from "@/lib/ratexYieldSync";
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
const MONTHLY_SNAPSHOT_KEY = "yield_monthly_snapshots_v1";
const RATEX_HISTORY_KEY = "yield_ratex_position_history_v1";
const SALAD_TRACKER_KEY = "project_income_salad_tracker_v1";
const ROLLERCOIN_TRACKER_KEY = "project_income_rollercoin_tracker_v2";

const MONTHLY_TRACKING_START = "2026-09";
const ROLLERCOIN_HISTORICAL_TRX = 69.123738;

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

  const exactMonthUsd =
    Object.entries(
      tracker?.daily ||
        {}
    ).reduce(
      (
        sum,
        [
          date,
          amount,
        ]
      ) =>
        String(
          date
        ).slice(
          0,
          7
        ) ===
        currentMonth
          ? sum +
            (
              Number(
                amount
              ) || 0
            )
          : sum,
      0
    );

  const monthUsd =
    exactMonthUsd > 0
      ? exactMonthUsd
      : Number(
          tracker?.monthlyEarnings?.[
            currentMonth
          ]
        ) || 0;

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

  const estimatedDailyUsd =
    monthUsd /
    currentDay;

  return {
    currentBalance,
    lifetimeUsd,
    monthUsd,
    withdrawals:
      Number(
        tracker?.withdrawals
      ) || 0,
    estimatedDailyUsd,
    estimatedMonthlyUsd:
      estimatedDailyUsd *
      30.4375,
    estimatedYearlyUsd:
      estimatedDailyUsd *
      365,
    lastSyncedAt:
      tracker?.lastSyncedAt ||
      null,
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
          entry?.trx ?? entry?.sol
        ) || 0;

      lifetimeUsd +=
        usd;

      lifetimeTrx +=
        trx;

      if (
        String(date).slice(
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

  lifetimeTrx +=
    ROLLERCOIN_HISTORICAL_TRX;

  if (
    liveTrxPrice > 0
  ) {
    todayUsd =
      todayTrx *
      liveTrxPrice;

    monthUsd =
      monthTrx *
      liveTrxPrice;

    lifetimeUsd =
      lifetimeTrx *
      liveTrxPrice;
  } else {
    const trackedLifetimeTrx =
      lifetimeTrx -
      ROLLERCOIN_HISTORICAL_TRX;

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

function createLuloProjectCard(
  project
) {
  const assets = [];

  const totalBalance =
    Number(
      project.lulo_total_balance_usd
    ) || 0;

  const usdcBalance =
    Number(
      project.lulo_usdc_balance_usd
    ) || 0;

  const protectedBalance =
    Number(
      project.lulo_protected_balance_usd
    ) || 0;

  const savedUsdsBalance =
    Number(
      project.lulo_usds_balance_usd
    ) || 0;

  const derivedUsdsBalance =
    Math.max(
      0,
      totalBalance -
        usdcBalance -
        protectedBalance
    );

  const usdsBalance =
    savedUsdsBalance >
    0
      ? savedUsdsBalance
      : derivedUsdsBalance;

  if (
    usdsBalance >
    0
  ) {
    assets.push({
      id: `lulo-usds-${project.id}`,
      asset: "USDS",
      strategy:
        "Lending",
      balance:
        usdsBalance,
      quantity:
        usdsBalance,
      price: 1,
      apy:
        Number(
          project.lulo_usds_apy
        ) ||
        Number(
          project.lulo_weighted_apy
        ) ||
        0,
      sourceLabel:
        "Lulo",
    });
  }

  if (
    usdcBalance >
    0
  ) {
    assets.push({
      id: `lulo-usdc-${project.id}`,
      asset: "USDC",
      strategy:
        "Lending",
      balance:
        usdcBalance,
      quantity:
        usdcBalance,
      price: 1,
      apy:
        Number(
          project.lulo_regular_apy
        ) || 0,
      sourceLabel:
        "Lulo",
    });
  }

  if (
    protectedBalance >
    0
  ) {
    assets.push({
      id: `lulo-protected-${project.id}`,
      asset:
        "Protected",
      strategy:
        "Protected Lending",
      balance:
        protectedBalance,
      quantity:
        protectedBalance,
      price: 1,
      apy:
        Number(
          project.lulo_protected_apy
        ) || 0,
      sourceLabel:
        "Lulo",
    });
  }

  if (
    !assets.length &&
    totalBalance >
      0
  ) {
    assets.push({
      id: `lulo-total-${project.id}`,
      asset:
        "Stablecoins",
      strategy:
        "Lending",
      balance:
        totalBalance,
      quantity: null,
      price: null,
      apy:
        Number(
          project.lulo_weighted_apy
        ) || 0,
      sourceLabel:
        "Lulo",
    });
  }

  return {
    id: `lulo-project-${project.id}`,
    platform:
      "Lulo",
    autoSynced:
      true,
    totalBalance,
    weightedApy:
      Number(
        project.lulo_weighted_apy
      ) || 0,
    earned:
      Number(
        project.lulo_lifetime_interest_usd
      ) ||
      Number(
        project.earned
      ) ||
      0,
    lastSyncedAt:
      project.lulo_last_synced_at ||
      null,
    assets,
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
  snapshot
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

  const asset = {
    id:
      getRatexPositionKey(
        snapshot
      ),
    asset:
      "PTONyc",
    allocationSymbol:
      "ONyc",
    strategy:
      "Fixed Yield",
    balance:
      Number(
        snapshot.currentValueUsd
      ) || 0,
    quantity:
      Number(
        snapshot.quantity
      ) || 0,
    price:
      Number(
        snapshot.priceUsd
      ) || 0,
    apy:
      Number(
        snapshot.fixedApy
      ) || 0,
    maturity:
      snapshot.maturity,
    maturityValueUsd:
      Number(
        snapshot.maturityValueUsd
      ) || 0,
    projectedProfitUsd:
      Number(
        snapshot.projectedProfitUsd
      ) || 0,
    remainingYieldUsd:
      Number(
        snapshot.remainingYieldUsd
      ) || 0,
    daysRemaining,
    sourceLabel:
      "RateX",
  };

  return {
    id: `ratex-project-${getRatexPositionKey(
      snapshot
    )}`,
    platform:
      "RateX",
    autoSynced:
      true,
    totalBalance:
      asset.balance,
    weightedApy:
      asset.apy,
    earned:
      Number(
        snapshot.earnedUsd
      ) || 0,
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

  const earnedUsd =
    Number(
      snapshot.earnedUsd
    ) || 0;

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
      };

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

    next.positions[
      key
    ] = {
      ...previous,
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
          snapshot.costBasisUsd
        ) ||
        Number(
          previous.costBasisUsd
        ) ||
        0,
      quantity,
      finalQuantity:
        quantity,
      lastValueUsd:
        Number(
          snapshot.currentValueUsd
        ) || 0,
      maturityValueUsd:
        Number(
          snapshot.maturityValueUsd
        ) || 0,
      lastEarnedUsd:
        earnedUsd,
      projectedProfitUsd:
        Number(
          snapshot.projectedProfitUsd
        ) || 0,
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

function buildProjectIncome(
  luloProjects,
  ratexHistory,
  saladTracker,
  monthlyBackfills,
  rollerCoinTracker
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

          addEarning(
            monthKey,
            "Lulo",
            amount
          );
        }
      );

      const projectBackfills =
        monthlyBackfills?.[
          String(
            project.id
          )
        ] || {};

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

  Object.entries(
    rollerCoinTracker?.daily ||
      {}
  ).forEach(
    ([
      date,
      entry,
    ]) => {
      addEarning(
        getMonthKey(
          date
        ),
        "RollerCoin",
        Number(
          entry?.usd
        ) || 0
      );
    }
  );

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

export default function YieldFarmingPage() {
  const [
    manualPositions,
    setManualPositions,
  ] = useState(
    loadPositions
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

        if (
          !rows.length
        ) {
          setRollerCoinSyncing(
            false
          );

          setRollerCoinMessage(
            "RollerCoin returned no earnings for that date range."
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

            return {
              ...current,
              daily:
                nextDaily,
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
      },
      []
    );

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

      const now =
        new Date();

      const monthKey =
        getCurrentMonthKey();

      if (
        monthKey <
        MONTHLY_TRACKING_START
      ) {
        return;
      }

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

              const existing =
                next[
                  projectKey
                ] || {};

              if (
                Object.prototype.hasOwnProperty.call(
                  existing,
                  monthKey
                )
              ) {
                return;
              }

              const tracked =
                getTrackedLuloMonthEarnings(
                  project,
                  monthKey
                );

              const estimate =
                estimateLuloMonthToDate(
                  project,
                  now
                );

              const lifetimeInterest =
                Number(
                  project.lulo_lifetime_interest_usd
                ) || 0;

              let targetMonthEarned =
                estimate;

              if (
                lifetimeInterest >
                0
              ) {
                targetMonthEarned =
                  Math.min(
                    estimate,
                    lifetimeInterest
                  );
              }

              targetMonthEarned =
                Math.max(
                  tracked,
                  targetMonthEarned
                );

              const backfill =
                Math.max(
                  0,
                  targetMonthEarned -
                    tracked
                );

              next[
                projectKey
              ] = {
                ...existing,
                [monthKey]:
                  Number(
                    backfill.toFixed(
                      6
                    )
                  ),
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
                  ] = value;
                }
              }
            );

            const monthlyEarnings = {
              ...(
                current?.monthlyEarnings ||
                {}
              ),
            };

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

            const previousLifetime =
              Number(
                current?.lastLifetimeBalance
              ) || 0;

            const previousBalance =
              Number(
                current?.lastBalance
              ) || 0;

            const earnedDelta =
              current?.initialized
                ? Math.max(
                    0,
                    lifetimeBalance -
                      previousLifetime
                  )
                : 0;

            if (
              !Object.keys(
                incomingDaily
              ).length
            ) {
              if (
                !current?.initialized
              ) {
                monthlyEarnings[
                  monthKey
                ] =
                  Number(
                    Math.max(
                      Number(
                        monthlyEarnings[
                          monthKey
                        ]
                      ) || 0,
                      currentBalance
                    ).toFixed(
                      6
                    )
                  );
              } else if (
                earnedDelta > 0
              ) {
                monthlyEarnings[
                  monthKey
                ] =
                  Number(
                    (
                      (
                        Number(
                          monthlyEarnings[
                            monthKey
                          ]
                        ) || 0
                      ) +
                      earnedDelta
                    ).toFixed(
                      6
                    )
                  );
              }
            }

            const expectedBalance =
              previousBalance +
              earnedDelta;

            const withdrawalDelta =
              current?.initialized
                ? Math.max(
                    0,
                    expectedBalance -
                      currentBalance
                  )
                : 0;

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
              lastWithdrawalAt:
                withdrawalDelta >
                0.000001
                  ? syncedAt
                  : current?.lastWithdrawalAt ||
                    null,
              withdrawals:
                Number(
                  (
                    (
                      Number(
                        current?.withdrawals
                      ) || 0
                    ) +
                    withdrawalDelta
                  ).toFixed(
                    6
                  )
                ),
              monthlyEarnings,
              daily,
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

        requestSaladLatest();

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
        requestSaladLatest,
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

  const projectCards =
    useMemo(
      () => {
        const autoProjects =
          luloProjects.map(
            createLuloProjectCard
          );

        const ratexProject =
          createRatexProjectCard(
            ratexSnapshot
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
          ...manualProjects,
        ];
      },
      [
        luloProjects,
        ratexSnapshot,
        manualPositions,
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
          saladTracker,
          monthlyBackfills,
          rollerCoinTracker
        ),
      [
        luloProjects,
        ratexHistory,
        saladTracker,
        monthlyBackfills,
        rollerCoinTracker,
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
        const portfolioBalance =
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

        const annualYield =
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
              ) *
                (
                  (
                    Number(
                      asset.apy
                    ) || 0
                  ) /
                  100
                ),
            0
          ) +
          365 +
          (
            Number(
              saladStats?.estimatedYearlyUsd
            ) || 0
          );

        const weightedApy =
          portfolioBalance >
          0
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
              portfolioBalance
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
          );

        return {
          portfolioBalance,
          weightedApy,
          annualYield,
          activePositions:
            projectCards.length +
            1 +
            (
              saladTracker?.initialized
                ? 1
                : 0
            ),
          totalEarned,
        };
      },
      [
        allAssets,
        projectCards,
        rollerCoinStats,
        saladStats,
        saladTracker,
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
              summary.annualYield / 12
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
        {projectCards.length ===
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
          <div className="space-y-4">
            {projectCards.map(
              (project) => (
                <ProjectCard
                  key={
                    project.id
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
                />
              )
            )}

            <RollerCoinProjectCard
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
            />

            <SaladProjectCard
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
            />
          </div>
        )}
      </section>

      {completedRatexPositions.length >
        0 && (
        <CompletedPositionsSection
          positions={
            completedRatexPositions
          }
        />
      )}

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
      />
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
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/45 shadow-sm">
      <button
        type="button"
        onClick={
          onToggle
        }
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ProjectLogoButton
            platform={
              project.platform
            }
            logo={
              logo
            }
            onLogoChange={
              onLogoChange
            }
          />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold">
                {
                  project.platform
                }
              </h3>

              {project.autoSynced && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400">
                  <Wifi className="h-3 w-3" />
                  Live
                </span>
              )}
            </div>

            <div className="mt-0.5 text-xs text-muted-foreground">
              1 position
              {project.autoSynced &&
              project.lastSyncedAt
                ? ` · synced ${formatSyncTime(
                    project.lastSyncedAt
                  )}`
                : ""}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">
            {formatCurrency(
              project.totalBalance
            )}
          </div>
        </div>
      </button>

      {!collapsed && (
        <ProjectPositionsSection
          project={
            project
          }
          onDeletePosition={
            onDeletePosition
          }
        />
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
}) {
  const [
    expanded,
    setExpanded,
  ] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/45 shadow-sm">
      <button
        type="button"
        onClick={() =>
          setExpanded(
            (value) =>
              !value
          )
        }
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ProjectLogoButton
            platform="Salad"
            logo={
              logo
            }
            onLogoChange={
              onLogoChange
            }
          />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold">
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
                {connected
                  ? "LIVE"
                  : "OFFLINE"}
              </span>
            </div>

            <div className="mt-0.5 text-xs text-muted-foreground">
              1 position
              {tracker?.lastSyncedAt
                ? ` · synced ${formatSyncTime(
                    tracker.lastSyncedAt
                  )}`
                : ""}
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-2xl font-semibold tabular-nums">
            {formatCurrency(
              stats?.lifetimeUsd
            )}
          </div>

          <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {formatCurrency(
              stats?.currentBalance
            )}{" "}
            available
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-5 pb-5 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
}) {
  const [
    expanded,
    setExpanded,
  ] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/45 shadow-sm">
      <button
        type="button"
        onClick={() =>
          setExpanded(
            (current) =>
              !current
          )
        }
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ProjectLogoButton
            platform="RollerCoin"
            logo={
              logo
            }
            onLogoChange={
              onLogoChange
            }
          />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold">
                RollerCoin
              </h3>

              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400">
                <Wifi className="h-3 w-3" />
                LIVE
              </span>
            </div>

            <div className="mt-0.5 text-xs text-muted-foreground">
              1 position
              {tracker?.lastSyncedAt
                ? ` · synced ${formatSyncTime(
                    tracker.lastSyncedAt
                  )}`
                : ""}
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-2xl font-semibold tabular-nums">
            {formatCurrency(
              stats?.lifetimeUsd
            )}
          </div>

          <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {(Number(
              stats?.lifetimeTrx
            ) || 0).toFixed(10)} TRX
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-5 pb-5 pt-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
            <label className="space-y-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                From
              </span>

              <input
                type="date"
                value={
                  from
                }
                onChange={(event) =>
                  onFromChange(
                    event.target.value
                  )
                }
                className="h-10 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-sm outline-none transition focus:border-orange-400/60"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                To
              </span>

              <input
                type="date"
                value={
                  to
                }
                max={
                  getTodayKey()
                }
                onChange={(event) =>
                  onToChange(
                    event.target.value
                  )
                }
                className="h-10 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-sm outline-none transition focus:border-orange-400/60"
              />
            </label>

            <div className="flex items-end">
              <Button
                type="button"
                onClick={
                  onSync
                }
                disabled={
                  syncing
                }
                className="h-10 min-w-32"
              >
                {syncing
                  ? "Syncing…"
                  : "Sync earnings"}
              </Button>
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={
                  onRefresh
                }
                className="h-10"
              >
                Refresh
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>
              {message ||
                (connected
                  ? authenticated
                    ? rollerCoinOpen
                      ? "Ready to sync. Re-syncing the same dates replaces those dates instead of double-counting."
                      : "Auth is saved. Open RollerCoin in a tab before starting a new date-range sync."
                    : "Open RollerCoin once so the extension can capture your auth token."
                  : "Reload the updated extension, then refresh this page.")}
            </span>

            {tracker?.lastRange?.from &&
              tracker?.lastRange?.to && (
                <span className="tabular-nums">
                  Last range {tracker.lastRange.from} → {tracker.lastRange.to}
                </span>
              )}
          </div>
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
        className="flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-white/[0.04] text-xs font-bold tracking-tight transition hover:border-border hover:bg-white/[0.08]"
      >
        {logo ? (
          <img
            src={
              logo
            }
            alt={`${platform} logo`}
            className="h-full w-full object-cover"
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
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-white/[0.04] text-[10px] font-bold">
                            {getInitials(
                              platform.platform
                            )}
                          </div>

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

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {coins.map(
          (
            coin,
            index
          ) => (
            <div
              key={
                coin.symbol
              }
              className="flex items-center gap-1.5"
            >
              <span
                className={`h-2 w-2 rounded-full ${getCoinColor(
                  coin.symbol,
                  index
                )}`}
              />

              <span>
                {
                  coin.symbol
                }
              </span>

              <span className="tabular-nums">
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