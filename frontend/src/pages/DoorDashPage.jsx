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
import {
  addDaysKey,
  currentMonthKey,
  formatDeliveryMoney as money,
  getDeliveryApp as getApp,
  getEarnings,
  getExpenses,
  getNet,
  getWeekStartKey,
  monthLabel,
  prettyDate,
  shiftMonth,
  todayKey,
  weekRangeLabel,
} from "@/lib/deliveryEarnings";

const STORAGE_KEY = "doordash_earnings_v1";
const APPS = ["DoorDash", "Uber Eats", "Instacart", "Shipt"];
const APP_STYLES = {
  DoorDash: { icon: Bike, color: "#32d99b" },
  "Uber Eats": { icon: Car, color: "#60a5fa" },
  Instacart: { icon: ShoppingCart, color: "#ffbc57" },
  Shipt: { icon: Package, color: "#b291fa" },
};

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

function Metric({ icon: Icon, label, value, detail, tone = "text-foreground" }) {
  return (
    <Card className="flex min-h-[122px] min-w-0 flex-col justify-center rounded-[15px] border-[#29394a] bg-[#0d151e]">
      <CardContent className="px-4 py-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <Icon className="h-4 w-4 shrink-0" />
          <span>{label}</span>
        </div>
        <div className={`mt-2 text-[clamp(21px,2vw,28px)] font-bold tracking-tight tabular-nums ${tone}`}>{value}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>
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
  const thisWeekEntries = entries.filter((entry) => {
    const date = String(entry?.date || "").slice(0, 10);
    return date >= currentWeekStart && date <= addDaysKey(currentWeekStart, 6);
  });
  const thisWeekGross = thisWeekEntries.reduce((sum, entry) => sum + getEarnings(entry), 0);
  const thisWeekExpenses = thisWeekEntries.reduce((sum, entry) => sum + getExpenses(entry), 0);

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
  const hasChartActivity = chartData.some((day) => day.Earnings !== 0 || day.Expenses !== 0);

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
    <div className="space-y-3.5" data-testid="doordash-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Delivery</h1>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-[#32d99b] font-semibold text-[#061910] hover:bg-[#2ac28b]">
          <Plus className="mr-2 h-4 w-4" />
          Add earnings
        </Button>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={WalletCards}
          label="This week net"
          value={money(thisWeekGross - thisWeekExpenses)}
          detail={`Gross ${money(thisWeekGross)} · Expenses ${money(thisWeekExpenses)}`}
          tone="text-emerald-400"
        />
        <Metric
          icon={WalletCards}
          label={selectedMonth === currentMonth ? "This month net" : `${monthLabel(selectedMonth)} net`}
          value={money(monthNet)}
          detail={`Gross ${money(monthGross)} · Expenses ${money(monthExpenses)}`}
          tone="text-emerald-400"
        />
        <Metric
          icon={WalletCards}
          label="All-time net"
          value={money(allTimeNet)}
          detail={`Gross ${money(allTimeGross)} · Expenses ${money(allTimeExpenses)}`}
        />
        <Metric
          icon={ReceiptText}
          label="Expenses this month"
          value={money(monthExpenses)}
          detail={`${monthLabel(selectedMonth)} · all delivery apps`}
          tone="text-rose-400"
        />
      </div>

      <div className="grid items-stretch gap-3.5 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)]">
      <Card className="flex min-h-[430px] min-w-0 flex-col overflow-hidden rounded-[15px] border-[#29394a] bg-[#0d151e]">
        <CardContent className="flex h-full min-h-0 flex-col p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold">
                {chartView === "weekly" ? "Weekly Activity" : "Monthly Activity"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {chartView === "weekly"
                  ? `Earnings and expenses · ${weekRangeLabel(selectedWeekStart)}`
                  : monthLabel(selectedMonth)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center overflow-hidden rounded-lg border border-border/60 bg-background/60">
                <Button
                  type="button"
                  variant={chartView === "monthly" ? "secondary" : "ghost"}
                  onClick={() => setChartView("monthly")}
                  className="h-9 rounded-none border-r border-border/60 px-3"
                >
                  Monthly
                </Button>
                <Button
                  type="button"
                  variant={chartView === "weekly" ? "secondary" : "ghost"}
                  onClick={() => setChartView("weekly")}
                  className="h-9 rounded-none px-3"
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
                    className="h-9 w-9 rounded-none border-r border-border/60"
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
                    className="h-9 w-9 rounded-none border-l border-border/60"
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
                    className="h-9 w-9 rounded-none border-r border-border/60"
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
                    className="h-9 w-9 rounded-none border-l border-border/60"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 min-h-[320px] flex-1">
            {hasChartActivity ? (
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
                    opacity={0.1}
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
                    fill="#35c99c"
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
                      fill="#35c99c"
                      fontSize={11}
                      fontWeight={600}
                    />
                  </Bar>

                  <Bar
                    dataKey="Expenses"
                    name="Expenses"
                    fill="#e65765"
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
                      fill="#e65765"
                      fontSize={11}
                      fontWeight={600}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
                No delivery earnings logged for this {chartView === "weekly" ? "week" : "month"} yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-[430px] min-w-0 overflow-hidden rounded-[15px] border-[#29394a] bg-[#0d151e]">
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b border-[#29394a] px-4 py-4">
            <ReceiptText className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="text-[17px] font-semibold">Recent weeks</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Select a week to see its days</p>
            </div>
          </div>

          {recentWeeks.length ? (
            <div className="max-h-[370px] space-y-2 overflow-y-auto p-3 [scrollbar-width:thin]">
              {recentWeeks.map((week) => {
                const isExpanded = expandedWeeks.has(week.key);

                return (
                  <div key={week.key} className={`overflow-hidden rounded-xl border ${isExpanded ? "border-emerald-500/50 bg-emerald-500/[0.06]" : "border-[#29394a] bg-[#101a24]"}`}>
                    <button
                      type="button"
                      onClick={() => toggleWeek(week.key)}
                      className="flex w-full flex-wrap items-center gap-2.5 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.035]"
                      aria-expanded={isExpanded}
                    >
                      <div className="flex min-w-[125px] flex-1 items-center gap-2">
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                        <div className="text-[13px] font-semibold">{week.label}</div>
                      </div>

                      <div className="text-right text-xs text-muted-foreground">
                        <div>Gross {money(week.earnings)}</div>
                        <div>Expenses {money(week.expenses)}</div>
                      </div>

                      <div className="min-w-[88px] text-right">
                        <div className={`font-semibold ${week.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {week.net >= 0 ? "+" : ""}
                          {money(week.net)}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">net</div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="divide-y divide-border/40 border-t border-[#29394a]">
                        {week.days.map((day) => {
                          const net = day.earnings - day.expenses;

                          return (
                            <div key={day.date} className="flex flex-wrap items-center gap-3 pr-4 py-2.5 pl-8">
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

      </div>

      <Card className="rounded-[15px] border-[#29394a] bg-[#0d151e]">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold">Apps this month</h2>
              <p className="mt-1 text-xs text-muted-foreground">Gross earnings by delivery app · {monthLabel(selectedMonth)}</p>
            </div>
            <div className="flex items-center overflow-hidden rounded-lg border border-[#29394a] bg-[#101a24]">
              <Button type="button" variant="ghost" size="icon" onClick={goToPreviousMonth} aria-label="Previous month" className="h-8 w-8 rounded-none">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[116px] px-2 text-center text-xs font-medium">{monthLabel(selectedMonth)}</span>
              <Button type="button" variant="ghost" size="icon" onClick={goToNextMonth} disabled={!canGoNextMonth} aria-label="Next month" className="h-8 w-8 rounded-none">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {APPS.map((app) => {
              const { icon: Icon, color } = APP_STYLES[app];
              return (
                <div key={app} className="min-w-0 rounded-xl border border-[#29394a] bg-[#101a24] p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Icon className="h-4 w-4" style={{ color }} />
                    {app}
                  </div>
                  <div className="mt-4 text-[22px] font-semibold tracking-tight tabular-nums">{money(appTotals[app])}</div>
                </div>
              );
            })}
          </div>
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
