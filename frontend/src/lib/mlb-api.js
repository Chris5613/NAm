// MLB StatsAPI client — public, no key required, sends CORS headers.
const STATS_API = "https://statsapi.mlb.com/api/v1";

export function getPacificDateKey(value = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

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

export function getTodayDateKey() {
  return getPacificDateKey();
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`MLB API ${res.status}`);
  return res.json();
}

function pickPitchingStats(person) {
  const splits = person?.stats?.find(
    (entry) => entry?.group?.displayName === "pitching"
  )?.splits;
  return splits?.[0]?.stat || null;
}

async function fetchPitcherStats(pitcherIds, season) {
  const ids = [...new Set(pitcherIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const hydrate = `stats(group=[pitching],type=[season],season=${season})`;
  const url = `${STATS_API}/people?personIds=${ids.join(
    ","
  )}&hydrate=${encodeURIComponent(hydrate)}`;

  try {
    const data = await getJson(url);
    const byId = {};
    (data.people || []).forEach((person) => {
      byId[person.id] = {
        hand: person.pitchHand?.code || "",
        stat: pickPitchingStats(person),
      };
    });
    return byId;
  } catch {
    return {};
  }
}

function mapPitcher(probable, statsById) {
  if (!probable) {
    return { id: null, name: "TBD", hand: "", stats: null };
  }

  const entry = statsById[probable.id];
  const stat = entry?.stat;

  return {
    id: probable.id,
    name: probable.fullName || "TBD",
    hand: entry?.hand || "",
    stats: stat
      ? {
          record: `${stat.wins ?? 0}-${stat.losses ?? 0}`,
          era: stat.era ?? "—",
          whip: stat.whip ?? "—",
          inningsPitched: stat.inningsPitched ?? "—",
          strikeOuts: stat.strikeOuts ?? 0,
          gamesStarted: stat.gamesStarted ?? 0,
        }
      : null,
  };
}

function mapTeam(side) {
  const team = side?.team || {};
  const record = side?.leagueRecord;
  return {
    id: team.id,
    name: team.name || "TBD",
    record: record ? `${record.wins}-${record.losses}` : "",
  };
}

/**
 * Today's MLB slate: matchups, first pitch, and probable starters with
 * their current-season pitching line.
 */
export async function fetchTodaySlate(dateKey = getTodayDateKey()) {
  const hydrate = "team,probablePitcher";
  const url = `${STATS_API}/schedule?sportId=1&date=${dateKey}&hydrate=${encodeURIComponent(
    hydrate
  )}`;

  const data = await getJson(url);
  const games = data.dates?.[0]?.games || [];
  if (games.length === 0) return [];

  const season = games[0]?.season || String(new Date().getFullYear());
  const statsById = await fetchPitcherStats(
    games.flatMap((game) => [
      game.teams?.away?.probablePitcher?.id,
      game.teams?.home?.probablePitcher?.id,
    ]),
    season
  );

  return games
    .map((game) => ({
      id: String(game.gamePk),
      gameDate: game.gameDate,
      status: game.status?.detailedState || "",
      abstractStatus: game.status?.abstractGameState || "",
      gameNumber: game.gameNumber || 1,
      doubleHeader: game.doubleHeader === true || game.doubleHeader === "Y",
      venue: game.venue?.name || "",
      away: {
        ...mapTeam(game.teams?.away),
        pitcher: mapPitcher(game.teams?.away?.probablePitcher, statsById),
      },
      home: {
        ...mapTeam(game.teams?.home),
        pitcher: mapPitcher(game.teams?.home?.probablePitcher, statsById),
      },
    }))
    .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
}

export function formatFirstPitch(gameDate) {
  if (!gameDate) return "TBD";
  const date = new Date(gameDate);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function getFirstInningRuns(game) {
  const innings =
    game?.linescore?.innings ||
    game?.liveData?.linescore?.innings ||
    game?.innings ||
    [];

  const firstInning = innings[0];
  if (!firstInning || firstInning?.away?.runs == null || firstInning?.home?.runs == null) {
    return null;
  }

  const awayRuns = Number(
    firstInning?.away?.runs ??
      firstInning?.away_team_runs ??
      firstInning?.awayScore ??
      0
  );
  const homeRuns = Number(
    firstInning?.home?.runs ??
      firstInning?.home_team_runs ??
      firstInning?.homeScore ??
      0
  );

  return awayRuns + homeRuns;
}

export function isFirstInningComplete(game) {
  const linescore = game?.linescore || game?.liveData?.linescore || {};
  const innings = linescore.innings || game?.innings || [];
  const firstInning = innings[0];

  if (!firstInning || firstInning?.away?.runs == null || firstInning?.home?.runs == null) {
    return false;
  }

  const currentInning = Number(linescore.currentInning);
  const gameState = String(
    game?.gameData?.status?.abstractGameState || game?.status?.abstractGameState || ""
  ).toLowerCase();

  return gameState === "final" || currentInning > 1 || !Number.isFinite(currentInning);
}

export function gradeFirstInningBet(game, betType) {
  if (!isFirstInningComplete(game)) return null;

  const normalizedType = String(betType || "NRFI").trim().toUpperCase();
  const runs = getFirstInningRuns(game);

  if (runs == null) return null;

  if (normalizedType === "YRFI") {
    return runs > 0 ? "win" : "loss";
  }

  return runs === 0 ? "win" : "loss";
}

export async function fetchGameFeed(gamePk) {
  if (!gamePk) return null;

  const urls = [
    `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`,
    `https://statsapi.mlb.com/api/v1/game/${gamePk}/feed/live`,
  ];

  let lastError;

  for (const url of urls) {
    try {
      const data = await getJson(url);
      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("No MLB game feed found");
}

function normalizeTeamName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTeamKeys(name) {
  const normalized = normalizeTeamName(name);
  if (!normalized) return [];

  if (normalized.includes("red sox")) return ["red sox"];
  if (normalized.includes("white sox")) return ["white sox"];

  const parts = normalized.split(" ").filter(Boolean);
  const last = parts[parts.length - 1] || normalized;

  const keys = [normalized, last];

  if (normalized === "as" || normalized === "athletics") {
    keys.push("oakland athletics");
    keys.push("athletics");
  }

  return [...new Set(keys)];
}

function teamsMatch(a, b) {
  const aKeys = getTeamKeys(a);
  const bKeys = getTeamKeys(b);
  if (aKeys.length === 0 || bKeys.length === 0) return false;

  return aKeys.some((aKey) =>
    bKeys.some((bKey) =>
      aKey === bKey || aKey.includes(bKey) || bKey.includes(aKey)
    )
  );
}

export async function findGameForMatchup({
  date,
  awayTeam,
  homeTeam,
  gameNumber,
}) {
  const dateKey = getPacificDateKey(date);
  if (!dateKey || (!awayTeam && !homeTeam)) return null;

  const url = `${STATS_API}/schedule?sportId=1&date=${dateKey}`;
  const data = await getJson(url);
  const games = data?.dates?.[0]?.games || [];
  if (games.length === 0) return null;

  const targetNumber = Number(gameNumber) || 1;

  let byTeams = games.filter((game) => {
    const away = game?.teams?.away?.team?.name;
    const home = game?.teams?.home?.team?.name;
    return teamsMatch(away, awayTeam) && teamsMatch(home, homeTeam);
  });

  if (byTeams.length === 0) {
    byTeams = games.filter((game) => {
      const away = game?.teams?.away?.team?.name;
      const home = game?.teams?.home?.team?.name;
      return (
        (teamsMatch(away, awayTeam) || teamsMatch(home, awayTeam)) &&
        (teamsMatch(away, homeTeam) || teamsMatch(home, homeTeam))
      );
    });
  }

  const matched =
    byTeams.find((game) => Number(game?.gameNumber || 1) === targetNumber) ||
    byTeams[0] ||
    null;

  if (!matched) return null;

  return {
    gamePk: String(matched.gamePk),
    gameNumber: matched.gameNumber || 1,
    doubleHeader:
      matched.doubleHeader === true || matched.doubleHeader === "Y",
    abstractStatus: matched?.status?.abstractGameState || "",
    detailedStatus: matched?.status?.detailedState || "",
    gameDate: matched.gameDate,
  };
}
