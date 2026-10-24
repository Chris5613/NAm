import { useMemo, useState } from "react";
import { remoteStorage } from "@/lib/serverStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Bike,
  Car,
  ChevronLeft,
  ChevronRight,
  Plus,
  Package,
  ReceiptText,
  ShoppingCart,
  Trash2,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const STORAGE_KEY = "doordash_earnings_v1";
const APPS = ["DoorDash", "Uber Eats", "Instacart", "Shipt"];

function readEntries() {
  try {
    const parsed = JSON.parse(remoteStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  remoteStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentMonthKey() {
  return todayKey().slice(0, 7);
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function prettyDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function addDaysKey(dateKey, days) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(year, month - 1, day + days, 12, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getWeekStartKey(dateKey = todayKey()) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  const dayOfWeek = date.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return addDaysKey(dateKey, -daysSinceMonday);
}

function weekRangeLabel(startKey) {
  const endKey = addDaysKey(startKey, 6);
  const start = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${endKey}T12:00:00`);
  const sameMonth = start.getMonth() === end.getMonth();

  if (sameMonth) {
    return `${start.toLocaleDateString("en-US", { month: "short" })} ${start.getDate()} – ${end.getDate()}`;
  }

  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function getEarnings(entry) {
  if (Number.isFinite(Number(entry?.earnings))) return Number(entry.earnings);
  if (Number.isFinite(Number(entry?.gross))) return Number(entry.gross);
  if (Number.isFinite(Number(entry?.total))) return Number(entry.total);

  return (
    (Number(entry?.basePay) || 0) +
    (Number(entry?.tips) || 0) +
    (Number(entry?.promo) || 0)
  );
}

function getExpenses(entry) {
  return Math.max(0, Number(entry?.expenses) || 0);
}

function getNet(entry) {
  return getEarnings(entry) - getExpenses(entry);
}

function getApp(entry) {
  const app = String(entry?.app || entry?.platform || "Uber Eats").trim();
  if (app === "Instacart") return "Instacart";
  if (app === "Shipt") return "Shipt";
  if (app === "Uber Eats") return "Uber Eats";
  return "DoorDash";
}

function Metric({ icon: Icon, label, value, detail }) {
  return (
    <Card className="border-border/60 bg-card/70">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span>{label}</span>
        </div>
        <div className="mt-3 text-[28px] font-semibold tracking-tight">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

export default function DoorDashPage() {
  const [entries, setEntries] = useState(readEntries);
  const [addOpen, setAddOpen] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState(() => new Set());
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [chartView, setChartView] = useState("weekly");
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => getWeekStartKey());
  const [form, setForm] = useState({
    app: "Uber Eats",
    date: todayKey(),
    earnings: "",
    expenses: "",
  });

  const currentMonth = currentMonthKey();
  const canGoNextMonth = selectedMonth < currentMonth;

  function goToPreviousMonth() {
    setSelectedMonth((current) => shiftMonth(current, -1));
  }

  function goToNextMonth() {
    setSelectedMonth((current) => {
      const next = shiftMonth(current, 1);
      return next > currentMonth ? current : next;
    });
  }

  const currentWeekStart = getWeekStartKey();
  const canGoNextWeek = selectedWeekStart < currentWeekStart;

  function goToPreviousWeek() {
    setSelectedWeekStart((current) => addDaysKey(current, -7));
  }

  function goToNextWeek() {
    setSelectedWeekStart((current) => {
      const next = addDaysKey(current, 7);
      return next > currentWeekStart ? current : next;
    });
  }

  const monthEntries = useMemo(
    () =>
      entries
        .filter((entry) => String(entry?.date || "").startsWith(selectedMonth))
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
    [entries, selectedMonth]
  );

  const monthGross = monthEntries.reduce((sum, entry) => sum + getEarnings(entry), 0);
  const monthExpenses = monthEntries.reduce((sum, entry) => sum + getExpenses(entry), 0);
  const monthNet = monthEntries.reduce((sum, entry) => sum + getNet(entry), 0);
  const allTimeGross = entries.reduce((sum, entry) => sum + getEarnings(entry), 0);
  const allTimeExpenses = entries.reduce((sum, entry) => sum + getExpenses(entry), 0);
  const allTimeNet = entries.reduce((sum, entry) => sum + getNet(entry), 0);

  const appTotals = useMemo(() => {
    const totals = { DoorDash: 0, "Uber Eats": 0, Instacart: 0, Shipt: 0 };
    monthEntries.forEach((entry) => {
      totals[getApp(entry)] += getEarnings(entry);
    });
    return totals;
  }, [monthEntries]);

  const recentWeeks = useMemo(() => {
    const days = {};

    entries.forEach((entry) => {
      const date = String(entry?.date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

      if (!days[date]) {
        days[date] = {
          date,
          earnings: 0,
          expenses: 0,
          ids: [],
        };
      }

      days[date].earnings += getEarnings(entry);
      days[date].expenses += getExpenses(entry);
      days[date].ids.push(entry.id);
    });

const currentWeekStart = getWeekStartKey();

const customWeeks = Array.from(
  { length: 8 },
  (_, index) => {
    const start = addDaysKey(
      currentWeekStart,
      index * -7
    );

    const end = addDaysKey(
      start,
      6
    );

    return {
      key: start,
      start,
      end,
      label: weekRangeLabel(start),
    };
  }
);
    return customWeeks
      .map((week) => {
        const weekDays = Object.values(days)
          .filter((day) => day.date >= week.start && day.date <= week.end)
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));

        const earnings = weekDays.reduce((sum, day) => sum + day.earnings, 0);
        const expenses = weekDays.reduce((sum, day) => sum + day.expenses, 0);

        return {
          ...week,
          days: weekDays,
          earnings,
          expenses,
          net: earnings - expenses,
        };
      })
      .filter((week) => week.days.length > 0);
  }, [entries]);

  const monthlyChartData = useMemo(() => {
    const byDay = {};

    monthEntries.forEach((entry) => {
      const date = entry.date;
      if (!byDay[date]) {
        byDay[date] = {
          date,
          label: prettyDate(date),
          Earnings: 0,
          Expenses: 0,
        };
      }

      byDay[date].Earnings += getEarnings(entry);
      byDay[date].Expenses += getExpenses(entry);
    });

    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
  }, [monthEntries]);

  const weeklyChartData = useMemo(() => {
    const byDay = {};

    entries.forEach((entry) => {
      const date = String(entry?.date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

      if (!byDay[date]) {
        byDay[date] = { Earnings: 0, Expenses: 0 };
      }

      byDay[date].Earnings += getEarnings(entry);
      byDay[date].Expenses += getExpenses(entry);
    });

    return Array.from({ length: 7 }, (_, index) => {
      const date = addDaysKey(selectedWeekStart, index);
      const totals = byDay[date] || { Earnings: 0, Expenses: 0 };

      return {
        date,
        label: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        Earnings: totals.Earnings,
        Expenses: totals.Expenses,
      };
    });
  }, [entries, selectedWeekStart]);

  const chartData = chartView === "weekly" ? weeklyChartData : monthlyChartData;

  const formEarnings = Math.max(0, Number(form.earnings) || 0);
  const formExpenses = Math.max(0, Number(form.expenses) || 0);
  const formNet = formEarnings - formExpenses;

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function addEntry(event) {
    event.preventDefault();
    if (!form.date || formEarnings <= 0) return;

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      app: form.app,
      date: form.date,
      earnings: formEarnings,
      expenses: formExpenses,
      createdAt: new Date().toISOString(),
    };

    setEntries((current) => {
      const next = [entry, ...current];
      saveEntries(next);
      return next;
    });

    setSelectedMonth(form.date.slice(0, 7));
    setForm((current) => ({
      app: current.app,
      date: current.date,
      earnings: "",
      expenses: "",
    }));
    setAddOpen(false);
  }

  function removeEntry(id) {
    if (!window.confirm("Delete this delivery earnings entry?")) return;

    setEntries((current) => {
      const next = current.filter((entry) => entry.id !== id);
      saveEntries(next);
      return next;
    });
  }

  function removeRecentDay(ids) {
    if (!window.confirm("Delete all delivery earnings for this day?")) return;

    const idSet = new Set(ids);

    setEntries((current) => {
      const next = current.filter((entry) => !idSet.has(entry.id));
      saveEntries(next);
      return next;
    });
  }

  function toggleWeek(weekKey) {
    setExpandedWeeks((current) => {
      const next = new Set(current);

      if (next.has(weekKey)) {
        next.delete(weekKey);
      } else {
        next.add(weekKey);
      }

      return next;
    });
  }

  return (
    <div className="space-y-7" data-testid="doordash-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">DoorDash + Uber Eats + Instacart + Shipt</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Delivery Earnings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Simple tracking for earnings and expenses.
          </p>
        </div>

        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add earnings
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
        <Metric
          icon={WalletCards}
          label="All Time"
          value={money(allTimeNet)}
          detail={`Gross ${money(allTimeGross)} · Expenses ${money(allTimeExpenses)}`}
        />

        <Metric
          icon={WalletCards}
          label="This Month"
          value={money(monthNet)}
          detail={`Gross ${money(monthGross)} · Expenses ${money(monthExpenses)}`}
        />

        <Card className="border-border/60 lg:col-span-2 xl:col-span-1">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Apps this month</p>
                <p className="mt-1 text-xs text-muted-foreground">Gross earnings by delivery app</p>
              </div>
              <ReceiptText className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="mt-4 grid grid-cols-4 gap-3">
              <div className="rounded-lg border border-border/50 bg-muted/15 p-3.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Bike className="h-3.5 w-3.5" />
                  DoorDash
                </div>
                <div className="mt-2 text-lg font-semibold">{money(appTotals.DoorDash)}</div>
              </div>

              <div className="rounded-lg border border-border/50 bg-muted/15 p-3.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Car className="h-3.5 w-3.5" />
                  Uber Eats
                </div>
                <div className="mt-2 text-lg font-semibold">{money(appTotals["Uber Eats"])}</div>
              </div>

              <div className="rounded-lg border border-border/50 bg-muted/15 p-3.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Instacart
                </div>
                <div className="mt-2 text-lg font-semibold">{money(appTotals.Instacart)}</div>
              </div>

              <div className="rounded-lg border border-border/50 bg-muted/15 p-3.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Package className="h-3.5 w-3.5" />
                  Shipt
                </div>
                <div className="mt-2 text-lg font-semibold">{money(appTotals.Shipt)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {chartView === "weekly" ? "Weekly Activity" : "Monthly Activity"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {chartView === "weekly"
                  ? weekRangeLabel(selectedWeekStart)
                  : monthLabel(selectedMonth)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center overflow-hidden rounded-lg border border-border/60 bg-background/60">
                <Button
                  type="button"
                  variant={chartView === "monthly" ? "secondary" : "ghost"}
                  onClick={() => setChartView("monthly")}
                  className="h-10 rounded-none border-r border-border/60 px-4"
                >
                  Monthly
                </Button>
                <Button
                  type="button"
                  variant={chartView === "weekly" ? "secondary" : "ghost"}
                  onClick={() => setChartView("weekly")}
                  className="h-10 rounded-none px-4"
                >
                  Weekly
                </Button>
              </div>

              {chartView === "monthly" && (
                <div className="flex items-center overflow-hidden rounded-lg border border-border/60 bg-background/60">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={goToPreviousMonth}
                    className="h-10 w-10 rounded-none border-r border-border/60"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <div className="min-w-[140px] px-4 text-center text-sm font-medium">
                    {monthLabel(selectedMonth)}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={goToNextMonth}
                    disabled={!canGoNextMonth}
                    className="h-10 w-10 rounded-none border-l border-border/60"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {chartView === "weekly" && (
                <div className="flex items-center overflow-hidden rounded-lg border border-border/60 bg-background/60">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={goToPreviousWeek}
                    className="h-10 w-10 rounded-none border-r border-border/60"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <div className="min-w-[150px] px-4 text-center text-sm font-medium">
                    {weekRangeLabel(selectedWeekStart)}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={goToNextWeek}
                    disabled={!canGoNextWeek}
                    className="h-10 w-10 rounded-none border-l border-border/60"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 h-[380px]">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  barGap={6}
                  margin={{
                    top: 28,
                    right: 12,
                    left: 0,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    opacity={0.15}
                  />

                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11 }}
                  />

                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={50}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `$${value}`}
                  />

                  <Tooltip
                    cursor={false}
                    formatter={(value, name) => [money(value), name]}
                    contentStyle={{
                      background: "#111827",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "12px",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                    }}
                    labelStyle={{
                      color: "#94a3b8",
                    }}
                    itemStyle={{
                      color: "#f8fafc",
                    }}
                  />

                  <Legend />

                  <Bar
                    dataKey="Earnings"
                    name="Delivery Earnings"
                    fill="#34d399"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={46}
                  >
                    <LabelList
                      dataKey="Earnings"
                      position="top"
                      offset={8}
                      formatter={(value) =>
                        Number(value) > 0
                          ? money(value)
                          : ""
                      }
                      fill="#34d399"
                      fontSize={11}
                      fontWeight={600}
                    />
                  </Bar>

                  <Bar
                    dataKey="Expenses"
                    name="Expenses"
                    fill="#ef4444"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={46}
                  >
                    <LabelList
                      dataKey="Expenses"
                      position="top"
                      offset={8}
                      formatter={(value) =>
                        Number(value) > 0
                          ? money(value)
                          : ""
                      }
                      fill="#ef4444"
                      fontSize={11}
                      fontWeight={600}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
                No delivery earnings logged for this month yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b border-border/60 px-6 py-5">
            <ReceiptText className="h-5 w-5" />
            <div>
              <h2 className="font-semibold">Recent Earnings</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Grouped by week</p>
            </div>
          </div>

          {recentWeeks.length ? (
            <div className="divide-y divide-border/60">
              {recentWeeks.map((week) => {
                const isExpanded = expandedWeeks.has(week.key);

                return (
                  <div key={week.key}>
                    <button
                      type="button"
                      onClick={() => toggleWeek(week.key)}
                      className="flex w-full flex-wrap items-center gap-4 bg-muted/20 px-6 py-4 text-left transition hover:bg-muted/30"
                      aria-expanded={isExpanded}
                    >
                      <div className="flex min-w-[180px] flex-1 items-center gap-3">
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                        <div>
                          <div className="text-sm font-semibold">{week.label}</div>
                        </div>
                      </div>

                      <div className="text-right text-xs text-muted-foreground">
                        <div>Gross {money(week.earnings)}</div>
                        <div>Expenses {money(week.expenses)}</div>
                      </div>

                      <div className="min-w-[110px] text-right">
                        <div className={`font-semibold ${week.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {week.net >= 0 ? "+" : ""}
                          {money(week.net)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">weekly net</div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="divide-y divide-border/40">
                        {week.days.map((day) => {
                          const net = day.earnings - day.expenses;

                          return (
                            <div key={day.date} className="flex flex-wrap items-center gap-4 px-6 py-3 pl-10">
                              <div className="min-w-[150px] flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{prettyDate(day.date)}</span>
                                </div>
                              </div>

                              <div className="text-right text-xs text-muted-foreground">
                                <div>Earned {money(day.earnings)}</div>
                                <div>Expenses {money(day.expenses)}</div>
                              </div>

                              <div className="min-w-[105px] text-right">
                                <div className={`font-semibold ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  {net >= 0 ? "+" : ""}
                                  {money(net)}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">net</div>
                              </div>

                              <button
                                type="button"
                                onClick={() => removeRecentDay(day.ids)}
                                className="text-muted-foreground transition hover:text-rose-400"
                                title="Delete this day's entries"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              Nothing logged for these weeks yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add delivery earnings</DialogTitle>
            <DialogDescription>Add one DoorDash, Uber Eats, Instacart, or Shipt work session.</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={addEntry}>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">App</label>
              <div className="grid grid-cols-2 gap-2">
                {APPS.map((app) => (
                  <Button
                    key={app}
                    type="button"
                    variant={form.app === app ? "default" : "outline"}
                    onClick={() => updateForm("app", app)}
                  >
                    {app}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Date</label>
              <Input
                type="date"
                value={form.date}
                max={todayKey()}
                onClick={(event) => {
                  if (typeof event.currentTarget.showPicker === "function") {
                    event.currentTarget.showPicker();
                  }
                }}
                onChange={(event) => updateForm("date", event.target.value)}
                className="cursor-pointer"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Earnings</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="$0.00"
                value={form.earnings}
                onChange={(event) => updateForm("earnings", event.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Expenses</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Gas, parking, tolls..."
                value={form.expenses}
                onChange={(event) => updateForm("expenses", event.target.value)}
              />
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Net</span>
                <span className={`text-lg font-semibold ${formNet >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {formNet >= 0 ? "+" : ""}
                  {money(formNet)}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={formEarnings <= 0}>
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
