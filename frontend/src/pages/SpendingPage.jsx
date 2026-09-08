import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
} from "lucide-react";

const CATEGORIES = [
  "Housing", "Utilities", "Groceries", "Dining", "Gas & Fuel", "Transportation", "Travel",
  "Shopping", "Subscriptions", "Entertainment", "Health", "Personal Care", "Pets", "Education",
  "Insurance", "Taxes", "Fees", "Income", "Transfers", "Payments", "Other",
];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CATEGORY_COLORS = ["#60a5fa", "#34d399", "#a78bfa", "#f472b6", "#22d3ee", "#818cf8", "#2dd4bf", "#94a3b8"];

const dayKey = (date) => date.toISOString().slice(0, 10);
const monthKeyOf = (date = new Date()) => date.toISOString().slice(0, 7);
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

// Running spend total per day index for one month.
function cumulativeByDay(items, key, length) {
  const totals = new Map();
  items
    .filter((item) => item.date?.startsWith(key))
    .forEach((item) => {
      const day = Number(item.date.slice(-2));
      totals.set(day, (totals.get(day) || 0) + Number(item.amount || 0));
    });
  let running = 0;
  return Array.from({ length }, (_, index) => {
    running += totals.get(index + 1) || 0;
    return running;
  });
}

function TransactionRow({ item, categories, showDate, onRecategorize, onHide, onAddCategory }) {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const Icon = getTransactionIcon(item.category);
  const options = categories.includes(item.category) ? categories : [item.category, ...categories];

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-400/10 text-blue-300">
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
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budget, setBudget] = useState(0);
  const [budgetInput, setBudgetInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [simplefinDialogOpen, setSimplefinDialogOpen] = useState(false);
  const [simplefinUrl, setSimplefinUrl] = useState("");
  const [allTransactionsOpen, setAllTransactionsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isLinking, setIsLinking] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [range, setRange] = useState("month");
  const [selectedMonth, setSelectedMonth] = useState(() => monthKeyOf());
  const [transaction, setTransaction] = useState(emptyTransaction);
  const [customCategories, setCustomCategories] = useState([]);
  const categories = useMemo(() => [...CATEGORIES, ...customCategories], [customCategories]);

  const today = dayKey(new Date());
  const currentMonth = monthKeyOf();
  const selectedYear = selectedMonth.slice(0, 4);
  const isCurrentMonth = selectedMonth === currentMonth;
  const previousMonth = shiftMonth(selectedMonth, -1);
  const elapsedDays = isCurrentMonth ? new Date().getDate() : daysInMonth(selectedMonth);

  const monthTransactions = useMemo(
    () => transactions.filter((item) => item.date?.startsWith(selectedMonth) && item.date <= today).sort((a, b) => b.date.localeCompare(a.date)),
    [selectedMonth, today, transactions]
  );
  const yearTransactions = useMemo(
    () => transactions.filter((item) => item.date?.startsWith(selectedYear) && item.date <= today).sort((a, b) => b.date.localeCompare(a.date)),
    [selectedYear, today, transactions]
  );
  const rangeTransactions = range === "ytd" ? yearTransactions : monthTransactions;

  const totalSpent = useMemo(() => rangeTransactions.reduce((sum, item) => sum + Number(item.amount || 0), 0), [rangeTransactions]);
  const yearTotal = useMemo(() => yearTransactions.reduce((sum, item) => sum + Number(item.amount || 0), 0), [yearTransactions]);

  const monthTiles = useMemo(() => {
    const totals = new Map();
    transactions
      .filter((item) => item.date?.startsWith(selectedYear) && item.date <= today)
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
      const totals = new Map();
      yearTransactions.forEach((item) => {
        const index = Number(item.date.slice(5, 7)) - 1;
        totals.set(index, (totals.get(index) || 0) + Number(item.amount || 0));
      });
      const length = selectedYear === String(new Date().getFullYear()) ? new Date().getMonth() + 1 : 12;
      let running = 0;
      return Array.from({ length }, (_, index) => {
        running += totals.get(index) || 0;
        return { label: MONTH_LABELS[index], spent: running };
      });
    }

    const current = cumulativeByDay(transactions, selectedMonth, elapsedDays);
    const previous = cumulativeByDay(transactions, previousMonth, elapsedDays);
    return current.map((spent, index) => ({ label: String(index + 1), spent, previous: previous[index] }));
  }, [elapsedDays, previousMonth, range, selectedMonth, selectedYear, transactions, yearTransactions]);

  // Compares the same number of elapsed days so a partial month is judged fairly.
  const previousMonthToDate = useMemo(() => {
    const previous = cumulativeByDay(transactions, previousMonth, elapsedDays);
    return previous[previous.length - 1] || 0;
  }, [elapsedDays, previousMonth, transactions]);
  const monthDelta = totalSpent - previousMonthToDate;

  const categoryBreakdown = useMemo(() => {
    const totals = new Map();
    rangeTransactions.forEach((item) => {
      const category = item.category || "Other";
      totals.set(category, (totals.get(category) || 0) + Number(item.amount || 0));
    });
    return [...totals.entries()]
      .map(([category, amount]) => ({ category, amount, share: totalSpent ? (amount / totalSpent) * 100 : 0 }))
      .sort((first, second) => second.amount - first.amount);
  }, [rangeTransactions, totalSpent]);

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
      Array.from({ length: 7 }, (_, index) => {
        const day = new Date();
        day.setDate(day.getDate() + index);
        return { key: dayKey(day), weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day), number: day.getDate() };
      }),
    []
  );
  const upcoming = useMemo(() => transactions.filter((item) => item.date >= today && item.date <= upcomingDays[6].key), [today, upcomingDays, transactions]);

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

  useEffect(() => {
    loadAll();
    settingsApi.get("spending_custom_categories").then((saved) => {
      if (Array.isArray(saved)) setCustomCategories(saved.filter((category) => typeof category === "string" && category.trim()));
    }).catch(() => {});
  }, [loadAll]);

  const addCategory = (value) => {
    const category = value.trim().replace(/\s+/g, " ");
    if (!category || categories.some((item) => item.toLowerCase() === category.toLowerCase())) return "";
    const next = [...customCategories, category];
    setCustomCategories(next);
    settingsApi.set("spending_custom_categories", next).catch(() => toast.error("Could not save the category."));
    return category;
  };

  const sync = async (itemId) => {
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
      toast.error(error.message || "Could not sync SimpleFIN transactions.");
    } finally {
      setIsSyncing(false);
    }
  };

  const syncNetWorthBalances = async (serverAccounts = accounts) => {
    const existing = (await assetsApi.getAll()).data || [];
    const existingByProviderId = new Map(existing.map((asset) => [asset.provider_account_id || asset.providerAccountId, asset]));
    for (const account of serverAccounts) {
      if (!account.providerAccountId || account.currentBalance === null || account.currentBalance === undefined) continue;
      const type = String(account.type || "").toLowerCase();
      const name = String(account.name || "").toLowerCase();
      const classifiedCategory = account.classification?.category;
      const isDebt = classifiedCategory === "debts" || (
        !classifiedCategory && (
          type.includes("credit") ||
          type.includes("card") ||
          name.includes("sapphire") ||
          name.includes("freedom") ||
          name.includes("slate") ||
          name.includes("credit") ||
          name.includes("card")
        )
      );
      const payload = {
        id: `simplefin-asset-${account.providerAccountId}`,
        name: account.name,
        category: isDebt ? "debts" : "cash",
        symbol: null,
        quantity: 1,
        current_price: 0,
        manual_value: Math.abs(Number(account.currentBalance) || 0),
        provider_account_id: account.providerAccountId,
        provider: "simplefin",
        synced_at: new Date().toISOString(),
      };
      const current = existingByProviderId.get(account.providerAccountId);
      const nameMatch = existing.find(
        (asset) =>
          !asset.provider_account_id &&
          String(asset.name || "").trim().toLowerCase() === String(account.name || "").trim().toLowerCase() &&
          asset.category === payload.category
      );
      if (current || nameMatch) await assetsApi.update((current || nameMatch).id, payload);
      else await assetsApi.create(payload);
    }
  };

  const linkAccount = async () => {
    setSimplefinDialogOpen(true);
  };

  const fetchSimplefinInBrowser = async (accessUrl) => {
    const parsed = new URL(accessUrl);
    const username = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    parsed.username = "";
    parsed.password = "";
    const path = parsed.pathname.replace(/\/$/, "");
    parsed.pathname = path.endsWith("/accounts") ? path : `${path}/accounts`;
    const startDate = Math.floor((Date.now() - 90 * 86400000) / 1000);
    const queryVariants = [
      `start-date=${startDate}&version=2`,
      `start-date=${startDate}`,
      "version=2",
    ];
    let bestPayload = null;
    let lastError = null;

    for (const query of queryVariants) {
      parsed.search = query ? `?${query}` : "";
      const response = await fetch(parsed.toString(), {
        headers: { Accept: "application/json", Authorization: `Basic ${window.btoa(`${username}:${password}`)}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = data?.errlist?.map((item) => item.description || item.code).join(", ") || `SimpleFIN returned HTTP ${response.status}`;
        lastError = new Error(detail);
        continue;
      }

      const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
      const transactionCount = accounts.reduce(
        (total, account) => total + (Array.isArray(account?.transactions) ? account.transactions.length : 0),
        Array.isArray(data?.transactions) ? data.transactions.length : 0
      );
      const bestCount = bestPayload?.transactionCount ?? -1;
      if (!bestPayload || transactionCount > bestCount) {
        bestPayload = { data, transactionCount };
      }
      if (transactionCount > 0) break;
    }

    if (!bestPayload) throw lastError || new Error("SimpleFIN returned no account data.");
    return bestPayload.data;
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
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Cash flow</p>
          <h1 className="mt-1 text-3xl font-semibold">Spending</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={isSyncing} onClick={() => sync()}>
            <RefreshCw className={isSyncing ? "animate-spin" : ""} /> {isSyncing ? "Syncing" : "Sync"}
          </Button>
          <Button size="sm" variant="outline" disabled={isLinking} onClick={linkAccount}>
            <Link2 /> {isLinking ? "Connecting" : "Connect SimpleFIN"}
          </Button>
          <Button size="sm" onClick={() => setTransactionDialogOpen(true)}>
            <Plus /> Add expense
          </Button>
        </div>
      </header>

      <Card className="mb-5 rounded-lg border-border/70 bg-secondary/20 shadow-none">
        <CardContent className="space-y-5 p-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Previous month"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/40 bg-secondary/40 hover:bg-secondary"
              onClick={() => setSelectedMonth((key) => shiftMonth(key, -1))}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 text-center">
              <h2 className="text-2xl font-bold tracking-wide sm:text-3xl">{monthLabel(selectedMonth)}</h2>
              <p className="mt-1 font-mono text-xs font-semibold">
                {selectedYear} Yearly Spend: <span className="text-emerald-300">{money(yearTotal)}</span>
              </p>
            </div>
            <button
              type="button"
              aria-label="Next month"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/40 bg-secondary/40 hover:bg-secondary"
              onClick={() => setSelectedMonth((key) => shiftMonth(key, 1))}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6 lg:grid-cols-12">
            {monthTiles.map((month) => (
              <button
                key={month.key}
                type="button"
                onClick={() => setSelectedMonth(month.key)}
                className={`min-w-0 rounded-md border px-2 py-3 text-center transition-colors ${
                  month.key === selectedMonth ? "border-emerald-400/70 bg-emerald-500/10" : "border-border/40 bg-secondary/30 hover:bg-secondary/60"
                }`}
              >
                <span className="block text-xs uppercase text-muted-foreground">{month.label}</span>
                <span className={`mt-1 block truncate font-mono text-xs font-semibold ${month.total ? "text-foreground" : "text-muted-foreground"}`}>
                  {month.total ? money(month.total) : "-"}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-5">
        <Card className="rounded-lg border-border/70 bg-card shadow-none">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{range === "ytd" ? `${selectedYear} spend to date` : `${monthLabel(selectedMonth)} spend`}</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">{money(totalSpent)}</p>
                {range === "month" && previousMonthToDate > 0 && (
                  <p className={`mt-1 text-xs ${monthDelta <= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {money(Math.abs(monthDelta))} {monthDelta <= 0 ? "less" : "more"} than last month{isCurrentMonth ? " at this point" : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {range === "month" && budget > 0 && <p className="max-w-36 text-right text-xs leading-4 text-emerald-400">{money(Math.max(budget - totalSpent, 0))} left in budget</p>}
                <div className="flex rounded-md border border-border/70 p-0.5">
                  {[
                    { key: "month", label: "Month" },
                    { key: "ytd", label: "Year to date" },
                  ].map((option) => (
                    <button
                      key={option.key}
                      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                        range === option.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setRange(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 12, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spending-area" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis
                    tick={{ fill: "#a1a1aa", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => (value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${value}`)}
                  />
                  <Tooltip
                    formatter={(value, name) => [money(value), name === "previous" ? "Last month" : "Spent"]}
                    labelFormatter={(label) => (range === "ytd" ? label : `Day ${label}`)}
                    contentStyle={{ background: "#19191c", border: "1px solid #3f3f46", borderRadius: 6 }}
                  />
                  {range === "month" && budget > 0 && <ReferenceLine y={budget} stroke="#71717a" strokeDasharray="4 4" />}
                  {range === "month" && <Area type="monotone" dataKey="previous" stroke="#52525b" strokeWidth={2} strokeDasharray="4 4" fill="none" dot={false} />}
                  <Area
                    type="monotone"
                    dataKey="spent"
                    stroke="#60a5fa"
                    strokeWidth={3}
                    fill="url(#spending-area)"
                    dot={{ r: 3, fill: "#93c5fd", stroke: "#1d4ed8", strokeWidth: 1 }}
                    activeDot={{ r: 6, fill: "#bfdbfe", stroke: "#18181b", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <i className="h-0.5 w-5 bg-blue-400" /> {range === "ytd" ? "Cumulative this year" : "Selected month"}
              </span>
              {range === "month" && (
                <span className="flex items-center gap-1.5">
                  <i className="h-0 w-5 border-t-2 border-dashed border-zinc-600" /> Last month
                </span>
              )}
              {range === "month" && budget > 0 && (
                <span className="flex items-center gap-1.5">
                  <i className="h-0 w-5 border-t border-dashed border-zinc-500" /> Budget
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border/70 bg-card shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Category breakdown</h2>
              <span className="text-xs text-muted-foreground">{range === "ytd" ? selectedYear : monthLabel(selectedMonth)}</span>
            </div>
            {categoryBreakdown.length ? (
              <>
                <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-secondary">
                  {categoryBreakdown.map((entry, index) => (
                    <div
                      key={entry.category}
                      title={`${entry.category}: ${money(entry.amount)}`}
                      style={{ width: `${entry.share}%`, background: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                    />
                  ))}
                </div>
                <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                  {categoryBreakdown.map((entry, index) => (
                    <div className="flex items-center gap-2" key={entry.category}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />
                      <span className="min-w-0 flex-1 truncate text-sm">{entry.category}</span>
                      <span className="text-sm font-semibold tabular-nums">{money(entry.amount)}</span>
                      <span className="w-9 text-right text-xs text-muted-foreground">{Math.round(entry.share)}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No spending in this period yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border/70 bg-card shadow-none">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="font-semibold">Recent transactions</h2>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                {rangeTransactions.length} {range === "ytd" ? "this year" : "this month"}
              </span>
            </div>
            {groups.length ? (
              groups.map(([date, items]) => (
                <div key={date}>
                  <div className="flex justify-between border-y border-border/60 bg-secondary/35 px-5 py-2 text-xs text-muted-foreground">
                    <span>{humanDate(date)}</span>
                    <span>{money(items.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</span>
                  </div>
                  {items.map((item) => (
                    <TransactionRow key={item.id} item={item} categories={categories} onRecategorize={recategorize} onHide={hideTransaction} onAddCategory={addCategory} />
                  ))}
                </div>
              ))
            ) : (
              <div className="px-5 py-16 text-center">
                <ReceiptText className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">No transactions in this period.</p>
              </div>
            )}
            <div className="grid grid-cols-2 divide-x divide-border/60 border-t border-border/60">
              <button className="py-3 text-sm font-medium hover:bg-secondary/50" onClick={() => setAllTransactionsOpen(true)}>
                See all
              </button>
              <button className="flex items-center justify-center gap-1 py-3 text-sm font-medium hover:bg-secondary/50" onClick={() => setTransactionDialogOpen(true)}>
                Add expense <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-10 border-t border-border/60 pt-8">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Accounts &amp; upcoming</h2>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="rounded-lg border-border/70 bg-card shadow-none">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-5 py-4">
                <h2 className="font-semibold">Accounts</h2>
                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => sync()} disabled={isSyncing}>
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} /> Sync now
                </button>
              </div>
              {accounts.length ? (
                accounts.map((account) => {
                  const Icon = getAccountIcon(account);
                  return (
                    <div className="flex items-center gap-3 border-t border-border/60 px-5 py-4" key={account.id}>
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{account.name}</span>
                        {account.classification?.matchedName ? (
                          <span className="mt-0.5 block text-xs text-rose-300">
                            Matched: {account.classification.matchedName}
                          </span>
                        ) : account.classification?.confidence === "possible" ? (
                          <span className="mt-0.5 block text-xs text-amber-300">Possible credit card</span>
                        ) : null}
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{money(account.currentBalance, "Linked")}</span>
                      <button title="Remove account" onClick={() => removeAccount(account.id)}>
                        <ChevronRight className="h-4 w-4 text-muted-foreground hover:text-rose-400" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="border-t border-border/60 px-5 py-12 text-center">
                  <WalletCards className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="mt-3 text-sm text-muted-foreground">Link an account to see balances and activity.</p>
                </div>
              )}
              <button className="flex w-full items-center gap-2 border-t border-border/60 px-5 py-3 text-sm text-emerald-400 hover:bg-emerald-400/5" onClick={linkAccount}>
                <Plus className="h-4 w-4" /> Link bank account
              </button>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border/70 bg-card shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Upcoming</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Scheduled expenses in the next seven days.</p>
                </div>
                {budget > 0 && <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-400">Budget set</span>}
              </div>
              <div className="mt-6 grid grid-cols-7 divide-x divide-border/60">
                {upcomingDays.map((day) => {
                  const items = upcoming.filter((item) => item.date === day.key);
                  return (
                    <div className="min-w-0 px-1 text-center" key={day.key}>
                      <p className="text-[10px] uppercase text-muted-foreground">{day.weekday}</p>
                      <p className={`mt-1 text-sm font-semibold ${day.key === today ? "text-emerald-400" : ""}`}>{day.number}</p>
                      <div className="mt-3 min-h-12 space-y-1">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            title={`${item.merchant}: ${money(item.amount)}`}
                            className="mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-blue-400/15 text-blue-300"
                          >
                            <CircleDollarSign className="h-3 w-3" />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {upcoming.length ? (
                <div className="mt-5 space-y-2 border-t border-border/60 pt-4">
                  {upcoming.slice(0, 3).map((item) => (
                    <div className="flex justify-between text-sm" key={item.id}>
                      <span>{item.merchant}</span>
                      <span className="font-medium">{money(item.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-5 border-t border-border/60 pt-4 text-sm text-muted-foreground">No upcoming expenses have been added.</p>
              )}
              <div className="mt-5 flex gap-2">
                <Input aria-label="Monthly budget" type="number" min="0" placeholder="Monthly budget" value={budgetInput} onChange={(event) => setBudgetInput(event.target.value)} />
                <Button size="sm" variant="outline" onClick={saveBudget}>
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

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
              filteredTransactions.map((item) => <TransactionRow key={item.id} item={item} categories={categories} showDate onRecategorize={recategorize} onHide={hideTransaction} onAddCategory={addCategory} />)
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
