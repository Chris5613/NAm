import { remoteStorage as localStorage } from "@/lib/serverStore";
import { formatFirstPitch, getPacificDateKey } from "@/lib/mlb-api";
import { calculateProfit as calculateDecimalProfit, normalizeOddsToDecimal } from "@/lib/odds";

export const CLOUD_BETS_KEY = "cloud_manual_bets";
export const CLOUD_BANKROLL_KEY = "cloud_starting_bankroll";
export const CLOUD_WITHDRAWALS_KEY = "cloud_withdrawals";

export const VIEWS = [
  { value: "slate", label: "Slate" },
  { value: "bets", label: "Plays" },
];

export const SPORTS = [
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

export const TEAM_OPTIONS = {
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

export function getSavedBets() {
  try {
    const saved = JSON.parse(localStorage.getItem(CLOUD_BETS_KEY) || "[]");
    return Array.isArray(saved)
      ? saved.filter((bet) => !String(bet?.id || "").startsWith("mock-"))
      : [];
  } catch {
    return [];
  }
}

export function betIdentityKey(bet = {}) {
  return [
    String(bet.date ?? "").trim(),
    String(bet.title ?? "").trim(),
    String(bet.matchup ?? "").trim(),
    String(bet.awayTeam ?? "").trim(),
    String(bet.homeTeam ?? "").trim(),
    String(bet.gamePk ?? bet.mlbGamePk ?? bet.game_id ?? bet.gameId ?? "").trim(),
    String(bet.odds ?? "").trim(),
    String(bet.stake ?? bet.amount ?? "").trim(),
  ].join("::");
}

export function saveBets(bets) {
  try {
    const deduped = Array.isArray(bets) ? bets.filter((bet, index, list) => {
      const key = betIdentityKey(bet);
      if (!key) return true;
      return list.findIndex((item) => betIdentityKey(item) === key) === index;
    }) : [];
    localStorage.setItem(CLOUD_BETS_KEY, JSON.stringify(deduped));
  } catch {
    // localStorage unavailable
  }
}

export function formatCurrency(value) {
  const n = Number(value) || 0;

  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPercent(value) {
  const n = Number(value) || 0;
  return `${n.toFixed(1)}%`;
}

export function calculateProfit(stake, odds) {
  return calculateDecimalProfit(stake, odds);
}

export function formatRecord(wins, losses) {
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

export function getCurrentMonthKey() {
  return getPstDateString().slice(0, 7);
}

export function moveMonthKey(monthKey, amount) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");

  return `${nextYear}-${nextMonth}`;
}

export function getDayKey(date) {
  return String(date || "").slice(0, 10);
}

export function getCalendarDays(monthKey) {
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

export function getBetMonthKey(bet) {
  const date = bet.date || bet.created_at;
  if (!date) return "";
  return date.slice(0, 7);
}

export function formatMonthLabel(monthKey) {
  if (!monthKey) return "All Months";

  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function getBetDateTime(bet) {
  return new Date(bet.date || bet.created_at || 0).getTime();
}

export function emptyLeg() {
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

export function gameToLeg(game, title = "NRFI") {
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

export function gameToSingle(game, title = "NRFI") {
  const awayTeam = game?.away?.name || "";
  const homeTeam = game?.home?.name || "";
  const awayPitcher = game?.away?.pitcher?.name || "TBD";
  const homePitcher = game?.home?.pitcher?.name || "TBD";

  return {
    ...gameToLeg(game, title),
    amount: "25",
    odds: "",
    matchup: `${awayTeam} @ ${homeTeam} · ${awayPitcher} vs ${homePitcher} · ${formatFirstPitch(game?.gameDate)}`,
    date: getPacificDateKey(game?.gameDate) || getPstDateString(),
    team: homeTeam,
  };
}

export function formToSingle(form) {
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

export function emptyForm() {
  return {
    betMode: "single",
    title: "NRFI",
    matchup: "",
    gamePk: "",
    amount: "25",
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

export function getSportLabel(value) {
  const sport = SPORTS.find((s) => s.value === value);
  return sport?.label || value || "Uncategorized";
}

export function getTeamLabel(value) {
  if (!value) return "No Team";

  const allTeams = Object.values(TEAM_OPTIONS).flat();
  const team = allTeams.find((t) => t.value === value);

  return team?.label || value;
}

export function getTeam(bet) {
  return bet.team?.trim() || "No Team";
}

export function getBetParticipants(bet) {
  if (Array.isArray(bet.legs) && bet.legs.length > 0) {
    return bet.legs.flatMap((leg) => [leg.awayTeam, leg.homeTeam]).filter(Boolean);
  }

  return [bet.awayTeam, bet.homeTeam, bet.team].filter(Boolean);
}

export function getCategory(bet) {
  return bet.category?.trim() || "Uncategorized";
}

export function getBetStatus(bet) {
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

export function normalizeTeamName(team) {
  return String(team || "").trim();
}

export function getTeamLogoByName(teamName) {
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

export function getBetTeamNames(bet) {
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

export function isBetWin(bet) {
  const status = getBetStatus(bet);

  if (status === "win") return true;
  if (status === "loss") return false;

  return null;
}

export function getStatusLabel(status) {
  if (status === "win") return "Win";
  if (status === "loss") return "Loss";
  if (status === "pending") return "Pending";
  if (status === "in_progress") return "In Progress";

  return "Pending";
}

export function buildGroupStats(bets, getKey) {
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
