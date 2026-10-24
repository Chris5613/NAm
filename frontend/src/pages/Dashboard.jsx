import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { spendingApi } from "@/lib/apiClient";
import {
  useState,
  useEffect,
  useCallback,
} from "react";

import {
  netWorthApi,
  pricesApi,
} from "@/lib/api";

import {
  remoteStorage as localStorage,
} from "@/lib/serverStore";

import {
  localStorage as storage,
} from "@/lib/localStorage";

import { toast } from "sonner";

import CryptoBreakdown from "@/components/CryptoBreakdown";
import AssetBreakdown from "@/components/AssetBreakdown";
import AddAssetDialog from "@/components/AddAssetDialog";

import { Button } from "@/components/ui/button";

import {
  Plus,
  Camera,
  RefreshCw,
  TrendingUp,
  Bitcoin,
  WalletCards,
  Box,
  CreditCard,
  ChevronRight,
  ChevronDown,
  Search,
  ArrowUpRight,
  Download,
  Upload,
  X,
} from "lucide-react";

/* =========================================================
   STORAGE KEYS
========================================================= */

const DAILY_BASELINE_KEY =
  "daily_net_worth_baseline_pst";

const DAILY_CATEGORY_BASELINE_KEY =
  "daily_category_baseline_pst";

const MONTHLY_NET_WORTH_HISTORY_KEY =
  "monthly_net_worth_history_v2";

const LIVE_HISTORY_MAX_POINTS = 200;

// User-provided historical month-end net worth, January 2024 through February 2025.
// Chart-only records: never overwrite current holdings, balances, or saved snapshots.
const IMPORTED_NET_WORTH_HISTORY = [
  { date: "2024-01-01T12:00:00", value: 10782.51 },
  { date: "2024-02-01T12:00:00", value: 10693.68 },
  { date: "2024-03-01T12:00:00", value: 9528.58 },
  { date: "2024-04-01T12:00:00", value: 8632.42 },
  { date: "2024-05-01T12:00:00", value: 10896.34 },
  { date: "2024-06-01T12:00:00", value: 8972.98 },
  { date: "2024-07-01T12:00:00", value: 11405.74 },
  { date: "2024-08-01T12:00:00", value: 12575.42 },
  { date: "2024-09-01T12:00:00", value: 11304.91 },
  { date: "2024-10-01T12:00:00", value: 13220.50 },
  { date: "2024-11-01T12:00:00", value: 12834.66 },
  { date: "2024-12-01T12:00:00", value: 13600.00 },
  { date: "2025-01-01T12:00:00", value: 16027.94 },
  { date: "2025-02-01T12:00:00", value: 17568.45 },
];

/* =========================================================
   CATEGORY CONFIG
========================================================= */

const CATEGORY_CONFIG = {
  stocks: {
    label: "Stocks",
    shortLabel: "Stocks",
    icon: TrendingUp,
    color: "text-cyan-400",
    bar: "bg-cyan-400",
  },

  crypto: {
    label: "Crypto",
    shortLabel: "Crypto",
    icon: Bitcoin,
    color: "text-violet-400",
    bar: "bg-violet-400",
  },

  cash: {
    label: "Cash",
    shortLabel: "Cash",
    icon: WalletCards,
    color: "text-blue-400",
    bar: "bg-blue-400",
  },

  other: {
    label: "Other assets",
    shortLabel: "Other",
    icon: Box,
    color: "text-amber-400",
    bar: "bg-amber-400",
  },

  debts: {
    label: "Debts",
    shortLabel: "Debts",
    icon: CreditCard,
    color: "text-rose-400",
    bar: "bg-rose-400",
  },
};

/* =========================================================
   EXPORT
========================================================= */

const exportAllLocalStorage = () => {
  const backup = {};

  for (
    let i = 0;
    i < localStorage.length;
    i++
  ) {
    const key =
      localStorage.key(i);

    backup[key] =
      localStorage.getItem(
        key
      );
  }

  const blob = new Blob(
    [
      JSON.stringify(
        backup,
        null,
        2
      ),
    ],
    {
      type: "application/json",
    }
  );

  const url =
    URL.createObjectURL(
      blob
    );

  const a =
    document.createElement(
      "a"
    );

  a.href = url;

  a.download =
    "dashboard-backup.json";

  a.click();

  URL.revokeObjectURL(
    url
  );
};

/* =========================================================
   IMPORT
========================================================= */

const importAllLocalStorage = (
  event
) => {
  const file =
    event.target.files?.[0];

  if (!file) {
    return;
  }

  const reader =
    new FileReader();

  reader.onload = (e) => {
    try {
      const backup =
        JSON.parse(
          e.target.result
        );

      Object.entries(
        backup
      ).forEach(
        ([key, value]) => {
          localStorage.setItem(
            key,
            value
          );
        }
      );

      window.location.reload();
    } catch (error) {
      console.error(
        "Could not import backup:",
        error
      );

      toast.error(
        "Could not import JSON file"
      );
    }
  };

  reader.readAsText(
    file
  );
};

/* =========================================================
   DATE HELPERS
========================================================= */

function getPstDateKey(
  date = new Date()
) {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        "America/Los_Angeles",

      year: "numeric",

      month: "2-digit",

      day: "2-digit",
    }
  ).format(date);
}

function getMonthKey(
  date = new Date()
) {
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

function getMonthLabel(
  date = new Date()
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        "America/Los_Angeles",

      month: "short",

      year: "numeric",
    }
  ).format(date);
}

/* =========================================================
   CURRENCY
========================================================= */

function formatCurrency(
  value
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",

      currency: "USD",

      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    }
  ).format(
    Number(value) || 0
  );
}

/* =========================================================
   DAILY CATEGORY CHANGE
========================================================= */

function getCategoryDailyChanges(
  breakdown
) {
  const todayKey =
    getPstDateKey();

  let saved = null;

  try {
    saved = JSON.parse(
      localStorage.getItem(
        DAILY_CATEGORY_BASELINE_KEY
      ) || "null"
    );
  } catch {
    saved = null;
  }

  if (
    !saved ||
    saved.dateKey !==
      todayKey
  ) {
    const baseline = {
      stocks:
        breakdown?.stocks ||
        0,

      crypto:
        breakdown?.crypto ||
        0,

      cash:
        breakdown?.cash ||
        0,

      other:
        breakdown?.other ||
        0,

      debts:
        breakdown?.debts ||
        0,
    };

    localStorage.setItem(
      DAILY_CATEGORY_BASELINE_KEY,

      JSON.stringify({
        dateKey:
          todayKey,

        baseline,
      })
    );

    return {
      stocks: 0,

      crypto: 0,

      cash: 0,

      other: 0,

      debts: 0,
    };
  }

  return {
    stocks:
      (breakdown?.stocks ||
        0) -
      (saved.baseline
        ?.stocks || 0),

    crypto:
      (breakdown?.crypto ||
        0) -
      (saved.baseline
        ?.crypto || 0),

    cash:
      (breakdown?.cash ||
        0) -
      (saved.baseline
        ?.cash || 0),

    other:
      (breakdown?.other ||
        0) -
      (saved.baseline
        ?.other || 0),

    debts:
      (breakdown?.debts ||
        0) -
      (saved.baseline
        ?.debts || 0),
  };
}

/* =========================================================
   DAILY NET WORTH CHANGE
========================================================= */

function getDailyNetWorthChange(
  currentNetWorth
) {
  const todayKey =
    getPstDateKey();

  const value =
    Number(
      currentNetWorth
    ) || 0;

  if (value <= 0) {
    return {
      baseline: 0,

      change: 0,

      percentChange: 0,

      dateKey:
        todayKey,
    };
  }

  let saved = null;

  try {
    saved = JSON.parse(
      localStorage.getItem(
        DAILY_BASELINE_KEY
      ) || "null"
    );
  } catch {
    saved = null;
  }

  if (
    !saved ||
    saved.dateKey !==
      todayKey ||
    Number(
      saved.baseline
    ) <= 0
  ) {
    localStorage.setItem(
      DAILY_BASELINE_KEY,

      JSON.stringify({
        dateKey:
          todayKey,

        baseline:
          value,
      })
    );

    return {
      baseline:
        value,

      change: 0,

      percentChange: 0,

      dateKey:
        todayKey,
    };
  }

  const baseline =
    Number(
      saved.baseline
    ) || 0;

  const change =
    value -
    baseline;

  const percentChange =
    baseline !== 0
      ? (change /
          baseline) *
        100
      : 0;

  return {
    baseline,

    change,

    percentChange,

    dateKey:
      todayKey,
  };
}

/* =========================================================
   MONTHLY HISTORY

   Current month:
   - stays in the same chart position
   - value keeps updating

   When a new month starts:
   - previous month remains
   - a new chart point is created automatically
========================================================= */

function getMonthlyNetWorthHistory(
  currentNetWorth
) {
  const value =
    Number(
      currentNetWorth
    ) || 0;

  const monthKey =
    getMonthKey();

  const monthLabel =
    getMonthLabel();

  let saved = null;

  try {
    saved = JSON.parse(
      localStorage.getItem(
        MONTHLY_NET_WORTH_HISTORY_KEY
      ) || "null"
    );
  } catch {
    saved = null;
  }

  let history =
    Array.isArray(saved)
      ? saved
          .filter(
            (item) =>
              item &&
              typeof item.monthKey ===
                "string"
          )
          .map(
            (item) => ({
              monthKey:
                item.monthKey,

              month:
                item.month ||
                item.label ||
                item.time ||
                item.monthKey,

              value:
                Number(
                  item.value
                ) || 0,

              live:
                item.monthKey ===
                monthKey,
            })
          )
      : [];

  const currentIndex =
    history.findIndex(
      (item) =>
        item.monthKey ===
        monthKey
    );

  if (
    currentIndex >= 0
  ) {
    history =
      history.map(
        (
          item,
          index
        ) => ({
          ...item,

          live:
            index ===
            currentIndex,
        })
      );

    history[
      currentIndex
    ] = {
      ...history[
        currentIndex
      ],

      month:
        monthLabel,

      value,

      live: true,
    };
  } else {
    history = [
      ...history.map(
        (item) => ({
          ...item,

          live: false,
        })
      ),

      {
        monthKey,

        month:
          monthLabel,

        value,

        live: true,
      },
    ];
  }

  history.sort(
    (a, b) =>
      String(
        a.monthKey
      ).localeCompare(
        String(
          b.monthKey
        )
      )
  );

  localStorage.setItem(
    MONTHLY_NET_WORTH_HISTORY_KEY,

    JSON.stringify(
      history
    )
  );

  return history.map((item) =>
  item.monthKey === "2026-09"
    ? {
        ...item,
        value: (Number(item.value) || 0) + 0,
      }
    : item
);
}

/* =========================================================
   NET WORTH
========================================================= */

function calculateNetWorth(
  assets = [],
  cryptoTotal = 0
) {
  const breakdown = {
    stocks: 0,

    crypto:
      cryptoTotal,

    cash: 0,

    other: 0,

    debts: 0,
  };

  assets.forEach(
    (asset) => {
      const value =
        asset.category !==
          "stocks" &&
        asset.manual_value !=
          null
          ? Number(
              asset.manual_value
            ) || 0
          : (Number(
              asset.quantity
            ) || 0) *
            (Number(
              asset.current_price
            ) || 0);

      if (
        asset.category ===
        "debts"
      ) {
        breakdown.debts +=
          value;
      } else if (
        breakdown[
          asset.category
        ] !== undefined
      ) {
        breakdown[
          asset.category
        ] += value;
      }
    }
  );

  const total_net_worth =
    breakdown.stocks +
    breakdown.crypto +
    breakdown.cash +
    breakdown.other -
    breakdown.debts;

  return {
    total_net_worth,

    breakdown,

    asset_count:
      assets.length,
  };
}

/* =========================================================
   ALLOCATION BAR
========================================================= */

function AllocationBar({
  category,
  value,
  maxValue,
}) {
  const config =
    CATEGORY_CONFIG[
      category
    ];

  const Icon =
    config.icon;

  const width =
    maxValue > 0
      ? Math.max(
          4,

          (Math.abs(
            value
          ) /
            maxValue) *
            100
        )
      : 0;

  return (
    <div className="flex items-center gap-4">
      <Icon
        className={`h-5 w-5 shrink-0 ${config.color}`}
        strokeWidth={
          1.8
        }
      />

      <div className="min-w-0 flex-1">
        <div
          className="
            mb-1.5
            flex
            items-center
            justify-between
            gap-3
          "
        >
          <span className="text-sm text-foreground">
            {
              config.shortLabel
            }
          </span>

          <span className="text-sm font-medium text-foreground">
            {formatCurrency(
              value
            )}
          </span>
        </div>

        <div
          className="
            h-2
            overflow-hidden
            rounded-full
            bg-secondary
          "
        >
          <div
            className={`h-full rounded-full ${config.bar}`}
            style={{
              width:
                `${width}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   HOLDING ROW
========================================================= */

function HoldingRow({
  category,
  value,
  subtitle,
  dailyChange = 0,
  onClick,
}) {
  const config =
    CATEGORY_CONFIG[
      category
    ];

  const Icon =
    config.icon;

  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className="
        group
        flex
        w-full
        items-center
        gap-5
        border-t
        border-border/40
        px-6
        py-4
        text-left
        transition-colors
        hover:bg-white/[0.03]
        focus:outline-none
        focus-visible:bg-white/[0.04]
      "
    >
      <div className="flex w-11 justify-center">
        <Icon
          className={`h-6 w-6 ${config.color}`}
          strokeWidth={
            1.8
          }
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {
            config.label
          }
        </p>

        <p className="mt-0.5 text-sm text-muted-foreground">
          {subtitle}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-lg font-medium text-foreground">
          {category ===
          "debts"
            ? "−"
            : ""}

          {formatCurrency(
            Math.abs(
              value
            )
          )}
        </p>

        <p
          className={`mt-1 text-xs font-medium tabular-nums ${
            dailyChange > 0
              ? "text-emerald-400"
              : dailyChange < 0
                ? "text-rose-400"
                : "text-muted-foreground"
          }`}
        >
          {dailyChange > 0
            ? "+"
            : dailyChange < 0
              ? "−"
              : ""}

          {formatCurrency(
            Math.abs(
              dailyChange
            )
          )}{" "}
          today
        </p>
      </div>

      <ChevronRight
        className="
          h-5
          w-5
          text-muted-foreground
          transition
          group-hover:translate-x-0.5
          group-hover:text-foreground
        "
      />
    </button>
  );
}

/* =========================================================
   MONTHLY NET WORTH MINI CHART
========================================================= */

function MonthlyNetWorthMiniChart({
  history = [],
}) {
  const points =
    Array.isArray(history)
      ? history
          .filter(
            (item) =>
              item &&
              Number.isFinite(
                Number(
                  item.value
                )
              )
          )
          .slice(-6)
      : [];

  if (!points.length) {
    return (
      <div className="flex h-[145px] items-center justify-center text-xs text-muted-foreground">
        Waiting for monthly history…
      </div>
    );
  }

  const width = 720;
  const height = 245;
  const padX = 42;
  const padTop = 34;
  const padBottom = 34;

  const values =
    points.map(
      (item) =>
        Number(
          item.value
        ) || 0
    );

  const minValue =
    Math.min(
      ...values
    );

  const maxValue =
    Math.max(
      ...values
    );

  const range =
    Math.max(
      1,
      maxValue -
        minValue
    );

  const chartPoints =
    points.map(
      (
        item,
        index
      ) => {
        const x =
          points.length ===
          1
            ? width / 2
            : padX +
              (
                index /
                (
                  points.length -
                  1
                )
              ) *
                (
                  width -
                  padX * 2
                );

        const usableHeight =
          height -
          padTop -
          padBottom;

        const normalized =
          (
            (
              Number(
                item.value
              ) || 0
            ) -
            minValue
          ) /
          range;

        const y =
          maxValue ===
          minValue
            ? padTop +
              usableHeight /
                2
            : padTop +
              (
                1 -
                normalized
              ) *
                usableHeight;

        return {
          ...item,
          x,
          y,
        };
      }
    );

  const polylinePoints =
    chartPoints
      .map(
        (point) =>
          `${point.x},${point.y}`
      )
      .join(" ");

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[245px] w-full overflow-visible"
        role="img"
        aria-label="Monthly net worth history"
      >
        <line
          x1={padX}
          y1={
            height -
            padBottom
          }
          x2={
            width -
            padX
          }
          y2={
            height -
            padBottom
          }
          stroke="currentColor"
          className="text-border/50"
          strokeWidth="1"
        />

        {chartPoints.length >
          1 && (
          <polyline
            points={
              polylinePoints
            }
            fill="none"
            stroke="#22d3ee"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {chartPoints.map(
          (point) => (
            <g
              key={
                point.monthKey
              }
            >
              {point.live && (
                <circle
                  cx={
                    point.x
                  }
                  cy={
                    point.y
                  }
                  r="9"
                  fill="rgba(34, 211, 238, 0.15)"
                  stroke="#22d3ee"
                  strokeWidth="1"
                />
              )}

              <circle
                cx={
                  point.x
                }
                cy={
                  point.y
                }
                r={
                  point.live
                    ? 5
                    : 4
                }
                fill="#22d3ee"
              />

              <text
                x={
                  point.x
                }
                y={
                  Math.max(
                    12,
                    point.y -
                      12
                  )
                }
                textAnchor="middle"
                fill="currentColor"
                className="text-foreground"
                fontSize="10"
                fontWeight={
                  point.live
                    ? "700"
                    : "500"
                }
              >
                {formatCurrency(
                  point.value
                )}
              </text>

              <text
                x={
                  point.x
                }
                y={
                  height - 8
                }
                textAnchor="middle"
                fill="currentColor"
                className="text-muted-foreground"
                fontSize="10"
              >
                {
                  String(
                    point.month ||
                      point.monthKey
                  ).split(
                    " "
                  )[0]
                }
              </text>
            </g>
          )
        )}
      </svg>
    </div>
  );
}

/* =========================================================
   DASHBOARD
========================================================= */

export default function Dashboard() {
  const [
    assets,
    setAssets,
  ] = useState([]);
  const [chartRange, setChartRange] = useState("1M");
  const [cashMonth, setCashMonth] = useState(() => new Date().toISOString().slice(0,7));
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankTransactions, setBankTransactions] = useState([]);
  useEffect(() => {
    let mounted = true;
    Promise.all([spendingApi.accounts(), spendingApi.transactions()]).then(([accounts, transactions]) => {
      if (mounted) { setBankAccounts(Array.isArray(accounts) ? accounts : []); setBankTransactions(Array.isArray(transactions) ? transactions : []); }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);


  const [
    netWorth,
    setNetWorth,
  ] = useState(null);

  const [
    history,
    setHistory,
  ] = useState([]);

  const [
    liveHistory,
    setLiveHistory,
  ] = useState(() => {
    const persisted =
      storage.getLiveHistory?.();

    return Array.isArray(
      persisted
    )
      ? persisted
      : [];
  });

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    activeTab,
    setActiveTab,
  ] = useState(
    "all"
  );

  const [
    addDialogOpen,
    setAddDialogOpen,
  ] = useState(
    false
  );

  const [
    lastUpdated,
    setLastUpdated,
  ] = useState(
    null
  );

  const [
    dailyNetWorthChange,
    setDailyNetWorthChange,
  ] = useState(
    null
  );

  const [
    dailyCategoryChanges,
    setDailyCategoryChanges,
  ] = useState(
    null
  );

  const [
    refreshingPrices,
    setRefreshingPrices,
  ] = useState(
    false
  );

  const [
    holdingSearch,
    setHoldingSearch,
  ] = useState("");

  const [
    detailsModalOpen,
    setDetailsModalOpen,
  ] = useState(
    false
  );

  const [
    selectedCategory,
    setSelectedCategory,
  ] = useState(
    null
  );

  /* =======================================================
     LIVE HISTORY
  ======================================================= */

  useEffect(() => {
    if (
      !Array.isArray(
        liveHistory
      )
    ) {
      return;
    }

    const trimmed =
      liveHistory.slice(
        -LIVE_HISTORY_MAX_POINTS
      );

    storage.setLiveHistory?.(
      trimmed
    );
  }, [
    liveHistory,
  ]);

  /* =======================================================
     FETCH
  ======================================================= */

  const fetchData =
    useCallback(
      async () => {
        try {
          const storedAssets =
            storage.getAssets?.() ||
            [];

          const cryptoCache =
            storage.getCryptoCache?.() ||
            {};

          /*
           * Project Income is the source of truth for the
           * active-project portfolio balance.
           *
           * cryptoCache.total can contain stale project
           * values, so rebuild Crypto from:
           *
           *   Project Income Portfolio + Bitcoin
           */
          const projectIncomeSummary =
            storage.get?.(
              "project_income_portfolio_summary_v1"
            ) || null;

          const projectIncomeBalance =
            Number(
              projectIncomeSummary
                ?.portfolioBalance
            );

          const bitcoinBalance =
            Number(
              cryptoCache
                ?.projectPortfolio
                ?.bitcoin
                ?.value ??
              cryptoCache
                ?.projectPortfolio
                ?.bitcoin
                ?.balance
            ) || 0;

          const cachedCryptoTotal =
            Number(
              cryptoCache.total
            ) || 0;

          const cryptoTotal =
            Number.isFinite(
              projectIncomeBalance
            )
              ? (
                  projectIncomeBalance +
                  bitcoinBalance
                )
              : cachedCryptoTotal;

          /*
           * Repair the shared crypto cache too so every
           * Net Worth surface reads the same total.
           */
          if (
            Number.isFinite(
              projectIncomeBalance
            ) &&
            Math.abs(
              cachedCryptoTotal -
                cryptoTotal
            ) > 0.005
          ) {
            storage.setCryptoCache?.({
              ...cryptoCache,

              total:
                cryptoTotal,

              updated_at:
                new Date().toISOString(),
            });
          }

          const calculatedNetWorth =
            calculateNetWorth(
              storedAssets,

              cryptoTotal
            );

          const categoryChanges =
            getCategoryDailyChanges(
              calculatedNetWorth.breakdown
            );

          const monthlyHistory =
            getMonthlyNetWorthHistory(
              calculatedNetWorth.total_net_worth
            );

          const dailyChange =
            getDailyNetWorthChange(
              calculatedNetWorth.total_net_worth
            );

          setAssets(
            storedAssets
          );

          setNetWorth(
            calculatedNetWorth
          );

          setDailyNetWorthChange(
            dailyChange
          );

          setDailyCategoryChanges(
            categoryChanges
          );

          setHistory(
            monthlyHistory
          );

          setLastUpdated(
            new Date()
          );

          setLiveHistory(
            (previous) => {
              if (
                previous.length ===
                0
              ) {
                return [
                  {
                    timestamp:
                      new Date().toISOString(),

                    value:
                      calculatedNetWorth.total_net_worth,
                  },
                ];
              }

              return previous;
            }
          );
        } catch (
          error
        ) {
          console.error(
            error
          );

          toast.error(
            "Failed to load data"
          );
        } finally {
          setLoading(
            false
          );
        }
      },

      []
    );

  useEffect(() => {
    fetchData();

    const refreshFromProjectIncome =
      () => {
        fetchData();
      };

    /*
     * Keep the parent Net Worth Crypto total synchronized
     * with the Project Income balance and Bitcoin cache.
     */
    window.addEventListener(
      "project-income-portfolio-balance-updated",
      refreshFromProjectIncome
    );

    window.addEventListener(
      "project-crypto-updated",
      refreshFromProjectIncome
    );

    const interval =
      setInterval(
        () => {
          fetchData();
        },

        10 *
          60 *
          1000
      );

    return () => {
      clearInterval(
        interval
      );

      window.removeEventListener(
        "project-income-portfolio-balance-updated",
        refreshFromProjectIncome
      );

      window.removeEventListener(
        "project-crypto-updated",
        refreshFromProjectIncome
      );
    };
  }, [
    fetchData,
  ]);

  /* =======================================================
     ESC CLOSE MODAL
  ======================================================= */

  useEffect(() => {
    if (
      !detailsModalOpen
    ) {
      return;
    }

    const handleKeyDown =
      (
        event
      ) => {
        if (
          event.key ===
          "Escape"
        ) {
          setDetailsModalOpen(
            false
          );
        }
      };

    window.addEventListener(
      "keydown",

      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",

        handleKeyDown
      );
    };
  }, [
    detailsModalOpen,
  ]);

  /* =======================================================
     SNAPSHOT
  ======================================================= */

  const handleSnapshot =
    async () => {
      try {
        await netWorthApi.saveSnapshot();

        const historyRes =
          await netWorthApi.getHistory();

        if (
          Array.isArray(
            historyRes?.data
          )
        ) {
          setHistory(
            historyRes.data
          );
        }

        toast.success(
          "Snapshot saved"
        );
      } catch (
        error
      ) {
        console.error(
          error
        );

        toast.error(
          "Failed to save snapshot"
        );
      }
    };

  /* =======================================================
     CREATED
  ======================================================= */

  const handleAssetCreated =
    () => {
      setAddDialogOpen(
        false
      );

      fetchData();
    };

  /* =======================================================
     REFRESH
  ======================================================= */

  const handleRefreshPrices =
    useCallback(
      async () => {
        setRefreshingPrices(
          true
        );

        try {
          const result =
            await pricesApi.refreshAll();

          await fetchData();

          toast.success(
            result?.updatedCount >
              0
              ? `Updated ${result.updatedCount} asset prices`
              : "Prices are already up to date"
          );
        } catch (
          error
        ) {
          console.error(
            error
          );

          toast.error(
            "Failed to refresh prices"
          );
        } finally {
          setRefreshingPrices(
            false
          );
        }
      },

      [
        fetchData,
      ]
    );

  const handleAssetUpdated =
    () =>
      fetchData();

  const handleAssetDeleted =
    () =>
      fetchData();

  /* =======================================================
     MODAL
  ======================================================= */

  const openCategoryModal =
    (
      category
    ) => {
      setSelectedCategory(
        category
      );

      setDetailsModalOpen(
        true
      );
    };

  const closeCategoryModal =
    () => {
      setDetailsModalOpen(
        false
      );
    };

  /* =======================================================
     LOADING
  ======================================================= */

  if (
    loading
  ) {
    return (
      <div
        className="
          flex
          min-h-[70vh]
          items-center
          justify-center
        "
        data-testid="loading-spinner"
      >
        <div className="animate-pulse font-mono text-sm text-muted-foreground">
          Loading...
        </div>
      </div>
    );
  }

  /* =======================================================
     DATA
  ======================================================= */

  const breakdown =
    netWorth?.breakdown || {
      stocks: 0,

      crypto: 0,

      cash: 0,

      other: 0,

      debts: 0,
    };

  const totalNetWorth =
    netWorth
      ?.total_net_worth ||
    0;

  const allocationCategories =
    [
      "stocks",

      "crypto",

      "cash",

      "other",

      "debts",
    ];

  const maxAllocation =
    Math.max(
      ...allocationCategories.map(
        (
          category
        ) =>
          Math.abs(
            breakdown[
              category
            ] || 0
          )
      ),

      1
    );

  const assetCounts = {
    stocks:
      assets.filter(
        (
          asset
        ) =>
          asset.category ===
          "stocks"
      ).length,

    cash:
      assets.filter(
        (
          asset
        ) =>
          asset.category ===
          "cash"
      ).length,

    other:
      assets.filter(
        (
          asset
        ) =>
          asset.category ===
          "other"
      ).length,

    debts:
      assets.filter(
        (
          asset
        ) =>
          asset.category ===
          "debts"
      ).length,
  };

  const holdingRows = [
    {
      category:
        "stocks",

      value:
        breakdown.stocks,

      subtitle: `${
        assetCounts.stocks
      } ${
        assetCounts.stocks ===
        1
          ? "account"
          : "accounts"
      }`,

      dailyChange:
        dailyCategoryChanges
          ?.stocks || 0,
    },

    {
      category:
        "crypto",

      value:
        breakdown.crypto,

      subtitle:
        "Projects and Bitcoin",

      dailyChange:
        dailyCategoryChanges
          ?.crypto || 0,
    },

    {
      category:
        "cash",

      value:
        breakdown.cash,

      subtitle: `${
        assetCounts.cash
      } ${
        assetCounts.cash ===
        1
          ? "account"
          : "accounts"
      }`,

      dailyChange:
        dailyCategoryChanges
          ?.cash || 0,
    },

    {
      category:
        "other",

      value:
        breakdown.other,

      subtitle: `${
        assetCounts.other
      } ${
        assetCounts.other ===
        1
          ? "asset"
          : "assets"
      }`,

      dailyChange:
        dailyCategoryChanges
          ?.other || 0,
    },

    {
      category:
        "debts",

      value:
        breakdown.debts,

      subtitle: `${
        assetCounts.debts
      } ${
        assetCounts.debts ===
        1
          ? "account"
          : "accounts"
      }`,

      dailyChange:
        dailyCategoryChanges
          ?.debts || 0,
    },
  ];

  const filteredHoldingRows =
    holdingRows.filter(
      (
        row
      ) => {
        if (
          activeTab !==
            "all" &&
          row.category !==
            activeTab
        ) {
          return false;
        }

        if (
          !holdingSearch.trim()
        ) {
          return true;
        }

        const query =
          holdingSearch
            .trim()
            .toLowerCase();

        return (
          CATEGORY_CONFIG[
            row.category
          ].label
            .toLowerCase()
            .includes(
              query
            ) ||
          row.subtitle
            .toLowerCase()
            .includes(
              query
            )
        );
      }
    );

  const todayChange =
    dailyNetWorthChange
      ?.change || 0;

  const todayPositive =
    todayChange >= 0;

  const currentMonth =
    history.find(
      (
        item
      ) =>
        item.monthKey ===
        getMonthKey()
    );

  /* =======================================================
     UI
  ======================================================= */

  const now = new Date();
  const rangeDays = { "1W": 7, "1M": 30, "3M": 90, YTD: Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / 86400000) + 1 };
  const cutoff = new Date(now.getTime() - (rangeDays[chartRange] || 36500) * 86400000);
  const livePoints = (liveHistory || []).map(p => ({ date: new Date(p.timestamp || p.date || p.time), value: Number(p.value) })).filter(p => Number.isFinite(p.date.getTime()) && Number.isFinite(p.value));
  const monthPoints = (history || []).map(p => ({ date: new Date(p.monthKey ? p.monthKey + "-01T12:00:00" : (p.timestamp || p.date || p.time)), value: Number(p.value ?? p.total_net_worth) })).filter(p => Number.isFinite(p.date.getTime()) && Number.isFinite(p.value));
  const existingMonths = new Set([...monthPoints, ...livePoints].map(p => `${p.date.getFullYear()}-${String(p.date.getMonth()+1).padStart(2,"0")}`));
  const importedPoints = IMPORTED_NET_WORTH_HISTORY.filter(p => !existingMonths.has(p.date.slice(0,7))).map(p => ({date:new Date(p.date),value:p.value}));
  const combined = [...importedPoints, ...monthPoints, ...livePoints, {date:now,value:totalNetWorth}].filter(p => chartRange === "ALL" || p.date >= cutoff).sort((a,b) => a.date-b.date);
  const netChart = combined.map(p => ({ label: p.date.toLocaleDateString("en-US", {month:"short",day:"numeric"}), value:p.value }));
  const [cashYear, cashMonthNum] = cashMonth.split("-").map(Number);
  const days = new Date(cashYear, cashMonthNum, 0).getDate();
  const cashDays = Array.from({length:days}, (_,i) => ({day:String(i+1),income:0,expenses:0}));
  bankTransactions.filter(t => t.date?.startsWith(cashMonth)).forEach(t => {
    const day = Number(t.date.slice(-2));
    if (day < 1 || day > days) return;
    const amount = Math.abs(Number(t.amount || 0));
    if (t.category === "Income") cashDays[day-1].income += amount;
    else if (!["Transfers","Payments"].includes(t.category)) cashDays[day-1].expenses += amount;
  });
  const incomeTotal = cashDays.reduce((sum,d) => sum+d.income,0);
  const expenseTotal = cashDays.reduce((sum,d) => sum+d.expenses,0);
  const card = "rounded-xl border border-border/50 bg-card p-4";
  const monthTitle = new Date(cashYear,cashMonthNum-1,1).toLocaleDateString("en-US",{month:"long",year:"numeric"});
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 pb-4" data-testid="dashboard">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-xl font-semibold tracking-tight" data-testid="page-title">Financial overview</h1><p className="mt-1 text-sm text-muted-foreground">Your wealth, accounts and cash flow at a glance.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={handleRefreshPrices} disabled={refreshingPrices}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button><Button onClick={() => setAddDialogOpen(true)}><Plus className="mr-2 h-4 w-4"/>Add asset</Button></div>
      </header>
      <div className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr] lg:items-stretch">
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Net Worth</h2><p className="mt-0.5 text-2xl font-semibold tracking-tight">{formatCurrency(totalNetWorth)}</p><p className={`mt-2 text-sm ${todayPositive ? "text-emerald-400" : "text-rose-400"}`}>{todayPositive?"+":"−"}{formatCurrency(Math.abs(todayChange))} today</p></div>
          <div className="flex rounded-lg border border-border/60 p-1">{["1W","1M","3M","YTD","ALL"].map(r => <button key={r} type="button" onClick={() => setChartRange(r)} className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${chartRange===r?"bg-secondary text-foreground":"text-muted-foreground hover:text-foreground"}`}>{r}</button>)}</div></div>
        <div className="mt-4 h-[190px] w-full">{netChart.length > 0 ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={netChart}><defs><linearGradient id="dashboardNetFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#ffffff10" vertical={false}/><XAxis dataKey="label" tick={{fill:"#94a3b8",fontSize:11}} minTickGap={30}/><YAxis tick={{fill:"#94a3b8",fontSize:11}} width={65} tickFormatter={v=>"$"+Math.round(v/1000)+"k"} domain={["auto","auto"]}/><Tooltip formatter={v=>formatCurrency(v)} contentStyle={{background:"#101419",border:"1px solid #30363d",borderRadius:10}}/><Area dataKey="value" type="monotone" stroke="#3b82f6" fill="url(#dashboardNetFill)" strokeWidth={3} dot={netChart.length < 3 ? {r:4,fill:"#3b82f6"} : false}/></AreaChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No net worth history recorded for this period yet.</div>}</div>
      </section>
        <section className={card}><div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold">Accounts</h2><span className="text-xs text-muted-foreground">{bankAccounts.length} connected</span></div><p className="text-xs text-muted-foreground">Connected account balances</p><p className="mt-1 text-2xl font-semibold">{formatCurrency(bankAccounts.reduce((sum,a)=>sum+Number(a.currentBalance ?? 0),0))}</p><div className="mt-4 divide-y divide-border/40">{bankAccounts.length ? bankAccounts.map((a,i)=><div key={a.id||i} className="flex items-center justify-between gap-3 py-2.5"><div className="flex min-w-0 items-center gap-3"><WalletCards className="h-5 w-5 shrink-0 text-blue-400"/><span className="truncate text-sm">{a.name||a.displayName||a.institution||"Account"}</span></div><span className="shrink-0 text-sm font-medium tabular-nums">{a.currentBalance == null ? "Balance unavailable" : formatCurrency(a.currentBalance)}</span></div>):<p className="py-6 text-sm text-muted-foreground">No connected accounts yet. Connect accounts from the Spending page.</p>}</div></section>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr] lg:items-stretch">
<section className={card}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Cash Flow</h2><input type="month" value={cashMonth} onChange={e=>setCashMonth(e.target.value)} className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-foreground"/></div><p className="mt-1 text-xs text-muted-foreground">{monthTitle}</p><div className="mt-4 grid grid-cols-3 gap-3"><div><p className="text-xs text-muted-foreground">Income</p><p className="mt-1 text-xl font-semibold text-emerald-400">{formatCurrency(incomeTotal)}</p></div><div><p className="text-xs text-muted-foreground">Expenses</p><p className="mt-1 text-xl font-semibold">{formatCurrency(expenseTotal)}</p></div><div><p className="text-xs text-muted-foreground">Net Cash Flow</p><p className={`mt-1 text-xl font-semibold ${incomeTotal-expenseTotal>=0?"text-emerald-400":"text-rose-400"}`}>{formatCurrency(incomeTotal-expenseTotal)}</p></div></div><div className="mt-4 h-[145px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={cashDays} barGap={1}><XAxis dataKey="day" tick={{fill:"#94a3b8",fontSize:10}} minTickGap={18}/><YAxis tick={{fill:"#94a3b8",fontSize:10}} width={45} tickFormatter={v=>"$"+v}/><Tooltip contentStyle={{background:"#101419",border:"1px solid #30363d",borderRadius:10}} formatter={v=>formatCurrency(v)}/><Bar dataKey="income" name="Income" fill="#34d399" radius={[2,2,0,0]}/><Bar dataKey="expenses" name="Expenses" fill="#f472b6" radius={[2,2,0,0]}/></BarChart></ResponsiveContainer></div><div className="mt-1 flex gap-5 text-xs text-muted-foreground"><span>🟢 Income</span><span>● Expenses</span></div></section>
<section className={card}><h2 className="text-lg font-semibold">Asset Allocation</h2><div className="mt-4 space-y-3">{["stocks","crypto","cash","other","debts"].map(category=><button type="button" key={category} onClick={()=>openCategoryModal(category)} className="block w-full text-left"><AllocationBar category={category} value={breakdown[category]||0} maxValue={maxAllocation}/></button>)}</div></section>
      </div>
      {/* =================================================
          DETAILS MODAL
      ================================================= */}

      {detailsModalOpen &&
        selectedCategory && (
<div
  className="
    fixed
    inset-0
    z-40
    flex
    items-center
    justify-center
    bg-black/75
    p-4
    backdrop-blur-sm
  "
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeCategoryModal();
              }
            }}
          >
            <div
              className="
                flex
                max-h-[88vh]
                w-full
                max-w-5xl
                flex-col
                overflow-hidden
                rounded-lg
                border
                border-border/60
                bg-card
                shadow-2xl
              "
              role="dialog"
              aria-modal="true"
              aria-labelledby="holding-details-title"
            >
              {/* HEADER */}

              <div
                className="
                  flex
                  shrink-0
                  items-center
                  justify-between
                  border-b
                  border-border/40
                  px-6
                  py-5
                "
              >
                <div className="flex items-center gap-4">
                  {(() => {
                    const Icon =
                      CATEGORY_CONFIG[
                        selectedCategory
                      ].icon;

                    return (
                      <div
                        className="
                          flex
                          h-11
                          w-11
                          items-center
                          justify-center
                          rounded-md
                          bg-secondary
                        "
                      >
                        <Icon
                          className={`h-6 w-6 ${
                            CATEGORY_CONFIG[
                              selectedCategory
                            ].color
                          }`}
                          strokeWidth={
                            1.8
                          }
                        />
                      </div>
                    );
                  })()}

                  <div>
                    <h2
                      id="holding-details-title"
                      className="
                        text-xl
                        font-semibold
                        text-foreground
                      "
                    >
                      {
                        CATEGORY_CONFIG[
                          selectedCategory
                        ].label
                      }
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedCategory ===
                      "crypto"
                        ? "Projects and Bitcoin"
                        : selectedCategory ===
                            "other"
                          ? `${assetCounts.other} ${
                              assetCounts.other ===
                              1
                                ? "asset"
                                : "assets"
                            }`
                          : `${
                              assetCounts[
                                selectedCategory
                              ] ||
                              0
                            } ${
                              assetCounts[
                                selectedCategory
                              ] ===
                              1
                                ? "account"
                                : "accounts"
                            }`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <p className="hidden text-xl font-semibold text-foreground sm:block">
                    {selectedCategory ===
                    "debts"
                      ? "−"
                      : ""}

                    {formatCurrency(
                      Math.abs(
                        breakdown[
                          selectedCategory
                        ] || 0
                      )
                    )}
                  </p>

                  <button
                    type="button"
                    onClick={
                      closeCategoryModal
                    }
                    className="
                      flex
                      h-10
                      w-10
                      items-center
                      justify-center
                      rounded-md
                      text-muted-foreground
                      transition-colors
                      hover:bg-secondary
                      hover:text-foreground
                    "
                    aria-label="Close details"
                  >
                    <X
                      className="h-5 w-5"
                      strokeWidth={
                        1.8
                      }
                    />
                  </button>
                </div>
              </div>

              {/* MOBILE TOTAL */}

              <div className="border-b border-border/40 px-6 py-4 sm:hidden">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total
                </p>

                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {selectedCategory ===
                  "debts"
                    ? "−"
                    : ""}

                  {formatCurrency(
                    Math.abs(
                      breakdown[
                        selectedCategory
                      ] || 0
                    )
                  )}
                </p>
              </div>

              {/* CONTENT */}

              <div
                className="
                  min-h-0
                  flex-1
                  overflow-y-auto
                  p-6
                "
              >
                {selectedCategory ===
                "crypto" ? (
                  <CryptoBreakdown
                    key="modal-crypto"
                    defaultOpen
                    dailyChange={
                      dailyCategoryChanges
                        ?.crypto ||
                      0
                    }
                  />
                ) : (
<AssetBreakdown
  key={`modal-${selectedCategory}`}
  category={selectedCategory}
  assets={assets}
  onUpdate={handleAssetUpdated}
  onDelete={handleAssetDeleted}
  defaultOpen
  hideSummary
  dailyChange={
    dailyCategoryChanges?.[
      selectedCategory
    ] || 0
  }
/>
                )}
              </div>
            </div>
          </div>
        )}

      {/* =================================================
          ADD ASSET
      ================================================= */}

      <AddAssetDialog
        open={
          addDialogOpen
        }
        onOpenChange={
          setAddDialogOpen
        }
        onCreated={
          handleAssetCreated
        }
        defaultCategory={
          selectedCategory ===
            "other" ||
          selectedCategory ===
            "debts"
            ? selectedCategory
            : "other"
        }
        allowStocks
      />

      {/* Keeps lastUpdated alive without displaying it */}

      {lastUpdated && (
        <span className="hidden">
          {
            lastUpdated.toISOString()
          }
        </span>
      )}
    </div>
  );
}
