import { useState, useEffect, useCallback, useMemo } from "react";
import { projectsApi } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  Pencil,
  Timer,
  Receipt,
  Coins,
  TrendingUp,
  Building2,
  Landmark,
  Cpu,
  Wallet,
  ArrowUpRight,
  Filter,
  CheckCircle2,
  GripVertical,
  X,
  CalendarClock,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import AddProjectDialog from "@/components/AddProjectDialog";
import EditProjectDialog from "@/components/EditProjectDialog";
import TransactionsDialog from "@/components/TransactionsDialog";
import { coinGeckoApi } from "@/lib/external-apis";
import { getDailyReturnValue, normalizeDailyReturns } from "@/lib/projectDailyReturns";

const CHART_COLORS = [
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#F59E0B",
  "#06B6D4",
  "#EC4899",
  "#6366F1",
  "#14B8A6",
  "#F97316",
  "#A855F7",
];

const TOOLTIP_CONTENT_STYLE = {
  background: "#121214",
  border: "1px solid #27272A",
  borderRadius: "6px",
  fontFamily: "'Space Mono', monospace",
  fontSize: "12px",
  color: "#FAFAFA",
};

function formatCurrency(value) {
  if (!value && value !== 0) return "$0.00";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatApyEarned(value) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 0.01 || amount === 0) return formatCurrency(amount);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(amount);
}

function formatSyncTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Pending";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function isInactiveProject(project) {
  return project?.inactive === true || project?.is_inactive === true;
}

function formatPercent(value) {
  const n = Number(value) || 0;
  return `${n.toFixed(1)}%`;
}

function formatHashrate(value) {
  const units = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s"];
  let amount = Number(value) || 0;
  let unitIndex = 0;
  while (amount >= 1000 && unitIndex < units.length - 1) {
    amount /= 1000;
    unitIndex += 1;
  }
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${units[unitIndex]}`;
}

function isEarningTransaction(transaction) {
  const amount = Number(transaction?.amount);
  const isEarningType = transaction?.type === "earning" || !transaction?.type || transaction?.type === "earned";
  if (!isEarningType || !Number.isFinite(amount)) return false;
  return transaction.source === "jupiter_inf_loop" ? amount !== 0 : amount > 0;
}

function getLatestTrackedYieldAmount(project) {
  const transactions = Array.isArray(project?.transactions) ? project.transactions : [];
  const latest = transactions
    .filter((transaction) => transaction.source === "inf_yield" || transaction.source === "jupiter_inf_loop" || transaction.source === "lulo_yield")
    .sort((a, b) => String(b.source_date || b.date || "").localeCompare(String(a.source_date || a.date || "")))[0];
  return Number(latest?.amount) || 0;
}

const MONTHLY_EARNERS_SEED_FLAG = "monthly_earners_demo_seeded";

const MOCK_EARNERS = [
  {
    name: "ETH Staking Yield",
    invested: 5000,
    earned: 612.4,
    per_day: 3.75,
  },
  {
    name: "Solana Staking",
    invested: 2500,
    earned: 305.2,
    per_day: 2.1,
  },
  {
    name: "USDC Lending (Aave)",
    invested: 3000,
    earned: 178.6,
    per_day: 1.35,
  },
  {
    name: "S&P 500 Index Fund",
    invested: 12000,
    earned: 1450.9,
    per_day: 6.85,
  },
  {
    name: "Dividend Stock Portfolio",
    invested: 8000,
    earned: 958.3,
    per_day: 4.2,
  },
  {
    name: "Real Estate REIT",
    invested: 6000,
    earned: 542.75,
    per_day: 2.95,
  },
];

function normalizeProjectCategoryKey(rawValue = "") {
  const value = String(rawValue || "").trim().toLowerCase();
  if (!value) return null;

  const cryptoKeys = [
    "crypto",
    "crypto staking",
    "staking",
    "eth staking",
    "solana staking",
    "btc",
    "trx",
    "trx rewards",
  ];
  const stocksKeys = [
    "stocks",
    "stock",
    "stocks & index",
    "index fund",
    "equity",
    "dividend",
    "etf",
    "s&p",
  ];
  const realEstateKeys = ["real estate", "reit", "property", "rental"];
  const lendingKeys = ["lending", "defi lending", "aave", "yield", "compound", "savings", "bank"];
  const miningKeys = ["mining", "hardware / mining", "hardware", "device", "acurast", "nosana", "roller", "unity", "phone farm"];
  const otherKeys = ["alternative yield", "other"];

  if (cryptoKeys.some((key) => value.includes(key))) return "crypto";
  if (stocksKeys.some((key) => value.includes(key))) return "stocks";
  if (realEstateKeys.some((key) => value.includes(key))) return "real_estate";
  if (lendingKeys.some((key) => value.includes(key))) return "lending";
  if (miningKeys.some((key) => value.includes(key))) return "mining";
  if (otherKeys.some((key) => value.includes(key))) return "other";

  return null;
}

function getProjectCategory(project) {
  const override = normalizeProjectCategoryKey(
    project?.custom_tag || project?.tag_label || project?.category_label || project?.category
  );
  if (override) return override;

  const cat = (project?.category || "").toLowerCase();
  const name = (project?.name || "").toLowerCase();

  if (cat === "crypto" || name.includes("eth") || name.includes("solana") || name.includes("staking") || name.includes("crypto") || name.includes("btc")) {
    return "crypto";
  }
  if (name.includes("reit") || name.includes("real estate") || name.includes("property")) {
    return "real_estate";
  }
  if (name.includes("lending") || name.includes("aave") || name.includes("yield") || name.includes("defi") || name.includes("compound")) {
    return "lending";
  }
  if (name.includes("mining") || name.includes("acurast") || name.includes("nosana") || name.includes("roller") || name.includes("unity") || name.includes("device") || name.includes("hardware")) {
    return "mining";
  }
  if (cat === "stocks" || name.includes("stock") || name.includes("index") || name.includes("s&p") || name.includes("dividend") || name.includes("equity") || name.includes("etf")) {
    return "stocks";
  }
  return "other";
}

function getDisplayCategoryLabel(project) {
  const customLabel = (project?.custom_tag || project?.tag_label || project?.category_label || "").trim();
  if (customLabel) return customLabel;

  return CATEGORY_CONFIGS[getProjectCategory(project)]?.label || CATEGORY_CONFIGS.other.label;
}

const CATEGORY_CONFIGS = {
  crypto: {
    label: "Crypto Staking",
    icon: Coins,
    badgeBg: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    cardBg: "bg-gradient-to-b from-purple-950/20 via-card/90 to-card border-purple-500/30 hover:border-purple-500/60 shadow-lg shadow-purple-950/20",
    iconBg: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    accentBg: "bg-purple-500",
    progressBg: "bg-gradient-to-r from-purple-500 to-indigo-400",
  },
  stocks: {
    label: "Stocks & Index",
    icon: TrendingUp,
    badgeBg: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    cardBg: "bg-gradient-to-b from-blue-950/20 via-card/90 to-card border-blue-500/30 hover:border-blue-500/60 shadow-lg shadow-blue-950/20",
    iconBg: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    accentBg: "bg-blue-500",
    progressBg: "bg-gradient-to-r from-blue-500 to-cyan-400",
  },
  real_estate: {
    label: "Real Estate",
    icon: Building2,
    badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    cardBg: "bg-gradient-to-b from-amber-950/20 via-card/90 to-card border-amber-500/30 hover:border-amber-500/60 shadow-lg shadow-amber-950/20",
    iconBg: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    accentBg: "bg-amber-500",
    progressBg: "bg-gradient-to-r from-amber-500 to-orange-400",
  },
  lending: {
    label: "DeFi Lending",
    icon: Landmark,
    badgeBg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    cardBg: "bg-gradient-to-b from-cyan-950/20 via-card/90 to-card border-cyan-500/30 hover:border-cyan-500/60 shadow-lg shadow-cyan-950/20",
    iconBg: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    accentBg: "bg-cyan-500",
    progressBg: "bg-gradient-to-r from-cyan-500 to-teal-400",
  },
  mining: {
    label: "Hardware / Mining",
    icon: Cpu,
    badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    cardBg: "bg-gradient-to-b from-emerald-950/20 via-card/90 to-card border-emerald-500/30 hover:border-emerald-500/60 shadow-lg shadow-emerald-950/20",
    iconBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    accentBg: "bg-emerald-500",
    progressBg: "bg-gradient-to-r from-emerald-500 to-green-400",
  },
  other: {
    label: "Alternative Yield",
    icon: Wallet,
    badgeBg: "bg-slate-500/10 text-slate-400 border-slate-500/30",
    cardBg: "bg-gradient-to-b from-slate-900/40 via-card/90 to-card border-border/40 hover:border-border/80 shadow-md",
    iconBg: "bg-secondary text-foreground border-border/40",
    accentBg: "bg-slate-500",
    progressBg: "bg-slate-400",
  },
};

function getCurrentMonthKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function moveMonthKey(monthKey, amount) {
  const [year, month] = monthKey.split("-").map(Number);
  const nextDate = new Date(year, month - 1 + amount, 1);
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return "All Months";
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

const MONTHLY_EARNERS_ORDER_KEY = "monthly_earners_custom_order_v1";
const BOARD_COLUMNS = 3;

function getMinimumBoardSlotCount(projectCount) {
  if (projectCount <= 0) return BOARD_COLUMNS;

  const roundedToRow = Math.ceil(projectCount / BOARD_COLUMNS) * BOARD_COLUMNS;

  // If a row is completely full, keep one extra empty row available so a
  // project can always be moved into a blank slot without collapsing the board.
  return projectCount % BOARD_COLUMNS === 0
    ? roundedToRow + BOARD_COLUMNS
    : roundedToRow;
}

function getMonthKeyFromDate(dateStr) {
  if (!dateStr) return "";
  const str = String(dateStr);
  if (str.length >= 7 && str.includes("-")) {
    return str.slice(0, 7);
  }
  return "";
}

export default function InvestmentOverview() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [txnProject, setTxnProject] = useState(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => getCurrentMonthKey());
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [trxPrice, setTrxPrice] = useState(null);
  const [customOrder, setCustomOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(MONTHLY_EARNERS_ORDER_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [dailyReturns, setDailyReturns] = useState(() => {
    const saved = localStorage.getItem("projectDailyReturns");
    const parsed = saved ? JSON.parse(saved) : {};
    return normalizeDailyReturns(parsed, []);
  });

  useEffect(() => {
    setDailyReturns((prev) => normalizeDailyReturns(prev, projects));
  }, [projects]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await projectsApi.accrueApyTransactions();
      setProjects(res.data || []);
    } catch {
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    coinGeckoApi.getPrice("tron")
      .then((price) => {
        if (price > 0) setTrxPrice(price);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    const intervalId = window.setInterval(fetchProjects, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [fetchProjects]);

  // One-time seed of mock crypto/stock/lending earners so the page isn't
  // empty on first load. No-op once seeded or if the user already has data.
  useEffect(() => {
    const seedMockEarners = async () => {
      const flagged = window.localStorage.getItem(MONTHLY_EARNERS_SEED_FLAG) === "true";
      if (flagged) return;

      window.localStorage.setItem(MONTHLY_EARNERS_SEED_FLAG, "true");

      const res = await projectsApi.getAll();
      if ((res.data || []).length > 0) return;

      for (const mock of MOCK_EARNERS) {
        await projectsApi.create(mock);
      }

      fetchProjects();
    };

    seedMockEarners();
  }, [fetchProjects]);

  useEffect(() => {
    const refresh = () => {
      fetchProjects();
    };

const events = [
  "focus",
  "storage",
  "acurast-sync-complete",
  "unity-network-sync-complete",
  "rollercoin-sync-complete",
  "nosana-sync-complete",
  "gomining-sync-complete",
  "gomining-token-sync-complete",
];
    events.forEach((e) => window.addEventListener(e, refresh));

    return () => {
      events.forEach((e) => window.removeEventListener(e, refresh));
    };
  }, [fetchProjects]);

  useEffect(() => {
    const refreshDailyReturns = () => {
      const saved = localStorage.getItem("projectDailyReturns");
      const parsed = saved ? JSON.parse(saved) : {};
      setDailyReturns(normalizeDailyReturns(parsed, projects));
    };

    window.addEventListener("project-daily-returns-updated", refreshDailyReturns);
    window.addEventListener("storage", refreshDailyReturns);

    return () => {
      window.removeEventListener("project-daily-returns-updated", refreshDailyReturns);
      window.removeEventListener("storage", refreshDailyReturns);
    };
  }, [projects]);

  const handleDelete = async (project) => {
    try {
      await projectsApi.delete(project.id);

      // Preserve the board position. Deleting a project turns only that slot
      // into an empty space instead of shifting every project after it.
      setCustomOrder((prev) => {
        const nextSlots = (Array.isArray(prev) ? prev : []).map((slot) =>
          slot != null && String(slot) === String(project.id) ? null : slot
        );

        try {
          localStorage.setItem(MONTHLY_EARNERS_ORDER_KEY, JSON.stringify(nextSlots));
        } catch {
          // ignore localStorage write failures
        }

        return nextSlots;
      });

      toast.success(`${project.name} deleted`);
      fetchProjects();
    } catch {
      toast.error("Failed to delete project");
    }
  };

  const handleClearTag = async (project) => {
    try {
      await projectsApi.update(project.id, { custom_tag: null });
      toast.success("Tag removed");
      fetchProjects();
    } catch {
      toast.error("Failed to remove tag");
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const activeProjects = useMemo(
    () => projects.filter((p) => !isInactiveProject(p)),
    [projects]
  );

  // Convert the old flat order into a fixed-slot board and keep it synchronized
  // with the projects that currently exist. Missing/deleted IDs become nulls,
  // while newly-created projects fill the first available empty slot.
  useEffect(() => {
    if (loading) return;

    const activeIds = activeProjects.map((project) => String(project.id));
    const activeIdSet = new Set(activeIds);

    setCustomOrder((prev) => {
      const previousSlots = Array.isArray(prev) ? prev : [];
      const seen = new Set();

      const nextSlots = previousSlots.map((slot) => {
        if (slot == null) return null;

        const id = String(slot);
        if (!activeIdSet.has(id) || seen.has(id)) return null;

        seen.add(id);
        return id;
      });

      // Add projects that are not yet represented on the board. New projects
      // occupy the first blank slot instead of forcing existing cards to move.
      activeIds.forEach((id) => {
        if (seen.has(id)) return;

        const emptyIndex = nextSlots.findIndex((slot) => slot == null);
        if (emptyIndex >= 0) {
          nextSlots[emptyIndex] = id;
        } else {
          nextSlots.push(id);
        }
        seen.add(id);
      });

      const minimumSlots = getMinimumBoardSlotCount(activeProjects.length);
      while (nextSlots.length < minimumSlots) nextSlots.push(null);
      while (nextSlots.length % BOARD_COLUMNS !== 0) nextSlots.push(null);

      // Always keep at least one blank target available. If every slot is full,
      // append one new three-slot row. Existing positions are never compacted.
      if (nextSlots.length > 0 && nextSlots.every((slot) => slot != null)) {
        nextSlots.push(...Array(BOARD_COLUMNS).fill(null));
      }

      const changed =
        previousSlots.length !== nextSlots.length ||
        previousSlots.some((slot, index) => slot !== nextSlots[index]);

      if (!changed) return prev;

      try {
        localStorage.setItem(MONTHLY_EARNERS_ORDER_KEY, JSON.stringify(nextSlots));
      } catch {
        // ignore localStorage write failures
      }

      return nextSlots;
    });
  }, [activeProjects, loading]);

  const projectById = useMemo(
    () => new Map(activeProjects.map((project) => [String(project.id), project])),
    [activeProjects]
  );

  const handleDragStart = (e, slotIndex) => {
    setDraggedIndex(slotIndex);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(slotIndex));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    setCustomOrder((prev) => {
      const nextSlots = [...(Array.isArray(prev) ? prev : [])];

      while (nextSlots.length <= Math.max(draggedIndex, targetIndex)) {
        nextSlots.push(null);
      }

      const draggedProjectId = nextSlots[draggedIndex];
      if (draggedProjectId == null) return prev;

      // Swap when dropping on another project, or simply move when dropping
      // onto an empty slot. Either way, no unrelated project changes position.
      const targetProjectId = nextSlots[targetIndex] ?? null;
      nextSlots[targetIndex] = draggedProjectId;
      nextSlots[draggedIndex] = targetProjectId;

      try {
        localStorage.setItem(MONTHLY_EARNERS_ORDER_KEY, JSON.stringify(nextSlots));
      } catch {
        // ignore localStorage write failures
      }

      return nextSlots;
    });

    setDraggedIndex(null);
  };
  const inactiveProjects = projects.filter((p) => isInactiveProject(p));

  const categoryCounts = useMemo(() => {
    const counts = { all: activeProjects.length };
    activeProjects.forEach((p) => {
      const cat = getProjectCategory(p);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [activeProjects]);

  const filteredProjects = useMemo(() => {
    if (categoryFilter === "all") return activeProjects;
    return activeProjects.filter((p) => getProjectCategory(p) === categoryFilter);
  }, [activeProjects, categoryFilter]);

  const getDailyAmount = useCallback((project) => {
    if (isInactiveProject(project)) return 0;
    if (project?.yield_tracking === "lulo_lending") {
      const balance = Number(project.lulo_total_balance_usd) || 0;
      const apy = Number(project.lulo_weighted_apy) || 0;
      return (balance * (apy / 100)) / 365;
    }
    if (project?.yield_tracking === "jupiter_inf_loop") {
      const collateralUsd = (Number(project.jupiter_collateral_inf) || 0) * (Number(project.jupiter_inf_usd) || 0);
      const debtUsd = (Number(project.jupiter_borrowed_sol) || 0) * (Number(project.jupiter_sol_usd) || 0);
      const annualSupplyYield = collateralUsd * ((Number(project.jupiter_supply_apy) || 0) / 100);
      const annualBorrowCost = debtUsd * ((Number(project.jupiter_borrow_apy) || 0) / 100);
      return (annualSupplyYield - annualBorrowCost) / 365;
    }
    if (project?.yield_tracking === "sanctum_inf") {
      return getLatestTrackedYieldAmount(project);
    }
    if (project?.yield_tracking === "kryptex") {
      return Number(project.kryptex_profitability_usd_day) || 0;
    }
    return getDailyReturnValue(project, dailyReturns, trxPrice);
  }, [dailyReturns, trxPrice]);

  const getProjectEarningsTotal = (project) => {
    const txns = Array.isArray(project?.transactions) ? project.transactions : [];
    const earnings = txns.filter(isEarningTransaction);

    const txnTotal = earnings.reduce((sum, txn) => sum + (Number(txn.amount) || 0), 0);
    const earnedTotal = Number(project?.earned) || 0;
    if (earnedTotal > 0) return earnedTotal;
    return txnTotal;
  };

  const getProjectInvestedTotal = (project) => {
    const txns = Array.isArray(project?.transactions) ? project.transactions : [];
    const investments = txns.filter((t) => t.type === "investment" && Number(t.amount) > 0);

    const txnTotal = investments.reduce((sum, txn) => sum + (Number(txn.amount) || 0), 0);
    if (txnTotal > 0) return txnTotal;
    return Number(project?.invested) || 0;
  };

  const totals = projects.reduce(
    (acc, p) => {
      const daily = getDailyAmount(p);
      const earned = getProjectEarningsTotal(p);
      const invested = getProjectInvestedTotal(p);

      return {
        invested: acc.invested + invested,
        earned: acc.earned + earned,
        per_day: acc.per_day + daily,
        per_week: acc.per_week + daily * 7,
        per_month: acc.per_month + daily * 30,
        per_year: acc.per_year + daily * 365,
      };
    },
    {
      invested: 0,
      earned: 0,
      per_day: 0,
      per_week: 0,
      per_month: 0,
      per_year: 0,
    }
  );

  const totalPnl = totals.earned - totals.invested;

  const actualEarningsByMonth = useMemo(() => {
    const map = {};

    projects.forEach((p) => {
      const txns = Array.isArray(p.transactions) ? p.transactions : [];
      const earningTxns = txns.filter(isEarningTransaction);

      if (earningTxns.length > 0) {
        earningTxns.forEach((t) => {
          const mKey = getMonthKeyFromDate(t.date || t.created_at || t.source_date);
          if (mKey) {
            map[mKey] = (map[mKey] || 0) + (Number(t.amount) || 0);
          }
        });
      } else if (Number(getProjectEarningsTotal(p)) > 0) {
        const mKey = getMonthKeyFromDate(p.created_at || p.date || p.updated_at) || getCurrentMonthKey();
        map[mKey] = (map[mKey] || 0) + (Number(getProjectEarningsTotal(p)) || 0);
      }
    });

    return map;
  }, [projects]);

  const selectedMonthSummary = useMemo(() => {
    const monthTotal = actualEarningsByMonth[selectedMonthKey] || totals.per_month;
    const totalValue = Number(monthTotal) || 0;

    return {
      monthTotal: totalValue,
      yearTotal: Number(totals.per_year) || 0,
    };
  }, [selectedMonthKey, actualEarningsByMonth, totals.per_month, totals.per_year]);

  const monthTiles = useMemo(() => {
    const year = Number(selectedMonthKey.slice(0, 4));

    return Array.from({ length: 12 }, (_, index) => {
      const monthNumber = String(index + 1).padStart(2, "0");
      const key = `${year}-${monthNumber}`;
      const totalEarned = actualEarningsByMonth[key] || 0;

      return {
        key,
        label: new Date(year, index, 1).toLocaleDateString("en-US", {
          month: "short",
        }),
        total: totalEarned,
        isSelected: key === selectedMonthKey,
      };
    });
  }, [selectedMonthKey, actualEarningsByMonth]);

  const monthlyBreakdown = useMemo(() => {
    const monthEarnedByProject = {};
    const monthProjects = [...activeProjects, ...inactiveProjects];

    monthProjects.forEach((p) => {
      const txns = Array.isArray(p.transactions) ? p.transactions : [];
      const earningTxns = txns.filter(isEarningTransaction);

      if (earningTxns.length > 0) {
        earningTxns.forEach((t) => {
          const mKey = getMonthKeyFromDate(t.date || t.created_at || t.source_date);
          if (mKey === selectedMonthKey) {
            monthEarnedByProject[p.id] = (monthEarnedByProject[p.id] || 0) + (Number(t.amount) || 0);
          }
        });
      } else if (Number(p.earned) > 0) {
        const mKey = getMonthKeyFromDate(p.created_at || p.date || p.updated_at) || getCurrentMonthKey();
        if (mKey === selectedMonthKey) {
          monthEarnedByProject[p.id] = (monthEarnedByProject[p.id] || 0) + (Number(p.earned) || 0);
        }
      }
    });

    const monthTotal = Object.values(monthEarnedByProject).reduce((sum, val) => sum + val, 0);

    if (monthTotal !== 0) {
      return monthProjects
        .map((project) => {
          const monthly = monthEarnedByProject[project.id] || 0;
          return {
            project,
            daily: monthly / 30,
            monthly,
            share: (monthly / monthTotal) * 100,
          };
        })
        .filter((row) => row.monthly !== 0)
        .sort((a, b) => b.monthly - a.monthly);
    }

    const projectedTotal = totals.per_month;
    return activeProjects
      .map((project) => {
        const daily = getDailyAmount(project);
        const monthly = daily * 30;

        return {
          project,
          daily,
          monthly,
          share: projectedTotal > 0 ? (monthly / projectedTotal) * 100 : 0,
        };
      })
      .filter((row) => row.monthly > 0)
      .sort((a, b) => b.monthly - a.monthly);
  }, [activeProjects, inactiveProjects, selectedMonthKey, totals.per_month, getDailyAmount]);

  const topEarner = monthlyBreakdown[0] || null;

  function getRoiDays(project) {
    if (isInactiveProject(project)) return null;

    const invested = getProjectInvestedTotal(project);
    const earned = getProjectEarningsTotal(project);
    const remaining = invested - earned;

    const daily = getDailyReturnValue(project, dailyReturns, trxPrice);

    if (daily <= 0) return null;
    if (remaining <= 0) return 0;

    return Math.ceil(remaining / daily);
  }

  const renderUniqueProjectCard = (project, index) => {
    const categoryKey = getProjectCategory(project);
    const config = CATEGORY_CONFIGS[categoryKey] || CATEGORY_CONFIGS.other;
    const CategoryIcon = config.icon;

    const invested = getProjectInvestedTotal(project);
    const earned = getProjectEarningsTotal(project);
    const isInfTracking = project.yield_tracking === "sanctum_inf";
    const isJupiterLoop = project.yield_tracking === "jupiter_inf_loop";
    const isLuloLending = project.yield_tracking === "lulo_lending";
    const isKryptex = project.yield_tracking === "kryptex";
    const jupiterCollateralUsd = (Number(project.jupiter_collateral_inf) || 0) * (Number(project.jupiter_inf_usd) || 0);
    const jupiterDebtUsd = (Number(project.jupiter_borrowed_sol) || 0) * (Number(project.jupiter_sol_usd) || 0);
    const pnl = isJupiterLoop
      ? (Number(project.jupiter_net_equity_usd) || 0) - invested
      : earned - invested;
    const displayedPnl = isJupiterLoop ? Number(project.jupiter_position_pnl_usd) || 0 : pnl;
    const pnlPercent = invested > 0 ? (displayedPnl / invested) * 100 : 0;
    const apy = isLuloLending
      ? Number(project.lulo_weighted_apy) || null
      : Number(project.apy) || (invested > 0 && project.per_day > 0 ? ((project.per_day * 365) / invested) * 100 : null);
    const daily = getDailyAmount(project);
    const monthly = daily * 30;
    const roiDays = getRoiDays(project);

    const recoveryPct = invested > 0 ? Math.min(100, Math.max(0, (earned / invested) * 100)) : 100;

    return (
      <Card
        key={project.id}
        draggable
        onDragStart={(e) => handleDragStart(e, index)}
        onDragEnd={() => setDraggedIndex(null)}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, index)}
        className={`relative overflow-hidden transition-all duration-200 cursor-grab active:cursor-grabbing hover:scale-[1.01] ${config.cardBg} ${
          index < 3 ? "self-stretch" : ""
        } ${
          draggedIndex === index ? "opacity-40 border-dashed border-emerald-400" : ""
        }`}
        data-testid={`project-box-${project.id}`}
      >
        <div className={`h-1 w-full ${config.progressBg}`} />

        <CardContent className="p-5 space-y-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-grab shrink-0">
                <GripVertical className="w-4 h-4" />
              </div>

              {project.icon_url ? (
                <img
                  src={project.icon_url}
                  alt=""
                  className="w-10 h-10 rounded-lg object-contain bg-secondary/50 p-1.5 border border-border/40 shrink-0"
                />
              ) : (
                <div className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${config.iconBg}`}>
                  <CategoryIcon className="w-5 h-5" strokeWidth={1.75} />
                </div>
              )}

              <div className="min-w-0 font-sans">
                <h3 className="font-semibold text-foreground text-base tracking-tight truncate">
                  {project.name}
                </h3>

                <div className="flex items-center gap-1.5 mt-1 flex-nowrap overflow-x-auto scrollbar-none max-w-full pb-0.5">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium uppercase px-2 py-0.5 rounded-full border ${config.badgeBg}`}>
                    <CategoryIcon className="w-3 h-3" strokeWidth={2} />
                    {getDisplayCategoryLabel(project)}
                    {(project.custom_tag || project.tag_label || project.category_label) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearTag(project);
                        }}
                        className="ml-1 -mr-0.5 hover:text-rose-400"
                        aria-label="Remove custom tag"
                        title="Remove custom tag"
                      >
                        <X className="w-2.5 h-2.5" strokeWidth={2.5} />
                      </button>
                    )}
                  </span>

                  {apy !== null && apy > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">
                      <TrendingUp className="w-3 h-3" strokeWidth={2} />
                      {apy.toFixed(1)}% APY
                    </span>
                  )}

                  {isInfTracking && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/40">
                      <Coins className="w-3 h-3" strokeWidth={2} />
                      {Number(project.inf_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} INF
                    </span>
                  )}

                  {isJupiterLoop && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-lime-500/15 text-lime-300 border border-lime-500/40">
                      <Coins className="w-3 h-3" strokeWidth={2} />
                      Jupiter #{project.jupiter_position_id}
                    </span>
                  )}

                  {roiDays !== null && (
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        roiDays <= 0
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                      }`}
                      data-testid={`roi-badge-${project.id}`}
                    >
                      <Timer className="w-3 h-3" strokeWidth={2} />
                      {roiDays <= 0 ? "ROI Reached" : `${roiDays}d`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTxnProject(project);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border/40 bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors"
                data-testid={`txn-project-${project.id}`}
                title="Add Transaction"
                aria-label="Add transaction"
              >
                <Receipt className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingProject(project);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border/40 bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors"
                data-testid={`edit-project-${project.id}`}
                aria-label="Edit project"
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(project);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border/40 bg-secondary/30 text-rose-400/70 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                data-testid={`delete-project-${project.id}`}
                aria-label="Delete project"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Yield Callout */}
          <div className="rounded-lg bg-secondary/30 border border-border/30 p-2.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
              {isJupiterLoop ? "Net Return" : "Return"}
            </span>
            <div className="font-mono text-xs text-right">
              <span className="font-semibold text-emerald-400">{formatCurrency(daily)}/day</span>
              <span className="text-muted-foreground ml-1.5">({formatCurrency(monthly)}/mo)</span>
            </div>
          </div>

          {isInfTracking && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-secondary/20 border border-border/20 p-2">
                <span className="block text-[9px] uppercase font-semibold text-muted-foreground">INF / SOL</span>
                <span className="font-mono text-foreground">
                  {Number(project.inf_last_rate || 0) > 0 ? Number(project.inf_last_rate).toFixed(8) : "Syncing"}
                </span>
              </div>
              <div className="rounded-md bg-secondary/20 border border-border/20 p-2 text-right">
                <span className="block text-[9px] uppercase font-semibold text-muted-foreground">Rate Source</span>
                <span className="font-mono text-foreground">
                  {project.inf_last_rate_source === "jupiter_market_ratio" ? "Jupiter" : "Pending"}
                </span>
              </div>
            </div>
          )}

          {isJupiterLoop && (
            <div className="space-y-1.5 text-xs">
              <div className="rounded-md bg-secondary/20 border border-border/20 p-2 flex items-start justify-between gap-3">
                <div>
                  <span className="block text-[9px] uppercase font-semibold text-muted-foreground">Collateral</span>
                  <span className="font-mono text-foreground">
                    {Number(project.jupiter_collateral_inf || 0).toFixed(4)} INF
                  </span>
                </div>
                <div className="text-right">
                  <span className="block font-mono text-muted-foreground">
                    {formatCurrency(jupiterCollateralUsd)} supplied
                  </span>
                  <span className="block font-mono text-emerald-400">
                    {Number(project.jupiter_supply_apy || 0).toFixed(2)}% APY
                  </span>
                </div>
              </div>

              <div className="rounded-md bg-secondary/20 border border-border/20 p-2 flex items-start justify-between gap-3">
                <div>
                  <span className="block text-[9px] uppercase font-semibold text-muted-foreground">Debt</span>
                  <span className="font-mono text-foreground">
                    {Number(project.jupiter_borrowed_sol || 0).toFixed(4)} SOL
                  </span>
                </div>
                <div className="text-right">
                  <span className="block font-mono text-muted-foreground">
                    {formatCurrency(jupiterDebtUsd)} borrowed
                  </span>
                  <span className="block font-mono text-amber-400">
                    {Number(project.jupiter_borrow_apy || 0).toFixed(2)}% APY
                  </span>
                </div>
              </div>

              <div className="rounded-md bg-secondary/20 border border-border/20 p-2 flex items-center justify-between gap-3">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Net Equity</span>
                <span className="font-mono text-foreground">
                  {formatCurrency(project.jupiter_net_equity_usd)}
                </span>
              </div>

              <div className="rounded-md bg-secondary/20 border border-border/20 p-2 flex items-center justify-between gap-3">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Net APY</span>
                <span className="font-mono text-lime-300">
                  {Number(project.jupiter_net_apy || 0) >= 0 ? "+" : ""}{Number(project.jupiter_net_apy || 0).toFixed(2)}%
                </span>
              </div>

              <div className="flex items-center justify-between px-1 text-[9px] uppercase text-muted-foreground">
                <span>Jupiter sync</span>
                <span className="font-mono normal-case">{formatSyncTime(project.jupiter_last_synced_at)}</span>
              </div>
            </div>
          )}

          {isLuloLending && (
            <div className="space-y-1.5 text-xs">
              <div className="rounded-md bg-secondary/20 border border-border/20 p-2 flex items-center justify-between gap-3">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Live Balance</span>
                <span className="font-mono text-foreground">{formatCurrency(project.lulo_total_balance_usd)}</span>
              </div>

              <div className="rounded-md bg-secondary/20 border border-border/20 p-2 flex items-center justify-between gap-3">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Current APY</span>
                <span className="font-mono text-emerald-400">{Number(project.lulo_weighted_apy || 0).toFixed(2)}%</span>
              </div>

              <div className="rounded-md bg-secondary/20 border border-border/20 p-2 flex items-start justify-between gap-3">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">USDC</span>
                <div className="text-right">
                  <span className="block font-mono text-foreground">{formatCurrency(project.lulo_usdc_balance_usd)}</span>
                  <span className="block font-mono text-emerald-400">{Number(project.lulo_regular_apy || 0).toFixed(2)}% APY</span>
                </div>
              </div>

              <div className="rounded-md bg-secondary/20 border border-border/20 p-2 flex items-start justify-between gap-3">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">USDS</span>
                <div className="text-right">
                  <span className="block font-mono text-foreground">{formatCurrency(project.lulo_usds_balance_usd)}</span>
                  <span className="block font-mono text-emerald-400">{Number(project.lulo_usds_apy || 0).toFixed(2)}% APY</span>
                </div>
              </div>

              <div className="flex items-center justify-between px-1 text-[9px] uppercase text-muted-foreground">
                <span>Lulo sync</span>
                <span className="font-mono normal-case">{formatSyncTime(project.lulo_last_synced_at)}</span>
              </div>
            </div>
          )}

          {isKryptex && Array.isArray(project.kryptex_miners) && project.kryptex_miners.length > 0 && (
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-secondary/20 border border-border/20 p-2">
                  <span className="block text-[9px] uppercase font-semibold text-muted-foreground">Withdrawable</span>
                  <span className="font-mono text-foreground">{formatCurrency(project.kryptex_withdrawable_usd)}</span>
                </div>
                <div className="rounded-md bg-secondary/20 border border-border/20 p-2 text-right">
                  <span className="block text-[9px] uppercase font-semibold text-muted-foreground">Active Devices</span>
                  <span className="font-mono text-foreground">{project.kryptex_miners.length}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                {project.kryptex_miners.map((miner) => (
                  <div
                    key={`${miner.device}-${miner.coin}-${miner.algorithm}`}
                    className="rounded-md border border-border/20 bg-secondary/20 p-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] font-semibold text-foreground truncate">{miner.device}</p>
                        <p className="text-[9px] font-mono text-muted-foreground uppercase">
                          {miner.coin} · {miner.algorithm} · {miner.miner}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 whitespace-nowrap">
                        {formatCurrency(miner.profitability_usd_day)}/d
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap text-[9px] font-mono text-muted-foreground">
                      {!String(miner.algorithm || "").toLowerCase().includes("randomx") && (
                        <span>{formatHashrate(miner.hashrate)}</span>
                      )}
                      {miner.temperature_c != null && <span className="text-orange-400/80">{miner.temperature_c}°C</span>}
                      {miner.power_w != null && <span className="text-yellow-400/80">{miner.power_w}W</span>}
                      {miner.fan_percent != null && <span>{miner.fan_percent}% fan</span>}
                      {!String(miner.algorithm || "").toLowerCase().includes("randomx") && (
                        <span>Shares {miner.accepted_shares}/{miner.rejected_shares}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between px-1 text-[9px] uppercase text-muted-foreground">
                <span>Kryptex sync</span>
                <span className="font-mono normal-case">{formatSyncTime(project.kryptex_last_synced_at)}</span>
              </div>
            </div>
          )}

          {/* Financial Metrics */}
          <div className={`grid gap-2 text-center ${categoryKey === "lending" ? "grid-cols-2" : "grid-cols-3"}`}>
            <div className="p-2 rounded-md bg-secondary/20 border border-border/20">
              <p className="text-[9px] uppercase font-semibold tracking-wider text-muted-foreground">
                {isJupiterLoop ? "Starting Equity" : isLuloLending ? "Principal" : categoryKey === "lending" ? "Balance" : "Invested"}
              </p>
              <p className="font-mono text-xs font-bold text-foreground mt-0.5">
                {formatCurrency(invested)}
              </p>
            </div>

            <div className="p-2 rounded-md bg-secondary/20 border border-border/20">
              <p className="text-[9px] uppercase font-semibold tracking-wider text-muted-foreground">
                {isJupiterLoop ? "APY Earned" : isLuloLending ? "Interest Earned" : "Earned"}
              </p>
              <p className="font-mono text-xs font-bold text-foreground mt-0.5">
                {isJupiterLoop || isLuloLending ? formatApyEarned(earned) : formatCurrency(earned)}
              </p>
            </div>

            {categoryKey !== "lending" && (
              <div className="p-2 rounded-md bg-secondary/20 border border-border/20">
                <p className="text-[9px] uppercase font-semibold tracking-wider text-muted-foreground">
                  {isJupiterLoop ? "Position P&L" : "Net P&L"}
                </p>
                <p
                  className={`font-mono text-xs font-bold mt-0.5 ${
                    displayedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {displayedPnl >= 0 ? "+" : ""}
                  {formatCurrency(displayedPnl)}
                  {isJupiterLoop && invested > 0 && (
                    <span className="ml-1 text-[9px] opacity-80">
                      ({pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(2)}%)
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Capital Recovery Progress */}
          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground font-mono">Capital Recovered</span>
              <span className="font-mono font-semibold text-foreground">
                {recoveryPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-secondary/60 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${config.progressBg}`}
                style={{ width: `${recoveryPct}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderInactiveProjectCard = (project) => {
    const invested = getProjectInvestedTotal(project);
    const earned = getProjectEarningsTotal(project);
    const pnl = earned - invested;

    return (
      <Card
        key={project.id}
        className="border-border/30 bg-card/60 opacity-75"
        data-testid={`inactive-project-box-${project.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              {project.icon_url ? (
                <img
                  src={project.icon_url}
                  alt=""
                  className="w-8 h-8 rounded-md object-contain grayscale"
                />
              ) : (
                <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center">
                  <span className="text-xs font-bold text-muted-foreground">
                    {(project.name || "?")[0]}
                  </span>
                </div>
              )}

              <span className="font-medium text-muted-foreground text-base">
                {project.name}
              </span>

              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                inactive
              </span>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Invested</p>
                <p className="font-mono text-sm text-muted-foreground">
                  {formatCurrency(project.invested)}
                </p>
              </div>

              <div className="text-right">
                <p className="text-xs text-muted-foreground">Earned</p>
                <p className="font-mono text-sm text-muted-foreground">
                  {formatCurrency(getProjectEarningsTotal(project))}
                </p>
              </div>

              <div className="text-right min-w-[100px]">
                <p className="text-xs text-muted-foreground">Net P&L</p>
                <p
                  className={`font-mono text-sm font-bold ${
                    pnl >= 0 ? "text-emerald-400/70" : "text-rose-400/70"
                  }`}
                >
                  {pnl >= 0 ? "+" : ""}
                  {formatCurrency(pnl)}
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setEditingProject(project)}
                data-testid={`edit-inactive-project-${project.id}`}
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground font-mono animate-pulse">
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="investment-overview-page">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-medium tracking-tight">
          Monthly Earners
        </h1>

        <Button
          size="sm"
          onClick={() => setAddDialogOpen(true)}
          className="bg-white text-black hover:bg-neutral-200"
          data-testid="add-project-btn"
        >
          <Plus className="w-4 h-4 mr-2" strokeWidth={1.5} />
          Add Project
        </Button>
      </div>

      {monthlyBreakdown.length > 0 && (
        <Card className="border-border/40 bg-card" data-testid="monthly-breakdown-card">
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedMonthKey((prev) => moveMonthKey(prev, -1))}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/40 bg-secondary/40 text-2xl font-bold text-foreground hover:bg-secondary"
                aria-label="Previous month"
              >
                &lt;
              </button>

              <div className="flex-1 text-center">
                <h2 className="text-3xl font-bold tracking-wide text-foreground">
                  {formatMonthLabel(selectedMonthKey)}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMonthKey((prev) => moveMonthKey(prev, 1))}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/40 bg-secondary/40 text-2xl font-bold text-foreground hover:bg-secondary"
                aria-label="Next month"
              >
                &gt;
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6 lg:grid-cols-12">
              {monthTiles.map((month) => (
                <button
                  key={month.key}
                  type="button"
                  onClick={() => setSelectedMonthKey(month.key)}
                  className={`min-w-0 rounded-md border px-2 py-3 text-center transition-colors ${
                    month.isSelected
                      ? "border-emerald-400/70 bg-emerald-500/10"
                      : "border-border/40 bg-secondary/30 hover:bg-secondary/60"
                  }`}
                >
                  <span className="block text-xs uppercase text-muted-foreground">
                    {month.label}
                  </span>
                  <span
                    className={`mt-1 block truncate text-xs font-mono font-semibold ${
                      month.total > 0 ? "text-emerald-300" : "text-muted-foreground"
                    }`}
                  >
                    {month.total > 0 ? `+${formatCurrency(month.total).replace(".00", "")}` : "$0"}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-col md:flex-row items-center gap-6 pt-2">
              <div className="w-full md:w-[240px] h-[220px] flex items-center justify-center shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={monthlyBreakdown.map((row) => ({
                        name: row.project.name,
                        value: Number(row.monthly.toFixed(2)),
                      }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={1}
                      stroke="#09090B"
                    >
                      {monthlyBreakdown.map((row, index) => (
                        <Cell
                          key={row.project.id}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      formatter={(value) => [formatCurrency(value) + "/mo", ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1 w-full">
                {monthlyBreakdown.map((row, index) => (
                  <div
                    key={row.project.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30 border border-border/20"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-foreground truncate">
                            {row.project.name}
                          </span>
                          {isInactiveProject(row.project) && (
                            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/40">
                              historic
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {formatCurrency(row.monthly)}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground ml-1.5">
                        ({formatPercent(row.share)})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeProjects.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {[
                { id: "all", label: "All Earner Types", count: categoryCounts.all || 0 },
                { id: "crypto", label: "Crypto Staking", count: categoryCounts.crypto || 0 },
                { id: "stocks", label: "Stocks & Index", count: categoryCounts.stocks || 0 },
                { id: "real_estate", label: "Real Estate", count: categoryCounts.real_estate || 0 },
                { id: "lending", label: "DeFi Lending", count: categoryCounts.lending || 0 },
                { id: "mining", label: "Hardware / Mining", count: categoryCounts.mining || 0 },
                { id: "monthly_rate", label: "Monthly", count: null },
              ]
                .filter((item) => item.id === "all" || item.id === "monthly_rate" || item.count > 0)
                .map((tab) => {
                  if (tab.id === "monthly_rate") {
                    return (
                      <div
                        key={tab.id}
                        className="flex items-center gap-1.5 shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5"
                        data-testid="current-monthly-rate-card"
                        title={`${formatCurrency(totals.per_day)} per day`}
                      >
                        <CalendarClock className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
                        <span className="text-xs text-muted-foreground">Monthly</span>
                        <span className="font-mono text-xs font-bold text-emerald-400" data-testid="current-monthly-rate-value">
                          {formatCurrency(totals.per_month)}
                        </span>
                      </div>
                    );
                  }

                  const isActive = categoryFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setCategoryFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 border ${
                        isActive
                          ? "bg-white text-slate-950 border-white font-semibold shadow"
                          : "bg-secondary/40 text-muted-foreground border-border/40 hover:text-foreground hover:bg-secondary/70"
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                          isActive ? "bg-slate-900 text-white" : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            {customOrder.map((projectId, slotIndex) => {
              const project = projectId != null ? projectById.get(String(projectId)) : null;
              const matchesFilter =
                project &&
                (categoryFilter === "all" || getProjectCategory(project) === categoryFilter);

              // A project hidden by the current filter still owns its physical
              // board position. Render a blank spacer so other cards do not move.
              if (project && !matchesFilter) {
                return (
                  <div
                    key={`filtered-slot-${slotIndex}`}
                    className={`min-h-[260px] rounded-xl border border-transparent ${slotIndex < 3 ? "self-stretch" : ""}`}
                    aria-hidden="true"
                  />
                );
              }

              if (project) {
                return renderUniqueProjectCard(project, slotIndex);
              }

              const isDropTarget = draggedIndex !== null;

              return (
                <div
                  key={`empty-slot-${slotIndex}`}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, slotIndex)}
                  className={`min-h-[260px] rounded-xl border border-dashed transition-all duration-200 flex items-center justify-center ${
                    slotIndex < 3 ? "self-stretch " : ""
                  }${
                    isDropTarget
                      ? "border-emerald-400/50 bg-emerald-500/[0.04]"
                      : "border-border/15 bg-card/[0.08]"
                  }`}
                  data-testid={`empty-project-slot-${slotIndex}`}
                >
                  {isDropTarget && (
                    <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400/70">
                      Drop here
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {inactiveProjects.length > 0 && (
        <div className="space-y-3 pt-6 border-t border-border/40">
          <h2 className="text-xl font-medium tracking-tight text-muted-foreground">
            Inactive Projects
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...inactiveProjects]
              .sort((a, b) => (Number(b.earned) || 0) - (Number(a.earned) || 0))
              .map(renderInactiveProjectCard)}
          </div>
        </div>
      )}

      <AddProjectDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={() => {
          setAddDialogOpen(false);
          fetchProjects();
        }}
      />

      {editingProject && (
        <EditProjectDialog
          project={editingProject}
          open={!!editingProject}
          onOpenChange={(open) => !open && setEditingProject(null)}
          onUpdated={() => {
            setEditingProject(null);
            fetchProjects();
          }}
        />
      )}

      {txnProject && (
        <TransactionsDialog
          project={txnProject}
          open={!!txnProject}
          onOpenChange={(open) => !open && setTxnProject(null)}
          onUpdated={fetchProjects}
        />
      )}
    </div>
  );
}