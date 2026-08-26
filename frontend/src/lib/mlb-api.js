// MLB StatsAPI client — public, no key required, sends CORS headers.
const STATS_API = "https://statsapi.mlb.com/api/v1";

export function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
