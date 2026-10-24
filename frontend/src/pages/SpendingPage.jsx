import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Area, AreaChart, PieChart, Pie, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { settingsApi, spendingApi } from "@/lib/apiClient";
import { api } from "@/lib/apiClient";
import { assetsApi } from "@/lib/api";
import {
  ArrowDownRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Link2,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  Utensils,
  WalletCards,
  EyeOff,
  Eye,
  Settings2,
} from "lucide-react";

const CATEGORIES = [
  "Housing", "Utilities", "Groceries", "Dining", "Gas & Fuel", "Transportation", "Travel",
  "Shopping", "Subscriptions", "Entertainment", "Health", "Personal Care", "Pets", "Education",
  "Insurance", "Taxes", "Fees", "Income", "Transfers", "Payments", "Other",
];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CATEGORY_COLORS = ["#60a5fa", "#34d399", "#a78bfa", "#f472b6", "#22d3ee", "#818cf8", "#2dd4bf", "#94a3b8"];
const SIMPLEFIN_REQUEST_HOUR_KEY = "simplefin_request_hour";

const dayKey = (date) => date.toISOString().slice(0, 10);
const monthKeyOf = (date = new Date()) => date.toISOString().slice(0, 7);
const hourKeyOf = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}`;
};
const nextHourOf = (date = new Date()) => {
  const nextHour = new Date(date);
  nextHour.setHours(date.getHours() + 1, 0, 0, 0);
  return nextHour;
};
const timeLabel = (date) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
const simplefinHourLock = (date = new Date()) => {
  const nextHour = nextHourOf(date);
  const currentHour = hourKeyOf(date);

  return {
    isLocked: false,
    currentHour,
    nextHourLabel: timeLabel(nextHour),
  };
};
// why it no work
const reserveSimplefinHour = () => {
  return;
};
const money = (amount, fallback = "$0") =>
  amount === null || amount === undefined || Number.isNaN(Number(amount))
    ? fallback
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
const humanDate = (date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`));
const emptyTransaction = () => ({ merchant: "", amount: "", category: "Dining", date: dayKey(new Date()), accountId: "" });

function shiftMonth(key, amount) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return `${new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long" })} ${year}`;
}

function getAccountIcon(account) {
  const type = String(account.type || "").toLowerCase();
  return type.includes("credit") ? CreditCard : type.includes("saving") ? WalletCards : Building2;
}

function getTransactionIcon(category) {
  return category === "Food & drink" ? Utensils : category === "Shopping" ? ShoppingBag : ArrowDownRight;
}

const isIncome = (item) => item.category === "Income";
const isExpense = (item) => !["Income", "Transfers", "Payments"].includes(item.category);

// Running total per day index for one month.
function cumulativeByDay(items, key, length, predicate = isExpense) {
  const totals = new Map();
  items
    .filter((item) => item.date?.startsWith(key) && predicate(item))
    .forEach((item) => {
      const day = Number(item.date.slice(-2));
      totals.set(day, (totals.get(day) || 0) + Math.abs(Number(item.amount || 0)));
    });
  let running = 0;
  return Array.from({ length }, (_, index) => {
    running += totals.get(index + 1) || 0;
    return running;
  });
}

function TransactionRow({ item, color, categories, showDate, onRecategorize, onHide, onAddCategory }) {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const Icon = getTransactionIcon(item.category);
  const options = categories.includes(item.category) ? categories : [item.category, ...categories];

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${color}22`, color }}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {item.merchant}
          {item.pending && <span className="ml-1 text-muted-foreground">| Pending</span>}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <button
            type="button"
            className="-ml-1 rounded border border-transparent px-1 py-0 text-xs text-muted-foreground hover:border-border/70 hover:text-foreground"
            onClick={() => setCategoryOpen(true)}
            aria-label={`Change category for ${item.merchant}`}
          >
            {item.category}
          </button>
          {showDate && <span className="text-xs text-muted-foreground">{humanDate(item.date)}</span>}
        </div>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{money(item.amount)}</span>
      <button title="Hide transaction" className="shrink-0 text-muted-foreground hover:text-amber-400" onClick={() => onHide(item.id)}>
        <EyeOff className="h-3.5 w-3.5" />
      </button>
      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="w-[min(92vw,42rem)] max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose category</DialogTitle>
            <DialogDescription>{item.merchant}</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
            {options.map((category) => (
              <Button
                key={category}
                type="button"
                variant={category === item.category ? "default" : "outline"}
                className="justify-start"
                onClick={() => {
                  onRecategorize(item.id, category);
                  setCategoryOpen(false);
                }}
              >
                {category}
              </Button>
            ))}
          </div>
          <div className="flex gap-2 border-t border-border/60 pt-4">
            <Input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="New category"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const added = onAddCategory(newCategory);
                  if (added) {
                    onRecategorize(item.id, added);
                    setNewCategory("");
                    setCategoryOpen(false);
                  }
                }
              }}
            />
            <Button
              type="button"
              onClick={() => {
                const added = onAddCategory(newCategory);
                if (added) {
                  onRecategorize(item.id, added);
                  setNewCategory("");
                  setCategoryOpen(false);
                }
              }}
            >
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SpendingPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budget, setBudget] = useState(0);
  const [budgetInput, setBudgetInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [simplefinDialogOpen, setSimplefinDialogOpen] = useState(false);
  const [simplefinUrl, setSimplefinUrl] = useState("");
  const [allTransactionsOpen, setAllTransactionsOpen] = useState(false);
  const [categoryTransactionsOpen, setCategoryTransactionsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isLinking, setIsLinking] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [range, setRange] = useState("month");
  const [selectedMonth, setSelectedMonth] = useState(() => monthKeyOf());
  const [transaction, setTransaction] = useState(emptyTransaction);
  const [customCategories, setCustomCategories] = useState([]);
  const categories = useMemo(() => [...CATEGORIES, ...customCategories], [customCategories]);
  const syncLock = simplefinHourLock();

  const today = dayKey(new Date());
  const currentMonth = monthKeyOf();
  const selectedYear = selectedMonth.slice(0, 4);
  const isCurrentMonth = selectedMonth === currentMonth;
  const previousMonth = shiftMonth(selectedMonth, -1);
  const elapsedDays = isCurrentMonth ? new Date().getDate() : daysInMonth(selectedMonth);
  const [hiddenTransactionsOpen, setHiddenTransactionsOpen] =
  useState(false);

const [hiddenTransactions, setHiddenTransactions] =
  useState([]);

const [loadingHiddenTransactions, setLoadingHiddenTransactions] =
  useState(false);

  const monthTransactions = useMemo(
    () => transactions.filter((item) => item.date?.startsWith(selectedMonth) && item.date <= today).sort((a, b) => b.date.localeCompare(a.date)),
    [selectedMonth, today, transactions]
  );
  const yearTransactions = useMemo(
    () => transactions.filter((item) => item.date?.startsWith(selectedYear) && item.date <= today).sort((a, b) => b.date.localeCompare(a.date)),
    [selectedYear, today, transactions]
  );
  const rangeTransactions = range === "ytd" ? yearTransactions : monthTransactions;
  const categoryTransactions = useMemo(
    () => rangeTransactions.filter((item) => item.category === selectedCategory),
    [rangeTransactions, selectedCategory]
  );

  const totalSpent = useMemo(() => rangeTransactions.filter(isExpense).reduce((sum, item) => sum + Math.abs(Number(item.amount || 0)), 0), [rangeTransactions]);
  const totalIncome = useMemo(() => rangeTransactions.filter(isIncome).reduce((sum, item) => sum + Math.abs(Number(item.amount || 0)), 0), [rangeTransactions]);
  const netCashFlow = totalIncome - totalSpent;
  const yearTotal = useMemo(() => yearTransactions.filter(isExpense).reduce((sum, item) => sum + Math.abs(Number(item.amount || 0)), 0), [yearTransactions]);

  const monthTiles = useMemo(() => {
    const totals = new Map();
    transactions
      .filter((item) => item.date?.startsWith(selectedYear) && item.date <= today && isExpense(item))
      .forEach((item) => {
        const key = item.date.slice(0, 7);
        totals.set(key, (totals.get(key) || 0) + Number(item.amount || 0));
      });
    return MONTH_LABELS.map((label, index) => {
      const key = `${selectedYear}-${String(index + 1).padStart(2, "0")}`;
      return { key, label, total: totals.get(key) || 0 };
    });
  }, [selectedYear, today, transactions]);

  const chartData = useMemo(() => {
    if (range === "ytd") {
      const expenses = new Map(), incomes = new Map();
      yearTransactions.forEach((item) => {
        const index = Number(item.date.slice(5, 7)) - 1;
        const amount = Math.abs(Number(item.amount || 0));
        if (isIncome(item)) incomes.set(index, (incomes.get(index) || 0) + amount);
        else if (isExpense(item)) expenses.set(index, (expenses.get(index) || 0) + amount);
      });
      const length = selectedYear === String(new Date().getFullYear()) ? new Date().getMonth() + 1 : 12;
      let spent = 0, income = 0;
      return Array.from({ length }, (_, index) => {
        spent += expenses.get(index) || 0;
        income += incomes.get(index) || 0;
        return { label: MONTH_LABELS[index], spent, income };
      });
    }
    const current = cumulativeByDay(transactions, selectedMonth, elapsedDays, isExpense);
    const income = cumulativeByDay(transactions, selectedMonth, elapsedDays, isIncome);
    const previous = cumulativeByDay(transactions, previousMonth, elapsedDays, isExpense);
    return current.map((spent, index) => ({ label: String(index + 1), spent, income: income[index], previous: previous[index] }));
  }, [elapsedDays, previousMonth, range, selectedMonth, selectedYear, transactions, yearTransactions]);

  // Compares the same number of elapsed days so a partial month is judged fairly.
  const previousMonthToDate = useMemo(() => {
    const previous = cumulativeByDay(transactions, previousMonth, elapsedDays);
    return previous[previous.length - 1] || 0;
  }, [elapsedDays, previousMonth, transactions]);
  const monthDelta = totalSpent - previousMonthToDate;

  const categoryBreakdown = useMemo(() => {
    const totals = new Map();
    rangeTransactions.filter(isExpense).forEach((item) => {
      const category = item.category || "Other";
      totals.set(category, (totals.get(category) || 0) + Number(item.amount || 0));
    });
    return [...totals.entries()]
      .map(([category, amount]) => ({ category, amount, share: totalSpent ? (amount / totalSpent) * 100 : 0 }))
      .sort((first, second) => second.amount - first.amount);
  }, [rangeTransactions, totalSpent]);

  const categoryColorMap = useMemo(
    () => Object.fromEntries(categoryBreakdown.map((entry, index) => [entry.category, CATEGORY_COLORS[index % CATEGORY_COLORS.length]])),
    [categoryBreakdown]
  );

  const groups = useMemo(() => {
    const grouped = new Map();
    rangeTransactions.slice(0, 12).forEach((item) => grouped.set(item.date, [...(grouped.get(item.date) || []), item]));
    return [...grouped.entries()];
  }, [rangeTransactions]);

  const filteredTransactions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rangeTransactions.filter(
      (item) => (categoryFilter === "all" || item.category === categoryFilter) && (!term || item.merchant.toLowerCase().includes(term))
    );
  }, [categoryFilter, rangeTransactions, search]);

  const upcomingDays = useMemo(
    () =>
      Array.from({ length: 14 }, (_, index) => {
        const day = new Date();
        day.setDate(day.getDate() + index);
        return { key: dayKey(day), weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day), number: day.getDate() };
      }),
    []
  );
  const upcoming = useMemo(() => transactions.filter((item) => item.date >= today && item.date <= upcomingDays[13].key), [today, upcomingDays, transactions]);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [serverAccounts, serverTransactions, serverBudget] = await Promise.all([
        spendingApi.accounts(),
        spendingApi.transactions(),
        spendingApi.getBudget(),
      ]);
      setAccounts(serverAccounts || []);
      setTransactions(serverTransactions || []);
      setBudget(serverBudget || 0);
      setBudgetInput(serverBudget ? String(serverBudget) : "");
      return serverAccounts || [];
    } catch (error) {
      toast.error(error.message || "Could not load spending data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

const syncNetWorthBalances = useCallback(async (serverAccounts = []) => {
  const existing = (await assetsApi.getAll()).data || [];

  const existingByProviderId = new Map(
    existing.map((asset) => [
      asset.provider_account_id || asset.providerAccountId,
      asset,
    ])
  );

  for (const account of serverAccounts) {
    if (
      !account.providerAccountId ||
      account.currentBalance === null ||
      account.currentBalance === undefined
    ) {
      continue;
    }

    const type = String(account.type || "").toLowerCase();
    const name = String(account.name || "").toLowerCase();
    const classifiedCategory = account.classification?.category;

    const isDebt =
      classifiedCategory === "debts" ||
      (!classifiedCategory &&
        (type.includes("credit") ||
          type.includes("card") ||
          name.includes("sapphire") ||
          name.includes("freedom") ||
          name.includes("slate") ||
          name.includes("credit") ||
          name.includes("card")));

    const current = existingByProviderId.get(
      account.providerAccountId
    );

    const nameMatch = existing.find(
      (asset) =>
        !asset.provider_account_id &&
        String(asset.name || "")
          .trim()
          .toLowerCase() ===
          String(account.name || "")
            .trim()
            .toLowerCase() &&
        asset.category ===
          (isDebt ? "debts" : "cash")
    );

    const matchedAsset = current || nameMatch;

    const incomingBalance = Math.abs(
      Number(account.currentBalance) || 0
    );

    const existingBalance = Math.abs(
      Number(matchedAsset?.manual_value) || 0
    );

    const safeBalance =
      isDebt &&
      incomingBalance === 0 &&
      existingBalance > 0
        ? existingBalance
        : incomingBalance;

    const payload = {
      id: `simplefin-asset-${account.providerAccountId}`,
      name: account.name,
      category: isDebt ? "debts" : "cash",
      symbol: null,
      quantity: 1,
      current_price: 0,
      manual_value: safeBalance,
      provider_account_id:
        account.providerAccountId,
      provider: "simplefin",
      synced_at: new Date().toISOString(),
    };

    if (matchedAsset) {
      await assetsApi.update(
        matchedAsset.id,
        payload
      );
    } else {
      await assetsApi.create(payload);
    }
  }
}, []);

  const sync = useCallback(async (itemId) => {
    const lock = simplefinHourLock();
    if (lock.isLocked) {
      toast.error(`SimpleFIN was already requested this hour. Your next sync is at ${lock.nextHourLabel}.`);
      return;
    }

    setIsSyncing(true);
    try {
      const connections = await api.get("/api/simplefin/connections");
      const selected = itemId ? connections.filter((connection) => connection.id === itemId) : connections;
      if (!selected.length) throw new Error("No SimpleFIN connections found.");
      let accountCount = 0;
      let receivedCount = 0;
      let incoming = [];
      for (const connection of selected) {
        const payload = await fetchSimplefinInBrowser(connection.access_url);
        const result = await api.post("/api/simplefin/browser-sync", {
          connection_id: connection.id,
          payload,
        });
        accountCount += result?.accounts || 0;
        receivedCount += result?.received_transactions || 0;
        incoming = [...incoming, ...(result?.transactions || [])];
      }
      const refreshedAccounts = await loadAll();
      await syncNetWorthBalances(refreshedAccounts);
      toast.success(incoming.length ? `${incoming.length} expenses synced` : `${accountCount} accounts checked; ${receivedCount} transactions received`);
    } catch (error) {
      if (Number.isFinite(error.retryAfter)) {
        sessionStorage.setItem("simplefin_rate_limited_until", String(Date.now() + error.retryAfter * 1000));
      } else if (error.message?.startsWith("SimpleFIN is rate-limiting")) {
        sessionStorage.setItem("simplefin_rate_limited_until", String(Date.now() + 60 * 1000));
      }
      toast.error(error.message || "Could not sync SimpleFIN transactions.");
    } finally {
      setIsSyncing(false);
    }
  }, [loadAll, syncNetWorthBalances]);

  useEffect(() => {
    let mounted = true;

    const initializePage = async () => {
      await loadAll();
      try {
        const connections = await api.get("/api/simplefin/connections");
        if (!mounted || !Array.isArray(connections) || connections.length === 0) return;
      } catch {
        // No SimpleFIN connection configured; skip the background sync.
      }
    };

    initializePage();
    settingsApi.get("spending_custom_categories").then((saved) => {
      if (!mounted) return;
      if (Array.isArray(saved)) setCustomCategories(saved.filter((category) => typeof category === "string" && category.trim()));
    }).catch(() => {});

    return () => {
      mounted = false;
    };
  }, [loadAll]);

  const addCategory = (value) => {
    const category = value.trim().replace(/\s+/g, " ");
    if (!category || categories.some((item) => item.toLowerCase() === category.toLowerCase())) return "";
    const next = [...customCategories, category];
    setCustomCategories(next);
    settingsApi.set("spending_custom_categories", next).catch(() => toast.error("Could not save the category."));
    return category;
  };

  const openCategoryTransactions = (category) => {
    setSelectedCategory(category);
    setCategoryTransactionsOpen(true);
  };

  const linkAccount = async () => {
    setSimplefinDialogOpen(true);
  };

  const fetchSimplefinInBrowser = async (accessUrl) => {
    reserveSimplefinHour();
    // Save before sending because even a failed provider request counts against the hourly allowance.

    const parsed = new URL(accessUrl);
    const username = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    parsed.username = "";
    parsed.password = "";
    const path = parsed.pathname.replace(/\/$/, "");
    parsed.pathname = path.endsWith("/accounts") ? path : `${path}/accounts`;
    const startDate = Math.floor((Date.now() - 90 * 86400000) / 1000);
    parsed.search = `?start-date=${startDate}&version=2`;
    const response = await fetch(parsed.toString(), {
      headers: { Accept: "application/json", Authorization: `Basic ${window.btoa(`${username}:${password}`)}` },
    });
    const data = await response.json().catch(() => null);

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") || "0");
      const waitMessage = retryAfter ? ` Wait ${retryAfter} seconds before trying again.` : " Wait a minute before trying again.";
      const error = new Error(`SimpleFIN is rate-limiting requests.${waitMessage}`);
      error.retryAfter = retryAfter || 60;
      throw error;
    }
    if (!response.ok) {
      const detail = data?.errlist?.map((item) => item.description || item.code).join(", ") || `SimpleFIN returned HTTP ${response.status}`;
      throw new Error(detail);
    }
    if (!Array.isArray(data?.accounts) && !Array.isArray(data?.transactions)) {
      throw new Error("SimpleFIN returned no account data.");
    }
    return data;
  };

  const connectSimplefin = async () => {
    setIsLinking(true);
    try {
      let accessUrl = simplefinUrl.trim();
      if (!accessUrl.startsWith("https://")) {
        const claimed = await api.post("/api/simplefin/claim", { setup_token: accessUrl });
        accessUrl = claimed.access_url;
      }
      const result = await api.post("/api/simplefin/connections", { access_url: accessUrl });
      const payload = await fetchSimplefinInBrowser(accessUrl);
      await api.post("/api/simplefin/browser-sync", { connection_id: result.id, payload });
      setSimplefinUrl("");
      setSimplefinDialogOpen(false);
      toast.success(`${payload.accounts?.length || "Your"} account${payload.accounts?.length === 1 ? "" : "s"} connected`);
      const refreshedAccounts = await loadAll();
      await syncNetWorthBalances(refreshedAccounts);
    } catch (error) {
      toast.error(error.message || "Could not connect SimpleFIN.");
    } finally {
      setIsLinking(false);
    }
  };

  const recategorize = async (id, category) => {
    const previous = transactions;
    setTransactions((current) => current.map((item) => (item.id === id ? { ...item, category } : item)));
    try {
      await spendingApi.patchTransaction(id, { category });
    } catch (error) {
      setTransactions(previous);
      toast.error(error.message || "Could not update the category.");
    }
  };

  const deleteTransaction = async (id) => {
    const previous = transactions;
    setTransactions((current) => current.filter((item) => item.id !== id));
    try {
      await spendingApi.deleteTransaction(id);
    } catch (error) {
      setTransactions(previous);
      toast.error(error.message || "Could not delete the expense.");
    }
  };

  const hideTransaction = async (id) => {
    const previous = transactions;
    setTransactions((current) => current.filter((item) => item.id !== id));
    try {
      await spendingApi.hideTransaction(id);
    } catch (error) {
      setTransactions(previous);
      toast.error(error.message || "Could not hide the transaction.");
    }
  };

  const openHiddenTransactions = async () => {
  setHiddenTransactionsOpen(true);
  setLoadingHiddenTransactions(true);

  try {
    const hidden =
      await spendingApi.hiddenTransactions();

    setHiddenTransactions(
      Array.isArray(hidden) ? hidden : []
    );
  } catch (error) {
    toast.error(
      error.message ||
        "Could not load hidden transactions."
    );
  } finally {
    setLoadingHiddenTransactions(false);
  }
};

const unhideTransaction = async (id) => {
  try {
    const restored =
      await spendingApi.unhideTransaction(id);

    setHiddenTransactions((current) =>
      current.filter((item) => item.id !== id)
    );

    setTransactions((current) =>
      [restored, ...current].sort((a, b) =>
        String(b.date || "").localeCompare(
          String(a.date || "")
        )
      )
    );

    toast.success("Transaction restored");
  } catch (error) {
    toast.error(
      error.message ||
        "Could not restore the transaction."
    );
  }
};

  const removeAccount = async (id) => {
    const previous = accounts;
    setAccounts((current) => current.filter((item) => item.id !== id));
    try {
      await spendingApi.deleteAccount(id);
    } catch (error) {
      setAccounts(previous);
      toast.error(error.message || "Could not remove the account.");
    }
  };

  const addTransaction = async () => {
    const amount = Number(transaction.amount);
    if (!transaction.merchant.trim() || !Number.isFinite(amount) || amount <= 0) return;
    try {
      const saved = await spendingApi.saveTransaction({ ...transaction, merchant: transaction.merchant.trim(), amount });
      setTransactions((current) => [saved, ...current]);
      setTransaction(emptyTransaction());
      setTransactionDialogOpen(false);
      toast.success("Expense added");
    } catch (error) {
      toast.error(error.message || "Could not add the expense.");
    }
  };

  const saveBudget = async () => {
    const value = Math.max(Number(budgetInput) || 0, 0);
    try {
      await spendingApi.setBudget(value);
      setBudget(value);
      setBudgetInput(value ? String(value) : "");
      toast.success("Budget saved");
    } catch (error) {
      toast.error(error.message || "Could not save the budget.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1510px] space-y-5 pb-10" data-testid="spending-page">
      <header className="flex min-h-[60px] flex-wrap items-center justify-between gap-4 pb-1">
        <h1 className="text-[26px] font-medium tracking-tight">Spending</h1>
        <div className="flex items-center gap-2.5">
          <button type="button" title="Sync accounts" aria-label="Sync accounts" disabled={isSyncing || syncLock.isLocked} onClick={() => sync()} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground hover:text-white disabled:opacity-50"><RefreshCw className={"h-4 w-4 " + (isSyncing ? "animate-spin" : "")}/></button>
          <button type="button" title="Connect SimpleFIN" aria-label="Connect SimpleFIN" disabled={isLinking} onClick={linkAccount} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground hover:text-white disabled:opacity-50"><Link2 className="h-4 w-4"/></button>
          <div title={user?.username || "Account"} className="ml-1 flex h-11 w-11 items-center justify-center rounded-full border-2 border-violet-400 text-xs font-semibold text-white">{String(user?.username || "U").slice(0,2).toUpperCase()}</div>
          <button type="button" onClick={() => setTransactionDialogOpen(true)} title="Add expense" aria-label="Add expense" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3b3c40] text-white hover:bg-[#4a4b50]"><Plus className="h-5 w-5"/></button>
          <a href="#spending-budget" title="Budget settings" aria-label="Budget settings" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2a2b2e] text-white hover:bg-[#3b3c40]"><Settings2 className="h-5 w-5"/></a>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1310px] items-start gap-[18px] xl:grid-cols-[minmax(0,2.2fr)_minmax(310px,0.95fr)]">
        <div className="min-w-0 space-y-4">
          <section id="spending-overview" className="overflow-hidden rounded-[18px] border border-[#222428] bg-[#111214]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#222428] px-[18px] py-4">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Spend this {range === "ytd" ? "year" : "month"}</h2>
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Previous month" className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => setSelectedMonth(key => shiftMonth(key, -1))}><ChevronLeft className="h-4 w-4" /></button>
                <span className="min-w-[94px] text-center text-[11px] font-medium">{range === "ytd" ? selectedYear : monthLabel(selectedMonth)}</span>
                <button type="button" aria-label="Next month" className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => setSelectedMonth(key => shiftMonth(key, 1))}><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="px-5 pb-4 pt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[30px] font-semibold leading-none tracking-tight tabular-nums">{money(totalSpent)}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">{range === "ytd" ? `${selectedYear} cumulative spending` : monthLabel(selectedMonth)}</p>
                  {range === "month" && previousMonthToDate > 0 && (
                    <p className={`mt-1 text-[11px] ${monthDelta <= 0 ? "text-emerald-400" : "text-rose-400"}`}>{money(Math.abs(monthDelta))} {monthDelta <= 0 ? "less" : "more"} than last month{isCurrentMonth ? " to date" : ""}</p>
                  )}
                </div>
                <div className="flex rounded-lg border border-border/50 bg-background/50 p-0.5">
                  {[["month", "Month"], ["ytd", "YTD"]].map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setRange(key)} className={`rounded-md px-3 py-1.5 text-[11px] ${range === key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="mt-5 h-[clamp(225px,29vh,300px)] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 4, left: -22, bottom: 0 }}>
                    <defs><linearGradient id="originSpendingFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38a5df" stopOpacity={0.24}/><stop offset="100%" stopColor="#38a5df" stopOpacity={0}/></linearGradient></defs>
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#78828d", fontSize: 10 }} minTickGap={28} />
                    <YAxis hide domain={["auto", "auto"]}/>
                    <Tooltip contentStyle={{ background: "#17191d", border: "1px solid #30343b", borderRadius: 10, fontSize: 12 }} labelFormatter={label => range === "ytd" ? label : `Day ${label}`} formatter={(value, name) => [money(value), name === "previous" ? "Previous month" : name === "income" ? "Income" : "Spent"]}/>
                    {range === "month" && budget > 0 && <ReferenceLine y={budget} stroke="#64748b" strokeDasharray="4 4" />}
                    {range === "month" && <Area type="monotone" dataKey="previous" stroke="#6b7280" strokeWidth={1.6} strokeDasharray="3 4" fill="none" dot={false}/>}
                    <Area type="monotone" dataKey="spent" stroke="#38a5df" strokeWidth={2.5} fill="url(#originSpendingFill)" dot={false} activeDot={{ r: 4 }}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-[#38a5df]"/>Spending</span>
                {range === "month" && <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-slate-500"/>Previous month</span>}
                {range === "month" && budget > 0 && <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-slate-400"/>Budget</span>}
              </div>
            </div>
          </section>

          <div className="grid gap-[18px] lg:grid-cols-2">
            <section id="spending-transactions" className="min-w-0 overflow-hidden rounded-[18px] border border-[#222428] bg-[#111214]">
              <div className="flex items-center justify-between border-b border-[#222428] px-[18px] py-4">
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Latest transactions</h2>
                <button type="button" onClick={() => setAllTransactionsOpen(true)} className="text-[11px] text-muted-foreground hover:text-foreground">See all <ChevronRight className="inline h-3 w-3"/></button>
              </div>
              <div className="divide-y divide-border/35 px-4">
                {rangeTransactions.length ? rangeTransactions.slice(0, 5).map(item => (
                  <div key={item.id} className="flex items-center gap-2.5 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary"><ReceiptText className="h-3.5 w-3.5 text-muted-foreground"/></div>
                    <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{item.merchant || "Transaction"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{humanDate(item.date)} · {item.category || "Other"}{item.pending ? " · Pending" : ""}</p></div>
                    <span className={`shrink-0 text-xs font-medium tabular-nums ${isIncome(item) ? "text-emerald-400" : ""}`}>{money(item.amount)}</span>
                  </div>
                )) : <p className="py-8 text-center text-xs text-muted-foreground">No transactions in this period.</p>}
              </div>
              <div className="grid grid-cols-2 divide-x divide-border/40 border-t border-border/40">
                <button type="button" onClick={openHiddenTransactions} className="py-3 text-[11px] text-muted-foreground hover:bg-secondary/40">Hidden transactions</button>
                <button type="button" onClick={() => setTransactionDialogOpen(true)} className="py-3 text-[11px] text-muted-foreground hover:bg-secondary/40">Add expense</button>
              </div>
            </section>

            <section id="spending-upcoming" className="min-w-0 overflow-hidden rounded-[18px] border border-[#222428] bg-[#111214]">
              <div className="flex items-center justify-between border-b border-[#222428] px-[18px] py-4">
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Upcoming transactions</h2>
                <span className="text-[10px] text-muted-foreground">Next 14 days</span>
              </div>
              <div className="grid grid-cols-7 gap-[2px] px-3 pt-3">
                {upcomingDays.map(day => {
                  const dayItems = upcoming.filter(item => item.date === day.key);
                  const total = dayItems.reduce((sum,item) => sum + Math.abs(Number(item.amount || 0)), 0);
                  return <div key={day.key} className="min-w-0 border border-[#23252a] bg-[#0e0f11] px-0.5 pb-1.5 pt-1 text-center">
                    <p className="text-[9px] text-[#868b94]">{day.weekday}</p><p className="mt-1 text-[12px] text-white">{day.number}</p>
                    <div className="mt-2 flex h-3 items-center justify-center gap-0.5">{dayItems.slice(0,3).map((item,index) => <span key={item.id || index} className={"h-1.5 w-1.5 rounded-full "+(isIncome(item) ? "bg-emerald-400" : "bg-rose-400")}/>)}</div>
                    <p className="mt-1 truncate text-[9px] text-[#858a93]">{dayItems.length ? money(total) : "—"}</p>
                  </div>;
                })}
              </div>
              <div className="mt-3 space-y-2 border-t border-border/35 px-4 py-3">
                {upcoming.length ? upcoming.slice(0, 4).map((item,index) => (
                  <div key={item.id || index} className="flex items-center justify-between gap-2 text-[11px]"><span className="min-w-0 truncate">{item.merchant || item.category || "Transaction"} <span className="text-muted-foreground">· {humanDate(item.date)}</span></span><span className="shrink-0 tabular-nums">{money(item.amount)}</span></div>
                )) : <p className="py-3 text-center text-[11px] text-muted-foreground">No dated transactions scheduled in the next 7 days.</p>}
                <p className="text-[10px] text-muted-foreground">Based on recorded transaction dates, not predicted bills.</p>
              </div>
            </section>
          </div>

          <section id="spending-reports" className="overflow-hidden rounded-[18px] border border-[#222428] bg-[#111214]">
            <div className="flex items-center justify-between border-b border-[#222428] px-[18px] py-4">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Reports</h2><span className="text-[11px] text-muted-foreground">{selectedYear} spending by month</span>
            </div>
            <div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4">
              <div><p className="text-[10px] text-muted-foreground">Income</p><p className="mt-1 text-lg font-semibold tabular-nums text-emerald-400">{money(totalIncome)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Expenses</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(totalSpent)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Net cash flow</p><p className={`mt-1 text-lg font-semibold tabular-nums ${netCashFlow >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{money(netCashFlow)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Yearly spend</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(yearTotal)}</p></div>
            </div>
            <div className="grid grid-cols-6 gap-1.5 border-t border-border/35 px-5 py-4 sm:grid-cols-12">
              {monthTiles.map(month => {
                const largest = Math.max(1, ...monthTiles.map(tile => Math.abs(tile.total)));
                return <button type="button" key={month.key} onClick={() => { setSelectedMonth(month.key); setRange("month"); document.getElementById("spending-overview")?.scrollIntoView({ behavior: "smooth" }); }} className="group flex min-w-0 flex-col items-center gap-1.5" title={`${month.label}: ${money(month.total)}`}>
                  <div className="flex h-14 w-full items-end justify-center rounded-md bg-secondary/25 p-1"><div className={`w-full rounded-sm ${month.key === selectedMonth ? "bg-sky-400" : "bg-slate-500/60 group-hover:bg-sky-400/65"}`} style={{ height: `${Math.max(month.total ? 7 : 2, Math.abs(month.total) / largest * 100)}%` }}/></div>
                  <span className="text-[9px] text-muted-foreground">{month.label}</span>
                </button>;
              })}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-4">
          <section id="spending-categories" className="overflow-hidden rounded-[18px] border border-[#222428] bg-[#111214]">
            <div className="flex items-center justify-between border-b border-[#222428] px-[18px] py-4">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Category breakdown</h2><span className="text-[10px] text-muted-foreground">{range === "ytd" ? selectedYear : monthLabel(selectedMonth)}</span>
            </div>
            <div className="p-4">
              {categoryBreakdown.length ? <>
                <div className="relative mx-auto h-[235px] w-full max-w-[330px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={categoryBreakdown} dataKey="amount" nameKey="category" innerRadius="69%" outerRadius="91%" stroke="#111214" strokeWidth={4} paddingAngle={2.5} startAngle={90} endAngle={-270}>
                      {categoryBreakdown.map((entry,index) => <Cell key={entry.category} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}/>)}
                    </Pie><Tooltip contentStyle={{ background: "#17191d", border: "1px solid #30343b", borderRadius: 9, fontSize: 11 }} formatter={value => money(value)}/></PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><p className="text-xl font-semibold tabular-nums">{money(totalSpent)}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Total expenses</p></div>
                </div>
                <div className="mt-3 divide-y divide-[#25272b] overflow-hidden rounded-[14px] border border-[#26282d] px-3">
                  {categoryBreakdown.map((entry,index) => <button key={entry.category} type="button" onClick={() => openCategoryTransactions(entry.category)} className="flex w-full items-center gap-2.5 rounded-md py-3 text-left transition-colors hover:bg-[#202227]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}/>
                    <span className="min-w-0 flex-1 truncate text-[12px]">{entry.category}</span><span className="shrink-0 text-[12px] font-medium tabular-nums">{money(entry.amount)}</span><span className="w-10 shrink-0 text-right text-[10px] text-muted-foreground">{Math.round(entry.share)}%</span>
                  </button>)}
                </div>
              </> : <p className="py-12 text-center text-xs text-muted-foreground">No spending in this period yet.</p>}
            </div>
          </section>

          <section id="spending-budget" className="overflow-hidden rounded-[18px] border border-[#222428] bg-[#111214]">
            <div className="flex items-center justify-between border-b border-[#222428] px-[18px] py-4">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">Monthly budget</h2><span className="text-[10px] text-muted-foreground">{monthLabel(selectedMonth)}</span>
            </div>
            <div className="px-5 py-4">
              <p className="text-[23px] font-semibold tabular-nums">{money(totalSpent)} <span className="text-[12px] font-normal text-muted-foreground">of {budget > 0 ? money(budget) : "no budget set"}</span></p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#27292e]"><div className={`h-full rounded-full ${budget > 0 && totalSpent > budget ? "bg-rose-400" : "bg-emerald-400"}`} style={{ width: `${budget > 0 ? Math.min(100, totalSpent / budget * 100) : 0}%` }}/></div>
              <div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>{budget > 0 ? `${money(Math.max(0,budget-totalSpent))} remaining` : "Set a budget to track progress"}</span><span>{budget > 0 ? `${Math.round(totalSpent/budget*100)}%` : "—"}</span></div>
              <div className="mt-4 flex gap-2"><Input aria-label="Monthly budget" className="h-9 min-w-0 text-xs" type="number" min="0" placeholder="Budget amount" value={budgetInput} onChange={event => setBudgetInput(event.target.value)}/><Button size="sm" variant="outline" className="h-9 shrink-0 text-xs" onClick={saveBudget}>Save</Button></div>
            </div>
          </section>
        </aside>
      </div>

      <Dialog
  open={hiddenTransactionsOpen}
  onOpenChange={setHiddenTransactionsOpen}
>
  <DialogContent className="max-w-2xl">
    <DialogHeader>
      <DialogTitle>Hidden transactions</DialogTitle>

      <DialogDescription>
        Hidden transactions are excluded from your spending
        totals. Restore any transaction to include it again.
      </DialogDescription>
    </DialogHeader>

    <div className="-mx-6 max-h-[60vh] divide-y divide-border/40 overflow-y-auto border-y border-border/60">
      {loadingHiddenTransactions ? (
        <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading hidden transactions...
        </div>
      ) : hiddenTransactions.length ? (
        hiddenTransactions.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-4 px-6 py-4"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {item.merchant}
              </p>

              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{item.category}</span>
                <span>•</span>
                <span>{humanDate(item.date)}</span>
              </div>
            </div>

            <div className="text-right">
              <p className="text-sm font-semibold tabular-nums">
                {money(item.amount)}
              </p>
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() =>
                unhideTransaction(item.id)
              }
            >
              <Eye className="h-4 w-4" />
              Unhide
            </Button>
          </div>
        ))
      ) : (
        <div className="px-6 py-12 text-center">
          <Eye className="mx-auto h-7 w-7 text-muted-foreground" />

          <p className="mt-3 text-sm font-medium">
            No hidden transactions
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Transactions you hide will appear here.
          </p>
        </div>
      )}
    </div>

    <DialogFooter>
      <Button
        variant="outline"
        onClick={() =>
          setHiddenTransactionsOpen(false)
        }
      >
        Close
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

      <Dialog open={allTransactionsOpen} onOpenChange={setAllTransactionsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>All transactions</DialogTitle>
            <DialogDescription>
              {range === "ytd" ? selectedYear : monthLabel(selectedMonth)} · {filteredTransactions.length} shown
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search merchant" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <select
              aria-label="Filter by category"
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option className="bg-zinc-950" value="all">
                All categories
              </option>
              {categoryBreakdown.map((entry) => (
                <option className="bg-zinc-950" key={entry.category} value={entry.category}>
                  {entry.category}
                </option>
              ))}
            </select>
          </div>
          <div className="-mx-6 max-h-[55vh] divide-y divide-border/40 overflow-y-auto border-y border-border/60">
            {filteredTransactions.length ? (
              filteredTransactions.map((item) => <TransactionRow key={item.id} item={item} color={categoryColorMap[item.category] || CATEGORY_COLORS[CATEGORY_COLORS.length - 1]} categories={categories} showDate onRecategorize={recategorize} onHide={hideTransaction} onAddCategory={addCategory} />)
            ) : (
              <p className="px-5 py-12 text-center text-sm text-muted-foreground">No transactions match this search.</p>
            )}
          </div>
          <DialogFooter>
            <div className="flex w-full items-center justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold tabular-nums">{money(filteredTransactions.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</span>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryTransactionsOpen} onOpenChange={setCategoryTransactionsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedCategory} transactions</DialogTitle>
            <DialogDescription>
              {range === "ytd" ? selectedYear : monthLabel(selectedMonth)} · {categoryTransactions.length} shown
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] divide-y divide-border/40 overflow-y-auto border-y border-border/60">
            {categoryTransactions.length ? (
              categoryTransactions.map((item) => (
                <TransactionRow
                  key={item.id}
                  item={item}
                  color={categoryColorMap[item.category] || CATEGORY_COLORS[CATEGORY_COLORS.length - 1]}
                  categories={categories}
                  showDate
                  onRecategorize={recategorize}
                  onHide={hideTransaction}
                  onAddCategory={addCategory}
                />
              ))
            ) : (
              <p className="px-5 py-12 text-center text-sm text-muted-foreground">No transactions in this category.</p>
            )}
          </div>
          <DialogFooter>
            <div className="flex w-full items-center justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold tabular-nums">{money(categoryTransactions.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</span>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={simplefinDialogOpen} onOpenChange={setSimplefinDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect SimpleFIN</DialogTitle>
            <DialogDescription>
              Paste the SimpleFIN setup token you received, or an HTTPS access URL if you already claimed it. The setup token is exchanged securely by the backend.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium" htmlFor="simplefin-access-url">SimpleFIN access URL</label>
            <Input
              className="mt-2"
              id="simplefin-access-url"
              type="url"
              placeholder="Setup token or https://..."
              value={simplefinUrl}
              onChange={(event) => setSimplefinUrl(event.target.value)}
            />
            <p className="mt-2 text-xs text-muted-foreground">Create this URL in SimpleFIN Bridge after linking your institutions.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSimplefinDialogOpen(false)}>Cancel</Button>
            <Button disabled={isLinking || !simplefinUrl.trim()} onClick={connectSimplefin}>
              {isLinking ? "Connecting" : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transactionDialogOpen} onOpenChange={setTransactionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add an expense</DialogTitle>
            <DialogDescription>It will be included in the totals for its month.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="merchant">
                Merchant
              </label>
              <Input className="mt-2" id="merchant" placeholder="Grocery store" value={transaction.merchant} onChange={(event) => setTransaction({ ...transaction, merchant: event.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="amount">
                Amount
              </label>
              <Input className="mt-2" id="amount" type="number" min="0" step="0.01" placeholder="0.00" value={transaction.amount} onChange={(event) => setTransaction({ ...transaction, amount: event.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="date">
                Date
              </label>
              <Input className="mt-2" id="date" type="date" value={transaction.date} onChange={(event) => setTransaction({ ...transaction, date: event.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="category">
                Category
              </label>
              <select
                className="mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                id="category"
                value={transaction.category}
                onChange={(event) => setTransaction({ ...transaction, category: event.target.value })}
              >
                {categories.map((category) => (
                  <option className="bg-zinc-950" key={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="transaction-account">
                Account
              </label>
              <select
                className="mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                id="transaction-account"
                value={transaction.accountId}
                onChange={(event) => setTransaction({ ...transaction, accountId: event.target.value })}
              >
                <option className="bg-zinc-950" value="">
                  Unassigned
                </option>
                {accounts.map((account) => (
                  <option className="bg-zinc-950" key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addTransaction}>Add expense</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
