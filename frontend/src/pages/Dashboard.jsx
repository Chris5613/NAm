import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar } from "recharts";
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

// User-confirmed historical monthly net worth, January 2025 through May 2026.
// Chart-only records: never overwrite current holdings, balances, or saved snapshots.
const IMPORTED_NET_WORTH_HISTORY = [
  { date: "2025-01-01T12:00:00", value: 10782.51 },
  { date: "2025-02-01T12:00:00", value: 10693.68 },
  { date: "2025-03-01T12:00:00", value: 9528.58 },
  { date: "2025-04-01T12:00:00", value: 8632.42 },
  { date: "2025-05-01T12:00:00", value: 10896.34 },
  { date: "2025-06-01T12:00:00", value: 8972.98 },
  { date: "2025-07-01T12:00:00", value: 11405.74 },
  { date: "2025-08-01T12:00:00", value: 12575.42 },
  { date: "2025-09-01T12:00:00", value: 11304.91 },
  { date: "2025-10-01T12:00:00", value: 13220.50 },
  { date: "2025-11-01T12:00:00", value: 12834.66 },
  { date: "2025-12-01T12:00:00", value: 11257.05 },
  { date: "2026-01-01T12:00:00", value: 13684.99 },
  { date: "2026-02-01T12:00:00", value: 15225.50 },
  { date: "2026-03-01T12:00:00", value: 16233.31 },
  { date: "2026-04-01T12:00:00", value: 17271.75 },
  { date: "2026-05-01T12:00:00", value: 17491.19 },
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

              // Do not turn missing historical values into a fabricated $0.
              value: item.value,

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

  return history;
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
  const [chartRange, setChartRange] = useState("ALL");
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
  // Imported 2025–2026 monthly values are user-confirmed history.
  // Ignore duplicate snapshots for those months rather than replacing them.
  // Outside that known history, preserve genuine numeric zeros and discard
  // missing/invalid values (Number(null) and Number("") both become zero).
  const parseHistoricalValue = raw => {
    if (raw == null || typeof raw === "boolean" || (typeof raw === "string" && raw.trim() === "")) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const toHistoryPoint = (dateInput, rawValue) => {
    if (dateInput == null || dateInput === "") return null;
    const date = new Date(dateInput);
    const value = parseHistoricalValue(rawValue);
    return Number.isFinite(date.getTime()) && value !== null ? { date, value } : null;
  };
  const importedMonths = new Set(IMPORTED_NET_WORTH_HISTORY.map(p => p.date.slice(0, 7)));
  const isImportedMonth = point => importedMonths.has(`${point.date.getFullYear()}-${String(point.date.getMonth() + 1).padStart(2, "0")}`);
  const livePoints = (liveHistory || [])
    .map(p => p && toHistoryPoint(p.timestamp || p.date || p.time, p.value))
    .filter(p => p && !isImportedMonth(p));
  const monthPoints = (history || [])
    .map(p => p && toHistoryPoint(p.monthKey ? p.monthKey + "-01T12:00:00" : (p.timestamp || p.date || p.time), p.value ?? p.total_net_worth))
    .filter(p => p && !isImportedMonth(p));
  const importedPoints = IMPORTED_NET_WORTH_HISTORY.map(p => toHistoryPoint(p.date, p.value)).filter(Boolean);
  const currentPoint = toHistoryPoint(now, totalNetWorth);
  // A previously persisted May 9, 2026 zero snapshot is not a verified
  // portfolio valuation. Hide that exact point on the chart only; leave all
  // underlying server-backed history and other legitimate zero values intact.
  const isUnverifiedMay9Zero = point =>
    point.value === 0 &&
    point.date.getFullYear() === 2026 &&
    point.date.getMonth() === 4 &&
    point.date.getDate() === 9;
  const combined = [...importedPoints, ...monthPoints, ...livePoints, ...(currentPoint ? [currentPoint] : [])]
    .filter(p => !isUnverifiedMay9Zero(p) && (chartRange === "ALL" || p.date >= cutoff))
    .sort((a,b) => a.date-b.date);
  // Space recorded observations evenly so unrecorded months do not make a
  // large empty horizontal interval. Dates remain unchanged in tooltips.
  const netChart = combined.map(p => ({ dateKey: p.date.toISOString(), value: p.value }));
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
  const card = "min-w-0 overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-[0_8px_24px_rgba(0,0,0,0.08)]";
  const monthTitle = new Date(cashYear, cashMonthNum - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const bankTotal = bankAccounts.reduce((sum, account) => sum + Number(account.currentBalance ?? 0), 0);
  const sortedBankAccounts = [...bankAccounts].sort((a, b) => {
    const balanceA = a.currentBalance == null ? -Infinity : Number(a.currentBalance);
    const balanceB = b.currentBalance == null ? -Infinity : Number(b.currentBalance);
    return (Number.isFinite(balanceB) ? balanceB : -Infinity) - (Number.isFinite(balanceA) ? balanceA : -Infinity);
  });
  const netCashFlow = incomeTotal - expenseTotal;
  const chartTooltipStyle = { background: "#17191d", border: "1px solid #30343b", borderRadius: 10, color: "#f1f5f9", fontSize: 12 };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-3 pb-7" data-testid="dashboard">
      <header className="flex flex-wrap items-center justify-between gap-4 pb-1">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight" data-testid="page-title">Hi Christian</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleRefreshPrices} disabled={refreshingPrices} className="h-9 border-border/60 bg-card px-3 text-xs">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh
          </Button>
          <Button size="sm" onClick={() => setAddDialogOpen(true)} className="h-9 px-3 text-xs">
            <Plus className="mr-1.5 h-3.5 w-3.5" />Add asset
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-[13px] lg:grid-cols-[minmax(0,1.75fr)_minmax(300px,1fr)]">
        <section className={card} aria-label="Net worth">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Net worth</h2>
            <span className="text-[10px] text-muted-foreground">Total portfolio</span>
          </div>
          <div className="px-4 pt-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <p className="text-[clamp(24px,2.2vw,30px)] font-semibold leading-none tracking-tight tabular-nums">{formatCurrency(totalNetWorth)}</p>
              <span className={`text-xs font-medium tabular-nums ${todayPositive ? "text-emerald-400" : "text-rose-400"}`}>
                {todayPositive ? "+" : "−"}{formatCurrency(Math.abs(todayChange))} today
              </span>
            </div>
            <div className="mt-2 h-[clamp(155px,19vh,190px)] w-full">
              {netChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={netChart} margin={{ top: 8, right: 2, bottom: 0, left: 2 }}>
                    <defs>
                      <linearGradient id="dashboardNetFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38a5df" stopOpacity={0.19} />
                        <stop offset="100%" stopColor="#38a5df" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="dateKey" type="category" axisLine={false} tickLine={false} tick={{ fill: "#78828d", fontSize: 10 }} minTickGap={30} dy={8} tickFormatter={dateKey => new Date(dateKey).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip formatter={value => formatCurrency(value)} labelFormatter={dateKey => new Date(dateKey).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} contentStyle={chartTooltipStyle} />
                    <Area dataKey="value" type="monotone" stroke="#38a5df" fill="url(#dashboardNetFill)" strokeWidth={2.25} dot={netChart.length < 3 ? { r: 2.5, fill: "#38a5df" } : false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No net worth history recorded for this period yet.</div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-4 py-2.5">
            <span className="text-[11px] text-muted-foreground">{netChart.length < 3 ? `${netChart.length} recorded ${netChart.length === 1 ? "value" : "values"} in this range` : "Net worth history · recorded values spaced evenly"}</span>
            <div className="flex items-center gap-0.5 rounded-lg bg-background/70 p-0.5" aria-label="Net worth time range">
              {["1W", "1M", "3M", "YTD", "ALL"].map(range => (
                <button key={range} type="button" onClick={() => setChartRange(range)}
                  aria-pressed={chartRange === range}
                  className={`min-w-9 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-colors ${chartRange === range ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}>
                  {range}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className={card} aria-label="Connected accounts">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Accounts</h2>
            <span className="text-[10px] text-muted-foreground">{bankAccounts.length} connected</span>
          </div>
          <div className="px-4 pb-2 pt-3">
            <p className="text-[11px] text-muted-foreground">Connected account balances</p>
            <p className="mt-1 text-[23px] font-semibold leading-tight tracking-tight tabular-nums">{formatCurrency(bankTotal)}</p>
            <div className="mt-2 divide-y divide-border/35">
              {sortedBankAccounts.length ? sortedBankAccounts.map((account, index) => (
                <div key={account.id || index} className="flex min-w-0 items-center justify-between gap-3 py-2 transition-colors hover:bg-white/[0.015]">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <WalletCards className="h-4 w-4 shrink-0 text-sky-400/80" />
                    <span className="truncate text-[12px]">{account.name || account.displayName || account.institution || "Account"}</span>
                  </div>
                  <span className="shrink-0 text-[12px] font-medium tabular-nums">
                    {account.currentBalance == null ? "Unavailable" : formatCurrency(account.currentBalance)}
                  </span>
                </div>
              )) : <p className="py-5 text-xs text-muted-foreground">No connected accounts yet. Connect accounts from the Spending page.</p>}
            </div>
          </div>
        </section>

        <section className={card} aria-label="Cash flow">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-4 py-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Cash flow</h2>
            <input type="month" aria-label="Cash flow month" value={cashMonth} onChange={event => setCashMonth(event.target.value)}
              className="max-w-full rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-foreground" />
          </div>
          <div className="px-4 pb-3 pt-3">
            <p className="text-[11px] text-muted-foreground">{monthTitle}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 border-b border-border/30 pb-3">
              <div className="min-w-0"><p className="text-[11px] text-muted-foreground">Income</p><p className="mt-1 text-[clamp(14px,1.5vw,21px)] font-semibold tabular-nums text-emerald-400">{formatCurrency(incomeTotal)}</p></div>
              <div className="min-w-0"><p className="text-[11px] text-muted-foreground">Expenses</p><p className="mt-1 text-[clamp(14px,1.5vw,21px)] font-semibold tabular-nums">{formatCurrency(expenseTotal)}</p></div>
              <div className="min-w-0"><p className="text-[11px] text-muted-foreground">Net cash flow</p><p className={`mt-1 text-[clamp(14px,1.5vw,21px)] font-semibold tabular-nums ${netCashFlow >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{formatCurrency(netCashFlow)}</p></div>
            </div>
            <div className="mt-2 h-[132px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashDays} barGap={1} margin={{ top: 6, right: 0, bottom: 0, left: -10 }}>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#78828d", fontSize: 10 }} minTickGap={18} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#78828d", fontSize: 10 }} width={48} tickFormatter={value => "$" + value} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={value => formatCurrency(value)} />
                  <Bar dataKey="income" name="Income" fill="#36b990" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#d97a9b" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center gap-5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#36b990]" />Income</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#d97a9b]" />Expenses</span>
            </div>
          </div>
        </section>

        <section className={card} aria-label="Asset allocation">
          <div className="border-b border-border/40 px-4 py-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Asset allocation</h2>
          </div>
          <div className="space-y-2 px-4 py-3">
            {["stocks", "crypto", "cash", "other", "debts"].map(category => (
              <button key={category} type="button" onClick={() => openCategoryModal(category)}
                className="block w-full rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-secondary/35"
                aria-label={`View ${category} allocation details`}>
                <AllocationBar category={category} value={breakdown[category] || 0} maxValue={maxAllocation} />
              </button>
            ))}
          </div>
        </section>
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
