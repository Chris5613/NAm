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
  remoteStorage as localStorage, subscribe,
} from "@/lib/serverStore";
import { getFinancialTotalAssets } from "@/lib/financialAssetsSnapshot";

import {
  localStorage as storage,
} from "@/lib/localStorage";
import {
  calculateNetWorth,
  formatCurrency,
  getCategoryDailyChanges,
  getDailyNetWorthChange,
  getMonthKey,
  getMonthlyNetWorthHistory,
} from "@/lib/dashboardMetrics";
import {
  AllocationBar,
  CATEGORY_CONFIG,
  HoldingRow,
  MonthlyNetWorthMiniChart,
} from "@/components/DashboardComponents";
import { getPrivateAccountingProfile } from "@/lib/yieldFarmingAccounting";

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
  Target,
  CalendarClock,
  Trash2,
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

// Personal historical net-worth rows are loaded from the authenticated
// backend private accounting profile, never bundled into public source.

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
   DASHBOARD
========================================================= */

export default function Dashboard() {
  const [
    assets,
    setAssets,
  ] = useState([]);
  const [chartRange, setChartRange] = useState("ALL");
  const [financialAssets, setFinancialAssets] = useState(getFinancialTotalAssets);
  useEffect(() => {
    const refresh = () => setFinancialAssets(getFinancialTotalAssets());
    const unsubscribe = subscribe(refresh);
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("project-crypto-updated", refresh);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("project-crypto-updated", refresh);
    };
  }, []);
  const [cashMonth, setCashMonth] = useState(() => new Date().toISOString().slice(0,7));
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankTransactions, setBankTransactions] = useState([]);
  const [financialGoals, setFinancialGoals] = useState(() => {
    const saved = storage.get("nam_financial_goals_v1");
    return Array.isArray(saved) ? saved : [];
  });
  const [recurringBills, setRecurringBills] = useState(() => {
    const saved = storage.get("nam_recurring_bills_v1");
    return Array.isArray(saved) ? saved : [];
  });
  const [editingFinance, setEditingFinance] = useState(null);
  const [financeDraft, setFinanceDraft] = useState({});
  const openFinanceEditor = (type, item = null) => {
    setEditingFinance({ type, id: item?.id || null });
    setFinanceDraft(item ? { ...item } : type === "goal"
      ? { title: "", saved: "", target: "" }
      : { title: "", amount: "", dueDate: "", frequency: "monthly" });
  };
  const saveFinanceItem = (event) => {
    event.preventDefault();
    const draft = { ...financeDraft, title: String(financeDraft.title || "").trim() };
    if (!draft.title) return;
    if (editingFinance.type === "goal") {
      const target = Number(draft.target), saved = Number(draft.saved);
      if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(saved) || saved < 0) return;
      const nextItem = { id: editingFinance.id || `goal-${Date.now()}`, title: draft.title, saved, target };
      const next = editingFinance.id ? financialGoals.map(item => item.id === editingFinance.id ? nextItem : item) : [...financialGoals, nextItem];
      setFinancialGoals(next);
      storage.set("nam_financial_goals_v1", next);
    } else {
      const amount = Number(draft.amount);
      if (!Number.isFinite(amount) || amount < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(draft.dueDate))) return;
      const nextItem = { id: editingFinance.id || `bill-${Date.now()}`, title: draft.title, amount, dueDate: draft.dueDate, frequency: draft.frequency === "once" ? "once" : "monthly" };
      const next = editingFinance.id ? recurringBills.map(item => item.id === editingFinance.id ? nextItem : item) : [...recurringBills, nextItem];
      setRecurringBills(next);
      storage.set("nam_recurring_bills_v1", next);
    }
    setEditingFinance(null);
  };
  const deleteFinanceItem = () => {
    if (!editingFinance?.id) return;
    const isGoal = editingFinance.type === "goal";
    const next = (isGoal ? financialGoals : recurringBills).filter(item => item.id !== editingFinance.id);
    if (isGoal) { setFinancialGoals(next); storage.set("nam_financial_goals_v1", next); }
    else { setRecurringBills(next); storage.set("nam_recurring_bills_v1", next); }
    setEditingFinance(null);
  };

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

  const homeBalance = category => category === "crypto"
    ? financialAssets.value : breakdown[category];
  const maxAllocation = Math.max(
    ...allocationCategories.map(category => Math.abs(Number(homeBalance(category)) || 0)),
    1,
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
  // Private profile monthly values are user-confirmed history.
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
  const privateHistory = Array.isArray(getPrivateAccountingProfile()?.netWorthHistory)
    ? getPrivateAccountingProfile().netWorthHistory
    : [];
  const importedMonths = new Set(privateHistory.map(p => String(p?.date || "").slice(0, 7)));
  const isImportedMonth = point => importedMonths.has(`${point.date.getFullYear()}-${String(point.date.getMonth() + 1).padStart(2, "0")}`);
  const livePoints = (liveHistory || [])
    .map(p => p && toHistoryPoint(p.timestamp || p.date || p.time, p.value))
    .filter(p => p && !isImportedMonth(p));
  const monthPoints = (history || [])
    .map(p => p && toHistoryPoint(p.monthKey ? p.monthKey + "-01T12:00:00" : (p.timestamp || p.date || p.time), p.value ?? p.total_net_worth))
    .filter(p => p && !isImportedMonth(p));
  const importedPoints = privateHistory.map(p => toHistoryPoint(p.date, p.value)).filter(Boolean);
  const currentPoint = toHistoryPoint(now, totalNetWorth);
  // A previously persisted May 9, 2026 zero snapshot is not a verified
  // portfolio valuation. Hide that exact point on the chart only; leave all
  // underlying server-backed history and other legitimate zero values intact.
  const isUnverifiedMay9Zero = point =>
    point.value === 0 &&
    point.date.getFullYear() === 2026 &&
    point.date.getMonth() === 4 &&
    point.date.getDate() === 9;
  // The current month is a live month: display one up-to-date value at
  // today's date instead of both a first-of-month snapshot and today's value.
  // Historical records stay in storage unchanged.
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const pointMonthKey = point => `${point.date.getFullYear()}-${String(point.date.getMonth() + 1).padStart(2, "0")}`;
  const combined = [...importedPoints, ...monthPoints, ...livePoints]
    .filter(p => pointMonthKey(p) !== currentMonthKey)
    .concat(currentPoint ? [currentPoint] : [])
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
  const nextBills = recurringBills.map(bill => {
    const date = new Date(`${bill.dueDate}T12:00:00`);
    if (!Number.isFinite(date.getTime())) return null;
    const today = new Date();
    today.setHours(0,0,0,0);
    if (bill.frequency === "monthly") {
      const day = date.getDate();
      let due = new Date(today.getFullYear(), today.getMonth(), Math.min(day, new Date(today.getFullYear(),today.getMonth()+1,0).getDate()),12);
      if (due < today) due = new Date(today.getFullYear(),today.getMonth()+1,Math.min(day,new Date(today.getFullYear(),today.getMonth()+2,0).getDate()),12);
      return { ...bill, nextDate: due };
    }
    return date >= today ? { ...bill, nextDate: date } : null;
  }).filter(Boolean).sort((a,b) => a.nextDate-b.nextDate);
  const netWorthCategories = [...allocationCategories].map(category => ({
    category,
    label: CATEGORY_CONFIG[category].shortLabel,
    change: Number(dailyCategoryChanges?.[category]) || 0,
  })).sort((a,b) => Math.abs(b.change)-Math.abs(a.change));
  const categoryChangeTotal = netWorthCategories.reduce((sum,item) => sum + item.change, 0);
  const hasDailyChange = dailyCategoryChanges !== null && netWorthCategories.some(item => item.change !== 0);

  const chartTooltipStyle = { background: "#17191d", border: "1px solid #30343b", borderRadius: 10, color: "#f1f5f9", fontSize: 12 };

  return (
    <div className="w-full min-w-0 max-w-none space-y-3 pb-7" data-testid="dashboard">
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

      <div className="grid items-stretch gap-[13px] lg:grid-cols-[minmax(0,1.75fr)_minmax(300px,1fr)]">
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
            <div className="mt-2 h-[clamp(205px,24vh,245px)] w-full">
              {netChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={netChart} margin={{ top: 70, right: 2, bottom: 0, left: 2 }}>
                    <defs>
                      <linearGradient id="dashboardNetFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38a5df" stopOpacity={0.19} />
                        <stop offset="100%" stopColor="#38a5df" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="dateKey" type="category" axisLine={false} tickLine={false} tick={{ fill: "#78828d", fontSize: 10 }} minTickGap={30} dy={8} tickFormatter={dateKey => new Date(dateKey).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip offset={12} formatter={value => formatCurrency(value)} labelFormatter={dateKey => new Date(dateKey).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} contentStyle={chartTooltipStyle} />
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

        <section className={card} aria-label="Balances">
          <div className="border-b border-border/40 px-4 py-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Balances</h2>
          </div>
          <div className="space-y-2 px-4 py-3">
            {[...allocationCategories].sort((a, b) =>
              Math.abs(Number(homeBalance(b)) || 0) -
              Math.abs(Number(homeBalance(a)) || 0)).map(category => (
              <button key={category} type="button" onClick={() => openCategoryModal(category)}
                className="block w-full rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-secondary/35"
                aria-label={`View ${category === "crypto" ? "Total Assets" : category} details`}>
                <AllocationBar category={category}
                  value={homeBalance(category)}
                  label={category === "crypto" ? "Total Assets" : undefined}
                  unverified={category === "crypto" && financialAssets.incomplete}
                  maxValue={maxAllocation} />
              </button>
            ))}
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
                  <Tooltip cursor={false} contentStyle={chartTooltipStyle} formatter={value => formatCurrency(value)} />
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

        <section className={card} aria-label="Net worth change breakdown">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Net worth change</h2>
            <span className="text-[10px] text-muted-foreground">Today</span>
          </div>
          <div className="px-4 py-3">
            <p className={`mb-3 text-[23px] font-semibold tabular-nums ${todayChange >= 0 ? "text-emerald-400":"text-rose-400"}`}>{todayChange >= 0 ? "+" : ""}{formatCurrency(todayChange)}</p>
            {dailyCategoryChanges === null ? <p className="py-4 text-xs text-muted-foreground">Daily change data is not available yet.</p> : (
              <div className="space-y-2.5">
                {netWorthCategories.map(item => {
                  const Icon = CATEGORY_CONFIG[item.category].icon;
                  return <div key={item.category} className="flex items-center gap-2 text-xs">
                    <Icon className={`h-3.5 w-3.5 ${CATEGORY_CONFIG[item.category].color}`} />
                    <span className="min-w-0 flex-1">{item.label}</span>
                    <span className={`tabular-nums ${item.change > 0 ? "text-emerald-400" : item.change < 0 ? "text-rose-400":"text-muted-foreground"}`}>{item.change > 0 ? "+" : ""}{formatCurrency(item.change)}</span>
                    <span className="w-12 text-right tabular-nums text-muted-foreground">{Math.abs(categoryChangeTotal) > 0 ? `${(item.change / categoryChangeTotal * 100).toFixed(1)}%` : "—"}</span>
                  </div>;
                })}
                {!hasDailyChange && <p className="pt-1 text-[10px] text-muted-foreground">No category changes recorded today.</p>}
              </div>
            )}
          </div>
        </section>
      </div>

      {editingFinance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={event => { if(event.target === event.currentTarget) setEditingFinance(null); }}>
          <div role="dialog" aria-modal="true" aria-label={editingFinance.type === "goal" ? "Edit financial goal" : "Edit recurring bill"} className="w-full max-w-md rounded-xl border border-border/70 bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{editingFinance.id ? "Edit" : "Add"} {editingFinance.type === "goal" ? "financial goal" : "recurring bill"}</h2>
              <button type="button" onClick={() => setEditingFinance(null)} aria-label="Close editor"><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <form onSubmit={saveFinanceItem} className="space-y-3">
              <label className="block text-xs text-muted-foreground">Name
                <input required maxLength={80} value={financeDraft.title || ""} onChange={event => setFinanceDraft({...financeDraft,title:event.target.value})} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" placeholder={editingFinance.type === "goal" ? "Goal name" : "Bill name"} />
              </label>
              {editingFinance.type === "goal" ? (<>
                <label className="block text-xs text-muted-foreground">Current savings
                  <input required type="number" min="0" step="0.01" value={financeDraft.saved ?? ""} onChange={event => setFinanceDraft({...financeDraft,saved:event.target.value})} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" />
                </label>
                <label className="block text-xs text-muted-foreground">Target
                  <input required type="number" min="0.01" step="0.01" value={financeDraft.target ?? ""} onChange={event => setFinanceDraft({...financeDraft,target:event.target.value})} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" />
                </label>
              </>) : (<>
                <label className="block text-xs text-muted-foreground">Amount
                  <input required type="number" min="0" step="0.01" value={financeDraft.amount ?? ""} onChange={event => setFinanceDraft({...financeDraft,amount:event.target.value})} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" />
                </label>
                <label className="block text-xs text-muted-foreground">First due date
                  <input required type="date" value={financeDraft.dueDate || ""} onChange={event => setFinanceDraft({...financeDraft,dueDate:event.target.value})} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" />
                </label>
                <label className="block text-xs text-muted-foreground">Repeat
                  <select value={financeDraft.frequency || "monthly"} onChange={event => setFinanceDraft({...financeDraft,frequency:event.target.value})} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"><option value="monthly">Monthly</option><option value="once">One-time</option></select>
                </label>
              </>)}
              <div className="flex items-center justify-between gap-2 pt-2">
                {editingFinance.id ? <button type="button" onClick={deleteFinanceItem} className="flex items-center gap-1 text-xs text-rose-400"><Trash2 className="h-3.5 w-3.5" />Delete</button> : <span />}
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingFinance(null)}>Cancel</Button>
                  <Button type="submit" size="sm">Save</Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

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
                        selectedCategory === "crypto" ? "Total Assets" :
                        CATEGORY_CONFIG[selectedCategory].label
                      }
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedCategory ===
                      "crypto"
                        ? "Balance Sheet total, including BTC and equipment"
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
