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
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import AddProjectDialog from "@/components/AddProjectDialog";
import EditProjectDialog from "@/components/EditProjectDialog";
import TransactionsDialog from "@/components/TransactionsDialog";

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

function isInactiveProject(project) {
  return project?.inactive === true || project?.is_inactive === true;
}

function formatPercent(value) {
  const n = Number(value) || 0;
  return `${n.toFixed(1)}%`;
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

function getProjectCategory(project) {
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
    return saved ? JSON.parse(saved) : {};
  });

  const fetchProjects = useCallback(async () => {
    try {
      const res = await projectsApi.getAll();
      setProjects(res.data || []);
    } catch {
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
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
      setDailyReturns(saved ? JSON.parse(saved) : {});
    };

    window.addEventListener("project-daily-returns-updated", refreshDailyReturns);
    window.addEventListener("storage", refreshDailyReturns);

    return () => {
      window.removeEventListener("project-daily-returns-updated", refreshDailyReturns);
      window.removeEventListener("storage", refreshDailyReturns);
    };
  }, []);

  const handleDelete = async (project) => {
    try {
      await projectsApi.delete(project.id);
      toast.success(`${project.name} deleted`);
      fetchProjects();
    } catch {
      toast.error("Failed to delete project");
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const activeProjects = useMemo(() => {
    const active = projects.filter((p) => !isInactiveProject(p));

    if (!customOrder || customOrder.length === 0) return active;

    const orderMap = new Map();
    customOrder.forEach((id, idx) => orderMap.set(String(id), idx));

    return [...active].sort((a, b) => {
      const idxA = orderMap.has(String(a.id)) ? orderMap.get(String(a.id)) : 99999;
      const idxB = orderMap.has(String(b.id)) ? orderMap.get(String(b.id)) : 99999;
      return idxA - idxB;
    });
  }, [projects, customOrder]);

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    const nextList = [...filteredProjects];
    const [movedItem] = nextList.splice(draggedIndex, 1);
    nextList.splice(targetIndex, 0, movedItem);

    const newOrderIds = nextList.map((p) => String(p.id));
    setCustomOrder(newOrderIds);
    try {
      localStorage.setItem(MONTHLY_EARNERS_ORDER_KEY, JSON.stringify(newOrderIds));
      toast.success("Boxes reordered");
    } catch {
      // ignore
    }
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

  const getDailyAmount = (project) => {
    if (isInactiveProject(project)) return 0;

    const tableDaily = Number(dailyReturns?.[project.name]);

    return Number.isFinite(tableDaily) && tableDaily > 0
      ? tableDaily
      : Number(project.per_day) || 0;
  };

  const totals = projects.reduce(
    (acc, p) => {
      const daily = getDailyAmount(p);

      return {
        invested: acc.invested + (Number(p.invested) || 0),
        earned: acc.earned + (Number(p.earned) || 0),
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
      const earningTxns = txns.filter(
        (t) => (t.type === "earning" || !t.type || t.type === "earned") && Number(t.amount) > 0
      );

      if (earningTxns.length > 0) {
        earningTxns.forEach((t) => {
          const mKey = getMonthKeyFromDate(t.date || t.created_at || t.source_date);
          if (mKey) {
            map[mKey] = (map[mKey] || 0) + (Number(t.amount) || 0);
          }
        });
      } else if (Number(p.earned) > 0) {
        const mKey = getMonthKeyFromDate(p.created_at || p.date || p.updated_at) || getCurrentMonthKey();
        map[mKey] = (map[mKey] || 0) + (Number(p.earned) || 0);
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
    activeProjects.forEach((p) => {
      const txns = Array.isArray(p.transactions) ? p.transactions : [];
      const earningTxns = txns.filter(
        (t) => (t.type === "earning" || !t.type || t.type === "earned") && Number(t.amount) > 0
      );

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

    if (monthTotal > 0) {
      return activeProjects
        .map((project) => {
          const monthly = monthEarnedByProject[project.id] || 0;
          return {
            project,
            daily: monthly / 30,
            monthly,
            share: (monthly / monthTotal) * 100,
          };
        })
        .filter((row) => row.monthly > 0)
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
  }, [activeProjects, selectedMonthKey, totals.per_month, dailyReturns]);

  const topEarner = monthlyBreakdown[0] || null;

  function getRoiDays(project) {
    if (isInactiveProject(project)) return null;

    const remaining = (Number(project.invested) || 0) - (Number(project.earned) || 0);

    const tableDaily = Number(dailyReturns?.[project.name]);
    const daily =
      Number.isFinite(tableDaily) && tableDaily > 0
        ? tableDaily
        : Number(project.per_day) || 0;

    if (daily <= 0) return null;
    if (remaining <= 0) return 0;

    return Math.ceil(remaining / daily);
  }

  const renderUniqueProjectCard = (project, index) => {
    const categoryKey = getProjectCategory(project);
    const config = CATEGORY_CONFIGS[categoryKey] || CATEGORY_CONFIGS.other;
    const CategoryIcon = config.icon;

    const invested = Number(project.invested) || 0;
    const earned = Number(project.earned) || 0;
    const pnl = earned - invested;
    const apy = Number(project.apy) || (invested > 0 && project.per_day > 0 ? ((project.per_day * 365) / invested) * 100 : null);
    const dailyTrx = Number(project.daily_trx) || 0;
    const daily = getDailyAmount(project);
    const monthly = daily * 30;
    const roiDays = getRoiDays(project);

    const recoveryPct = invested > 0 ? Math.min(100, Math.max(0, (earned / invested) * 100)) : 100;

    return (
      <Card
        key={project.id}
        draggable
        onDragStart={(e) => handleDragStart(e, index)}
        onDragOver={(e) => handleDragOver(e, index)}
        onDrop={(e) => handleDrop(e, index)}
        className={`relative overflow-hidden transition-all duration-200 cursor-grab active:cursor-grabbing hover:scale-[1.01] ${config.cardBg} ${
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

                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium uppercase px-2 py-0.5 rounded-full border ${config.badgeBg}`}>
                    <CategoryIcon className="w-3 h-3" strokeWidth={2} />
                    {config.label}
                  </span>

                  {dailyTrx > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/40">
                      ⚡ {dailyTrx} TRX/day
                    </span>
                  )}

                  {apy !== null && apy > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">
                      <TrendingUp className="w-3 h-3" strokeWidth={2} />
                      {apy.toFixed(1)}% APY
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
              Return
            </span>
            <div className="font-mono text-xs text-right">
              <span className="font-semibold text-emerald-400">{formatCurrency(daily)}/day</span>
              <span className="text-muted-foreground ml-1.5">({formatCurrency(monthly)}/mo)</span>
            </div>
          </div>

          {/* Financial Metrics */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-md bg-secondary/20 border border-border/20">
              <p className="text-[9px] uppercase font-semibold tracking-wider text-muted-foreground">Invested</p>
              <p className="font-mono text-xs font-bold text-foreground mt-0.5">
                {formatCurrency(invested)}
              </p>
            </div>

            <div className="p-2 rounded-md bg-secondary/20 border border-border/20">
              <p className="text-[9px] uppercase font-semibold tracking-wider text-muted-foreground">Earned</p>
              <p className="font-mono text-xs font-bold text-foreground mt-0.5">
                {formatCurrency(earned)}
              </p>
            </div>

            <div className="p-2 rounded-md bg-secondary/20 border border-border/20">
              <p className="text-[9px] uppercase font-semibold tracking-wider text-muted-foreground">Net P&L</p>
              <p
                className={`font-mono text-xs font-bold mt-0.5 ${
                  pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {pnl >= 0 ? "+" : ""}
                {formatCurrency(pnl)}
              </p>
            </div>
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
    const pnl = (Number(project.earned) || 0) - (Number(project.invested) || 0);

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
                  {formatCurrency(project.earned)}
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
                      <span className="text-sm font-medium text-foreground truncate">
                        {row.project.name}
                      </span>
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
              ]
                .filter((item) => item.id === "all" || item.count > 0)
                .map((tab) => {
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project, index) =>
              renderUniqueProjectCard(project, index)
            )}
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