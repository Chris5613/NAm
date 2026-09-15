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
   DASHBOARD
========================================================= */

export default function Dashboard() {
  const [
    assets,
    setAssets,
  ] = useState([]);

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

          const cryptoTotal =
            Number(
              cryptoCache.total
            ) || 0;

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

    const interval =
      setInterval(
        () => {
          fetchData();
        },

        10 *
          60 *
          1000
      );

    return () =>
      clearInterval(
        interval
      );
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
    },

    {
      category:
        "crypto",

      value:
        breakdown.crypto,

      subtitle:
        "Projects and Bitcoin",
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

  return (
    <div
      className="
        mx-auto
        w-full
        max-w-[1600px]
        space-y-5
        pb-10
      "
      data-testid="dashboard"
    >
      {/* =================================================
          HEADER
      ================================================= */}

      <header
        className="
          flex
          flex-col
          justify-between
          gap-5
          xl:flex-row
          xl:items-start
        "
      >
        <div>
          <h1
            className="
              text-[38px]
              font-semibold
              leading-none
              tracking-[-0.03em]
              text-foreground
            "
            data-testid="page-title"
          >
            Net Worth
          </h1>

          <p className="mt-2 text-lg text-muted-foreground">
            Your wealth at a
            glance
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* ACTIONS */}

          <details className="group relative">
            <summary
              className="
                flex
                h-12
                cursor-pointer
                list-none
                items-center
                gap-3
                rounded-lg
                border
                border-border/60
                bg-card
                px-5
                text-sm
                font-medium
                text-foreground
                transition-colors
                hover:bg-secondary
              "
            >
              Actions

              <ChevronDown
                className="h-4 w-4 text-muted-foreground"
                strokeWidth={
                  1.8
                }
              />
            </summary>

            <div
              className="
                absolute
                right-0
                z-50
                mt-2
                w-52
                overflow-hidden
                rounded-lg
                border
                border-border/60
                bg-card
                p-1.5
                shadow-xl
              "
            >

              <button
                type="button"
                onClick={
                  handleRefreshPrices
                }
                disabled={
                  refreshingPrices
                }
                className="
                  flex
                  w-full
                  items-center
                  gap-3
                  rounded-md
                  px-3
                  py-2.5
                  text-sm
                  text-foreground
                  transition-colors
                  hover:bg-secondary
                  disabled:opacity-50
                "
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    refreshingPrices
                      ? "animate-spin"
                      : ""
                  }`}
                />

                {refreshingPrices
                  ? "Refreshing..."
                  : "Refresh prices"}
              </button>

            </div>
          </details>

          {/* ADD ASSET */}

          <Button
            onClick={() =>
              setAddDialogOpen(
                true
              )
            }
            data-testid="add-asset-btn"
            className="
              h-12
              rounded-lg
              bg-white
              px-5
              text-[15px]
              font-semibold
              text-black
              hover:bg-neutral-200
            "
          >
            <Plus
              className="mr-2 h-5 w-5"
              strokeWidth={
                2
              }
            />

            Add asset
          </Button>
        </div>
      </header>

      {/* =================================================
          HERO + ALLOCATION
      ================================================= */}

      <section
        className="
          grid
          gap-4
          xl:grid-cols-[1.58fr_1fr]
        "
      >
        {/* TOTAL NET WORTH */}

        <div
          className="
            relative
            min-h-[305px]
            overflow-hidden
            rounded-lg
            border
            border-border/40
            bg-card
            p-6
          "
        >
          <p className="text-lg text-muted-foreground">
            Total net worth
          </p>

          <p
            className="
              mt-3
              text-[62px]
              font-semibold
              leading-none
              tracking-[-0.04em]
              text-foreground
            "
          >
            {formatCurrency(
              totalNetWorth
            )}
          </p>

          <div
            className={`
              mt-6
              flex
              items-center
              gap-2
              text-xl
              font-medium

              ${
                todayPositive
                  ? "text-emerald-400"
                  : "text-rose-400"
              }
            `}
          >
            <ArrowUpRight
              className={`h-6 w-6 ${
                todayPositive
                  ? ""
                  : "rotate-90"
              }`}
            />

            <span>
              {todayPositive
                ? "+"
                : "−"}

              {formatCurrency(
                Math.abs(
                  todayChange
                )
              )}{" "}
              today
            </span>
          </div>

          {/* MONTHLY HISTORY STATUS */}

          <div
            className="
              absolute
              bottom-0
              right-0
              top-7
              hidden
              w-[45%]
              border-l
              border-dashed
              border-border
              lg:block
            "
          >
            <div
              className="
                absolute
                left-0
                top-[57%]
                h-3
                w-3
                -translate-x-1/2
                rounded-full
                bg-cyan-400
              "
            />

            <div
              className="
                flex
                h-full
                flex-col
                items-center
                justify-center
                px-8
                text-center
              "
            >
              <p className="font-medium text-foreground">
                {currentMonth
                  ? currentMonth.month
                  : "Net worth history"}
              </p>

              <p className="mt-2 text-sm text-muted-foreground">
                {history.length ===
                1
                  ? "Your first monthly point is being tracked"
                  : `${history.length} monthly points tracked`}
              </p>

              <p className="mt-4 text-xs text-muted-foreground">
                A new position is
                created automatically
                when the next month
                begins
              </p>
            </div>
          </div>
        </div>

        {/* ALLOCATION */}

        <div
          className="
            rounded-lg
            border
            border-border/40
            bg-card
            p-6
          "
        >
          <h2 className="text-xl font-semibold text-foreground">
            Asset allocation
          </h2>

          <div className="mt-6 space-y-5">
            {[
              "stocks",

              "crypto",

              "cash",

              "other",
            ].map(
              (
                category
              ) => (
                <AllocationBar
                  key={
                    category
                  }
                  category={
                    category
                  }
                  value={
                    breakdown[
                      category
                    ] || 0
                  }
                  maxValue={
                    maxAllocation
                  }
                />
              )
            )}

            <div className="border-t border-border/40 pt-5">
              <AllocationBar
                category="debts"
                value={
                  breakdown.debts ||
                  0
                }
                maxValue={
                  maxAllocation
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* =================================================
          HOLDINGS
      ================================================= */}

      <section
        className="
          overflow-hidden
          rounded-lg
          border
          border-border/40
          bg-card
        "
      >
        <div
          className="
            flex
            flex-col
            gap-4
            px-6
            py-5
            md:flex-row
            md:items-center
            md:justify-between
          "
        >
          <h2 className="text-xl font-semibold text-foreground">
            Your holdings
          </h2>

          <div
            className="
              flex
              flex-col
              gap-3
              sm:flex-row
            "
          >
            {/* FILTER */}

            <div className="relative">
              <select
                value={
                  activeTab
                }
                onChange={(
                  event
                ) =>
                  setActiveTab(
                    event
                      .target
                      .value
                  )
                }
                className="
                  h-10
                  min-w-[128px]
                  appearance-none
                  rounded-md
                  border
                  border-border/60
                  bg-background
                  pl-4
                  pr-10
                  text-sm
                  text-foreground
                  outline-none
                  transition-colors
                  focus:border-border
                  focus:ring-1
                  focus:ring-border
                "
              >
                <option value="all">
                  All assets
                </option>

                <option value="stocks">
                  Stocks
                </option>

                <option value="crypto">
                  Crypto
                </option>

                <option value="cash">
                  Cash
                </option>

                <option value="other">
                  Other assets
                </option>

                <option value="debts">
                  Debts
                </option>
              </select>

              <ChevronDown
                className="
                  pointer-events-none
                  absolute
                  right-3
                  top-1/2
                  h-4
                  w-4
                  -translate-y-1/2
                  text-muted-foreground
                "
              />
            </div>

            {/* SEARCH */}

            <div className="relative">
              <Search
                className="
                  absolute
                  left-3
                  top-1/2
                  h-4
                  w-4
                  -translate-y-1/2
                  text-muted-foreground
                "
              />

              <input
                value={
                  holdingSearch
                }
                onChange={(
                  event
                ) =>
                  setHoldingSearch(
                    event
                      .target
                      .value
                  )
                }
                placeholder="Search assets..."
                className="
                  h-10
                  w-full
                  rounded-md
                  border
                  border-border/60
                  bg-background
                  pl-10
                  pr-4
                  text-sm
                  text-foreground
                  outline-none
                  transition-colors
                  placeholder:text-muted-foreground
                  focus:border-border
                  focus:ring-1
                  focus:ring-border
                  sm:w-64
                "
              />
            </div>
          </div>
        </div>

        {/* ROWS */}

        <div>
          {filteredHoldingRows.map(
            (
              row
            ) => (
              <HoldingRow
                key={
                  row.category
                }
                {...row}
                onClick={() =>
                  openCategoryModal(
                    row.category
                  )
                }
              />
            )
          )}

          {filteredHoldingRows.length ===
            0 && (
            <div
              className="
                border-t
                border-border/40
                px-6
                py-10
                text-center
                text-sm
                text-muted-foreground
              "
            >
              No matching
              assets.
            </div>
          )}
        </div>
      </section>

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