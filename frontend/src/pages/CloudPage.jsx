import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus,
  Trash2,
  X,
  Minimize2,
  Maximize2,
  TrendingUp,
  TrendingDown,
  Trophy,
  Pencil,
  Eye,
  EyeOff,
  Clock,
  Info,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import MlbSlate from "@/components/MlbSlate";
import {
  fetchGameFeed,
  findGameForMatchup,
  fetchTodaySlate,
  formatFirstPitch,
  gradeFirstInningBet,
} from "@/lib/mlb-api";

const CLOUD_BETS_KEY = "cloud_manual_bets";
const CLOUD_BANKROLL_KEY = "cloud_starting_bankroll";
const CLOUD_WITHDRAWALS_KEY = "cloud_withdrawals";

const VIEWS = [
  { value: "slate", label: "Slate" },
  { value: "bets", label: "Plays" },
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
    return Array.isArray(saved)
      ? saved.filter((bet) => !String(bet?.id || "").startsWith("mock-"))
      : [];
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

function calculateProfit(stake, odds) {
  const wager = Math.abs(Number(stake) || 0);
  const normalizedOdds = String(odds || "").trim().replace(/^\+/, "");
  const americanOdds = Number(normalizedOdds);

  if (!wager || !Number.isFinite(americanOdds) || americanOdds === 0) return 0;

  return americanOdds > 0
    ? (wager * americanOdds) / 100
    : (wager * 100) / Math.abs(americanOdds);
}

function formatRecord(wins, losses) {
  return `${wins}W · ${losses}L`;
}

export function getPstDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function getBetTypeLabel(value) {
  const normalized = String(value || "NRFI").trim().toUpperCase();
  return normalized === "YRFI" ? "YRFI" : "NRFI";
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

function emptyLeg() {
  return {
    id: crypto.randomUUID(),
    gamePk: "",
    awayTeam: "",
    homeTeam: "",
    gameStatus: "Scheduled",
    gameNumber: 1,
    doubleHeader: false,
    awayTeam: "",
    homeTeam: "",
    firstPitch: "",
    title: "NRFI",
    result: "pending",
  };
}

function gameToLeg(game, title = "NRFI") {
  return {
    id: crypto.randomUUID(),
    gamePk: String(game?.id || game?.gamePk || ""),
    awayTeam: game?.away?.name || "",
    homeTeam: game?.home?.name || "",
    firstPitch: game?.gameDate || "",
    status: game?.abstractStatus || game?.status || "Scheduled",
    gameNumber: game?.gameNumber || 1,
    doubleHeader: Boolean(game?.doubleHeader),
    title,
    result: "pending",
  };
}

function gameToSingle(game, title = "NRFI") {
  const awayTeam = game?.away?.name || "";
  const homeTeam = game?.home?.name || "";
  const awayPitcher = game?.away?.pitcher?.name || "TBD";
  const homePitcher = game?.home?.pitcher?.name || "TBD";

  return {
    ...gameToLeg(game, title),
    amount: "",
    odds: "",
    matchup: `${awayTeam} @ ${homeTeam} · ${awayPitcher} vs ${homePitcher} · ${formatFirstPitch(game?.gameDate)}`,
    date: String(game?.gameDate || "").slice(0, 10) || getPstDateString(),
    team: homeTeam,
  };
}

function formToSingle(form) {
  if (!form.gamePk && !form.awayTeam && !form.homeTeam) return null;

  return {
    id: crypto.randomUUID(),
    gamePk: String(form.gamePk || ""),
    awayTeam: form.awayTeam || "",
    homeTeam: form.homeTeam || "",
    firstPitch: form.date || "",
    status: form.gameStatus || "Scheduled",
    gameNumber: form.gameNumber || 1,
    doubleHeader: Boolean(form.doubleHeader),
    title: getBetTypeLabel(form.title),
    result: "pending",
    amount: form.amount || "",
    odds: form.odds || "",
    matchup: form.matchup || "",
    date: form.date || getPstDateString(),
    team: form.team || form.homeTeam || "",
  };
}

function emptyForm() {
  return {
    betMode: "single",
    title: "NRFI",
    matchup: "",
    gamePk: "",
    amount: "",
    odds: "",
    result: "pending",
    date: getPstDateString(),
    category: "",
    team: "",
    sportsbook: "",
    note: "",
    singleBets: [],
    legs: [],
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

function getBetParticipants(bet) {
  if (Array.isArray(bet.legs) && bet.legs.length > 0) {
    return bet.legs.flatMap((leg) => [leg.awayTeam, leg.homeTeam]).filter(Boolean);
  }

  return [bet.awayTeam, bet.homeTeam, bet.team].filter(Boolean);
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

function normalizeTeamName(team) {
  return String(team || "").trim();
}

function getTeamLogoByName(teamName) {
  const normalized = normalizeTeamName(teamName);
  if (!normalized) return null;

  const map = {
    "Seattle Mariners": "https://www.mlbstatic.com/team-logos/136.svg",
    "Houston Astros": "https://www.mlbstatic.com/team-logos/118.svg",
    "Los Angeles Dodgers": "https://www.mlbstatic.com/team-logos/119.svg",
    "Boston Red Sox": "https://www.mlbstatic.com/team-logos/111.svg",
    "New York Yankees": "https://www.mlbstatic.com/team-logos/147.svg",
    "Atlanta Braves": "https://www.mlbstatic.com/team-logos/144.svg",
    "Texas Rangers": "https://www.mlbstatic.com/team-logos/140.svg",
    "Philadelphia Phillies": "https://www.mlbstatic.com/team-logos/121.svg",
    "Detroit Tigers": "https://www.mlbstatic.com/team-logos/116.svg",
    "Tampa Bay Rays": "https://www.mlbstatic.com/team-logos/139.svg",
    "Toronto Blue Jays": "https://www.mlbstatic.com/team-logos/141.svg",
    "New York Mets": "https://www.mlbstatic.com/team-logos/121.svg",
    "San Diego Padres": "https://www.mlbstatic.com/team-logos/135.svg",
    "Baltimore Orioles": "https://www.mlbstatic.com/team-logos/110.svg",
    "Milwaukee Brewers": "https://www.mlbstatic.com/team-logos/158.svg",
    "Chicago Cubs": "https://www.mlbstatic.com/team-logos/112.svg",
    "Chicago White Sox": "https://www.mlbstatic.com/team-logos/145.svg",
    "Cleveland Guardians": "https://www.mlbstatic.com/team-logos/114.svg",
    "Minnesota Twins": "https://www.mlbstatic.com/team-logos/142.svg",
    "Oakland Athletics": "https://www.mlbstatic.com/team-logos/133.svg",
    "Los Angeles Angels": "https://www.mlbstatic.com/team-logos/108.svg",
    "Kansas City Royals": "https://www.mlbstatic.com/team-logos/118.svg",
    "Arizona Diamondbacks": "https://www.mlbstatic.com/team-logos/109.svg",
    "San Francisco Giants": "https://www.mlbstatic.com/team-logos/137.svg",
    "St. Louis Cardinals": "https://www.mlbstatic.com/team-logos/138.svg",
    "Cincinnati Reds": "https://www.mlbstatic.com/team-logos/113.svg",
    "Colorado Rockies": "https://www.mlbstatic.com/team-logos/115.svg",
    "Miami Marlins": "https://www.mlbstatic.com/team-logos/146.svg",
    "Washington Nationals": "https://www.mlbstatic.com/team-logos/120.svg",
    "Pittsburgh Pirates": "https://www.mlbstatic.com/team-logos/134.svg",
    "Seattle Mariners": "https://www.mlbstatic.com/team-logos/136.svg",
    "Houston Astros": "https://www.mlbstatic.com/team-logos/118.svg",
  };

  const direct = map[normalized];
  if (direct) return direct;

  return Object.entries(map).find(([team]) =>
    normalized.toLowerCase().includes(team.toLowerCase()) ||
    team.toLowerCase().includes(normalized.toLowerCase())
  )?.[1] || null;
}

function getBetTeamNames(bet) {
  if (bet?.awayTeam && bet?.homeTeam) {
    return [bet.awayTeam, bet.homeTeam];
  }

  const text = `${bet?.title || ""} ${bet?.matchup || ""}`;

  const candidates = [
    "Arizona Diamondbacks", "Diamondbacks", "D-backs",
    "Atlanta Braves", "Braves",
    "Baltimore Orioles", "Orioles",
    "Boston Red Sox", "Red Sox",
    "Chicago Cubs", "Cubs",
    "Chicago White Sox", "White Sox",
    "Cincinnati Reds", "Reds",
    "Cleveland Guardians", "Guardians",
    "Colorado Rockies", "Rockies",
    "Detroit Tigers", "Tigers",
    "Houston Astros", "Astros",
    "Kansas City Royals", "Royals",
    "Los Angeles Angels", "Angels",
    "Los Angeles Dodgers", "Dodgers",
    "Miami Marlins", "Marlins",
    "Milwaukee Brewers", "Brewers",
    "Minnesota Twins", "Twins",
    "New York Mets", "Mets",
    "New York Yankees", "Yankees",
    "Oakland Athletics", "Athletics", "A's",
    "Philadelphia Phillies", "Phillies",
    "Pittsburgh Pirates", "Pirates",
    "San Diego Padres", "Padres",
    "San Francisco Giants", "Giants",
    "Seattle Mariners", "Mariners",
    "St. Louis Cardinals", "Cardinals",
    "Tampa Bay Rays", "Rays",
    "Texas Rangers", "Rangers",
    "Toronto Blue Jays", "Blue Jays",
    "Washington Nationals", "Nationals",
  ];

  const lowerText = text.toLowerCase();
  const matches = [];

  for (const cand of candidates) {
    const pos = lowerText.indexOf(cand.toLowerCase());
    if (pos !== -1) {
      matches.push({ name: cand, pos });
    }
  }

  matches.sort((a, b) => a.pos - b.pos);

  const nonOverlapping = [];
  for (const m of matches) {
    const isSub = nonOverlapping.some(
      (existing) =>
        m.pos >= existing.pos &&
        m.pos + m.name.length <= existing.pos + existing.name.length
    );
    if (!isSub) {
      nonOverlapping.push(m);
    }
  }

  const teamNames = nonOverlapping.map((m) => m.name);
  if (teamNames.length >= 2) return teamNames.slice(0, 2);
  if (teamNames.length === 1) return [teamNames[0], ""];
  return ["", ""];
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
  const [view, setView] = useState("slate");
  const [addOpen, setAddOpen] = useState(false);
  const [slipMinimized, setSlipMinimized] = useState(true);
  const [isRefreshingPending, setIsRefreshingPending] = useState(false);
  const [editingBetId, setEditingBetId] = useState(null);
  const [form, setForm] = useState(() => emptyForm());
  const [calendarMonthKey, setCalendarMonthKey] = useState(() => getCurrentMonthKey());
  const [slateGames, setSlateGames] = useState([]);
  const [slateLoading, setSlateLoading] = useState(false);
  const [gamePickerLegId, setGamePickerLegId] = useState(null);
  const [startingBankroll, setStartingBankroll] = useState(() => {
    const saved = Number(localStorage.getItem(CLOUD_BANKROLL_KEY));
    return Number.isFinite(saved) && saved >= 0 ? saved : 0;
  });
  const [withdrawals, setWithdrawals] = useState(() => {
    const saved = Number(localStorage.getItem(CLOUD_WITHDRAWALS_KEY));
    return Number.isFinite(saved) && saved >= 0 ? saved : 0;
  });

  const isEditing = !!editingBetId;
  const availableTeams = TEAM_OPTIONS[form.category] || [];

  useEffect(() => {
    if (!addOpen || form.betMode !== "parlay" || slateGames.length > 0) return;

    let cancelled = false;
    setSlateLoading(true);

    fetchTodaySlate()
      .then((games) => {
        if (!cancelled) setSlateGames(games);
      })
      .catch(() => {
        if (!cancelled) setSlateGames([]);
      })
      .finally(() => {
        if (!cancelled) setSlateLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [addOpen, form.betMode, slateGames.length]);

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

    return sorted;
  }, [bets]);

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

  const trendStats = useMemo(() => {
    const settledBets = filteredBets.filter((bet) => {
      const status = getBetStatus(bet);
      return status === "win" || status === "loss";
    });
    const pendingBets = filteredBets.filter((bet) => getBetStatus(bet) === "pending");
    const getStake = (bet) => Math.abs(Number(bet.stake ?? bet.amount) || 0);
    const getProfit = (bet) => Number(bet.amount) || 0;
    const settledStake = settledBets.reduce((sum, bet) => sum + getStake(bet), 0);
    const settledPnl = settledBets.reduce((sum, bet) => sum + getProfit(bet), 0);
    const wins = settledBets.filter((bet) => isBetWin(bet) === true);
    const losses = settledBets.filter((bet) => isBetWin(bet) === false);

    let runningPnl = 0;
    let peakPnl = 0;
    let maxDrawdown = 0;
    [...settledBets]
      .sort((a, b) => getBetDateTime(a) - getBetDateTime(b))
      .forEach((bet) => {
        runningPnl += getProfit(bet);
        peakPnl = Math.max(peakPnl, runningPnl);
        maxDrawdown = Math.max(maxDrawdown, peakPnl - runningPnl);
      });

    const typeStats = ["NRFI", "YRFI"].map((type) => {
      const typeBets = settledBets.filter((bet) => {
        if (Array.isArray(bet.legs) && bet.legs.length > 0) {
          return bet.legs.some((leg) => getBetTypeLabel(leg.title) === type);
        }
        return getBetTypeLabel(bet.title) === type;
      });
      const typeWins = typeBets.filter((bet) => isBetWin(bet) === true).length;
      const typeStake = typeBets.reduce((sum, bet) => sum + getStake(bet), 0);
      const typePnl = typeBets.reduce((sum, bet) => sum + getProfit(bet), 0);

      return {
        type,
        count: typeBets.length,
        wins: typeWins,
        losses: typeBets.length - typeWins,
        pnl: typePnl,
        roi: typeStake > 0 ? (typePnl / typeStake) * 100 : 0,
      };
    });

    return {
      settled: settledBets.length,
      pending: pendingBets.length,
      totalStake: filteredBets.reduce((sum, bet) => sum + getStake(bet), 0),
      settledStake,
      settledPnl,
      winRate: settledBets.length > 0 ? (wins.length / settledBets.length) * 100 : 0,
      roi: settledStake > 0 ? (settledPnl / settledStake) * 100 : 0,
      averageStake: filteredBets.length > 0
        ? filteredBets.reduce((sum, bet) => sum + getStake(bet), 0) / filteredBets.length
        : 0,
      averageWin: wins.length > 0
        ? wins.reduce((sum, bet) => sum + getProfit(bet), 0) / wins.length
        : 0,
      averageLoss: losses.length > 0
        ? losses.reduce((sum, bet) => sum + getProfit(bet), 0) / losses.length
        : 0,
      bestWin: wins.length > 0 ? Math.max(...wins.map(getProfit)) : 0,
      worstLoss: losses.length > 0 ? Math.min(...losses.map(getProfit)) : 0,
      maxDrawdown,
      typeStats,
    };
  }, [filteredBets]);

  const categoryStats = useMemo(() => {
    return buildGroupStats(filteredBets, getCategory);
  }, [filteredBets]);

  const teamStats = useMemo(() => {
    const groups = {};

    filteredBets.forEach((bet) => {
      const participants = [...new Set(getBetParticipants(bet))];
      const won = isBetWin(bet);
      const amount = Number(bet.amount) || 0;
      const stake = Math.abs(Number(bet.stake ?? bet.amount) || 0);

      participants.forEach((team) => {
        if (!groups[team]) groups[team] = { name: team, wins: 0, losses: 0, wagered: 0, pnl: 0 };
        groups[team].wagered += stake;
        groups[team].pnl += amount;
        if (won === true) groups[team].wins += 1;
        if (won === false) groups[team].losses += 1;
      });
    });

    return Object.values(groups)
      .map((group) => ({
        ...group,
        total: group.wins + group.losses,
        winRate: group.wins + group.losses > 0 ? (group.wins / (group.wins + group.losses)) * 100 : 0,
        roi: group.wagered > 0 ? (group.pnl / group.wagered) * 100 : 0,
      }))
      .filter((group) => group.total > 0)
      .sort((a, b) => b.pnl - a.pnl);
  }, [filteredBets]);

  useEffect(() => {
    localStorage.setItem(CLOUD_BANKROLL_KEY, String(startingBankroll));
  }, [startingBankroll]);

  useEffect(() => {
    localStorage.setItem(CLOUD_WITHDRAWALS_KEY, String(withdrawals));
  }, [withdrawals]);


  const calendarBets = useMemo(() => {
    return bets.filter((bet) => getBetMonthKey(bet) === calendarMonthKey);
  }, [bets, calendarMonthKey]);

  const openAddModal = () => {
    setEditingBetId(null);
    setForm(emptyForm());
    setSlipMinimized(true);
    setAddOpen(true);
  };

  const openAddModalFromGame = (game) => {
    const awayTeam = game?.away?.name || "";
    const homeTeam = game?.home?.name || "";
    const awayPitcher = game?.away?.pitcher?.name || "TBD";
    const homePitcher = game?.home?.pitcher?.name || "TBD";

    const newLeg = gameToLeg(game);
    const newSingle = gameToSingle(game);

    if (addOpen && form.betMode === "parlay") {
      if (form.legs.some((leg) => String(leg.gamePk) === newLeg.gamePk)) return;
      setForm((prev) => ({ ...prev, legs: [...prev.legs, newLeg] }));
      return;
    }

    if (addOpen) {
      setForm((prev) => ({
        ...prev,
        betMode: "single",
        singleBets: [
          ...(
            prev.singleBets?.length
              ? prev.singleBets
              : formToSingle(prev)
                ? [formToSingle(prev)]
                : []
          ),
          newSingle,
        ].filter(
          (single, index, singles) =>
            singles.findIndex((item) => String(item.gamePk) === String(single.gamePk)) === index
        ),
      }));
      return;
    }

    setEditingBetId(null);
    setForm({
      ...emptyForm(),
      title: "NRFI",
      matchup: `${awayTeam} @ ${homeTeam} · ${awayPitcher} vs ${homePitcher} · ${formatFirstPitch(game.gameDate)}`,
      gamePk: newLeg.gamePk,
      awayTeam,
      homeTeam,
      gameStatus: game.abstractStatus || game.status || "Scheduled",
      gameNumber: game.gameNumber || 1,
      doubleHeader: Boolean(game.doubleHeader),
      result: "pending",
      date: String(game.gameDate || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      category: "Baseball",
      team: homeTeam,
      singleBets: [newSingle],
    });
    setSlipMinimized(true);
    setAddOpen(true);
  };

  const refreshPendingGrades = useCallback(async (showToast = false) => {
      if (isRefreshingPending) return;
      setIsRefreshingPending(true);

      try {

      const pendingBets = bets.filter((bet) => {
        if (String(bet.result || "").toLowerCase() !== "pending") return false;
        if (Array.isArray(bet.legs) && bet.legs.length > 0) return true;

        if (bet.mlbGamePk || bet.gamePk || bet.game_id || bet.gameId) return true;

        const [awayTeam, homeTeam] = getBetTeamNames(bet);
        return Boolean(bet.date && awayTeam && homeTeam);
      });

      if (pendingBets.length === 0) {
        if (showToast) toast.message("No pending bets to refresh");
        return;
      }

      const nextBets = [...bets];
      let updated = false;

      for (const bet of pendingBets) {
        if (Array.isArray(bet.legs) && bet.legs.length > 0) {
          const legs = [...bet.legs];
          let legsChanged = false;

          for (let i = 0; i < legs.length; i += 1) {
            const leg = legs[i];
            if (String(leg.result || "pending").toLowerCase() !== "pending") continue;

            let gamePk = leg.gamePk;

            if (!gamePk) {
              try {
                const resolved = await findGameForMatchup({
                  date: leg.firstPitch || bet.date,
                  awayTeam: leg.awayTeam,
                  homeTeam: leg.homeTeam,
                  gameNumber: leg.gameNumber,
                });

                if (resolved?.gamePk) {
                  gamePk = resolved.gamePk;
                  legs[i] = {
                    ...leg,
                    gamePk,
                    gameNumber: resolved.gameNumber || leg.gameNumber || 1,
                    doubleHeader:
                      typeof resolved.doubleHeader === "boolean"
                        ? resolved.doubleHeader
                        : Boolean(leg.doubleHeader),
                    status:
                      resolved.abstractStatus ||
                      resolved.detailedStatus ||
                      leg.status ||
                      "Scheduled",
                  };
                  legsChanged = true;
                }
              } catch {
                // keep pending if schedule lookup fails
              }
            }

            if (!gamePk) continue;

            try {
              const feed = await fetchGameFeed(gamePk);
              const legResult = gradeFirstInningBet(feed, leg.title);

              if (legResult === "win" || legResult === "loss") {
                legs[i] = { ...legs[i], result: legResult };
                legsChanged = true;
              }
            } catch {
              // leave leg pending until the score is available
            }
          }

          if (!legsChanged) continue;

          const anyLoss = legs.some((leg) => leg.result === "loss");
          const allWin = legs.every((leg) => leg.result === "win");
          const overallResult = anyLoss ? "loss" : allWin ? "win" : "pending";

          const betIndex = nextBets.findIndex((item) => item.id === bet.id);
          if (betIndex >= 0) {
            nextBets[betIndex] = {
              ...nextBets[betIndex],
              legs,
              result: overallResult,
              amount:
                overallResult === "win"
                  ? calculateProfit(bet.stake || bet.amount, bet.odds)
                  : overallResult === "loss"
                    ? -Math.abs(Number(bet.stake || bet.amount) || 0)
                    : 0,
              updated_at: new Date().toISOString(),
            };
            updated = true;
          }

          continue;
        }

        let gamePk = bet.mlbGamePk || bet.gamePk || bet.game_id || bet.gameId;

        if (!gamePk) {
          try {
            const [awayTeam, homeTeam] = getBetTeamNames(bet);
            const resolved = await findGameForMatchup({
              date: bet.date,
              awayTeam,
              homeTeam,
              gameNumber: bet.gameNumber,
            });

            if (resolved?.gamePk) {
              gamePk = resolved.gamePk;
              const betIndex = nextBets.findIndex((item) => item.id === bet.id);
              if (betIndex >= 0) {
                nextBets[betIndex] = {
                  ...nextBets[betIndex],
                  mlbGamePk: gamePk,
                  gamePk,
                  gameStatus:
                    resolved.abstractStatus ||
                    resolved.detailedStatus ||
                    bet.gameStatus ||
                    "Scheduled",
                  gameNumber: resolved.gameNumber || bet.gameNumber || 1,
                  doubleHeader:
                    typeof resolved.doubleHeader === "boolean"
                      ? resolved.doubleHeader
                      : Boolean(bet.doubleHeader),
                  updated_at: new Date().toISOString(),
                };
                updated = true;
              }
            }
          } catch {
            // keep pending if schedule lookup fails
          }
        }

        if (!gamePk) continue;

        try {
          const feed = await fetchGameFeed(gamePk);
          const betType = getBetTypeLabel(bet.title);
          const result = gradeFirstInningBet(feed, betType);

          if (result === "win" || result === "loss") {
            const betIndex = nextBets.findIndex((item) => item.id === bet.id);
            if (betIndex >= 0) {
              nextBets[betIndex] = {
                ...nextBets[betIndex],
                result,
                amount:
                  result === "win"
                    ? calculateProfit(bet.stake || bet.amount, bet.odds)
                    : -Math.abs(Number(bet.stake || bet.amount) || 0),
                updated_at: new Date().toISOString(),
              };
              updated = true;
            }
          }
        } catch {
          // skip unresolved live feeds until the game advances or the score is available
        }
      }

      if (updated) {
        setBets(nextBets);
        saveBets(nextBets);
      }

      if (showToast) {
        toast.success(updated ? "Pending bets refreshed" : "No grade updates yet");
      }

      } finally {
        setIsRefreshingPending(false);
      }
    }, [bets, isRefreshingPending]);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const runRefresh = async () => {
      if (cancelled) return;
      await refreshPendingGrades(false);
    };

    runRefresh();
    timer = setInterval(runRefresh, 15000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [refreshPendingGrades]);

  const openEditModal = (bet) => {
    setEditingBetId(bet.id);

    if (Array.isArray(bet.legs) && bet.legs.length > 0) {
      setForm({
        ...emptyForm(),
        betMode: "parlay",
        amount: String(Math.abs(Number(bet.stake ?? bet.amount) || 0)),
        odds: bet.odds || "",
        date: bet.date || getPstDateString(),
        legs: bet.legs.map((leg) => ({
          id: leg.id || crypto.randomUUID(),
          gamePk: leg.gamePk || "",
          awayTeam: leg.awayTeam || "",
          homeTeam: leg.homeTeam || "",
          firstPitch: leg.firstPitch || "",
          status: leg.status || "Scheduled",
          gameNumber: leg.gameNumber || 1,
          doubleHeader: Boolean(leg.doubleHeader),
          title: getBetTypeLabel(leg.title),
          result: leg.result || "pending",
        })),
      });
      setSlipMinimized(true);
      setAddOpen(true);
      return;
    }

    setForm({
      ...emptyForm(),
      betMode: "single",
      title: bet.title || "",
      matchup: bet.matchup || "",
      gamePk: String(bet.mlbGamePk || bet.gamePk || bet.game_id || bet.gameId || ""),
      awayTeam: bet.awayTeam || "",
      homeTeam: bet.homeTeam || "",
      gameStatus: bet.gameStatus || "Scheduled",
      gameNumber: bet.gameNumber || 1,
      doubleHeader: Boolean(bet.doubleHeader),
      amount: String(Math.abs(Number(bet.stake ?? bet.amount) || 0)),
      odds: bet.odds || "",
      date: bet.date || getPstDateString(),
      category: bet.category || "",
      team: bet.team || "",
    });
    setSlipMinimized(true);
    setAddOpen(true);
  };

  const closeModal = () => {
    setAddOpen(false);
    setSlipMinimized(true);
    setEditingBetId(null);
    setGamePickerLegId(null);
    setForm(emptyForm());
  };

  const clearSlip = () => {
    setEditingBetId(null);
    setForm(emptyForm());
  };

  const deleteBet = (bet) => {
    const label = bet.title || bet.matchup || "this play";
    if (!window.confirm(`Delete ${label}?`)) return;

    const next = bets.filter((item) => item.id !== bet.id);
    setBets(next);
    saveBets(next);
    toast.success("Play deleted");
  };

  const setSlipBetMode = (mode) => {
    setForm((prev) => {
      if (mode === "parlay") {
        const singles = prev.singleBets?.length
          ? prev.singleBets
          : formToSingle(prev)
            ? [formToSingle(prev)]
            : [];

        return {
          ...prev,
          betMode: "parlay",
          legs: singles.length > 0 ? singles.map((single) => ({ ...single })) : prev.legs,
        };
      }

      return {
        ...prev,
        betMode: "single",
        singleBets: prev.singleBets?.length
          ? prev.singleBets
          : prev.legs.map((leg) => ({
              ...leg,
              matchup: `${leg.awayTeam} @ ${leg.homeTeam}`,
              date: prev.date || getPstDateString(),
              team: leg.homeTeam || "",
            })),
      };
    });
  };

  const addLeg = () => {
    setForm((prev) => ({ ...prev, legs: [...prev.legs, emptyLeg()] }));
  };

  const removeLeg = (legId) => {
    setForm((prev) => ({
      ...prev,
      legs: prev.legs.filter((leg) => leg.id !== legId),
    }));
  };

  const updateLeg = (legId, updates) => {
    setForm((prev) => ({
      ...prev,
      legs: prev.legs.map((leg) => (leg.id === legId ? { ...leg, ...updates } : leg)),
    }));
  };

  const removeSingle = (singleId) => {
    setForm((prev) => ({
      ...prev,
      singleBets: prev.singleBets.filter((single) => single.id !== singleId),
    }));
  };

  const updateSingle = (singleId, updates) => {
    setForm((prev) => ({
      ...prev,
      singleBets: prev.singleBets.map((single) =>
        single.id === singleId ? { ...single, ...updates } : single
      ),
    }));
  };

  const handleSaveBet = () => {
    const savedDate = form.date || getPstDateString();

    if (form.betMode === "parlay") {
      const amountRaw = Number(form.amount);
      const normalizedOdds = String(form.odds || "").trim();

      if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
        toast.error("Enter a valid amount");
        return;
      }

      if (form.legs.length < 2) {
        toast.error("Add at least two legs to a parlay");
        return;
      }

      if (form.legs.some((leg) => !leg.gamePk)) {
        toast.error("Select a game for every leg");
        return;
      }

      const legs = form.legs.map((leg) => ({
        id: leg.id,
        gamePk: leg.gamePk,
        awayTeam: leg.awayTeam,
        homeTeam: leg.homeTeam,
        firstPitch: leg.firstPitch,
        status: leg.status || "Scheduled",
        gameNumber: leg.gameNumber || 1,
        doubleHeader: Boolean(leg.doubleHeader),
        title: getBetTypeLabel(leg.title),
        result: "pending",
      }));

      const matchup = legs
        .map((leg) => `${leg.awayTeam} @ ${leg.homeTeam} (${leg.title})`)
        .join(" | ");

      if (isEditing) {
        const next = bets.map((bet) =>
          bet.id === editingBetId
            ? {
                ...bet,
                title: "Parlay",
                isParlay: true,
                legs,
                matchup,
                amount: 0,
                stake: Math.abs(amountRaw),
                odds: normalizedOdds,
                result: "pending",
                date: savedDate,
                category: "Parlay",
                updated_at: new Date().toISOString(),
              }
            : bet
        );

        setBets(next);
        saveBets(next);
        closeModal();
        toast.success("Parlay updated");
        return;
      }

      const nextBet = {
        id: crypto.randomUUID(),
        title: "Parlay",
        isParlay: true,
        legs,
        matchup,
        amount: 0,
        stake: Math.abs(amountRaw),
        odds: normalizedOdds,
        result: "pending",
        date: savedDate,
        category: "Parlay",
        team: "",
        sportsbook: "",
        note: "",
        created_at: new Date().toISOString(),
        hidden: false,
      };

      const next = [nextBet, ...bets];

      setBets(next);
      saveBets(next);
      closeModal();
      toast.success("Parlay added");
      return;
    }

    const singleSelections = form.singleBets?.length
      ? form.singleBets
      : formToSingle(form)
        ? [formToSingle(form)]
        : [];
    const betType = getBetTypeLabel(singleSelections[0]?.title || form.title);
    const finalAmount = 0;
    const activeSingle = singleSelections[0] || {};
    const singleAmountRaw = Number(activeSingle.amount ?? form.amount);
    const singleOdds = String(activeSingle.odds ?? form.odds ?? "").trim();
    const gamePk = String(activeSingle.gamePk || form.gamePk || "");
    const inferredMatchup = String(activeSingle.matchup || form.matchup || "").trim();

    const invalidSingle = singleSelections.find((single) => {
      const amount = Number(single.amount ?? form.amount);
      return !Number.isFinite(amount) || amount <= 0;
    });

    if (invalidSingle) {
      toast.error("Enter an amount for every single");
      return;
    }

    if (isEditing) {
      const next = bets.map((bet) =>
        bet.id === editingBetId
          ? {
              ...bet,
              title: betType,
              isParlay: false,
              legs: [],
              matchup: inferredMatchup || bet.matchup || "",
              awayTeam: String(form.awayTeam || ""),
              homeTeam: String(form.homeTeam || ""),
              gameStatus: form.gameStatus || "Scheduled",
              gameNumber: form.gameNumber || 1,
              doubleHeader: Boolean(form.doubleHeader),
              amount: finalAmount,
              stake: Math.abs(singleAmountRaw),
              odds: singleOdds,
              mlbGamePk: gamePk,
              result: "pending",
              date: savedDate,
              category: "NRFI/YRFI",
              team: bet.team || "",
              sportsbook: "",
              note: "",
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

    if (singleSelections.length === 0) {
      toast.error("Add at least one game");
      return;
    }

    const createdAt = new Date().toISOString();
    const nextSingleBets = singleSelections.map((single) => ({
      id: crypto.randomUUID(),
      title: getBetTypeLabel(single.title),
      matchup: String(single.matchup || `${single.awayTeam} @ ${single.homeTeam}`).trim(),
      awayTeam: String(single.awayTeam || "").trim(),
      homeTeam: String(single.homeTeam || "").trim(),
      gameStatus: single.status || single.gameStatus || "Scheduled",
      gameNumber: single.gameNumber || 1,
      doubleHeader: Boolean(single.doubleHeader),
      amount: finalAmount,
      stake: Math.abs(Number(single.amount) || 0),
      odds: String(single.odds || "").trim(),
      mlbGamePk: String(single.gamePk || ""),
      gamePk: String(single.gamePk || ""),
      result: "pending",
      date: single.date || savedDate,
      category: "NRFI/YRFI",
      team: String(single.team || single.homeTeam || "").trim(),
      sportsbook: "",
      note: "",
      created_at: createdAt,
      hidden: false,
    }));

    const next = [...nextSingleBets, ...bets];

    setBets(next);
    saveBets(next);
    closeModal();
    toast.success(nextSingleBets.length > 1 ? "Singles added" : "Bet added");
  };

  return (
<div className="min-h-[calc(100vh-4rem)] bg-background text-foreground p-0">
    <Card className="w-full rounded-none border-0 bg-card shadow-none">
      <CardContent className="p-8 pb-4 space-y-6">
          <div className="flex justify-center">
            <div className="inline-flex rounded-md border border-border/40 bg-secondary/30 p-1">
              {VIEWS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setView(option.value)}
                  className={`px-3 h-7 rounded text-xs font-medium transition-colors ${
                    view === option.value
                      ? "bg-slate-100 text-slate-950"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {view === "slate" && <MlbSlate onAddBet={openAddModalFromGame} />}

          {view === "bets" && (
            <CalendarSidePanel
              monthKey={calendarMonthKey}
              bets={calendarBets}
              allBets={bets}
              onEditBet={openEditModal}
              onDeleteBet={deleteBet}
              onRefreshPending={() => refreshPendingGrades(true)}
              refreshingPending={isRefreshingPending}
              onSelectMonth={setCalendarMonthKey}
              onPreviousMonth={() =>
                setCalendarMonthKey((prev) => moveMonthKey(prev, -1))
              }
              onNextMonth={() =>
                setCalendarMonthKey((prev) => moveMonthKey(prev, 1))
              }
            />
          )}
        </CardContent>
      </Card>

      {addOpen && slipMinimized ? (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
          <button
            type="button"
            onClick={() => refreshPendingGrades(true)}
            disabled={isRefreshingPending}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-card/95 text-foreground shadow-xl backdrop-blur hover:bg-secondary disabled:opacity-60"
            aria-label="Refresh pending bets"
            title="Refresh pending bets"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshingPending ? "animate-spin" : ""}`} />
          </button>

          <button
            type="button"
            onClick={() => setSlipMinimized(false)}
            className="flex items-center gap-2 rounded-md border border-border/60 bg-card/95 px-3 py-2 text-left text-foreground shadow-xl backdrop-blur"
            aria-label="Expand bet slip"
          >
            <Maximize2 className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wide">Bet Slip</span>
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
              {form.betMode === "parlay" ? form.legs.length : form.singleBets.length || 1}
            </span>
          </button>
        </div>
      ) : null}

      {addOpen && !slipMinimized ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Bet slip"
          className={`fixed inset-y-0 right-0 z-50 flex h-screen w-full flex-col overflow-y-auto border-l border-border bg-card text-foreground shadow-2xl transition-[max-width] duration-200 ${
            form.betMode === "single" && form.singleBets.length > 1
              ? "max-w-xl"
              : "max-w-md"
          }`}
        >
          <button
            type="button"
            aria-label="Minimize bet slip"
            onClick={() => setSlipMinimized(true)}
            className="absolute right-14 top-4 z-10 rounded-sm p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Close bet slip"
            onClick={closeModal}
            className="absolute right-4 top-4 z-10 rounded-sm p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center justify-between border-b border-border/40 px-5 py-4 pr-14 text-left">
            <div>
              <h2 className="text-xl font-black uppercase leading-none tracking-tight text-foreground">
                Bet Slip
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {form.betMode === "parlay" ? "Parlay" : "Singles"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => refreshPendingGrades(true)}
                disabled={isRefreshingPending}
                className="rounded-sm p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
                aria-label="Refresh pending bets"
                title="Refresh pending bets"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshingPending ? "animate-spin" : ""}`} />
              </button>

              <button
                type="button"
                onClick={clearSlip}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Clear All
              </button>
              <Info className="h-5 w-5 text-blue-600" />
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                {form.betMode === "parlay" ? form.legs.length : form.singleBets.length || 1}
              </span>
              <p className="text-sm font-bold uppercase text-foreground">
                {form.betMode === "parlay" ? "Parlay" : "Singles"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={form.betMode === "single" ? "default" : "outline"}
                onClick={() => setSlipBetMode("single")}
                className={
                  form.betMode === "single"
                    ? "bg-emerald-600 text-white hover:bg-emerald-500"
                    : "border-border/60 bg-secondary/30 text-foreground hover:bg-secondary"
                }
              >
                Singles
              </Button>

              <Button
                type="button"
                variant={form.betMode === "parlay" ? "default" : "outline"}
                onClick={() => setSlipBetMode("parlay")}
                className={
                  form.betMode === "parlay"
                    ? "bg-emerald-600 text-white hover:bg-emerald-500"
                    : "border-border/60 bg-secondary/30 text-foreground hover:bg-secondary"
                }
              >
                Parlay
              </Button>
            </div>

            <div className="hidden">
              <p className="text-sm text-muted-foreground">
                {form.betMode === "parlay"
                  ? "Build your ticket by adding two or more first-inning selections."
                  : isEditing
                    ? "Update this manual bet."
                    : "Manually enter a win or loss."}
              </p>
            </div>

            {form.betMode === "single" ? (
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">First inning pick</Label>

                {form.singleBets.length > 0 ? (
                  <div
                    className="space-y-2 overflow-y-auto pr-1"
                    style={{
                      maxHeight:
                        form.singleBets.length > 3
                          ? "min(62vh, 42rem)"
                          : form.singleBets.length > 1
                            ? "min(54vh, 34rem)"
                            : "18rem",
                    }}
                  >
                    {form.singleBets.map((single, index) => (
                      <div key={single.id} className="rounded-md border border-border/40 bg-background/50 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">
                            {index + 1}
                          </span>

                          <div className="flex -space-x-1">
                            {[single.awayTeam, single.homeTeam].map((team) => {
                              const logo = getTeamLogoByName(team);
                              return logo ? (
                                <img key={team} src={logo} alt={team} className="h-6 w-6 rounded-full bg-secondary object-contain p-0.5 ring-1 ring-background" />
                              ) : null;
                            })}
                          </div>

                          <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                            {single.awayTeam} @ {single.homeTeam}
                          </p>

                          <button
                            type="button"
                            onClick={() => removeSingle(single.id)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Remove single"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={getBetTypeLabel(single.title) === "NRFI" ? "default" : "outline"}
                            onClick={() => updateSingle(single.id, { title: "NRFI" })}
                            className={getBetTypeLabel(single.title) === "NRFI" ? "h-8 bg-emerald-600 text-white hover:bg-emerald-500" : "h-8 border-border/60 bg-transparent text-foreground hover:bg-secondary"}
                          >
                            NRFI
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant={getBetTypeLabel(single.title) === "YRFI" ? "default" : "outline"}
                            onClick={() => updateSingle(single.id, { title: "YRFI" })}
                            className={getBetTypeLabel(single.title) === "YRFI" ? "h-8 bg-emerald-600 text-white hover:bg-emerald-500" : "h-8 border-border/60 bg-transparent text-foreground hover:bg-secondary"}
                          >
                            YRFI
                          </Button>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                              Amount
                            </Label>
                            <Input
                              type="number"
                              step="any"
                              value={single.amount || ""}
                              onChange={(e) => updateSingle(single.id, { amount: e.target.value })}
                              placeholder="25.00"
                              className="h-9 border-border bg-background font-mono text-foreground"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                              Odds
                            </Label>
                            <Input
                              value={single.odds || ""}
                              onChange={(e) => updateSingle(single.id, { odds: e.target.value })}
                              placeholder="+120 or -110"
                              className="h-9 border-border bg-background font-mono text-foreground"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={getBetTypeLabel(form.title) === "NRFI" ? "default" : "outline"}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            title: "NRFI",
                          }))
                        }
                        className={
                          getBetTypeLabel(form.title) === "NRFI"
                            ? "bg-emerald-600 text-white hover:bg-emerald-500"
                            : "border-border/60 bg-secondary/30 text-foreground hover:bg-secondary"
                        }
                      >
                        NRFI
                      </Button>

                      <Button
                        type="button"
                        variant={getBetTypeLabel(form.title) === "YRFI" ? "default" : "outline"}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            title: "YRFI",
                          }))
                        }
                        className={
                          getBetTypeLabel(form.title) === "YRFI"
                            ? "bg-emerald-600 text-white hover:bg-emerald-500"
                            : "border-border/60 bg-secondary/30 text-foreground hover:bg-secondary"
                        }
                      >
                        YRFI
                      </Button>
                    </div>

                    {form.gamePk ? (
                      <div className="mt-3 rounded-md border border-border/40 bg-background/50 p-3">
                        <div className="flex items-center gap-2">
                          {[form.awayTeam, form.homeTeam].map((team) => {
                            const logo = getTeamLogoByName(team);
                            return logo ? (
                              <img key={team} src={logo} alt={team} className="h-7 w-7 rounded-full bg-secondary object-contain p-0.5" />
                            ) : null;
                          })}
                          <span className={`ml-auto text-[10px] font-semibold uppercase ${form.gameStatus === "Final" ? "text-muted-foreground" : form.gameStatus === "Live" ? "text-rose-300" : "text-emerald-300"}`}>
                            {form.gameStatus || "Scheduled"}
                          </span>
                        </div>
                        <p className="mt-2 text-xs font-medium text-foreground">{form.awayTeam} @ {form.homeTeam}</p>
                        {form.doubleHeader ? <p className="mt-1 text-[10px] text-muted-foreground">Doubleheader · Game {form.gameNumber}</p> : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/50 bg-[#0A0F1D]">
                <div className="flex items-center justify-between border-b border-border/40 bg-secondary/40 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Parlay selections</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {form.legs.length} selections · all must win
                    </p>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addLeg}
                    className="h-8 border-border/60 bg-transparent text-foreground hover:bg-secondary"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add Leg
                  </Button>
                </div>

                {slateLoading ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">Loading available games...</p>
                ) : null}

                <div className="max-h-72 space-y-2 overflow-y-auto p-3">
                  {form.legs.map((leg, index) => (
                    <div
                      key={leg.id}
                      className="rounded-md border border-border/40 bg-background/50"
                    >
                      <div className="flex items-start gap-3 p-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">
                          {index + 1}
                        </div>

                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              First inning
                            </span>

                            <span className="font-mono text-xs font-bold text-foreground">
                              {leg.title}
                            </span>
                          </div>

                          {leg.gamePk ? (
                            <div className="flex items-center gap-2">
                              <div className="flex -space-x-1">
                                {[leg.awayTeam, leg.homeTeam].map((team) => {
                                  const logo = getTeamLogoByName(team);
                                  return logo ? (
                                    <img key={team} src={logo} alt={team} className="h-6 w-6 rounded-full bg-secondary object-contain p-0.5 ring-1 ring-background" />
                                  ) : null;
                                })}
                              </div>
                              <span className={`text-[10px] font-semibold uppercase ${leg.status === "Final" ? "text-muted-foreground" : leg.status === "Live" ? "text-rose-300" : "text-emerald-300"}`}>
                                {leg.status || "Scheduled"}
                              </span>
                              {leg.doubleHeader ? <span className="text-[10px] text-muted-foreground">Game {leg.gameNumber}</span> : null}
                            </div>
                          ) : null}

                          <Popover
                            open={gamePickerLegId === leg.id}
                            onOpenChange={(open) =>
                              setGamePickerLegId(open ? leg.id : null)
                            }
                          >
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-auto min-h-9 w-full justify-between border-border/40 bg-background px-3 py-2 text-left text-xs font-medium text-foreground"
                              >
                                <span className="truncate">
                                  {leg.gamePk
                                    ? `${leg.awayTeam} @ ${leg.homeTeam}`
                                    : "Select game"}
                                </span>
                                <span className="ml-2 text-muted-foreground">⌄</span>
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-[min(22rem,calc(100vw-2rem))] border-border bg-card p-0"
                              align="start"
                            >
                              <Command>
                                <CommandInput placeholder="Search teams..." />
                                <CommandList>
                                  <CommandEmpty>No games found.</CommandEmpty>
                                  {slateGames.map((game) => (
                                    <CommandItem
                                      key={game.id}
                                      value={`${game.away.name} ${game.home.name}`}
                                      onSelect={() => {
                                        updateLeg(leg.id, {
                                          gamePk: String(game.id),
                                          awayTeam: game.away.name,
                                          homeTeam: game.home.name,
                                          firstPitch: game.gameDate,
                                          status: game.abstractStatus || game.status || "Scheduled",
                                          gameNumber: game.gameNumber || 1,
                                          doubleHeader: Boolean(game.doubleHeader),
                                        });
                                        setGamePickerLegId(null);
                                      }}
                                      className="flex-col items-start gap-0.5 py-2.5"
                                    >
                                      <span className="font-medium">
                                        {game.away.name} @ {game.home.name}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground">
                                        {formatFirstPitch(game.gameDate)}
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>

                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={leg.title === "NRFI" ? "default" : "outline"}
                              onClick={() => updateLeg(leg.id, { title: "NRFI" })}
                              className={leg.title === "NRFI" ? "h-8 bg-emerald-600 text-white hover:bg-emerald-500" : "h-8 border-border/60 bg-transparent text-foreground hover:bg-secondary"}
                            >
                              NRFI
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant={leg.title === "YRFI" ? "default" : "outline"}
                              onClick={() => updateLeg(leg.id, { title: "YRFI" })}
                              className={leg.title === "YRFI" ? "h-8 bg-emerald-600 text-white hover:bg-emerald-500" : "h-8 border-border/60 bg-transparent text-foreground hover:bg-secondary"}
                            >
                              YRFI
                            </Button>
                          </div>
                        </div>

                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={form.legs.length <= 2}
                          onClick={() => removeLeg(leg.id)}
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-border/40 bg-secondary/30 p-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Stake</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                      {form.amount ? `$${Number(form.amount).toFixed(2)}` : "$0.00"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Combined odds</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-foreground">{form.odds || "-"}</p>
                  </div>
                </div>
              </div>
            )}

            {(form.betMode === "parlay" || form.singleBets.length === 0) && (
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">
                  {form.betMode === "parlay" ? "Total Amount" : "Amount"}
                </Label>

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
                  placeholder="25.00"
                  className="border-border bg-background font-mono text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">
                  {form.betMode === "parlay" ? "Combined Odds" : "Odds"}
                </Label>

                <Input
                  value={form.odds}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      odds: e.target.value,
                    }))
                  }
                  placeholder="+120 or -110"
                  className="border-border bg-background font-mono text-foreground"
                />
              </div>
            </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={form.date || getPstDateString()}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    date: e.target.value,
                  }))
                }
                className="border-border bg-background font-mono text-foreground"
              />
            </div>
          </div>

          <DialogFooter className="mt-auto border-t border-border/40 bg-secondary/30 p-4">
            <Button
              variant="outline"
              onClick={closeModal}
              className="border-border/60 bg-transparent text-foreground hover:bg-secondary"
            >
              Cancel
            </Button>

            <Button
              onClick={handleSaveBet}
              className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
            >
              {isEditing ? "Save Changes" : "Save Bet"}
            </Button>
          </DialogFooter>
        </div>
      ) : null}
    </div>
  );
}


function CalendarSidePanel({
  monthKey,
  bets,
  allBets,
  onEditBet,
  onDeleteBet,
  onRefreshPending,
  refreshingPending,
  onSelectMonth,
  onPreviousMonth,
  onNextMonth,
}) {
  const [selectedDate, setSelectedDate] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    setSelectedDate(null);
    setDetailsOpen(false);
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

  const monthTiles = useMemo(() => {
    const year = Number(monthKey.slice(0, 4));
    const months = Array.from({ length: 12 }, (_, index) => {
      const monthNumber = String(index + 1).padStart(2, "0");
      const key = `${year}-${monthNumber}`;
      const monthBets = allBets.filter((bet) => getBetMonthKey(bet) === key);

      return monthBets.reduce(
        (summary, bet) => {
          summary.pnl += Number(bet.amount) || 0;
          const won = isBetWin(bet);
          if (won === true) summary.wins += 1;
          if (won === false) summary.losses += 1;
          return summary;
        },
        {
          key,
          label: new Date(year, index, 1).toLocaleDateString("en-US", {
            month: "short",
          }),
          wins: 0,
          losses: 0,
          pnl: 0,
        }
      );
    });

    return months;
  }, [allBets, monthKey]);

  const yearlyPnl = useMemo(() => {
    const year = monthKey.slice(0, 4);
    return allBets
      .filter((bet) => getBetMonthKey(bet).startsWith(year))
      .reduce((total, bet) => total + (Number(bet.amount) || 0), 0);
  }, [allBets, monthKey]);


  return (
    <Card className="w-full max-w-6xl mx-auto border-border/40 bg-secondary/20">
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPreviousMonth}
              className="w-10 h-10 rounded-lg border border-border/40 bg-secondary/40 text-2xl font-bold text-foreground hover:bg-secondary"
              aria-label="Previous month"
            >
              &lt;
            </button>

            <button
              type="button"
              onClick={onRefreshPending}
              disabled={refreshingPending}
              className="w-10 h-10 rounded-lg border border-border/40 bg-secondary/40 text-foreground hover:bg-secondary disabled:opacity-60"
              aria-label="Refresh pending bets"
              title="Refresh pending bets"
            >
              <RefreshCw className={`h-4 w-4 mx-auto ${refreshingPending ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="flex-1 text-center">
            <h2 className="text-3xl font-bold tracking-wide text-foreground">
              {formatMonthLabel(monthKey)}
            </h2>
            <p className="mt-1 font-mono text-xs font-semibold text-white">
              {monthKey.slice(0, 4)} Yearly P/L: {yearlyPnl >= 0 ? "+" : ""}
              {formatCurrency(yearlyPnl)}
            </p>
          </div>

          <button
            type="button"
            onClick={onNextMonth}
              className="w-10 h-10 rounded-lg border border-border/40 bg-secondary/40 text-2xl font-bold text-foreground hover:bg-secondary"
            aria-label="Next month"
          >
            &gt;
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6 lg:grid-cols-12">
          {monthTiles.map((month) => {
            const isActive = month.key === monthKey;
            const hasResults = month.wins > 0 || month.losses > 0;
            const isPositive = month.pnl >= 0;

            return (
              <button
                key={month.key}
                type="button"
                onClick={() => onSelectMonth(month.key)}
                className={`min-w-0 rounded-md border px-2 py-3 text-center transition-colors ${
                  isActive
                    ? "border-emerald-400/70 bg-emerald-500/10"
                    : "border-border/40 bg-secondary/30 hover:bg-secondary/60"
                }`}
              >
                <span className="block text-xs uppercase text-muted-foreground">
                  {month.label}
                </span>
                <span
                  className={`mt-1 block truncate text-xs font-mono font-semibold ${
                    hasResults
                      ? isPositive
                        ? "text-emerald-300"
                        : "text-rose-300"
                      : "text-muted-foreground"
                  }`}
                >
                  {hasResults
                    ? `${month.pnl >= 0 ? "+" : ""}${formatCurrency(month.pnl).replace(".00", "")}`
                    : "-"}
                </span>
              </button>
            );
          })}
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


        <div className="grid grid-cols-7 gap-2.5 text-center text-sm uppercase tracking-wider text-muted-foreground">
          {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2.5">
          {days.map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="h-16" />;
            }

            const dayStats = dailyStats[day.dateKey];
            const hasBets = !!dayStats;
            const isSelected = activeDate === day.dateKey;
            const isPositive = (dayStats?.pnl || 0) >= 0;

            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => {
                  setSelectedDate(day.dateKey);
                  setDetailsOpen(true);
                }}
                className={`h-16 rounded-lg border p-1.5 flex flex-col items-center justify-center transition-colors ${
                  isSelected
                    ? "border-violet-500 bg-violet-500/10"
                    : hasBets
                      ? isPositive
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-rose-500/40 bg-rose-500/10"
                      : "border-transparent bg-secondary/40 hover:bg-secondary/60"
                }`}
              >
                <span className="text-base font-bold text-foreground">{day.day}</span>

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

        <Dialog open={detailsOpen} onOpenChange={(open) => setDetailsOpen(open)}>
          <DialogContent className="bg-card border-border max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {selectedDate
                  ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Plays"}
              </DialogTitle>
            </DialogHeader>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/40 bg-secondary/30 p-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total P/L</p>
                <p className={`mt-1 font-mono text-base font-bold ${activeStats.pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {activeStats.pnl >= 0 ? "+" : ""}{formatCurrency(activeStats.pnl)}
                </p>
              </div>
              <div className="rounded-lg border border-border/40 bg-secondary/30 p-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Record</p>
                <p className="mt-1 font-mono text-base font-bold text-foreground">
                  {activeStats.wins} - {activeStats.losses}
                </p>
              </div>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {activeStats.bets.length === 0 ? (
                <div className="rounded-lg border border-border/40 bg-secondary/30 p-4 text-center text-sm text-muted-foreground">
                  No plays on this date.
                </div>
              ) : (
                activeStats.bets.map((bet) => {
                  const won = isBetWin(bet);
                  const status = getBetStatus(bet);
                  const statusLabel = getStatusLabel(status);
                  const stake = Math.abs(Number(bet.stake ?? bet.amount) || 0);
                  const isParlay = Array.isArray(bet.legs) && bet.legs.length > 0;
                  const [teamA, teamB] = isParlay ? [] : getBetTeamNames(bet);
                  const teamAImage = teamA ? getTeamLogoByName(teamA) : null;
                  const teamBImage = teamB ? getTeamLogoByName(teamB) : null;

                  return (
                    <div
                      key={bet.id}
                      className={`rounded-xl border bg-secondary/40 p-3 ${
                        won === true
                          ? "border-emerald-500/40"
                          : won === false
                            ? "border-rose-500/40"
                            : "border-amber-400/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {isParlay ? (
                            <div className="flex -space-x-2">
                              {bet.legs.slice(0, 4).flatMap((leg) => [leg.awayTeam, leg.homeTeam])
                                .map(getTeamLogoByName)
                                .filter(Boolean)
                                .slice(0, 4)
                                .map((src, idx) => (
                                  <img
                                    key={`${bet.id}-logo-${idx}`}
                                    src={src}
                                    alt=""
                                    className="w-7 h-7 rounded-full object-contain bg-secondary/80 p-0.5 ring-2 ring-secondary/40"
                                  />
                                ))}
                            </div>
                          ) : (
                            <>
                              {teamAImage ? (
                                <img src={teamAImage} alt={teamA} className="w-8 h-8 rounded-full object-contain bg-secondary/80 p-0.5" />
                              ) : null}
                              {teamBImage ? (
                                <img src={teamBImage} alt={teamB} className="w-8 h-8 rounded-full object-contain bg-secondary/80 p-0.5" />
                              ) : null}
                            </>
                          )}
                          <p className="text-sm font-bold text-foreground truncate">
                            {isParlay ? `Parlay (${bet.legs.length} legs)` : bet.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {statusLabel}
                          </span>
                          <button
                            type="button"
                            onClick={() => onEditBet(bet)}
                            className="rounded-sm p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            aria-label={`Edit ${bet.title || "play"}`}
                            title="Edit play"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteBet(bet)}
                            className="rounded-sm p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-300"
                            aria-label={`Delete ${bet.title || "play"}`}
                            title="Delete play"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {isParlay ? (
                        <div className="mt-2 space-y-1.5">
                          {bet.legs.map((leg) => {
                            const legWon =
                              leg.result === "win" ? true : leg.result === "loss" ? false : null;

                            return (
                              <div
                                key={leg.id}
                                className="flex items-center justify-between gap-2 rounded-md bg-background/40 px-2 py-1"
                              >
                                <span className="truncate text-xs text-muted-foreground">
                                  {leg.awayTeam} @ {leg.homeTeam}
                                  <span className="ml-1 font-mono text-foreground">{leg.title}</span>
                                </span>
                                <span
                                  className={`text-[10px] uppercase tracking-wider font-mono ${
                                    legWon === true
                                      ? "text-emerald-300"
                                      : legWon === false
                                        ? "text-rose-300"
                                        : "text-amber-300"
                                  }`}
                                >
                                  {legWon === true ? "Win" : legWon === false ? "Loss" : "Pending"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : bet.matchup ? (
                        <p className="mt-2 text-xs text-muted-foreground truncate">{bet.matchup}</p>
                      ) : null}

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider">Odds</span>
                          <span className="font-mono text-foreground">{bet.odds || "-"}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider">Amount</span>
                          <span className="font-mono text-foreground">{formatCurrency(stake)}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider">Result</span>
                          <span className={`font-mono ${won === true ? "text-emerald-300" : won === false ? "text-rose-300" : "text-amber-300"}`}>
                            {won === true ? "Win" : won === false ? "Loss" : "Pending"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase tracking-wider">P/L</span>
                          <span className={`font-mono ${Number(bet.amount) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {Number(bet.amount) >= 0 ? "+" : "-"}
                            {formatCurrency(Math.abs(Number(bet.amount) || 0))}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </DialogContent>
        </Dialog>
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