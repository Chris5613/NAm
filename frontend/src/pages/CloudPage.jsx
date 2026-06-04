import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  X,
  TrendingUp,
  TrendingDown,
  Trophy,
  Pencil,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";

const CLOUD_BETS_KEY = "cloud_manual_bets";

const SPORTS = [
  { value: "", label: "Select sport" },
  { value: "Basketball", label: "🏀 Basketball" },
  { value: "Football", label: "🏈 Football" },
  { value: "Baseball", label: "⚾ Baseball" },
  { value: "Soccer", label: "⚽ Soccer" },
  { value: "Tennis", label: "🎾 Tennis" },
  { value: "Hockey", label: "🏒 Hockey" },
  { value: "Golf", label: "⛳ Golf" },
  { value: "MMA / UFC", label: "🥊 MMA / UFC" },
  { value: "Boxing", label: "🥊 Boxing" },
  { value: "Esports", label: "🎮 Esports" },
  { value: "Horse Racing", label: "🐎 Horse Racing" },
  { value: "Cricket", label: "🏏 Cricket" },
  { value: "Rugby", label: "🏉 Rugby" },
  { value: "Volleyball", label: "🏐 Volleyball" },
  { value: "Motorsports", label: "🏎️ Motorsports" },
  { value: "Table Tennis", label: "🏓 Table Tennis" },
  { value: "Parlay", label: "🎟️ Parlay" },
  { value: "Casino", label: "🎰 Casino" },
  { value: "Other", label: "📌 Other" },
];

function getSavedBets() {
  try {
    const saved = JSON.parse(localStorage.getItem(CLOUD_BETS_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveBets(bets) {
  try {
    localStorage.setItem(CLOUD_BETS_KEY, JSON.stringify(bets || []));
  } catch {
    // localStorage unavailable
  }
}

function formatCurrency(value) {
  const n = Number(value) || 0;

  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value) {
  const n = Number(value) || 0;
  return `${n.toFixed(1)}%`;
}

function formatRecord(wins, losses) {
  return `${wins}W · ${losses}L`;
}

function getCurrentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function moveMonthKey(monthKey, amount) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");

  return `${nextYear}-${nextMonth}`;
}

function getDayKey(date) {
  return String(date || "").slice(0, 10);
}

function getCalendarDays(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startPadding = firstDay.getDay();
  const days = [];

  for (let i = 0; i < startPadding; i += 1) {
    days.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push({
      day,
      dateKey: `${monthKey}-${String(day).padStart(2, "0")}`,
    });
  }

  return days;
}

function getBetMonthKey(bet) {
  const date = bet.date || bet.created_at;
  if (!date) return "";
  return date.slice(0, 7);
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return "All Months";

  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getBetDateTime(bet) {
  return new Date(bet.date || bet.created_at || 0).getTime();
}

function emptyForm() {
  return {
    title: "",
    matchup: "",
    amount: "",
    result: "win",
    date: new Date().toISOString().slice(0, 10),
    category: "",
    sportsbook: "",
    note: "",
  };
}

function getSportLabel(value) {
  const sport = SPORTS.find((s) => s.value === value);
  return sport?.label || value || "Uncategorized";
}

function getCategory(bet) {
  return bet.category?.trim() || "Uncategorized";
}

function isBetWin(bet) {
  const result = String(bet.result || "").toLowerCase();

  if (result === "win" || result === "won") return true;
  if (result === "loss" || result === "lost") return false;

  const titleText = `${bet.title || ""} ${bet.note || ""}`.toLowerCase();

  if (titleText.includes("won")) return true;
  if (titleText.includes("lost") || titleText.includes("loss")) return false;

  return Number(bet.amount) > 0;
}

function buildGroupStats(bets, getKey) {
  const groups = {};

  bets.forEach((bet) => {
    const key = getKey(bet);
    const amount = Number(bet.amount) || 0;
    const won = isBetWin(bet);

    if (!groups[key]) {
      groups[key] = {
        name: key,
        wins: 0,
        losses: 0,
        wagered: 0,
        pnl: 0,
      };
    }

    groups[key].wagered += Math.abs(amount);
    groups[key].pnl += amount;

    if (won) {
      groups[key].wins += 1;
    } else {
      groups[key].losses += 1;
    }
  });

  return Object.values(groups).map((group) => {
    const total = group.wins + group.losses;

    return {
      ...group,
      total,
      winRate: total > 0 ? (group.wins / total) * 100 : 0,
      roi: group.wagered > 0 ? (group.pnl / group.wagered) * 100 : 0,
    };
  });
}

export default function CloudPage() {
  const [bets, setBets] = useState(() => getSavedBets());
  const [addOpen, setAddOpen] = useState(false);
  const [editingBetId, setEditingBetId] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [showHidden, setShowHidden] = useState(false);
  const [form, setForm] = useState(() => emptyForm());
  const [calendarMonthKey, setCalendarMonthKey] = useState(() => getCurrentMonthKey());

  const isEditing = !!editingBetId;

  const monthOptions = useMemo(() => {
    const months = [...new Set(bets.map(getBetMonthKey).filter(Boolean))];
    return months.sort((a, b) => b.localeCompare(a));
  }, [bets]);

  const filteredBets = useMemo(() => {
    const sorted = [...bets].sort((a, b) => {
      const dateA = getBetDateTime(a);
      const dateB = getBetDateTime(b);

      if (dateB !== dateA) return dateB - dateA;

      return (
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
      );
    });

    if (selectedMonth === "all") return sorted;

    return sorted.filter((bet) => getBetMonthKey(bet) === selectedMonth);
  }, [bets, selectedMonth]);

  const visibleBets = useMemo(() => {
    return filteredBets.filter((bet) => showHidden || !bet.hidden);
  }, [filteredBets, showHidden]);

  const hiddenCount = filteredBets.filter((bet) => bet.hidden).length;

  const stats = useMemo(() => {
    let wins = 0;
    let losses = 0;
    let wagered = 0;
    let netPnl = 0;

    filteredBets.forEach((bet) => {
      const amount = Number(bet.amount) || 0;
      wagered += Math.abs(amount);
      netPnl += amount;

if (isBetWin(bet)) {
  wins += 1;
} else {
  losses += 1;
}
    });

    const total = wins + losses;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const roi = wagered > 0 ? (netPnl / wagered) * 100 : 0;
    const avgBetSize = total > 0 ? wagered / total : 0;

    const chronological = [...filteredBets].sort(
      (a, b) => getBetDateTime(a) - getBetDateTime(b)
    );

    let currentWinStreak = 0;
    let longestWinStreak = 0;
    let longestLossStreak = 0;
    let runningWin = 0;
    let runningLoss = 0;

    chronological.forEach((bet) => {
      const won = isBetWin(bet);

      if (won) {
        runningWin += 1;
        runningLoss = 0;
      } else {
        runningLoss += 1;
        runningWin = 0;
      }

      longestWinStreak = Math.max(longestWinStreak, runningWin);
      longestLossStreak = Math.max(longestLossStreak, runningLoss);
    });

for (let i = chronological.length - 1; i >= 0; i -= 1) {
  const bet = chronological[i];

  if (isBetWin(bet)) {
    currentWinStreak += 1;
  } else {
    break;
  }
}

    return {
      wins,
      losses,
      total,
      wagered,
      netPnl,
      winRate,
      roi,
      avgBetSize,
      currentWinStreak,
      longestWinStreak,
      longestLossStreak,
    };
  }, [filteredBets]);

const chartSegments = useMemo(() => {
  let running = 0;

  const points = [...filteredBets]
    .sort((a, b) => getBetDateTime(a) - getBetDateTime(b))
    .map((bet, index) => {
      running += Number(bet.amount) || 0;

      return {
        label: `${index + 1}`,
        date: bet.date || `Bet ${index + 1}`,
        value: running,
      };
    });

  const data = points.map((point) => ({
    label: point.label,
    date: point.date,
    value: point.value,
  }));

  const segments = [];

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const key = `segment_${i}`;

    data[i - 1][key] = previous.value;
    data[i][key] = current.value;

    segments.push({
      key,
      color: current.value >= previous.value ? "#34D399" : "#FB7185",
    });
  }

  return {
    data,
    segments,
  };
}, [filteredBets]);

  const categoryStats = useMemo(() => {
    return buildGroupStats(filteredBets, getCategory);
  }, [filteredBets]);


  const calendarBets = useMemo(() => {
    return bets.filter((bet) => getBetMonthKey(bet) === calendarMonthKey);
  }, [bets, calendarMonthKey]);

  const openAddModal = () => {
    setEditingBetId(null);
    setForm(emptyForm());
    setAddOpen(true);
  };

  const openEditModal = (bet) => {
    setEditingBetId(bet.id);

    setForm({
      title: bet.title || "",
      matchup: bet.matchup || "",
      amount: String(Math.abs(Number(bet.amount) || 0)),
      result: Number(bet.amount) >= 0 ? "win" : "loss",
      date: bet.date || new Date().toISOString().slice(0, 10),
      category: bet.category || "",
      sportsbook: bet.sportsbook || "",
      note: bet.note || "",
    });

    setAddOpen(true);
  };

  const closeModal = () => {
    setAddOpen(false);
    setEditingBetId(null);
    setForm(emptyForm());
  };

  const handleSaveBet = () => {
    const amountRaw = Number(form.amount);

    if (!form.title.trim()) {
      toast.error("Enter a bet title");
      return;
    }

    if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    const finalAmount =
      form.result === "loss" ? -Math.abs(amountRaw) : Math.abs(amountRaw);

    if (isEditing) {
      const next = bets.map((bet) =>
        bet.id === editingBetId
          ? {
              ...bet,
              title: form.title.trim(),
              matchup: form.matchup.trim(),
              amount: finalAmount,
              result: form.result,
              date: form.date,
              category: form.category.trim(),
              sportsbook: form.sportsbook.trim(),
              note: form.note.trim(),
              updated_at: new Date().toISOString(),
            }
          : bet
      );

      setBets(next);
      saveBets(next);
      closeModal();
      toast.success("Bet updated");
      return;
    }

    const nextBet = {
      id: crypto.randomUUID(),
      title: form.title.trim(),
      matchup: form.matchup.trim(),
      amount: finalAmount,
      result: form.result,
      date: form.date,
      category: form.category.trim(),
      sportsbook: form.sportsbook.trim(),
      note: form.note.trim(),
      created_at: new Date().toISOString(),
      hidden: false,
    };

    const next = [nextBet, ...bets];

    setBets(next);
    saveBets(next);
    closeModal();
    toast.success("Bet added");
  };

  const handleDeleteBet = (id) => {
    const next = bets.filter((bet) => bet.id !== id);

    setBets(next);
    saveBets(next);

    toast.success("Bet removed");
  };

  const toggleHideBet = (id) => {
    const next = bets.map((bet) =>
      bet.id === id
        ? {
            ...bet,
            hidden: !bet.hidden,
          }
        : bet
    );

    setBets(next);
    saveBets(next);

    toast.success("Bet updated");
  };

  return (
<div className="min-h-[calc(100vh-4rem)] bg-background text-foreground p-0">
  <Card className="w-full min-h-[calc(100vh-4rem)] rounded-none border-0 bg-card shadow-none">
        <CardContent className="p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-violet-600 flex items-center justify-center shadow-[0_0_22px_rgba(124,58,237,0.35)]">
                <span className="text-2xl font-bold text-white">C</span>
              </div>

              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Cloud
                </h1>
                <p className="text-xs text-slate-300 mt-1">
                  Manual bet tracker
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-9 rounded-md border border-border/40 bg-background px-3 text-xs font-mono text-foreground outline-none"
              >
                <option value="all">All Months</option>

                {monthOptions.map((monthKey) => (
                  <option key={monthKey} value={monthKey}>
                    {formatMonthLabel(monthKey)}
                  </option>
                ))}
              </select>

              <Button
                size="sm"
                onClick={openAddModal}
                className="bg-slate-100 text-slate-950 hover:bg-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Bet
              </Button>

              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard
              label="Net P/L"
              value={`${stats.netPnl >= 0 ? "+" : ""}${formatCurrency(
                stats.netPnl
              )}`}
              positive={stats.netPnl >= 0}
            />

            <StatCard
              label="Win Rate"
              value={formatPercent(stats.winRate)}
              positive={stats.winRate >= 50}
            />

            <StatCard
              label="ROI"
              value={`${stats.roi >= 0 ? "+" : ""}${formatPercent(stats.roi)}`}
              positive={stats.roi >= 0}
            />

            <StatCard
              label="Avg Bet Size"
              value={formatCurrency(stats.avgBetSize)}
            />

            <StatCard
              label="Total Wagered"
              value={formatCurrency(stats.wagered)}
            />

            <StatCard label="Total Bets" value={String(stats.total)} />
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_390px] gap-6 items-start">
            <div className="space-y-6">
              <Card className="border-border/40 bg-secondary/20">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-muted-foreground mb-4">
                P/L Progression
              </p>

              <div className="h-[240px]">
                {chartSegments.data.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartSegments.data}
                      margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />

                      <XAxis
                        dataKey="label"
                        stroke="#CBD5E1"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value, index) =>
                          chartSegments.data[index]?.date || value
                        }
                      />

                      <YAxis
                        stroke="#CBD5E1"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                      />

                      <Tooltip
                        contentStyle={{
                          background: "#0F172A",
                          border: "1px solid #475569",
                          borderRadius: "6px",
                          fontSize: "12px",
                          color: "#FFFFFF",
                        }}
                        formatter={(value) => [formatCurrency(value), "P/L"]}
                        labelFormatter={(value, payload) =>
                          payload?.[0]?.payload?.date || value
                        }
                      />
{chartSegments.segments.map((segment) => (
  <Line
    key={segment.key}
    type="monotone"
    dataKey={segment.key}
    stroke={segment.color}
    strokeWidth={3}
    dot={false}
    connectNulls={false}
    isAnimationActive={false}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
))}
                  </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-slate-300">
                    Add more bets to build the chart.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <CloudStatsTable
              title="Win Rate by Sport"
              rows={[...categoryStats].sort((a, b) => b.winRate - a.winRate)}
              mode="winRate"
            />

            <CloudStatsTable
              title="Profit by Sport"
              rows={[...categoryStats].sort((a, b) => b.pnl - a.pnl)}
              mode="profit"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-sm font-semibold text-white">Bets</p>

              {hiddenCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHidden((prev) => !prev)}
                  className="border-border/40"
                >
                  {showHidden ? "Hide hidden" : `Show hidden (${hiddenCount})`}
                </Button>
              )}
            </div>

            {visibleBets.length === 0 ? (
              <div className="rounded-lg border border-border/40 bg-secondary/30 p-8 text-center">
                <p className="text-sm text-muted-foreground">No visible bets.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
                {visibleBets.map((bet) => {
                  const won = isBetWin(bet);

                  return (
                    <div
                      key={bet.id}
                      className={`rounded-lg border p-4 bg-secondary/40 ${
                        bet.hidden ? "opacity-50" : ""
                      } ${
                        won
                          ? "border-emerald-500/40"
                          : "border-rose-500/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              won
                                ? "bg-emerald-500/10 text-emerald-300"
                                : "bg-rose-500/10 text-rose-300"
                            }`}
                          >
                            {won ? (
                              <TrendingUp className="w-5 h-5" />
                            ) : (
                              <TrendingDown className="w-5 h-5" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white">
                              Cloud {won ? "won" : "lost"}{" "}
                              <span
                                className={
                                  won ? "text-emerald-300" : "text-rose-300"
                                }
                              >
                                {won ? "+" : "-"}
                                {formatCurrency(Math.abs(bet.amount))}
                              </span>
                            </p>

                            <p className="text-xs text-slate-300 truncate mt-1">
                              {bet.title}
                              {bet.matchup ? ` · ${bet.matchup}` : ""}
                            </p>

                            <p className="text-[11px] text-slate-300 mt-1">
                              {bet.date}
                              {getCategory(bet) !== "Uncategorized"
                                ? ` · ${getSportLabel(getCategory(bet))}`
                                : ""}
                              {bet.note ? ` · ${bet.note}` : ""}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-mono px-3 py-1 rounded border ${
                              won
                                ? "border-emerald-500/40 text-emerald-300"
                                : "border-rose-500/40 text-rose-300"
                            }`}
                          >
                            {won ? "Win" : "Loss"}
                          </span>

                          <button
                            onClick={() => openEditModal(bet)}
                            className="text-muted-foreground hover:text-foreground p-1"
                            title="Edit bet"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => toggleHideBet(bet.id)}
                            className="text-muted-foreground hover:text-foreground p-1"
                            title={bet.hidden ? "Unhide bet" : "Hide bet"}
                          >
                            {bet.hidden ? (
                              <Eye className="w-4 h-4" />
                            ) : (
                              <EyeOff className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            onClick={() => handleDeleteBet(bet.id)}
                            className="text-muted-foreground hover:text-rose-400 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
            </div>

            <CalendarSidePanel
              monthKey={calendarMonthKey}
              bets={calendarBets}
              onPreviousMonth={() =>
                setCalendarMonthKey((prev) => moveMonthKey(prev, -1))
              }
              onNextMonth={() =>
                setCalendarMonthKey((prev) => moveMonthKey(prev, 1))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => (open ? setAddOpen(true) : closeModal())}
      >
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {isEditing ? "Edit Cloud Bet" : "Add Cloud Bet"}
            </DialogTitle>

            <DialogDescription className="text-muted-foreground">
              {isEditing
                ? "Update this manual bet."
                : "Manually enter a win or loss."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-foreground">Bet title</Label>

              <Input
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
                placeholder="Example: Yuta Tomida Set 2"
                className="bg-background border-border"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Matchup or details</Label>

              <Input
                value={form.matchup}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    matchup: e.target.value,
                  }))
                }
                placeholder="Example: Sora Fukuda vs Yuta Tomida"
                className="bg-background border-border"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-foreground">Amount</Label>

                <Input
                  type="number"
                  step="any"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      amount: e.target.value,
                    }))
                  }
                  placeholder="458.34"
                  className="bg-background border-border font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Date</Label>

                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                  className="bg-background border-border font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Sport</Label>

              <select
                value={form.category}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    category: e.target.value,
                  }))
                }
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none"
              >
                {SPORTS.map((sport) => (
                  <option key={sport.value || "empty"} value={sport.value}>
                    {sport.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Result</Label>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={form.result === "win" ? "default" : "outline"}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      result: "win",
                    }))
                  }
                  className={
                    form.result === "win"
                      ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                      : "border-slate-600/60 bg-[#0A0F1D] text-white hover:bg-[#111A2E]"
                  }
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  Win
                </Button>

                <Button
                  type="button"
                  variant={form.result === "loss" ? "default" : "outline"}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      result: "loss",
                    }))
                  }
                  className={
                    form.result === "loss"
                      ? "bg-rose-400 text-slate-950 hover:bg-rose-300"
                      : "border-slate-600/60 bg-[#0A0F1D] text-white hover:bg-[#111A2E]"
                  }
                >
                  <TrendingDown className="w-4 h-4 mr-2" />
                  Loss
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Note</Label>

              <Input
                value={form.note}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    note: e.target.value,
                  }))
                }
                placeholder="Optional"
                className="bg-background border-border"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeModal}
              className="border-border/40"
            >
              Cancel
            </Button>

            <Button
              onClick={handleSaveBet}
              className="bg-slate-100 text-slate-950 hover:bg-white"
            >
              {isEditing ? "Save Changes" : "Save Bet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function CalendarSidePanel({ monthKey, bets, onPreviousMonth, onNextMonth }) {
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    setSelectedDate(null);
  }, [monthKey]);

  const days = useMemo(() => getCalendarDays(monthKey), [monthKey]);

  const dailyStats = useMemo(() => {
    const map = {};

    bets.forEach((bet) => {
      const dateKey = getDayKey(bet.date || bet.created_at);
      const amount = Number(bet.amount) || 0;

      if (!map[dateKey]) {
        map[dateKey] = {
          wins: 0,
          losses: 0,
          pnl: 0,
          bets: [],
        };
      }

      map[dateKey].pnl += amount;
      map[dateKey].bets.push(bet);

      if (isBetWin(bet)) {
        map[dateKey].wins += 1;
      } else {
        map[dateKey].losses += 1;
      }
    });

    return map;
  }, [bets]);

  const monthStats = useMemo(() => {
    return bets.reduce(
      (acc, bet) => {
        const amount = Number(bet.amount) || 0;
        acc.pnl += amount;

        if (isBetWin(bet)) {
          acc.wins += 1;
        } else {
          acc.losses += 1;
        }

        return acc;
      },
      { wins: 0, losses: 0, pnl: 0 }
    );
  }, [bets]);

  const firstBetDate = bets[0]?.date || bets[0]?.created_at || "";
  const activeDate = selectedDate || getDayKey(firstBetDate) || `${monthKey}-01`;
  const activeStats = dailyStats[activeDate] || {
    wins: 0,
    losses: 0,
    pnl: 0,
    bets: [],
  };

  const withdrawGoal = 3000;
  const withdrawProgress = Math.max(0, Math.min(monthStats.pnl, withdrawGoal));
  const withdrawPercent = withdrawGoal > 0 ? (withdrawProgress / withdrawGoal) * 100 : 0;

  return (
    <Card className="border-border/40 bg-secondary/20 2xl:sticky 2xl:top-6">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onPreviousMonth}
            className="w-9 h-9 rounded-lg border border-border/40 bg-secondary/40 text-xl font-bold text-foreground hover:bg-secondary"
            aria-label="Previous month"
          >
            &lt;
          </button>

          <h2 className="flex-1 text-center text-2xl font-bold tracking-wide text-foreground">
            {formatMonthLabel(monthKey)}
          </h2>

          <button
            type="button"
            onClick={onNextMonth}
            className="w-9 h-9 rounded-lg border border-border/40 bg-secondary/40 text-xl font-bold text-foreground hover:bg-secondary"
            aria-label="Next month"
          >
            &gt;
          </button>
        </div>

        <div className="h-px bg-border/50" />

        <div className="rounded-lg border border-border/40 bg-secondary/40 p-4 flex items-center justify-between">
          <p className="text-lg font-bold text-foreground">
            {formatRecord(monthStats.wins, monthStats.losses)}
          </p>

          <p
            className={`text-lg font-bold font-mono ${
              monthStats.pnl >= 0 ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {monthStats.pnl >= 0 ? "+" : ""}
            {formatCurrency(monthStats.pnl)}
          </p>
        </div>

        <div className="rounded-lg border border-border/40 bg-secondary/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Withdraw Goal
            </p>

            <p className="font-mono text-sm font-bold text-foreground">
              {formatCurrency(withdrawProgress)} / {formatCurrency(withdrawGoal)}
            </p>
          </div>

          <div className="h-2 rounded-full bg-background overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${withdrawPercent}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center text-xs uppercase tracking-wider text-muted-foreground">
          {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="aspect-square" />;
            }

            const dayStats = dailyStats[day.dateKey];
            const hasBets = !!dayStats;
            const isSelected = activeDate === day.dateKey;
            const isPositive = (dayStats?.pnl || 0) >= 0;

            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => setSelectedDate(day.dateKey)}
                className={`aspect-square rounded-lg border p-1 flex flex-col items-center justify-center transition-colors ${
                  isSelected
                    ? "border-violet-500 bg-violet-500/10"
                    : hasBets
                      ? isPositive
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-rose-500/40 bg-rose-500/10"
                      : "border-transparent bg-secondary/40 hover:bg-secondary/60"
                }`}
              >
                <span className="text-sm font-bold text-foreground">{day.day}</span>

                {hasBets && (
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      isPositive ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {dayStats.pnl >= 0 ? "+" : ""}
                    {formatCurrency(dayStats.pnl).replace(".00", "")}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="h-px bg-border/50" />

        <div className="flex items-center justify-between">
          <p className="text-lg font-bold tracking-[0.2em] text-violet-400 uppercase">
            {new Date(`${activeDate}T00:00:00`).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
            })}
          </p>

          <p className="font-mono text-sm font-bold text-muted-foreground">
            {formatRecord(activeStats.wins, activeStats.losses)} · {activeStats.pnl >= 0 ? "+" : ""}
            {formatCurrency(activeStats.pnl)}
          </p>
        </div>

        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
          {activeStats.bets.length === 0 ? (
            <div className="rounded-lg border border-border/40 bg-secondary/30 p-4 text-center text-sm text-muted-foreground">
              No bets on this day.
            </div>
          ) : (
            activeStats.bets.map((bet) => {
              const won = isBetWin(bet);

              return (
                <div
                  key={bet.id}
                  className={`rounded-lg border bg-secondary/40 p-3 flex items-center justify-between gap-3 ${
                    won ? "border-emerald-500/40" : "border-rose-500/40"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {bet.title}
                    </p>

                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {bet.matchup || getSportLabel(getCategory(bet))}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`font-mono text-sm font-bold ${
                        won ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {Number(bet.amount) >= 0 ? "+" : ""}
                      {formatCurrency(Number(bet.amount) || 0)}
                    </p>

                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {won ? "Won" : "Lost"}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, positive }) {
  return (
    <div className="rounded-lg bg-secondary/60 border border-border/40 p-4 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>

      <p
        className={`font-mono text-lg font-bold mt-1 ${
          positive === true
            ? "text-emerald-300"
            : positive === false
              ? "text-rose-300"
              : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CloudStatsTable({ title, rows, mode }) {
  return (
    <Card className="border-border/40 bg-secondary/20">
      <CardContent className="p-5">
        <p className="text-sm font-semibold text-muted-foreground mb-4">
          {title}
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-4 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/30 pb-2">
              <span>Sport</span>
              <span className="text-right">Record</span>
              <span className="text-right">
                {mode === "winRate" ? "Win %" : "Wagered"}
              </span>
              <span className="text-right">
                {mode === "winRate" ? "ROI" : "P/L"}
              </span>
            </div>

            {rows.map((row) => (
              <div
                key={row.name}
                className="grid grid-cols-4 text-sm items-center py-1.5 border-b border-border/10 last:border-b-0"
              >
                <span className="text-white truncate">
                  {getSportLabel(row.name)}
                </span>

                <span className="font-mono text-xs text-white text-right">
                  {formatRecord(row.wins, row.losses)}
                </span>

                <span className="font-mono text-xs text-white text-right">
                  {mode === "winRate"
                    ? formatPercent(row.winRate)
                    : formatCurrency(row.wagered)}
                </span>

                <span
                  className={`font-mono text-xs font-medium text-right ${
                    (mode === "winRate" ? row.roi : row.pnl) >= 0
                      ? "text-emerald-300"
                      : "text-rose-300"
                  }`}
                >
                  {mode === "winRate"
                    ? `${row.roi >= 0 ? "+" : ""}${formatPercent(row.roi)}`
                    : `${row.pnl >= 0 ? "+" : ""}${formatCurrency(row.pnl)}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}