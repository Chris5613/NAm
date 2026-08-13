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
  Clock,
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

function getMockDate(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

const MOCK_BETS = [
  {
    id: "mock-celtics-spread",
    title: "Celtics -4.5",
    matchup: "Boston Celtics vs. New York Knicks",
    amount: 47.5,
    stake: 50,
    result: "win",
    date: getMockDate(1),
    category: "Basketball",
    team: "Boston Celtics",
    sportsbook: "DraftKings",
    note: "Covered late in the fourth quarter.",
    created_at: "2026-08-12T18:00:00.000Z",
    hidden: false,
  },
  {
    id: "mock-dodgers-moneyline",
    title: "Dodgers Moneyline",
    matchup: "Los Angeles Dodgers vs. San Diego Padres",
    amount: -35,
    stake: 35,
    result: "loss",
    date: getMockDate(3),
    category: "Baseball",
    team: "Los Angeles Dodgers",
    sportsbook: "FanDuel",
    note: "Bullpen gave up the lead in the eighth.",
    created_at: "2026-08-10T21:00:00.000Z",
    hidden: false,
  },
  {
    id: "mock-chiefs-parlay",
    title: "Chiefs & over 47.5",
    matchup: "Kansas City Chiefs vs. Buffalo Bills",
    amount: 82.5,
    stake: 30,
    result: "win",
    date: getMockDate(5),
    category: "Parlay",
    team: "Kansas City Chiefs",
    sportsbook: "BetMGM",
    note: "Two-leg same-game parlay.",
    created_at: "2026-08-08T19:00:00.000Z",
    hidden: false,
  },
  {
    id: "mock-mariners-total",
    title: "Mariners vs. Astros under 7.5",
    matchup: "Seattle Mariners vs. Houston Astros",
    amount: 40,
    stake: 40,
    result: "win",
    date: getMockDate(7),
    category: "Baseball",
    team: "Seattle Mariners",
    sportsbook: "Caesars",
    note: "Pitching duel from the first inning.",
    created_at: "2026-08-06T20:00:00.000Z",
    hidden: false,
  },
  {
    id: "mock-lakers-futures",
    title: "Lakers conference futures",
    matchup: "Western Conference futures",
    amount: 0,
    stake: 25,
    result: "pending",
    date: getMockDate(9),
    category: "Basketball",
    team: "Los Angeles Lakers",
    sportsbook: "DraftKings",
    note: "Season-long futures position.",
    created_at: "2026-08-04T16:00:00.000Z",
    hidden: false,
  },
];

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

const TEAM_OPTIONS = {
  Basketball: [
    { value: "Atlanta Hawks", label: "Hawks" },
    { value: "Boston Celtics", label: "Celtics" },
    { value: "Brooklyn Nets", label: "Nets" },
    { value: "Charlotte Hornets", label: "Hornets" },
    { value: "Chicago Bulls", label: "Bulls" },
    { value: "Cleveland Cavaliers", label: "Cavaliers" },
    { value: "Dallas Mavericks", label: "Mavericks" },
    { value: "Denver Nuggets", label: "Nuggets" },
    { value: "Detroit Pistons", label: "Pistons" },
    { value: "Golden State Warriors", label: "Warriors" },
    { value: "Houston Rockets", label: "Rockets" },
    { value: "Indiana Pacers", label: "Pacers" },
    { value: "LA Clippers", label: "Clippers" },
    { value: "Los Angeles Lakers", label: "Lakers" },
    { value: "Memphis Grizzlies", label: "Grizzlies" },
    { value: "Miami Heat", label: "Heat" },
    { value: "Milwaukee Bucks", label: "Bucks" },
    { value: "Minnesota Timberwolves", label: "Timberwolves" },
    { value: "New Orleans Pelicans", label: "Pelicans" },
    { value: "New York Knicks", label: "Knicks" },
    { value: "Oklahoma City Thunder", label: "Thunder" },
    { value: "Orlando Magic", label: "Magic" },
    { value: "Philadelphia 76ers", label: "76ers" },
    { value: "Phoenix Suns", label: "Suns" },
    { value: "Portland Trail Blazers", label: "Trail Blazers" },
    { value: "Sacramento Kings", label: "Kings" },
    { value: "San Antonio Spurs", label: "Spurs" },
    { value: "Toronto Raptors", label: "Raptors" },
    { value: "Utah Jazz", label: "Jazz" },
    { value: "Washington Wizards", label: "Wizards" },
  ],
  Football: [
    { value: "Arizona Cardinals", label: "Cardinals" },
    { value: "Atlanta Falcons", label: "Falcons" },
    { value: "Baltimore Ravens", label: "Ravens" },
    { value: "Buffalo Bills", label: "Bills" },
    { value: "Carolina Panthers", label: "Panthers" },
    { value: "Chicago Bears", label: "Bears" },
    { value: "Cincinnati Bengals", label: "Bengals" },
    { value: "Cleveland Browns", label: "Browns" },
    { value: "Dallas Cowboys", label: "Cowboys" },
    { value: "Denver Broncos", label: "Broncos" },
    { value: "Detroit Lions", label: "Lions" },
    { value: "Green Bay Packers", label: "Packers" },
    { value: "Houston Texans", label: "Texans" },
    { value: "Indianapolis Colts", label: "Colts" },
    { value: "Jacksonville Jaguars", label: "Jaguars" },
    { value: "Kansas City Chiefs", label: "Chiefs" },
    { value: "Las Vegas Raiders", label: "Raiders" },
    { value: "Los Angeles Chargers", label: "Chargers" },
    { value: "Los Angeles Rams", label: "Rams" },
    { value: "Miami Dolphins", label: "Dolphins" },
    { value: "Minnesota Vikings", label: "Vikings" },
    { value: "New England Patriots", label: "Patriots" },
    { value: "New Orleans Saints", label: "Saints" },
    { value: "New York Giants", label: "Giants" },
    { value: "New York Jets", label: "Jets" },
    { value: "Philadelphia Eagles", label: "Eagles" },
    { value: "Pittsburgh Steelers", label: "Steelers" },
    { value: "San Francisco 49ers", label: "49ers" },
    { value: "Seattle Seahawks", label: "Seahawks" },
    { value: "Tampa Bay Buccaneers", label: "Buccaneers" },
    { value: "Tennessee Titans", label: "Titans" },
    { value: "Washington Commanders", label: "Commanders" },
  ],
  Baseball: [
    { value: "Arizona Diamondbacks", label: "Diamondbacks" },
    { value: "Atlanta Braves", label: "Braves" },
    { value: "Baltimore Orioles", label: "Orioles" },
    { value: "Boston Red Sox", label: "Red Sox" },
    { value: "Chicago Cubs", label: "Cubs" },
    { value: "Chicago White Sox", label: "White Sox" },
    { value: "Cincinnati Reds", label: "Reds" },
    { value: "Cleveland Guardians", label: "Guardians" },
    { value: "Colorado Rockies", label: "Rockies" },
    { value: "Detroit Tigers", label: "Tigers" },
    { value: "Houston Astros", label: "Astros" },
    { value: "Kansas City Royals", label: "Royals" },
    { value: "Los Angeles Angels", label: "Angels" },
    { value: "Los Angeles Dodgers", label: "Dodgers" },
    { value: "Miami Marlins", label: "Marlins" },
    { value: "Milwaukee Brewers", label: "Brewers" },
    { value: "Minnesota Twins", label: "Twins" },
    { value: "New York Mets", label: "Mets" },
    { value: "New York Yankees", label: "Yankees" },
    { value: "Oakland Athletics", label: "Athletics" },
    { value: "Philadelphia Phillies", label: "Phillies" },
    { value: "Pittsburgh Pirates", label: "Pirates" },
    { value: "San Diego Padres", label: "Padres" },
    { value: "San Francisco Giants", label: "Giants" },
    { value: "Seattle Mariners", label: "Mariners" },
    { value: "St. Louis Cardinals", label: "Cardinals" },
    { value: "Tampa Bay Rays", label: "Rays" },
    { value: "Texas Rangers", label: "Rangers" },
    { value: "Toronto Blue Jays", label: "Blue Jays" },
    { value: "Washington Nationals", label: "Nationals" },
  ],


};

function getSavedBets() {
  try {
    const saved = JSON.parse(localStorage.getItem(CLOUD_BETS_KEY) || "[]");
    return Array.isArray(saved) && saved.length > 0 ? saved : MOCK_BETS;
  } catch {
    return MOCK_BETS;
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
    team: "",
    sportsbook: "",
    note: "",
  };
}

function getSportLabel(value) {
  const sport = SPORTS.find((s) => s.value === value);
  return sport?.label || value || "Uncategorized";
}

function getTeamLabel(value) {
  if (!value) return "No Team";

  const allTeams = Object.values(TEAM_OPTIONS).flat();
  const team = allTeams.find((t) => t.value === value);

  return team?.label || value;
}

function getTeam(bet) {
  return bet.team?.trim() || "No Team";
}

function getCategory(bet) {
  return bet.category?.trim() || "Uncategorized";
}

function getBetStatus(bet) {
  const result = String(bet.result || "").toLowerCase();

  if (result === "win" || result === "won") return "win";
  if (result === "loss" || result === "lost") return "loss";
  if (result === "pending") return "pending";
  if (result === "in_progress" || result === "in progress") return "in_progress";

  const titleText = `${bet.title || ""} ${bet.note || ""}`.toLowerCase();

  if (titleText.includes("won")) return "win";
  if (titleText.includes("lost") || titleText.includes("loss")) return "loss";

  return Number(bet.amount) >= 0 ? "win" : "loss";
}

function isBetWin(bet) {
  const status = getBetStatus(bet);

  if (status === "win") return true;
  if (status === "loss") return false;

  return null;
}

function getStatusLabel(status) {
  if (status === "win") return "Win";
  if (status === "loss") return "Loss";
  if (status === "pending") return "Pending";
  if (status === "in_progress") return "In Progress";

  return "Pending";
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

    if (won === true) {
      groups[key].wins += 1;
    } else if (won === false) {
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
  const [form, setForm] = useState(() => emptyForm());
  const [calendarMonthKey, setCalendarMonthKey] = useState(() => getCurrentMonthKey());

  const isEditing = !!editingBetId;
  const availableTeams = TEAM_OPTIONS[form.category] || [];

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

  const stats = useMemo(() => {
    let wins = 0;
    let losses = 0;
    let wagered = 0;
    let netPnl = 0;

    filteredBets.forEach((bet) => {
      const amount = Number(bet.amount) || 0;
      wagered += Math.abs(amount);
      netPnl += amount;

const won = isBetWin(bet);

if (won === true) {
  wins += 1;
} else if (won === false) {
  losses += 1;
}
    });

    const total = wins + losses;
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

      if (won === true) {
        runningWin += 1;
        runningLoss = 0;
      } else if (won === false) {
        runningLoss += 1;
        runningWin = 0;
      } else {
        runningWin = 0;
        runningLoss = 0;
      }

      longestWinStreak = Math.max(longestWinStreak, runningWin);
      longestLossStreak = Math.max(longestLossStreak, runningLoss);
    });

for (let i = chronological.length - 1; i >= 0; i -= 1) {
  const bet = chronological[i];

  if (isBetWin(bet) === true) {
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

  const teamStats = useMemo(() => {
    return buildGroupStats(
      filteredBets.filter((bet) => getTeam(bet) !== "No Team"),
      getTeam
    );
  }, [filteredBets]);


  const calendarBets = useMemo(() => {
    return bets.filter((bet) => getBetMonthKey(bet) === calendarMonthKey);
  }, [bets, calendarMonthKey]);

  const openAddModal = () => {
    setEditingBetId(null);
    setForm(emptyForm());
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
      form.result === "loss"
        ? -Math.abs(amountRaw)
        : form.result === "win"
          ? Math.abs(amountRaw)
          : 0;

    if (isEditing) {
      const next = bets.map((bet) =>
        bet.id === editingBetId
          ? {
              ...bet,
              title: form.title.trim(),
              matchup: form.matchup.trim(),
              amount: finalAmount,
              stake: Math.abs(amountRaw),
              result: form.result,
              date: form.date,
              category: form.category.trim(),
              team: form.team.trim(),
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
      stake: Math.abs(amountRaw),
      result: form.result,
      date: form.date,
      category: form.category.trim(),
      team: form.team.trim(),
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

  return (
<div className="min-h-[calc(100vh-4rem)] bg-background text-foreground p-0">
    <Card className="w-full rounded-none border-0 bg-card shadow-none">
      <CardContent className="p-8 pb-4 space-y-6">
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

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard
              label="Net P/L"
              value={`${stats.netPnl >= 0 ? "+" : ""}${formatCurrency(
                stats.netPnl
              )}`}
              positive={stats.netPnl >= 0}
            />

            <StatCard
              label="Total Wagered"
              value={formatCurrency(stats.wagered)}
            />

            <StatCard label="Total Bets" value={String(stats.total)} />
          </div>

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
                    team: "",
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

            {availableTeams.length > 0 && (
              <div className="space-y-2">
                <Label className="text-foreground">Team</Label>

                <select
                  value={form.team}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      team: e.target.value,
                    }))
                  }
                  className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none"
                >
                  <option value="">Select team</option>

                  {availableTeams.map((team) => (
                    <option key={team.value} value={team.value}>
                      {team.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

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

                <Button
                  type="button"
                  variant={form.result === "pending" ? "default" : "outline"}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      result: "pending",
                    }))
                  }
                  className={
                    form.result === "pending"
                      ? "bg-amber-300 text-slate-950 hover:bg-amber-200"
                      : "border-slate-600/60 bg-[#0A0F1D] text-white hover:bg-[#111A2E]"
                  }
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Pending
                </Button>

                <Button
                  type="button"
                  variant={form.result === "in_progress" ? "default" : "outline"}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      result: "in_progress",
                    }))
                  }
                  className={
                    form.result === "in_progress"
                      ? "bg-sky-300 text-slate-950 hover:bg-sky-200"
                      : "border-slate-600/60 bg-[#0A0F1D] text-white hover:bg-[#111A2E]"
                  }
                >
                  <Clock className="w-4 h-4 mr-2" />
                  In Progress
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

      const won = isBetWin(bet);

      if (won === true) {
        map[dateKey].wins += 1;
      } else if (won === false) {
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

        const won = isBetWin(bet);

        if (won === true) {
          acc.wins += 1;
        } else if (won === false) {
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


  return (
    <Card className="w-full border-border/40 bg-secondary/20">
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


        <div className="grid grid-cols-7 gap-2 text-center text-xs uppercase tracking-wider text-muted-foreground">
          {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="h-12" />;
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
                className={`h-12 rounded-lg border p-1 flex flex-col items-center justify-center transition-colors ${
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
              const status = getBetStatus(bet);
              const statusLabel = getStatusLabel(status);
              const isPending = status === "pending" || status === "in_progress";

              return (
                <div
                  key={bet.id}
                  className={`rounded-lg border bg-secondary/40 p-3 flex items-center justify-between gap-3 ${
                    won === true
                      ? "border-emerald-500/40"
                      : won === false
                        ? "border-rose-500/40"
                        : "border-amber-400/40"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {bet.title}
                    </p>

                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {bet.matchup || (getTeam(bet) !== "No Team" ? getTeamLabel(getTeam(bet)) : getSportLabel(getCategory(bet)))}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`font-mono text-sm font-bold ${
                        won === true
                          ? "text-emerald-300"
                          : won === false
                            ? "text-rose-300"
                            : "text-amber-300"
                      }`}
                    >
                      {isPending
                        ? `${formatCurrency(bet.stake ?? 0)} stake`
                        : `${Number(bet.amount) >= 0 ? "+" : ""}${formatCurrency(Number(bet.amount) || 0)}`}
                    </p>

                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {statusLabel}
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

function CloudStatsTable({ title, rows, mode, firstColumnLabel, formatName }) {
  const isTeamTable = mode === "teamProfit" || title === "Profit by Team";
  const resolvedFirstColumnLabel =
    firstColumnLabel || (isTeamTable ? "Team" : "Sport");
  const resolvedFormatName =
    formatName || (isTeamTable ? getTeamLabel : getSportLabel);
  const lastColumnLabel = mode === "winRate" ? "ROI" : "P/L";

  return (
    <Card className="border-border/40 bg-secondary/20 overflow-hidden">
      <CardContent className="p-5">
        <p className="text-sm font-semibold text-muted-foreground mb-4">
          {title}
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_90px_110px] text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/30 pb-2">
              <span>{resolvedFirstColumnLabel}</span>
              <span className="text-right">Record</span>
              <span className="text-right">{lastColumnLabel}</span>
            </div>

            {rows.map((row) => {
              const displayName = resolvedFormatName(row.name);
              const finalValue = mode === "winRate" ? row.roi : row.pnl;

              return (
                <div
                  key={row.name}
                  className="grid grid-cols-[minmax(0,1fr)_90px_110px] text-sm items-center py-1.5 border-b border-border/10 last:border-b-0"
                >
                  <span className="text-white truncate pr-2">
                    {displayName}
                  </span>

                  <span className="font-mono text-xs text-white text-right">
                    {formatRecord(row.wins, row.losses)}
                  </span>

                  <span
                    className={`font-mono text-xs font-medium text-right ${
                      finalValue >= 0 ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {mode === "winRate"
                      ? `${row.roi >= 0 ? "+" : ""}${formatPercent(row.roi)}`
                      : `${row.pnl >= 0 ? "+" : ""}${formatCurrency(row.pnl)}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}